// Temporary setter permission test. Every setter receives the value just verified by the getters.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

internal static class HomeServiceWriteProbe
{
    private const string Operation = "http://tizen.org/appcontrol/operation/main";
    private const string AutoKey = "db/menu/smart_hub/ontvsetting/auto_start";
    private static readonly string[] Keys = {
        "db/appfw/home_appid", "db/appfw/startup_appid", "db/appfw/booting_appid_backup", "db/first_screen/type"
    };
    [DllImport("libvconf.so.0")] private static extern int vconf_set_str(string key, string value);
    [DllImport("libvconf.so.0")] private static extern int vconf_set_int(string key, int value);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    private static extern int app_operation_set_current_app(string operation, string appId);

    internal sealed class Snapshot
    {
        internal uint Uid;
        internal string Firmware, Main;
        internal int Auto;
        internal readonly Dictionary<string, string> Strings = new Dictionary<string, string>();
        internal static Snapshot Parse(JsonElement value)
        {
            if (value.GetProperty("schema_version").GetInt32() != 1 || !value.GetProperty("read_only").GetBoolean()
                || value.GetProperty("architecture_bits").GetInt32() != 32)
                throw new InvalidDataException("Incomplete read test");
            var os = value.GetProperty("os_release");
            if (os.GetProperty("ID").GetString() != "tizen") throw new PlatformNotSupportedException();
            var result = new Snapshot { Uid = value.GetProperty("uid").GetUInt32(), Firmware = os.GetProperty("BUILD_ID").GetString() };
            if (result.Uid == 0 || string.IsNullOrWhiteSpace(result.Firmware)) throw new InvalidDataException();
            result.Main = String(value.GetProperty("main_operation"));
            var settings = value.GetProperty("settings");
            foreach (string key in Keys) result.Strings[key] = String(settings.GetProperty(key));
            var auto = settings.GetProperty(AutoKey);
            if (auto.GetProperty("status").GetString() != "ok") throw new InvalidDataException();
            result.Auto = auto.GetProperty("value").GetInt32();
            if (result.Auto != 0 && result.Auto != 1) throw new InvalidDataException();
            return result;
        }
        private static string String(JsonElement value)
        {
            if (value.GetProperty("status").GetString() != "ok") throw new InvalidDataException();
            string text = value.GetProperty("value").GetString();
            if (string.IsNullOrEmpty(text) || text.Length > 256) throw new InvalidDataException();
            return text;
        }
        internal static Snapshot Read()
        {
            using (var doc = JsonDocument.Parse(JsonSerializer.Serialize(HomeServiceProbe.Read()))) return Parse(doc.RootElement);
        }
        internal bool Same(Snapshot other)
        {
            if (Uid != other.Uid || Firmware != other.Firmware || Main != other.Main || Auto != other.Auto) return false;
            foreach (string key in Keys) if (Strings[key] != other.Strings[key]) return false;
            return true;
        }
    }
    internal sealed class Step
    {
        public string key { get; set; }
        public string status { get; set; }
        public int? native_code { get; set; }
        public string error { get; set; }
    }
    internal sealed class Report
    {
        public int schema_version { get; set; } = 1;
        public bool read_only { get; set; } = false;
        public bool same_values { get; set; } = true;
        public bool success { get; set; }
        public bool? baseline_unchanged { get; set; }
        public string error { get; set; }
        public List<Step> steps { get; set; } = new List<Step>();
    }
    private static void Save(string file, Report report)
    {
        string temporary = file + ".tmp";
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
        {
            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(report);
            stream.Write(bytes, 0, bytes.Length); stream.Flush(true);
        }
        File.Move(temporary, file, true);
    }
    private static void Check(Snapshot original, Func<Snapshot> read)
    {
        if (!original.Same(read())) throw new InvalidOperationException("Values changed since read test");
    }
    private static void Test(string key, Func<int> setter, Snapshot original, Func<Snapshot> read, Action<Report> save, Report report)
    {
        Check(original, read);
        var step = new Step { key = key, status = "requested" };
        report.steps.Add(step);
        save(report);
        try
        {
            step.native_code = setter();
        }
        catch (Exception error)
        {
            step.status = "failed"; step.error = error.GetType().Name;
        }
        // A failed permission check can still leave other setters available.
        // Stop the whole test if any value changed or the fresh read is incomplete.
        try { Check(original, read); }
        catch (Exception error)
        {
            step.status = "verification_failed"; step.error = error.GetType().Name;
            save(report);
            throw;
        }
        step.status = step.native_code == 0 && step.error == null ? "verified" : "failed";
        save(report);
    }
    internal static void Execute(Snapshot original, Func<Snapshot> read, Func<string, object, int> setter, Action<Report> save, Report report)
    {
        Check(original, read);
        save(report);
        Test("operation/main", () => setter("operation/main", original.Main), original, read, save, report);
        foreach (string key in Keys)
            Test(key, () => setter(key, original.Strings[key]), original, read, save, report);
        Test(AutoKey, () => setter(AutoKey, original.Auto), original, read, save, report);
        Check(original, read);
        report.success = report.steps.TrueForAll(step => step.status == "verified");
    }
    private static int NativeSetter(string key, object value)
    {
        if (key == "operation/main") return app_operation_set_current_app(Operation, (string)value);
        if (key == AutoKey) return vconf_set_int(AutoKey, (int)value);
        if (Array.IndexOf(Keys, key) < 0) throw new ArgumentException();
        return vconf_set_str(key, (string)value);
    }
    public static int Main(string[] args)
    {
        var report = new Report();
        string progress = null;
        Snapshot original = null;
        try
        {
            if (args.Length != 1 || Path.GetFileName(args[0]) != "aerotizen-native-home-set-baseline-v2.json"
                || new FileInfo(args[0]).Length > 16384) throw new ArgumentException();
            progress = Path.Combine(Path.GetDirectoryName(args[0]), "aerotizen-native-home-set-progress-v2.json");
            using (var doc = JsonDocument.Parse(File.ReadAllText(args[0]))) original = Snapshot.Parse(doc.RootElement);
            Execute(original, Snapshot.Read, NativeSetter, value => Save(progress, value), report);
        }
        catch (Exception error) { report.error = error.GetType().Name; }
        try { if (original != null) report.baseline_unchanged = original.Same(Snapshot.Read()); }
        catch (Exception) { report.baseline_unchanged = null; }
        report.success = report.success && report.baseline_unchanged == true;
        try { if (progress != null) Save(progress, report); } catch (Exception) { /* Parent keeps its launch marker. */ }
        Console.WriteLine("AEROTIZEN_SERVICE_HOME_SET=" + JsonSerializer.Serialize(report));
        return report.success ? 0 : 1;
    }
}
