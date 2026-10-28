// Read-only native query. No persistent settings or app-control setters belong here.
using System;
using System.Collections.Generic;
using System.IO;
using System.Globalization;
using System.Net.Http;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using System.Text.Json;
using AeroTizen.Home;

internal static class HomeQuery
{
    private const int ServiceTimeoutMs = 1500;
    private const string MainOperation = "http://tizen.org/appcontrol/operation/main";
    private static readonly string[] StringKeys = {
        "db/appfw/home_appid", "db/appfw/startup_appid",
        "db/appfw/booting_appid_backup", "db/first_screen/type"
    };
    private const string AutoStartKey = "db/menu/smart_hub/ontvsetting/auto_start";

    [DllImport("libc.so.6")] private static extern uint getuid();
    [DllImport("libc.so.6")] private static extern void free(IntPtr value);
    [DllImport("libvconf.so.0", SetLastError = true)]
    private static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0", SetLastError = true)]
    private static extern int vconf_get_int(string key, out int value);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    private static extern int app_operation_get_current_app(string operation, out IntPtr appId);

    private static Dictionary<string, object> Unavailable(string type, string error)
    {
        return new Dictionary<string, object> {
            ["type"] = type, ["status"] = "unavailable", ["value"] = null, ["error"] = error
        };
    }

    private static Dictionary<string, object> StringValue(string key, bool operation = false)
    {
        IntPtr value = IntPtr.Zero;
        try
        {
            if (operation)
            {
                int result = app_operation_get_current_app(key, out value);
                if (result != 0) return Unavailable("string", "native return code " + result);
            }
            else value = vconf_get_str(key);
            if (value == IntPtr.Zero)
                return Unavailable("string", "getter returned null; errno=" + Marshal.GetLastWin32Error());
            return new Dictionary<string, object> {
                ["type"] = "string", ["status"] = "ok", ["value"] = Marshal.PtrToStringAnsi(value)
            };
        }
        catch (Exception error) { return Unavailable("string", error.GetType().Name + ": " + error.Message); }
        finally { if (value != IntPtr.Zero) free(value); }
    }

    private static Dictionary<string, object> IntegerValue(string key)
    {
        try
        {
            int value;
            int result = vconf_get_int(key, out value);
            if (result != 0) return Unavailable("int", "native return code " + result);
            return new Dictionary<string, object> { ["type"] = "int", ["status"] = "ok", ["value"] = value };
        }
        catch (Exception error) { return Unavailable("int", error.GetType().Name + ": " + error.Message); }
    }

    private static Dictionary<string, string> OsRelease()
    {
        var result = new Dictionary<string, string>();
        foreach (string line in File.ReadAllLines("/etc/os-release"))
        {
            int separator = line.IndexOf('=');
            if (separator > 0)
                result[line.Substring(0, separator)] = line.Substring(separator + 1).Trim('"');
        }
        return result;
    }

    private static Dictionary<string, object> WatcherFailure(string code, string message, bool reachable = false,
        int? httpStatus = null, string socketError = null)
    {
        var error = new Dictionary<string, object> { ["code"] = code, ["message"] = message };
        if (httpStatus.HasValue) error["http_status"] = httpStatus.Value;
        if (socketError != null) error["socket_error"] = socketError;
        return new Dictionary<string, object> { ["state"] = "unknown", ["reachable"] = reachable, ["error"] = error };
    }

    // Exposed to the host harness with a fake HTTP handler; this never launches a service.
    internal static object ReadWatcher(HttpClient client)
    {
        bool responded = false;
        try
        {
            using (var response = client.GetAsync("http://127.0.0.1:47790/").GetAwaiter().GetResult())
            {
                responded = true;
                if (!response.IsSuccessStatusCode)
                    return WatcherFailure("http_error", "Home control service returned an HTTP error.", true, (int)response.StatusCode);
                using (var document = JsonDocument.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult()))
                {
                    JsonElement leaving;
                    if (!document.RootElement.TryGetProperty("leaving", out leaving) ||
                        (leaving.ValueKind != JsonValueKind.True && leaving.ValueKind != JsonValueKind.False))
                        return WatcherFailure("invalid_response", "Home control service returned an invalid response.", true);
                    JsonElement control;
                    if (document.RootElement.TryGetProperty("homeControl", out control))
                    {
                        string mode = control.GetProperty("mode").GetString();
                        return new { state = mode == "watcher" ? (leaving.GetBoolean() ? "paused" : "active") :
                            mode == "native" ? "native" : mode == "hold" ? "handoff" : "blocked",
                            reachable = true, control = control.Clone(), error = (object)null };
                    }
                    return new { state = leaving.GetBoolean() ? "paused" : "active", reachable = true, error = (object)null };
                }
            }
        }
        catch (TaskCanceledException) { return WatcherFailure("timeout", "Home control service query timed out after " + ServiceTimeoutMs + " ms."); }
        catch (HttpRequestException error)
        {
            var socket = error.InnerException as SocketException;
            return WatcherFailure("connection_error", "Could not complete the Home control service connection.",
                socketError: socket == null ? null : socket.SocketErrorCode.ToString());
        }
        catch (Exception error) when (error is JsonException || error is InvalidOperationException || error is KeyNotFoundException)
        { return responded
            ? WatcherFailure("invalid_response", "Home control service returned an invalid response.", true)
            : WatcherFailure("query_error", "Home control service query failed."); }
        // Do not export exception text: it can include host-specific paths or response content.
        catch (Exception) { return WatcherFailure("query_error", "Home control service query failed."); }
    }

    private static object Watcher()
    {
        try
        {
            using (var handler = new HttpClientHandler { UseProxy = false, AllowAutoRedirect = false })
            using (var client = new HttpClient(handler) { Timeout = TimeSpan.FromMilliseconds(ServiceTimeoutMs) })
                return ReadWatcher(client);
        }
        catch (Exception) { return WatcherFailure("query_error", "Home control service client could not be created."); }
    }

    private static object Boot()
    {
        try {
            return new { id = Guid.Parse(File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim()).ToString(),
                uptime_seconds = double.Parse(File.ReadAllText("/proc/uptime").Split(' ')[0], CultureInfo.InvariantCulture) };
        }
        catch (Exception) { return null; }
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length != 0) throw new Exception("This helper only queries; it accepts no commands.");
            if (IntPtr.Size != 4) throw new Exception("Expected a 32-bit Tizen process.");
            uint uid = getuid();
            if (uid != 0 && uid != 901) throw new Exception("Expected root or SDK execution context.");
            var os = OsRelease();
            if (!os.ContainsKey("ID") || os["ID"] != "tizen") throw new Exception("Expected Tizen.");
            var settings = new Dictionary<string, object>();
            foreach (string key in StringKeys) settings[key] = StringValue(key);
            settings[AutoStartKey] = IntegerValue(AutoStartKey);
            var result = new {
                schema_version = 1, read_only = true, uid = uid, architecture_bits = IntPtr.Size * 8,
                os_release = os, main_operation = StringValue(MainOperation, true),
                settings = settings, watcher = Watcher(), boot = Boot(), launcher = Installation.Status()
            };
            Console.WriteLine("AEROTIZEN_HOME_QUERY=" + JsonSerializer.Serialize(result));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Home query failed: " + error.Message);
            return 1;
        }
    }
}
