// Temporary #188 diagnostic. Only native getters are imported. Never use this as a Home backup.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class HomeServiceProbe
{
    private const string MainOperation = "http://tizen.org/appcontrol/operation/main";
    private static readonly string[] StringKeys = {
        "db/appfw/home_appid", "db/appfw/startup_appid",
        "db/appfw/booting_appid_backup", "db/first_screen/type"
    };
    [DllImport("libc.so.6")] private static extern uint getuid();
    [DllImport("libc.so.6")] private static extern void free(IntPtr value);
    [DllImport("libvconf.so.0", SetLastError = true)] private static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0", SetLastError = true)] private static extern int vconf_get_int(string key, out int value);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    private static extern int app_operation_get_current_app(string operation, out IntPtr appId);

    private static object Unavailable(string reason) => new { status = "unavailable", reason };
    private static object StringValue(string key, bool operation = false)
    {
        IntPtr value = IntPtr.Zero;
        try
        {
            if (operation)
            {
                int code = app_operation_get_current_app(key, out value);
                if (code != 0) return new { status = "unavailable", native_code = code };
            }
            else value = vconf_get_str(key);
            if (value == IntPtr.Zero) return new { status = "unavailable", errno = Marshal.GetLastWin32Error() };
            string text = Marshal.PtrToStringAnsi(value);
            if (text == null || !Regex.IsMatch(text, "\\A[A-Za-z0-9._:/-]{0,256}\\z")) return Unavailable("value_redacted");
            return new { status = "ok", value = text };
        }
        catch (Exception error) { return Unavailable(error.GetType().Name); }
        finally { if (value != IntPtr.Zero) free(value); }
    }

    private static object AutoStart()
    {
        try
        {
            int value;
            int code = vconf_get_int("db/menu/smart_hub/ontvsetting/auto_start", out value);
            if (code != 0) return new { status = "unavailable", native_code = code };
            return new { status = "ok", value };
        }
        catch (Exception error) { return Unavailable(error.GetType().Name); }
    }

    internal static object Read()
    {
        var environment = new Dictionary<string, string>();
        foreach (string line in File.ReadAllLines("/etc/os-release"))
        {
            var match = Regex.Match(line, "\\A(ID|VERSION_ID|BUILD_ID)=[\"']?([A-Za-z0-9._+-]+)[\"']?\\z");
            if (match.Success) environment[match.Groups[1].Value] = match.Groups[2].Value;
        }
        if (!environment.ContainsKey("ID") || environment["ID"] != "tizen") throw new PlatformNotSupportedException();
        uint? uid = null;
        try { uid = getuid(); } catch (Exception) { /* Getter failures below remain reportable. */ }
        var settings = new Dictionary<string, object>();
        foreach (string key in StringKeys) settings[key] = StringValue(key);
        settings["db/menu/smart_hub/ontvsetting/auto_start"] = AutoStart();
        return new {
            schema_version = 1, read_only = true, uid, architecture_bits = IntPtr.Size * 8,
            os_release = environment, main_operation = StringValue(MainOperation, true), settings
        };
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length != 0) throw new ArgumentException();
            Console.WriteLine("AEROTIZEN_SERVICE_HOME=" + JsonSerializer.Serialize(Read()));
            return 0;
        }
        catch (Exception error)
        {
            // Exception messages can include private paths. Retain only the exception type.
            Console.WriteLine("AEROTIZEN_SERVICE_HOME=" + JsonSerializer.Serialize(new {
                schema_version = 1, read_only = true, error = error.GetType().Name
            }));
            return 1;
        }
    }
}
