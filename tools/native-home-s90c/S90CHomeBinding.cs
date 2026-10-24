// Standalone S90C native HOME helper adapted from the TV-tested V992.56 Stage 6.1.
// No automatic deployment. Undocumented native Samsung APIs; exact firmware only.
// No network addresses, private recovery snapshots or compiled binaries included.
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class S90CHomeBinding
{
    const string Firmware = "T-PTMCDEUC-0090-2220.4";
    const string Op = "http://tizen.org/appcontrol/operation/main";
    const string Samsung = "com.samsung.tv.csfs";
    const string Aero = "DclHome001.Home";
    const string Viewer = "org.tizen.tv-viewer";
    const string HomeKey = "db/appfw/home_appid";
    const string StartupKey = "db/appfw/startup_appid";
    const string BackupKey = "db/appfw/booting_appid_backup";
    const string FirstKey = "db/first_screen/type";
    const string AutoKey = "db/menu/smart_hub/ontvsetting/auto_start";

    [DllImport("libc")] static extern uint getuid();
    [DllImport("libc")] static extern void free(IntPtr p);
    [DllImport("libbundle.so.0")] static extern IntPtr bundle_create();
    [DllImport("libbundle.so.0")] static extern void bundle_free(IntPtr b);
    [DllImport("libaul.so.0")] static extern int aul_svc_set_operation(IntPtr b, string op);
    [DllImport("libaul.so.0")] static extern int aul_get_default_app(IntPtr b, out IntPtr p);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    static extern int app_operation_set_current_app(string op, string app);
    [DllImport("libvconf.so.0")] static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0")] static extern int vconf_set_str(string key, string value);
    [DllImport("libvconf.so.0")] static extern int vconf_get_int(string key, out int n);
    [DllImport("libapp-context-manager-common.so")]
    static extern byte util_is_appbooting_supported_webapp_byappid(string app);

    class Snapshot
    {
        internal string Main, Home, Startup, Backup, First;
        internal int Auto;
    }

    static void Guard()
    {
        if (IntPtr.Size != 4 || getuid() != 901)
            throw new InvalidOperationException("STOP: SDK UID 901 and 32-bit Tizen required");
        string info = File.ReadAllText("/etc/prd_info.ini");
        if (!info.Contains("Version=" + Firmware + ";", StringComparison.Ordinal))
            throw new InvalidOperationException("STOP: unknown Samsung firmware");
    }

    static string ReadKey(string key)
    {
        IntPtr pointer = vconf_get_str(key);
        if (pointer == IntPtr.Zero)
            throw new InvalidOperationException("Cannot read " + key);
        try { return Marshal.PtrToStringAnsi(pointer) ?? ""; }
        finally { free(pointer); }
    }

    static string ReadOperation()
    {
        IntPtr b = bundle_create();
        if (b == IntPtr.Zero) throw new InvalidOperationException("Cannot allocate bundle");
        try {
            if (aul_svc_set_operation(b, Op) != 0)
                throw new InvalidOperationException("Cannot select main operation");
            IntPtr app;
            if (aul_get_default_app(b, out app) != 0 || app == IntPtr.Zero)
                throw new InvalidOperationException("Cannot query native Home");
            try { return Marshal.PtrToStringAnsi(app) ?? ""; }
            finally { free(app); }
        } finally { bundle_free(b); }
    }

    static Snapshot Read()
    {
        Snapshot s = new Snapshot();
        s.Main = ReadOperation();
        s.Home = ReadKey(HomeKey);
        s.Startup = ReadKey(StartupKey);
        s.Backup = ReadKey(BackupKey);
        s.First = ReadKey(FirstKey);
        if (vconf_get_int(AutoKey, out s.Auto) != 0)
            throw new InvalidOperationException("Cannot read auto-start");
        return s;
    }

    static bool OtherKeysUnmodified(Snapshot s)
    {
        return s.Startup == Viewer && s.Backup == Viewer &&
            s.First == Samsung && s.Auto == 0;
    }
    static bool Original(Snapshot s)
    {
        return OtherKeysUnmodified(s) && s.Main == Samsung && s.Home == Samsung;
    }
    static bool Applied(Snapshot s)
    {
        return OtherKeysUnmodified(s) && s.Main == Aero && s.Home == Aero;
    }

    static void Print(Snapshot s)
    {
        Console.WriteLine("main_operation=" + s.Main);
        Console.WriteLine(HomeKey + "=" + s.Home);
        Console.WriteLine(StartupKey + "=" + s.Startup);
        Console.WriteLine(BackupKey + "=" + s.Backup);
        Console.WriteLine(FirstKey + "=" + s.First);
        Console.WriteLine(AutoKey + "=" + s.Auto);
        Console.WriteLine("native_home_state=" +
            (Original(s) ? "SAMSUNG" : Applied(s) ? "AEROTIZEN" : "UNRECOGNISED"));
    }

    static void WriteOperation(string app)
    {
        if (app_operation_set_current_app(Op, app) != 0 || ReadOperation() != app)
            throw new InvalidOperationException("STOP: main operation write/readback mismatch");
    }
    static void WriteKey(string app)
    {
        if (vconf_set_str(HomeKey, app) != 0 || ReadKey(HomeKey) != app)
            throw new InvalidOperationException("STOP: Home app ID write/readback mismatch");
    }

    // Write exactly two native values. No startup/boot/first-screen writes.
    static void WritePair(Snapshot before, string target)
    {
        if (!OtherKeysUnmodified(before) ||
            (before.Main != Samsung && before.Main != Aero) ||
            (before.Home != Samsung && before.Home != Aero))
            throw new InvalidOperationException("STOP: unknown state; no write");
        if (before.Main != target) WriteOperation(target);
        Snapshot middle = Read();
        if (!OtherKeysUnmodified(middle)) throw new InvalidOperationException("STOP: unrelated keys changed");
        if (middle.Home != target) WriteKey(target);
        Snapshot after = Read();
        Print(after);
        if (target == Aero ? !Applied(after) : !Original(after))
            throw new InvalidOperationException("STOP: final state does not match reference");
    }

    // The original Stage 6.1 helper attempts a bounded reversal if a
    // two-key apply partially succeeds. Keep this safety property here.
    // An unknown or externally modified state must remain untouched.
    static void UndoPartialWrite()
    {
        Snapshot s = Read();
        if (!OtherKeysUnmodified(s) ||
            (s.Main != Samsung && s.Main != Aero) ||
            (s.Home != Samsung && s.Home != Aero))
            throw new InvalidOperationException(
                "Cannot safely undo: state is unknown or other keys changed");
        if (s.Main != Samsung) WriteOperation(Samsung);
        if (s.Home != Samsung) WriteKey(Samsung);
        if (!Original(Read()))
            throw new InvalidOperationException(
                "Original Samsung Home read-back incomplete after undo");
    }

    public static int Main(string[] args)
    {
        bool attemptedWrite = false;
        try {
            bool query = args.Length == 1 && args[0] == "query";
            bool apply = args.Length == 2 && args[0] == "apply" &&
                args[1] == "CONFIRM_S90C_HOME";
            bool restore = args.Length == 2 && args[0] == "restore" &&
                args[1] == "CONFIRM_SAMSUNG_RESTORE";
            if (!query && !apply && !restore)
                throw new InvalidOperationException("Allowed: query, apply CONFIRM_S90C_HOME, restore CONFIRM_SAMSUNG_RESTORE");
            Guard();
            Snapshot before = Read();
            Print(before);
            if (query) {
                Console.WriteLine("aerotizen_boot_eligible=" +
                    util_is_appbooting_supported_webapp_byappid(Aero));
                Console.WriteLine("READ_ONLY_COMPLETE");
                return 0;
            }
            if (apply) {
                if (Applied(before)) { Console.WriteLine("ALREADY_APPLIED_NO_WRITES"); return 0; }
                if (!Original(before))
                    throw new InvalidOperationException("STOP: native Home differs from recorded original");
                if (util_is_appbooting_supported_webapp_byappid(Aero) != 1)
                    throw new InvalidOperationException("STOP: AeroTizen not boot-eligible");
            } else {
                if (Original(before)) { Console.WriteLine("ALREADY_ORIGINAL_NO_WRITES"); return 0; }
                if (!OtherKeysUnmodified(before) ||
                    (before.Main != Samsung && before.Main != Aero) ||
                    (before.Home != Samsung && before.Home != Aero))
                    throw new InvalidOperationException("STOP: unexpected state; seek manual recovery review");
            }
            attemptedWrite = true;
            WritePair(before, apply ? Aero : Samsung);
            Console.WriteLine(apply ? "S90C_HOME_BINDING_VERIFIED" : "S90C_RESTORE_VERIFIED");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine("STOP: " + error.GetType().Name + ": " + error.Message);
            if (attemptedWrite)
            {
                try
                {
                    UndoPartialWrite();
                    Console.Error.WriteLine("S90C_AUTO_UNDO_VERIFIED");
                }
                catch (Exception undoError)
                {
                    Console.Error.WriteLine("S90C_AUTO_UNDO_UNCERTAIN: " + undoError.Message);
                    Console.Error.WriteLine(
                        "Use separately validated private recovery. Do not retry apply blindly.");
                }
            }
            return 1;
        }
    }
}
