using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using AeroTizen.Root;
using Microsoft.Win32.SafeHandles;

internal sealed class StremioCredential
{
    private const string Name = "stremio-feed.json";
    private const string Label = "security.SMACK64";
    // The root service runs on ARM or ARM64 Linux. Both use these directory flags.
    private const int Cloexec = 1 << 19, NoFollow = 1 << 15, NonBlock = 1 << 11, DirectoryOnly = 1 << 14;
    private const int WriteNew = (1 << 7) | (1 << 6) | 1; // O_EXCL | O_CREAT | O_WRONLY
    private static readonly string[] PrivatePath = { "opt", "usr", "home", "owner", "apps_rw", "DclHome001", "data" };
    private readonly byte[] contents;
    internal string Token { get; }

    internal StremioCredential(string token)
    {
        Token = token;
        contents = JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1, token });
    }

    [DllImport("libc.so.6")] private static extern int open(string path, int flags);
    [DllImport("libc.so.6")] private static extern int openat(SafeFileHandle directory, string name, int flags, uint mode);
    [DllImport("libc.so.6")] private static extern int fchown(SafeFileHandle file, uint uid, uint gid);
    [DllImport("libc.so.6")] private static extern int fchmod(SafeFileHandle file, uint mode);
    [DllImport("libc.so.6")] private static extern IntPtr fgetxattr(SafeFileHandle file, string name, byte[] value, UIntPtr size);
    [DllImport("libc.so.6")] private static extern int fsetxattr(SafeFileHandle file, string name, byte[] value, UIntPtr size, int flags);
    [DllImport("libc.so.6")] private static extern int renameat(SafeFileHandle from, string name, SafeFileHandle to, string target);
    [DllImport("libc.so.6")] private static extern int unlinkat(SafeFileHandle directory, string name, int flags);

    private static SafeFileHandle OpenDirectory()
    {
        const int flags = Cloexec | NoFollow | DirectoryOnly;
        var current = new SafeFileHandle(new IntPtr(open("/", flags)), true);
        foreach (string component in PrivatePath)
        {
            if (current.IsInvalid) break;
            var next = new SafeFileHandle(new IntPtr(openat(current, component, flags, 0)), true);
            current.Dispose();
            current = next;
        }
        return current;
    }

    private bool Matches(SafeFileHandle directory, uint uid)
    {
        using var existing = new SafeFileHandle(new IntPtr(openat(directory, Name, Cloexec | NoFollow | NonBlock, 0)), true);
        if (existing.IsInvalid) return false;
        var info = RootPaths.Metadata(existing);
        if (info.uid != uid || info.mode != 0x8180 || info.links != 1) return false;
        using var stream = new FileStream(existing, FileAccess.Read);
        if (stream.Length != contents.Length) return false;
        var bytes = new byte[contents.Length];
        return stream.Read(bytes, 0, bytes.Length) == bytes.Length && bytes.SequenceEqual(contents);
    }

    internal bool EnsurePublished()
    {
        try
        {
            using var directory = OpenDirectory();
            if (directory.IsInvalid) return false;
            var owner = RootPaths.Metadata(directory);
            if (owner.uid == 0) return false;
            if (Matches(directory, owner.uid)) return true;

            var label = new byte[256];
            long length = fgetxattr(directory, Label, label, new UIntPtr((uint)label.Length)).ToInt64();
            if (length <= 0 || length > label.Length) return false;
            string temporary = ".stremio-" + Guid.NewGuid().ToString("N");
            using var file = new SafeFileHandle(new IntPtr(openat(directory, temporary, Cloexec | NoFollow | WriteNew, 0x180)), true);
            if (file.IsInvalid) return false;
            try
            {
                using var stream = new FileStream(file, FileAccess.Write);
                stream.Write(contents, 0, contents.Length);
                stream.Flush(true);
                if (fchmod(file, 0x180) != 0 || fchown(file, owner.uid, owner.gid) != 0 ||
                    fsetxattr(file, Label, label, new UIntPtr((uint)length), 0) != 0) return false;
                return renameat(directory, temporary, directory, Name) == 0;
            }
            finally { unlinkat(directory, temporary, 0); }
        }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    internal void Remove()
    {
        try
        {
            using var directory = OpenDirectory();
            if (!directory.IsInvalid && Matches(directory, RootPaths.Metadata(directory).uid))
                unlinkat(directory, Name, 0);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
