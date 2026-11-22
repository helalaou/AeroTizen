using System;
using System.Buffers.Binary;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using AeroTizen.UntetheredProbe;
using Microsoft.Win32.SafeHandles;

namespace AeroTizen.Root
{
    internal readonly record struct ButtonKey(ushort Code, int? Scan);
    internal sealed record ButtonPress(string Device, ButtonKey Key);

    internal sealed class ButtonFilter
    {
        private const int Down = 1, Up = 0;
        private readonly IReadOnlyDictionary<ButtonKey, string> rules;
        private readonly HashSet<ushort> held = new HashSet<ushort>();

        internal ButtonFilter(IReadOnlyDictionary<ButtonKey, string> rules) => this.rules = rules;

        internal (bool Forward, string Launch) OnKey(ButtonKey key, int value)
        {
            if (value == Up) return (!held.Remove(key.Code), null);
            if (held.Contains(key.Code)) return (false, null);
            if (value != Down || !(rules.TryGetValue(key, out string app)
                || rules.TryGetValue(key with { Scan = null }, out app))) return (true, null);
            held.Add(key.Code);
            return (false, app);
        }
    }

    // Linux input ABI. The virtual device exists only while its descriptor is open.
    internal static class ButtonInput
    {
        private const string Libc = "libc.so.6";
        private const string ForwardedPhys = "aerotizen-forwarded-remote";
        private const string CompositorTool = "/usr/bin/enlightenment_info";
        private const string Uinput = "/dev/uinput", AlternateUinput = "/dev/input/uinput";
        private const string TvKeyLayout = "/usr/share/X11/xkb/tizen_key_layout.txt.tv";
        private const int MaxKeyLayoutBytes = 128 * 1024;
        private const int NonBlocking = 0x800, CloseOnExec = 0x80000, NoFollow = 0x20000;
        private const int PollMilliseconds = 100, DiscoverTimeoutSeconds = 18;
        private const int TryAgain = 11, Interrupted = 4;
        private const short PollIn = 1, PollFailure = 8 | 16 | 32;
        private const ushort Sync = 0, Key = 1, Misc = 4, SyncDropped = 3, ScanCode = 4;
        internal const int MaxKey = 0x2ff;
        private const int KeyBytes = (MaxKey + 1) / 8, DeviceNameBytes = 80, InputIdBytes = 8;
        private const uint Grab = 0x40044590, SetEvent = 0x40045564, SetKey = 0x40045565;
        private const uint CreateDevice = 0x5501;
        private const uint GetId = 0x80084502, GetTypes = 0x80044520;
        private const uint GetKeys = 0x80604521, GetPressedKeys = 0x80604518;
        private const uint GetName = 0x81004506, GetPhys = 0x81004507, GetUnique = 0x81004508;
        private const int KeyOnlyEvents = (1 << Sync) | (1 << Key) | (1 << Misc) | (1 << 20); // SYN, KEY, MSC, REP
        private static readonly int TypeOffset = IntPtr.Size * 2, EventBytes = TypeOffset + 8;
        private static readonly Regex RemoteName = new Regex(@"smart (?:control|remote)|rc device|mcirb|remocon|samsung.*remote", RegexOptions.IgnoreCase);
        private static readonly Regex OtherInput = new Regex(@"keyboard|mouse|panel", RegexOptions.IgnoreCase);

        [StructLayout(LayoutKind.Sequential)]
        private struct PollFd { internal int Fd; internal short Events, Result; }

        [DllImport(Libc, SetLastError = true)] private static extern int open(string path, int flags);
        [DllImport(Libc, SetLastError = true)] private static extern IntPtr read(int fd, byte[] value, UIntPtr size);
        [DllImport(Libc, SetLastError = true)] private static extern IntPtr write(int fd, byte[] value, UIntPtr size);
        [DllImport(Libc, SetLastError = true)] private static extern int poll([In, Out] PollFd[] fds, UIntPtr count, int timeout);
        [DllImport(Libc, EntryPoint = "ioctl", SetLastError = true)] private static extern int Ioctl(int fd, UIntPtr cmd, int value);
        [DllImport(Libc, EntryPoint = "ioctl", SetLastError = true)] private static extern int IoctlBytes(int fd, UIntPtr cmd, [In, Out] byte[] value);

        // Reserve standard navigation, power, volume, channel, numeric and transport keys.
        // Samsung uses vendor codes as well as Linux app launch keys, so there is no shared app code table.
        internal static bool CanAssign(ushort code) => code switch
        {
            148 or 149 or 150 or 202 or 203 => true, // PROG1-4 and WWW
            < 240 or >= 0x100 and <= 0x15f => false, // standard keyboard, system and generic buttons
            >= 0x160 and <= 0x188 => false, // OK through source selection
            >= 0x18e and <= 0x19f => false, // colour, channel and playback
            0x1af or >= 0x1b4 and <= 0x1bf => false, // display, playback and channel shortcuts
            >= 0x200 and <= 0x20f => false, // phone-style number keys
            _ => code <= MaxKey,
        };

