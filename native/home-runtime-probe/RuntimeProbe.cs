// Diagnostic only: no setters, app launches, database access or settings values.
using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class RuntimeProbe
{
    private const string Prefix = "AEROTIZEN_HOME_RUNTIME\t";
    private static readonly string[] Libraries = {
        "libvconf.so.0", "libcapi-appfw-app-operation-tv.so.0",
        "libcapi-appfw-app-manager.so.0", "libapp-context-manager-common.so"
    };
    private static readonly string[] Keys = {
        "db/appfw/home_appid", "db/appfw/startup_appid",
        "db/appfw/booting_appid_backup", "db/first_screen/type"
    };
    [DllImport("libc.so.6")] private static extern uint getuid();
    [DllImport("libc.so.6")] private static extern uint getgid();
    [DllImport("libc.so.6")] private static extern void free(IntPtr value);
    [DllImport("libvconf.so.0", SetLastError = true)]
    private static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0", SetLastError = true)]
    private static extern int vconf_get_int(string key, out int value);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    private static extern int app_operation_get_current_app(string operation, out IntPtr appId);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_manager_get_app_info(string appId, out IntPtr info);
    [DllImport("libcapi-appfw-app-manager.so.0")]
    private static extern int app_info_destroy(IntPtr info);

    private static void Emit(string key, object value) => Console.WriteLine(Prefix + key + "\t" + value);
    private static void Check(string key, Func<string> read)
    {
        try { Emit(key, read()); }
        catch (DllNotFoundException) { Emit(key, "missing_library,-"); }
        catch (EntryPointNotFoundException) { Emit(key, "missing_symbol,-"); }
        catch (Exception) { Emit(key, "error,-"); }
    }

    private static string ReadString(string key, bool operation = false)
    {
        IntPtr value = IntPtr.Zero;
        try
        {
            int code = 0;
            if (operation) code = app_operation_get_current_app(key, out value);
            else value = vconf_get_str(key);
            if (code != 0) return "unavailable," + code;
            if (value == IntPtr.Zero) return "unavailable," + (operation ? 0 : Marshal.GetLastWin32Error());
            // Do not decode, print or save the setting value.
            return "ok,0";
        }
        finally { if (value != IntPtr.Zero) free(value); }
    }

    private static string ReadInteger()
    {
        int value;
        int code = vconf_get_int("db/menu/smart_hub/ontvsetting/auto_start", out value);
        return (code == 0 ? "ok," : "unavailable,") + code;
    }

    private static string ReadInstallation()
    {
        IntPtr info = IntPtr.Zero;
        try
        {
            int code = app_manager_get_app_info("DclHome001.Home", out info);
            if (code == 0 && info != IntPtr.Zero) return "ok,0";
            // TizenFX NoSuchApp: a successful lookup of an absent app is useful evidence.
            if (code == (-0x01110000 | 0x01) && info == IntPtr.Zero) return "absent," + code;
            return "unavailable," + code;
        }
        finally {
            if (info != IntPtr.Zero && app_info_destroy(info) != 0)
                throw new InvalidOperationException();
        }
    }

    private static void Identity()
    {
        try { Emit("uid", getuid()); Emit("gid", getgid()); }
        catch (Exception) { Emit("identity", "unavailable"); }
        try
        {
            foreach (string line in File.ReadAllLines("/proc/self/status"))
            {
                int split = line.IndexOf(':');
                if (split < 0) continue;
                string key = line.Substring(0, split);
                if (key == "CapInh" || key == "CapPrm" || key == "CapEff" ||
                    key == "CapBnd" || key == "CapAmb" || key == "NoNewPrivs")
                    Emit(key, line.Substring(split + 1).Trim());
            }
        }
        catch (Exception) { }
        try
        {
            string label = File.ReadAllText("/proc/self/attr/current").Trim();
            Emit("security_label", label == "System" || label == "_" ? label :
                label == "User" || label.StartsWith("User::", StringComparison.Ordinal) ? "User" : "other");
        }
        catch (Exception) { }
    }

    public static int Main(string[] args)
    {
        Emit("started", 1);
        if (args.Length != 0) return 2;
        Emit("runtime", RuntimeInformation.FrameworkDescription);
        Emit("bits", IntPtr.Size * 8);
        Identity();
        bool tizen = false;
        try {
            foreach (string line in File.ReadAllLines("/etc/os-release"))
                if (line == "ID=tizen" || line == "ID=\"tizen\"") tizen = true;
        } catch (Exception) { }
        Emit("tizen", tizen ? 1 : 0);
        bool allowed = false;
        try { allowed = tizen && IntPtr.Size == 4 && getuid() != 0; } catch (Exception) { }
        foreach (string library in Libraries)
            Check("library." + library, () => {
                if (!allowed) return "skipped,-";
                IntPtr handle;
                if (!NativeLibrary.TryLoad(library, out handle)) return "missing_library,-";
                NativeLibrary.Free(handle);
                return "ok,0";
            });
        foreach (string key in Keys)
            Check("getter." + key, () => allowed ? ReadString(key) : "skipped,-");
        Check("getter.auto_start", () => allowed ? ReadInteger() : "skipped,-");
        Check("getter.main_operation", () => allowed ? ReadString("http://tizen.org/appcontrol/operation/main", true) : "skipped,-");
        Check("getter.launcher_registration", () => allowed ? ReadInstallation() : "skipped,-");
        Emit("complete", 1);
        return 0;
    }
}
