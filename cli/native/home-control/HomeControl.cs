// This writer is deliberately separate from the getter-only query assembly.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using AeroTizen.Home;

internal sealed class NativePlatform : IPlatform, IDisposable
{
    private const string Operation = "http://tizen.org/appcontrol/operation/main";
    private const string AutoKey = "db/menu/smart_hub/ontvsetting/auto_start";
    private readonly HttpClient client = new HttpClient(new HttpClientHandler { UseProxy = false }) { Timeout = TimeSpan.FromSeconds(3) };
    [DllImport(Compatibility.Libc)] internal static extern uint getuid();
    [DllImport(Compatibility.Libc)] private static extern void free(IntPtr value);
    [DllImport(Compatibility.Vconf)] private static extern IntPtr vconf_get_str(string key);
    [DllImport(Compatibility.Vconf)] private static extern int vconf_get_int(string key, out int value);
    [DllImport(Compatibility.Vconf)] private static extern int vconf_set_str(string key, string value);
    [DllImport(Compatibility.Vconf)] private static extern int vconf_set_int(string key, int value);
    [DllImport(Compatibility.AppOperation)]
    private static extern int app_operation_get_current_app(string operation, out IntPtr appId);
    [DllImport(Compatibility.AppOperation)]
    private static extern int app_operation_set_current_app(string operation, string appId);
    [DllImport(Compatibility.AppContext)]
    private static extern byte util_is_appbooting_supported_webapp_byappid(string appId);
    internal static void Check(int code) { if (code != 0) throw new Exception("Native call failed: " + code); }
    internal static Dictionary<string, string> OsRelease()
    {
        var result = new Dictionary<string, string>();
        foreach (string line in File.ReadAllLines("/etc/os-release"))
        {
            int separator = line.IndexOf('=');
            if (separator > 0) result[line.Substring(0, separator)] = line.Substring(separator + 1).Trim('"');
        }
        return result;
    }
    public void CheckCompatibility(bool applying)
    {
        Compatibility.RequireRuntime(IntPtr.Size, RuntimeInformation.ProcessArchitecture, getuid(), OsRelease());
        Compatibility.RequireApis(applying, Compatibility.RequireExports);
    }
    public string Firmware => OsRelease()["BUILD_ID"];
    public bool LauncherEligible() => Directory.Exists("/opt/usr/apps/DclHome001") && util_is_appbooting_supported_webapp_byappid(Policy.Target) != 0;
    public bool LauncherInstalled() => Installation.Exists();
    private string String(string key)
    {
        IntPtr value = vconf_get_str(key);
        if (value == IntPtr.Zero) throw new Exception("Native value unavailable: " + key);
        try { return Marshal.PtrToStringAnsi(value); } finally { free(value); }
    }
    public Snapshot Read()
    {
        IntPtr app;
        Check(app_operation_get_current_app(Operation, out app));
        if (app == IntPtr.Zero) throw new Exception("Native Home owner unavailable.");
        string main;
        try { main = Marshal.PtrToStringAnsi(app); } finally { free(app); }
        var strings = new Dictionary<string, string>();
        foreach (string key in Policy.Keys) strings[key] = String(key);
        int auto; Check(vconf_get_int(AutoKey, out auto));
        return new Snapshot { Main = main, Strings = strings, AutoStart = auto };
    }
    public void SetMain(string value) => Check(app_operation_set_current_app(Operation, value));
    public void SetString(string key, string value) => Check(vconf_set_str(key, value));
    public void SetAutoStart(int value) => Check(vconf_set_int(AutoKey, value));
    private Watcher ParseWatcher(JsonElement value) => new Watcher {
        Protocol = value.GetProperty("protocol").GetInt32(), AppId = value.GetProperty("app_id").GetString(),
        Persistent = value.GetProperty("persistent").GetBoolean(), Mode = value.GetProperty("mode").GetString(),
        Transaction = value.GetProperty("transaction").GetString(), BaselineHash = value.GetProperty("baseline_sha256").GetString()
    };
    public Watcher ReadWatcher()
    {
        using (var response = client.GetAsync("http://127.0.0.1:47790/").GetAwaiter().GetResult())
        {
            response.EnsureSuccessStatusCode();
            using (var doc = JsonDocument.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult()))
                return ParseWatcher(doc.RootElement.GetProperty("homeControl"));
        }
    }
    public Watcher ChangeWatcher(Watcher expected, string mode, string transaction, string baselineHash)
    {
        using (var message = new HttpRequestMessage(HttpMethod.Post, "http://127.0.0.1:47790/control/home"))
        {
            message.Headers.Add("X-AeroTizen-Home", "1");
            message.Content = new StringContent(JsonSerializer.Serialize(new {
                expected_mode = expected.Mode, expected_transaction = expected.Transaction,
                expected_baseline_sha256 = expected.BaselineHash, mode = mode,
                transaction = transaction, baseline_sha256 = baselineHash
            }), Encoding.UTF8, "application/json");
            // The service requires this exact media type and rejects browser origins.
            message.Content.Headers.ContentType.CharSet = null;
            using (var response = client.SendAsync(message).GetAwaiter().GetResult())
            {
                response.EnsureSuccessStatusCode();
                using (var doc = JsonDocument.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult()))
                    return ParseWatcher(doc.RootElement);
            }
        }
    }
    public void Dispose() => client.Dispose();
}

