// Read-only Samsung native HOME inspector for per-device compatibility research.
// DOES NOT CONTAIN NATIVE SETTERS. Does not change HOME, startup, autostart.
// Only deploy after owner permission, host-side model/capability validation,
// and proof the native libraries/runtime match the queried firmware.
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class NativeHomeQuery
{
    const string MainOperation = "http://tizen.org/appcontrol/operation/main";

    [DllImport("libc")] static extern uint getuid();
    [DllImport("libc")] static extern void free(IntPtr address);
    [DllImport("libbundle.so.0")] static extern IntPtr bundle_create();
    [DllImport("libbundle.so.0")] static extern void bundle_free(IntPtr bundle);
    [DllImport("libaul.so.0")] static extern int aul_svc_set_operation(IntPtr bundle, string operation);
    [DllImport("libaul.so.0")] static extern int aul_get_default_app(IntPtr bundle, out IntPtr app);
    [DllImport("libvconf.so.0")] static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0")] static extern int vconf_get_int(string key, out int value);

    static void Guard()
    {
        if (IntPtr.Size != 4 || getuid() != 901)
            throw new InvalidOperationException("STOP: 32-bit SDK UID 901 is required");
        if (!File.Exists("/etc/prd_info.ini"))
            throw new InvalidOperationException("STOP: firmware identity file unavailable");

        // Native library availability is necessary but NOT proof of ABI
        // or behaviour compatibility. No unknown device is write-authorised.
        string[] libraries = { "libbundle.so.0", "libaul.so.0", "libvconf.so.0" };
        foreach (string name in libraries)
        {
            IntPtr handle;
            if (!NativeLibrary.TryLoad(name, out handle))
                throw new InvalidOperationException("STOP: native library unavailable: " + name);
            NativeLibrary.Free(handle);
        }
    }

    static string ReadMainOperation()
    {
        IntPtr bundle = bundle_create();
        if (bundle == IntPtr.Zero)
            throw new InvalidOperationException("Native app-control query bundle unavailable");
        try
        {
            if (aul_svc_set_operation(bundle, MainOperation) != 0)
                throw new InvalidOperationException("Unable to prepare read-only app-control query");
            IntPtr app;
            if (aul_get_default_app(bundle, out app) != 0 || app == IntPtr.Zero)
                throw new InvalidOperationException("Unable to read default main operation");
            try { return Marshal.PtrToStringAnsi(app) ?? ""; }
            finally { free(app); }
        }
        finally { bundle_free(bundle); }
    }

    static string ReadString(string key)
    {
        IntPtr value = vconf_get_str(key);
        if (value == IntPtr.Zero)
            throw new InvalidOperationException("Unable to read native key " + key);
        try { return Marshal.PtrToStringAnsi(value) ?? ""; }
        finally { free(value); }
    }

    static void ReadNativeStatus()
    {
        Console.WriteLine("NATIVE_HOME_READ_ONLY_BEGIN");
        Console.WriteLine("main_operation=" + ReadMainOperation());
        foreach (string key in new [] {
            "db/appfw/home_appid",
            "db/appfw/startup_appid",
            "db/appfw/booting_appid_backup",
            "db/first_screen/type"
        }) Console.WriteLine(key + "=" + ReadString(key));

        int autostart;
        const string autoKey = "db/menu/smart_hub/ontvsetting/auto_start";
        if (vconf_get_int(autoKey, out autostart) != 0)
            throw new InvalidOperationException("Unable to read native auto-start value");
        Console.WriteLine(autoKey + "=" + autostart);
        Console.WriteLine("NATIVE_HOME_READ_ONLY_COMPLETE");
        Console.WriteLine("WRITE_AUTHORIZED=NO");
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length != 1 || args[0] != "query")
                throw new InvalidOperationException("Read-only command: query");
            Guard();
            ReadNativeStatus();
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("STOP: READ-ONLY native query failed: " + error.Message);
            return 1;
        }
    }
}