        private static IOException Failure(string action) => new IOException(action + " (errno " + Marshal.GetLastWin32Error() + ")");
        private static int Fd(SafeFileHandle file) => file.DangerousGetHandle().ToInt32();
        private static SafeFileHandle Open(string path, int mode)
        {
            int result = open(path, mode | NonBlocking | CloseOnExec | NoFollow);
            if (result < 0) throw Failure("Could not open input device");
            return new SafeFileHandle((IntPtr)result, true);
        }

        private static void Require(int result, string action)
        {
            if (result < 0) throw Failure(action);
        }

        private static byte[] ReadInfo(int fd, uint request, int size)
        {
            byte[] buffer = new byte[size];
            Require(IoctlBytes(fd, (UIntPtr)request, buffer), "Could not inspect input device");
            return buffer;
        }

        private static string CString(byte[] bytes) => Encoding.UTF8.GetString(bytes.TakeWhile(value => value != 0).ToArray());

        private static string ReadName(int fd, uint request, bool optional = false)
        {
            byte[] buffer = new byte[256];
            int result = IoctlBytes(fd, (UIntPtr)request, buffer);
            if (optional && result < 0 && Marshal.GetLastWin32Error() == 2) return "";
            Require(result, "Could not identify input device");
            return CString(buffer);
        }

        private sealed class Device : IDisposable
        {
            internal readonly SafeFileHandle File;
            internal readonly string Name, Identity;
            internal readonly byte[] Id, Keys;
            internal int Descriptor => Fd(File);

