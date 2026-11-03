using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal static class RootPaths
    {
        internal const string AppId = "org.aerotizen.roothelper", Version = "0.1.0";
        internal const string Package = "/opt/usr/apps/" + AppId;
        internal const string Data = "/home/owner/apps_rw/" + AppId + "/data";
        internal const string Private = "/opt/usr/share/aerotizen-root-private";
        internal const string Config = Package + "/bin/root.json";
        [DllImport("libc.so.6")] internal static extern uint getuid();
        [DllImport("libc.so.6")] internal static extern uint geteuid();
        [DllImport("libc.so.6")] internal static extern uint getgid();
        [DllImport("libc.so.6", SetLastError = true)] internal static extern int chmod(string path, uint mode);
        [DllImport("libc.so.6", SetLastError = true)] internal static extern int setsid();
        [DllImport("libc.so.6", SetLastError = true)] private static extern int statx(int fd, string path, int flags, uint mask, IntPtr buffer);
        [DllImport("libc.so.6", SetLastError = true)] private static extern int mkdir(string path, uint mode);
        internal static void NewDirectory(string path, uint mode)
        {
            if (mkdir(path, mode) != 0) throw new IOException("Directory already exists or cannot be created");
        }
        internal static void PrivateDirectory(string path, uint owner)
        {
            IntPtr data = Marshal.AllocHGlobal(256);
            try
            {
                if (statx(-100, path, 0x100, 0x31f, data) != 0 || (Marshal.ReadInt32(data) & 0x31f) != 0x31f
                    || (uint)Marshal.ReadInt32(data, 20) != owner
                    || ((ushort)Marshal.ReadInt16(data, 28) & 0xf000) != 0x4000
                    || ((ushort)Marshal.ReadInt16(data, 28) & 0x3f) != 0) throw new IOException("Untrusted private directory");
            }
            finally { Marshal.FreeHGlobal(data); }
        }
        internal static string Boot()
        {
            string value = File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
            if (!Guid.TryParseExact(value, "D", out Guid id) || id.ToString("D") != value) throw new IOException("Invalid kernel boot ID");
            return value;
        }
        internal static void RequireTv(bool root)
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux)
                || (RuntimeInformation.ProcessArchitecture != Architecture.Arm && RuntimeInformation.ProcessArchitecture != Architecture.Arm64)
                || !File.ReadAllLines("/etc/os-release").Contains("ID=tizen")
                || (root ? getuid() != 0 || geteuid() != 0 : getuid() == 0 || geteuid() == 0))
                throw new InvalidOperationException(root ? "Root service requires root on an ARM Tizen TV" : "Bootstrap requires an ordinary ARM Tizen app");
        }
        internal static (uint uid, uint gid, uint mode, uint links) Metadata(FileStream file)
        {
            IntPtr data = Marshal.AllocHGlobal(256);
            try
            {
                if (statx(file.SafeFileHandle.DangerousGetHandle().ToInt32(), "", 0x1000, 0x31f, data) != 0
                    || (Marshal.ReadInt32(data) & 0x31f) != 0x31f) throw new IOException("File ownership could not be checked");
                return ((uint)Marshal.ReadInt32(data, 20), (uint)Marshal.ReadInt32(data, 24),
                    (ushort)Marshal.ReadInt16(data, 28), (uint)Marshal.ReadInt32(data, 16));
            }
            finally { Marshal.FreeHGlobal(data); }
        }
        internal static byte[] PrivateFile(string path, uint owner, int limit)
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked private file refused");
            using (var file = File.OpenRead(path))
            {
                var stat = Metadata(file);
                if (stat.uid != owner || (stat.mode & 0xf000) != 0x8000 || (stat.mode & 0x3f) != 0 || stat.links != 1
                    || file.Length <= 0 || file.Length > limit) throw new IOException("Private file ownership or mode is invalid");
                byte[] bytes = new byte[file.Length]; int offset = 0;
                while (offset < bytes.Length)
                {
                    int count = file.Read(bytes, offset, bytes.Length - offset);
                    if (count == 0) throw new EndOfStreamException(); offset += count;
                }
                return bytes;
            }
        }
        internal static void WriteNew(string path, byte[] bytes, uint mode = 0x180)
        {
            string temporary = path + ".new-" + Guid.NewGuid().ToString("N");
            try
            {
                using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    if (chmod(temporary, mode) != 0) throw new IOException("Could not restrict file permissions");
                    file.Write(bytes, 0, bytes.Length); file.Flush(true);
                }
                File.Move(temporary, path, false);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
    }

    internal sealed class RootSettings
    {
        internal readonly string Installation, Identity, Duid, Baseline, Certificate;
        internal readonly int Port;
        internal readonly Dictionary<string, string> Files = new Dictionary<string, string>();
        internal RootSettings(byte[] bytes)
        {
            if (bytes.Length > 16384) throw new InvalidDataException("Oversized root settings");
            using (var document = JsonDocument.Parse(bytes))
            {
                var root = document.RootElement;
                string[] expected = { "schema_version", "app_id", "version", "installation_id", "device_identity_sha256", "duid_sha256",
                    "baseline_boot_id", "bridge_port", "certificate_sha256", "files" };
                if (!root.EnumerateObject().Select(item => item.Name).OrderBy(item => item).SequenceEqual(expected.OrderBy(item => item))
                    || root.GetProperty("schema_version").GetInt32() != 1 || root.GetProperty("app_id").GetString() != RootPaths.AppId
                    || root.GetProperty("version").GetString() != RootPaths.Version) throw new InvalidDataException("Unsupported root settings");
                Installation = Hex(root.GetProperty("installation_id").GetString(), 32);
                Identity = Hex(root.GetProperty("device_identity_sha256").GetString(), 64);
                Duid = Hex(root.GetProperty("duid_sha256").GetString(), 64);
                Certificate = Hex(root.GetProperty("certificate_sha256").GetString(), 64);
                Baseline = root.GetProperty("baseline_boot_id").GetString();
                if (!Guid.TryParseExact(Baseline, "D", out Guid boot) || Baseline != boot.ToString("D")) throw new InvalidDataException("Invalid setup boot ID");
                Port = root.GetProperty("bridge_port").GetInt32();
                if (Port < 1024 || Port > 65535 || Port == 26101 || Port == 26102) throw new InvalidDataException("Invalid bridge port");
                var names = new HashSet<string>();
                foreach (string name in new[] { "AeroTizenRootHelper", "AeroTizenRootBridge", "AeroTizenRootProbe", "AeroTizenBootWriter" })
                    foreach (string suffix in new[] { ".dll", ".runtimeconfig.json", ".deps.json" })
                        names.Add((name == "AeroTizenRootProbe" ? "res/runner/" : name == "AeroTizenBootWriter" ? "res/setup/" : "bin/") + name + suffix);
                foreach (var item in root.GetProperty("files").EnumerateObject())
                {
                    if (!names.Remove(item.Name)) throw new InvalidDataException("Unexpected managed root file");
                    Files.Add(item.Name, Hex(item.Value.GetString(), 64));
                }
                if (names.Count != 0) throw new InvalidDataException("Incomplete managed root files");
            }
        }
        internal static string Hex(string value, int length)
        {
            if (!Regex.IsMatch(value ?? "", "\\A[a-f0-9]{" + length + "}\\z")) throw new InvalidDataException("Invalid root identity");
            return value;
        }
        internal static RootSettings Load() { return new RootSettings(Bundle.ReadBounded(RootPaths.Config, 16384)); }
        internal void VerifyFiles(string package = RootPaths.Package)
        {
            foreach (var item in Files)
                if (Bundle.Digest(Bundle.ReadBounded(package + "/" + item.Key)) != item.Value)
                    throw new InvalidDataException("Installed helper file checksum differs: " + item.Key);
        }
    }
}
