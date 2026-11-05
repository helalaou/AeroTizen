using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal static class ServerLifetime
    {
        private static string Pathname => RootPaths.Private + "/server.json";
        [DllImport("libc.so.6", EntryPoint = "syscall", SetLastError = true)] private static extern IntPtr PidfdOpen(IntPtr number, int pid, uint flags);
        [DllImport("libc.so.6", EntryPoint = "syscall", SetLastError = true)] private static extern IntPtr PidfdSignal(IntPtr number, int pidfd, int signal, IntPtr info, uint flags);
        [DllImport("libc.so.6", SetLastError = true)] private static extern int close(int fd);
        [StructLayout(LayoutKind.Sequential)] private struct PollFd { internal int fd; internal short events, returned; }
        [DllImport("libc.so.6", SetLastError = true)] private static extern int poll(ref PollFd descriptor, UIntPtr count, int timeout);
        private static string StartTicks(int pid)
        {
            string value = File.ReadAllText("/proc/" + pid + "/stat");
            return value.Substring(value.LastIndexOf(')') + 2).Split(' ', StringSplitOptions.RemoveEmptyEntries)[19];
        }
        internal static bool Matches(string installation, string savedTicks, string actualTicks, string[] command, string uid)
        {
            return savedTicks == actualTicks && command.Length == 6 && command[0] == "/usr/bin/dotnet"
                && command[1] == RootPaths.Package + "/bin/AeroTizenRootBridge.dll" && command[2] == "--serve"
                && command[3] == installation && (command[5] == "boot" || command[5] == "setup")
                && System.Text.RegularExpressions.Regex.IsMatch(command[4], "\\A[a-f0-9]{32}\\z")
                && uid.Split((char[])null, StringSplitOptions.RemoveEmptyEntries).Skip(1).SequenceEqual(new[] { "0", "0", "0", "0" });
        }
        internal static void Record(RootSettings settings)
        {
            RootPaths.PrivateDirectory(RootPaths.Private, 0);
            if (File.Exists(Pathname))
            {
                using (var old = JsonDocument.Parse(RootPaths.PrivateFile(Pathname, 0, 4096)))
                    if (old.RootElement.GetProperty("installation_id").GetString() != settings.Installation)
                        throw new IOException("Foreign bridge process record refused");
                File.Delete(Pathname);
            }
            RootPaths.WriteNew(Pathname, JsonSerializer.SerializeToUtf8Bytes(new { installation_id = settings.Installation,
                boot_id = RootPaths.Boot(), pid = Environment.ProcessId, start_ticks = StartTicks(Environment.ProcessId) }));
        }
        internal static void StopOther(RootSettings settings)
        {
            if (!File.Exists(Pathname)) return;
            using (var document = JsonDocument.Parse(RootPaths.PrivateFile(Pathname, 0, 4096)))
            {
                var value = document.RootElement;
                if (value.GetProperty("installation_id").GetString() != settings.Installation) throw new IOException("Foreign bridge process record refused");
                int pid = value.GetProperty("pid").GetInt32();
                if (value.GetProperty("boot_id").GetString() != RootPaths.Boot() || pid == Environment.ProcessId || !Directory.Exists("/proc/" + pid)) return;
                // pidfd pins the process before identity checks, so PID reuse cannot target another process.
                int handle = checked((int)PidfdOpen(new IntPtr(434), pid, 0).ToInt64());
                if (handle < 0) throw new IOException("Could not pin the bridge process for removal");
                try
                {
                    string[] command = Encoding.UTF8.GetString(File.ReadAllBytes("/proc/" + pid + "/cmdline")).Split('\0', StringSplitOptions.RemoveEmptyEntries);
                    string uid = File.ReadLines("/proc/" + pid + "/status").First(line => line.StartsWith("Uid:", StringComparison.Ordinal));
                    if (!Matches(settings.Installation, value.GetProperty("start_ticks").GetString(), StartTicks(pid), command, uid))
                        throw new IOException("Saved bridge PID is no longer the owned root process");
                    if (PidfdSignal(new IntPtr(424), handle, 15, IntPtr.Zero, 0) != IntPtr.Zero) throw new IOException("Could not stop the owned root bridge");
                    var watched = new PollFd { fd = handle, events = 1 };
                    int completed = poll(ref watched, new UIntPtr(1), 3000);
                    if (completed < 0 || (completed > 0 && (watched.returned & 1) == 0)) throw new IOException("Bridge termination wait failed");
                    if (completed == 0)
                    {
                        if (PidfdSignal(new IntPtr(424), handle, 9, IntPtr.Zero, 0) != IntPtr.Zero || poll(ref watched, new UIntPtr(1), 1500) <= 0 || (watched.returned & 1) == 0)
                            throw new IOException("Root bridge termination was not confirmed");
                    }
                }
                finally { close(handle); }
            }
        }
    }
}