            internal Device(SafeFileHandle file, string name, string phys)
            {
                File = file;
                Name = name;
                Id = ReadInfo(Descriptor, GetId, InputIdBytes);
                Keys = ReadInfo(Descriptor, GetKeys, KeyBytes);
                string unique = ReadName(Descriptor, GetUnique, optional: true);
                Identity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
                    string.Join("\0", name, phys, unique, Convert.ToHexString(Id), Convert.ToHexString(Keys))))).ToLowerInvariant();
            }

            internal bool HasKey(int code) => (Keys[code / 8] & (1 << (code % 8))) != 0;
            public void Dispose() => File.Dispose();
        }

        private static List<Device> Discover()
        {
            var devices = new List<Device>();
            try
            {
                foreach (string path in Directory.EnumerateFiles("/dev/input", "event*"))
                {
                    if (!Regex.IsMatch(Path.GetFileName(path), @"\Aevent[0-9]+\z")) continue;
                    SafeFileHandle file = null;
                    try
                    {
                        file = Open(path, 0);
                        int fd = Fd(file);
                        string name = ReadName(fd, GetName);
                        if (!RemoteName.IsMatch(name) || OtherInput.IsMatch(name)) continue;
                        string phys = ReadName(fd, GetPhys, optional: true);
                        if (phys.EndsWith("-forwarded-remote", StringComparison.Ordinal)) continue;
                        uint types = BinaryPrimitives.ReadUInt32LittleEndian(ReadInfo(fd, GetTypes, sizeof(uint)));
                        if ((types & (1 << Key)) == 0 || (types & ~KeyOnlyEvents) != 0) continue;
                        devices.Add(new Device(file, name, phys));
                        file = null; // The device owns this descriptor.
                    }
                    catch (IOException) { } // Device detached or unsupported.
                    finally { file?.Dispose(); }
                }
                return devices;
            }
            catch
            {
                devices.ForEach(device => device.Dispose());
                throw;
            }
        }

        private static PollFd[] PollDevices(IEnumerable<Device> devices) =>
            devices.Select(device => new PollFd { Fd = device.Descriptor, Events = PollIn }).ToArray();

        internal static string ReadKeyLayout()
        {
            try { return Encoding.UTF8.GetString(Bundle.ReadBounded(TvKeyLayout, MaxKeyLayoutBytes)); }
            catch (Exception error) when (error is IOException || error is InvalidDataException || error is UnauthorizedAccessException)
            {
                throw new IOException("The TV key layout is unavailable.", error);
            }
        }

        internal static ButtonInventory AppButtons()
        {
            string layout;
            try { layout = ReadKeyLayout(); }
            catch (IOException error) { return new ButtonInventory(Array.Empty<DiscoveredButton>(), error.Message); }

            var devices = Discover();
            try
            {
                if (devices.Count == 0)
                    return new ButtonInventory(Array.Empty<DiscoveredButton>(), "No supported physical remote was found.");
                var buttons = ButtonLayout.Find(layout, devices.Select(device => (device.Identity, (Func<int, bool>)device.HasKey)));
                return new ButtonInventory(buttons);
            }
            finally { devices.ForEach(device => device.Dispose()); }
        }

        private static void Poll(PollFd[] fds)
        {
            for (int i = 0; i < fds.Length; i++) fds[i].Result = 0;
            int result = poll(fds, (UIntPtr)fds.Length, PollMilliseconds);
            if (result < 0 && Marshal.GetLastWin32Error() != Interrupted) throw Failure("Could not read remote");
        }

        private static bool Read(int fd, byte[] packet)
        {
            int length = (int)read(fd, packet, (UIntPtr)packet.Length);
            if (length == packet.Length) return true;
            if (length < 0 && (Marshal.GetLastWin32Error() == TryAgain || Marshal.GetLastWin32Error() == Interrupted)) return false;
            throw Failure("Remote input was disconnected or returned an incomplete event");
        }

        private static ushort Type(byte[] packet) => BinaryPrimitives.ReadUInt16LittleEndian(packet.AsSpan(TypeOffset));
        private static ushort Code(byte[] packet) => BinaryPrimitives.ReadUInt16LittleEndian(packet.AsSpan(TypeOffset + 2));
        private static int Value(byte[] packet) => BinaryPrimitives.ReadInt32LittleEndian(packet.AsSpan(TypeOffset + 4));

        internal static ButtonPress Learn(CancellationToken stop)
        {
            var devices = Discover();
            try
            {
                if (devices.Count == 0) throw new IOException("No supported physical remote input was found.");
                var fds = PollDevices(devices);
                var scans = new int?[fds.Length];
                var timer = Stopwatch.StartNew();
                var packet = new byte[EventBytes];
                while (timer.Elapsed < TimeSpan.FromSeconds(DiscoverTimeoutSeconds))
                {
                    stop.ThrowIfCancellationRequested();
                    Poll(fds);
                    var presses = new HashSet<ButtonPress>();
                    for (int i = 0; i < fds.Length; i++)
                    {
                        if ((fds[i].Result & PollFailure) != 0) throw new IOException("The remote disconnected. Try learning again.");
                        if ((fds[i].Result & PollIn) == 0) continue;
                        // Bound each read batch so an active remote cannot delay cancellation.
                        for (int count = 0; count < 32 && Read(fds[i].Fd, packet); count++)
                        {
                            ushort type = Type(packet);
                            if (type == Sync) scans[i] = null;
                            if (type == Misc && Code(packet) == ScanCode) scans[i] = Value(packet);
                            if (type != Key) continue;
                            int? scan = scans[i];
                            scans[i] = null;
                            if (Value(packet) != 1) continue;
                            ushort code = Code(packet);
                            string identity = devices[i].Identity;
                            if (devices.Count(device => device.Identity == identity) != 1)
                                throw new IOException("The TV has more than one matching remote interface.");
                            presses.Add(new ButtonPress(identity, new ButtonKey(code, scan)));
                        }
                    }
                    if (presses.Count == 1) return presses.First();
                    if (presses.Count > 1) throw new IOException("More than one button press was detected. Try again.");
                }
                throw new IOException("No app button press was detected before the timeout.");
            }
            finally { devices.ForEach(device => device.Dispose()); }
        }

        internal static void Filter(string identity, IReadOnlyDictionary<ButtonKey, string> rules,
            Action active, Action<string> launch, CancellationToken stop)
        {
            var devices = Discover();
            try
            {
                var candidates = devices.Where(device => device.Identity == identity).ToArray();
                if (candidates.Length != 1) throw new IOException("The learned remote interface is unavailable or ambiguous.");
                var source = candidates[0];
                foreach (Device device in devices.Where(device => device != source)) device.Dispose();
                using (var sink = CreateForwarder(source))
                {
                    stop.ThrowIfCancellationRequested();
                    int input = source.Descriptor, output = Fd(sink);
                    Require(Ioctl(input, (UIntPtr)Grab, 1), "Could not take control of the remote");
                    var pressed = new HashSet<ushort>();
                    try
                    {
                        if (ReadInfo(input, GetPressedKeys, KeyBytes).Any(value => value != 0))
                            throw new IOException("Release all remote buttons.");
                        active();
                        FilterEvents(source, output, rules, pressed, launch, stop);
                    }
                    finally
                    {
                        Ioctl(input, (UIntPtr)Grab, 0);
                        foreach (ushort code in pressed) Send(output, Key, code);
                        if (pressed.Count != 0) Send(output, Sync, 0);
                    }
                }
            }
            finally { devices.ForEach(device => device.Dispose()); }
        }

        private static void FilterEvents(Device source, int output, IReadOnlyDictionary<ButtonKey, string> rules,
            HashSet<ushort> pressed, Action<string> launch, CancellationToken stop)
        {
            var fds = PollDevices(new[] { source });
            var packet = new byte[EventBytes];
            var filter = new ButtonFilter(rules);
            int? scan = null;
            while (!stop.IsCancellationRequested)
            {
                Poll(fds);
                if ((fds[0].Result & PollFailure) != 0) throw new IOException("The learned remote disconnected.");
                if ((fds[0].Result & PollIn) == 0) continue;
                for (int count = 0; count < 32 && !stop.IsCancellationRequested && Read(source.Descriptor, packet); count++)
                {
                    ushort type = Type(packet), code = Code(packet);
                    if (type == Sync && code == SyncDropped) throw new IOException("Remote input was interrupted.");
                    if (type == Sync) scan = null;
                    if (type == Misc && code == ScanCode) scan = Value(packet);
                    if (type == Key)
                    {
                        var decision = filter.OnKey(new ButtonKey(code, scan), Value(packet));
                        scan = null;
                        if (decision.Launch != null) launch(decision.Launch);
                        if (!decision.Forward) continue;
                    }
                    if (type != Sync && type != Key) continue;
                    Write(output, packet);
                    if (type == Key)
                    {
                        if (Value(packet) == 0) pressed.Remove(code);
                        else pressed.Add(code);
                    }
                }
            }
        }

        private static void Write(int fd, byte[] bytes)
        {
            if ((int)write(fd, bytes, (UIntPtr)bytes.Length) != bytes.Length) throw Failure("Could not forward remote input");
        }

        private static void Send(int fd, ushort type, ushort code)
        {
            var packet = new byte[EventBytes];
            BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(TypeOffset), type);
            BinaryPrimitives.WriteUInt16LittleEndian(packet.AsSpan(TypeOffset + 2), code);
            Write(fd, packet);
        }

        private static SafeFileHandle CreateForwarder(Device source)
        {
            var sink = Open(File.Exists(Uinput) ? Uinput : AlternateUinput, 1);
            try
            {
                int fd = Fd(sink);
                Require(Ioctl(fd, (UIntPtr)SetEvent, Key), "Could not configure the virtual remote");
                for (int code = 0; code <= MaxKey; code++)
                    if (source.HasKey(code)) Require(Ioctl(fd, (UIntPtr)SetKey, code), "Could not copy remote keys");
                uint setPhys = IntPtr.Size == 8 ? 0x4008556cu : 0x4004556cu; // UI_SET_PHYS takes a pointer.
                Require(IoctlBytes(fd, (UIntPtr)setPhys, Encoding.ASCII.GetBytes(ForwardedPhys + "\0")), "Could not identify the virtual remote");
                // Legacy uinput_user_dev works on Samsung's older kernels.
                const int AbsoluteAxes = 64, AbsoluteArrays = 4;
                var definition = new byte[DeviceNameBytes + InputIdBytes + sizeof(uint) * (1 + AbsoluteAxes * AbsoluteArrays)];
                // Keep the physical remote's name so Tizen can classify the virtual device.
                Encoding.UTF8.GetEncoder().Convert(source.Name.AsSpan(), definition.AsSpan(0, DeviceNameBytes - 1),
                    true, out _, out _, out _);
                source.Id.CopyTo(definition, DeviceNameBytes);
                Write(fd, definition);
                Require(Ioctl(fd, (UIntPtr)CreateDevice, 0), "Could not create the virtual remote");
                return sink;
            }
            catch
            {
                sink.Dispose();
                throw;
            }
        }

        internal static (int ExitCode, string Output) ReadInputDevices(CancellationToken stop)
        {
            if (!File.Exists(CompositorTool)) throw new IOException("The TV compositor tool is unavailable.");
            return RunTool(CompositorTool, new[] { "-input_devices" }, stop);
        }

        internal static (int ExitCode, string Output) RunTool(string path, IEnumerable<string> arguments, CancellationToken stop)
        {
            var start = new ProcessStartInfo(path) { UseShellExecute = false, RedirectStandardOutput = true,
                RedirectStandardError = true };
            foreach (string argument in arguments) start.ArgumentList.Add(argument);
            using var process = Process.Start(start) ?? throw new IOException("Could not start the TV tool.");
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stop);
            deadline.CancelAfter(TimeSpan.FromSeconds(2));
            var output = process.StandardOutput.ReadToEndAsync();
            var errors = process.StandardError.ReadToEndAsync();
            try
            {
                process.WaitForExitAsync(deadline.Token).GetAwaiter().GetResult();
                return (process.ExitCode, output.WaitAsync(deadline.Token).GetAwaiter().GetResult()
                    + "\n" + errors.WaitAsync(deadline.Token).GetAwaiter().GetResult());
            }
            catch (OperationCanceledException)
            {
                try { process.Kill(); } catch (InvalidOperationException) { }
                stop.ThrowIfCancellationRequested();
                throw new IOException("The TV tool did not answer in time.");
            }
        }
    }
}