internal static class HomeControl
{
    internal static Request ReadRequest(string path)
    {
        // An uninstalled recovery can carry the original boot apply request too.
        if (new FileInfo(path).Length > 393216) throw new Exception("Control request too large.");
        using (var doc = JsonDocument.Parse(File.ReadAllText(path)))
        {
            var root = doc.RootElement;
            if (root.GetProperty("schema_version").GetInt32() != 1) throw new Exception("Invalid request schema.");
            string hash = root.GetProperty("baseline_sha256").GetString();
            string transaction = root.GetProperty("transaction").GetString();
            JsonElement bootValue, restoreBootValue, legacyArtValue, absentValue, recovery;
            bool boot = root.TryGetProperty("boot", out bootValue) && bootValue.GetBoolean();
            // Reject old apply requests rather than silently ignoring a removed override.
            if (root.TryGetProperty("art_return", out legacyArtValue) && legacyArtValue.GetBoolean())
                throw new Exception("Art return overrides are no longer supported.");
            string restoreBoot = root.TryGetProperty("restore_boot_transaction", out restoreBootValue) ? restoreBootValue.GetString() : null;
            bool absent = root.TryGetProperty("launcher_absent", out absentValue) && absentValue.GetBoolean();
            if (!Regex.IsMatch(hash, "^[a-f0-9]{64}$") || !Regex.IsMatch(transaction, "^[a-f0-9]{32}$"))
                throw new Exception("Invalid request identity.");
            if (restoreBoot != null && !Regex.IsMatch(restoreBoot, "^[a-f0-9]{32}$")) throw new Exception("Invalid boot recovery transaction.");
            byte[] original = Convert.FromBase64String(root.GetProperty("baseline_base64").GetString());
            using (var sha = SHA256.Create())
                if (BitConverter.ToString(sha.ComputeHash(original)).Replace("-", "").ToLowerInvariant() != hash)
                    throw new Exception("Original backup checksum mismatch.");
            bool recoveryBoot = false;
            if (root.TryGetProperty("recovery_apply", out recovery))
            {
                if (!absent || recovery.GetProperty("schema_version").GetInt32() != 1 ||
                    recovery.GetProperty("action").GetString() != "apply" || !recovery.GetProperty("boot").GetBoolean() ||
                    !Regex.IsMatch(recovery.GetProperty("transaction").GetString(), "^[a-f0-9]{32}$") ||
                    recovery.GetProperty("baseline_sha256").GetString() != hash ||
                    Convert.ToBase64String(Convert.FromBase64String(recovery.GetProperty("baseline_base64").GetString())) != Convert.ToBase64String(original))
                    throw new Exception("Invalid PC boot recovery receipt.");
                recoveryBoot = true;
            }
            using (var baseline = JsonDocument.Parse(original))
            {
                var saved = baseline.RootElement;
                if (saved.GetProperty("schema_version").GetInt32() != 1 || saved.GetProperty("kind").GetString() != "aerotizen.home-baseline" ||
                    string.IsNullOrWhiteSpace(saved.GetProperty("device").GetProperty("model").GetString()) ||
                    string.IsNullOrWhiteSpace(saved.GetProperty("device").GetProperty("firmware_build").GetString()))
                    throw new Exception("Invalid device metadata or baseline schema.");
                var home = saved.GetProperty("home");
                if (home.GetProperty("operation").GetString() != "http://tizen.org/appcontrol/operation/main")
                    throw new Exception("Unexpected baseline operation.");
                var settings = home.GetProperty("settings");
                var strings = new Dictionary<string, string>();
                foreach (string key in Policy.Keys)
                {
                    var item = settings.GetProperty(key);
                    if (item.GetProperty("type").GetString() != "string") throw new Exception("Invalid baseline type.");
                    strings[key] = item.GetProperty("value").GetString();
                }
                var auto = settings.GetProperty("db/menu/smart_hub/ontvsetting/auto_start");
                if (auto.GetProperty("type").GetString() != "int") throw new Exception("Invalid autostart type.");
                return new Request {
                    Action = root.GetProperty("action").GetString(), Transaction = transaction, BaselineHash = hash,
                    Boot = boot, RestoreBootTransaction = restoreBoot,
                    LauncherAbsent = absent, RecoveryBoot = recoveryBoot,
                    Firmware = saved.GetProperty("device").GetProperty("firmware_build").GetString(),
                    Original = new Snapshot { Main = home.GetProperty("default_app").GetString(), Strings = strings, AutoStart = auto.GetProperty("value").GetInt32() }
                };
            }
        }
    }
    public static int Main(string[] args)
    {
        Result result;
        uint? uid = null;
        string action = null;
        try
        {
            uid = NativePlatform.getuid();
            if (args.Length != 1 || IntPtr.Size != 4 || uid != 901)
                throw new Exception("Expected one request file and 32-bit SDK UID 901; root is not used.");
            var request = ReadRequest(args[0]);
            action = request.Action;
            using (var guard = new FileStream("/home/owner/share/tmp/sdk_tools/.aerotizen-home-control.lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            using (var platform = new NativePlatform()) result = Policy.Execute(platform, request);
        }
        catch (Exception error) { result = new Result { Error = error.Message }; }
        Console.WriteLine("AEROTIZEN_HOME_CONTROL=" + JsonSerializer.Serialize(new { schema_version = 1, uid = uid, action = action, result = result }));
        return result.Success ? 0 : 1;
    }
}
