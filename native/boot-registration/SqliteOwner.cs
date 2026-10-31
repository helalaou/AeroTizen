// One-time setup helper. Never included in the harmless startup service.
using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;

internal static class SqliteOwner
{
    private const string Database = "/opt/dbspace/.pkgmgr_parser.db";
    [DllImport("libc.so.6", SetLastError = true)] private static extern uint getuid();
    [DllImport("libc.so.6", SetLastError = true)] private static extern uint geteuid();
    [DllImport("libc.so.6", SetLastError = true)] private static extern uint getgid();
    [DllImport("libc.so.6", SetLastError = true)] private static extern uint getegid();
    [DllImport("libc.so.6", SetLastError = true)] private static extern int setgroups(UIntPtr size, IntPtr groups);
    [DllImport("libc.so.6", SetLastError = true)] private static extern int setresgid(uint real, uint effective, uint saved);
    [DllImport("libc.so.6", SetLastError = true)] private static extern int setresuid(uint real, uint effective, uint saved);
    [DllImport("libc.so.6", SetLastError = true)] private static extern int prctl(int option, UIntPtr value, UIntPtr third, UIntPtr fourth, UIntPtr fifth);
    [DllImport("libc.so.6", SetLastError = true)] private static extern int execv(string path, IntPtr arguments);
    [DllImport("libc.so.6", SetLastError = true)] private static extern int statx(int fd, string path, int flags, uint mask, IntPtr buffer);

    private static uint Identity(string text)
    {
        if (!uint.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out uint value) || value == 0
            || value.ToString(CultureInfo.InvariantCulture) != text) throw new InvalidDataException("Expected a non-root numeric database owner");
        return value;
    }
    private static void Require(int result, string operation)
    {
        if (result != 0) throw new IOException(operation + " failed; errno=" + Marshal.GetLastWin32Error());
    }
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length != 3 || (args[0] != "--check" && args[0] != "--run")) throw new ArgumentException("Use --check or --run with owner UID and GID");
            uint uid = Identity(args[1]), gid = Identity(args[2]);
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux)
                || (RuntimeInformation.ProcessArchitecture != Architecture.Arm && RuntimeInformation.ProcessArchitecture != Architecture.Arm64)
                || !File.ReadAllLines("/etc/os-release").Contains("ID=tizen"))
                throw new InvalidOperationException("Database writer requires an ARM Tizen device");
            IntPtr metadata = Marshal.AllocHGlobal(256);
            try
            {
                using (var file = File.OpenRead(Database))
                {
                    Require(statx(file.SafeFileHandle.DangerousGetHandle().ToInt32(), "", 0x1000, 0x31f, metadata), "Database owner check");
                    if ((Marshal.ReadInt32(metadata) & 0x31f) != 0x31f
                        || unchecked((uint)Marshal.ReadInt32(metadata, 20)) != uid
                        || unchecked((uint)Marshal.ReadInt32(metadata, 24)) != gid
                        || (unchecked((ushort)Marshal.ReadInt16(metadata, 28)) & 0xf000) != 0x8000)
                        throw new InvalidDataException("Database inode does not match the saved owner");
                }
            }
            finally { Marshal.FreeHGlobal(metadata); }
            if (args[0] == "--check")
            {
                Console.WriteLine(JsonSerializer.Serialize(new { passed = true, read_only = true,
                    credential_change_attempted = false, current_uid = getuid(), current_euid = geteuid(), database_uid = uid, database_gid = gid }));
                return 0;
            }
            if (getuid() != 0 || geteuid() != 0) throw new InvalidOperationException("One-time database setup must start as root");
            Require(setgroups(UIntPtr.Zero, IntPtr.Zero), "Clear supplementary groups");
            Require(setresgid(gid, gid, gid), "Set database-owner GID");
            Require(setresuid(uid, uid, uid), "Set database-owner UID");
            Require(prctl(38, new UIntPtr(1), UIntPtr.Zero, UIntPtr.Zero, UIntPtr.Zero), "Disable new privileges");
            if (getuid() != uid || geteuid() != uid || getgid() != gid || getegid() != gid
                || !File.ReadAllLines("/proc/self/status").Any(line => line.StartsWith("CapEff:", StringComparison.Ordinal)
                    && line.Substring(7).Trim() == "0000000000000000"))
                throw new InvalidOperationException("Database writer did not drop all root privileges");
            Console.WriteLine("AEROTIZEN_SQLITE_OWNER=" + uid + ":" + gid);
            Console.Out.Flush();
            string[] values = { "/usr/bin/sqlite3", "-batch", "-bail", Database };
            IntPtr[] strings = values.Select(Marshal.StringToHGlobalAnsi).ToArray();
            IntPtr argv = Marshal.AllocHGlobal((strings.Length + 1) * IntPtr.Size);
            try
            {
                for (int index = 0; index < strings.Length; index++) Marshal.WriteIntPtr(argv, index * IntPtr.Size, strings[index]);
                Marshal.WriteIntPtr(argv, strings.Length * IntPtr.Size, IntPtr.Zero);
                execv(values[0], argv); // Replaces this process; stdin is the guarded SQL transaction.
                throw new IOException("SQLite exec failed; errno=" + Marshal.GetLastWin32Error());
            }
            finally
            {
                Marshal.FreeHGlobal(argv);
                foreach (IntPtr text in strings) Marshal.FreeHGlobal(text);
            }
        }
        catch (Exception error) { Console.Error.WriteLine("AEROTIZEN_BOOT_WRITER_ERROR=" + error.GetType().Name + ": " + error.Message); return 1; }
    }
}
