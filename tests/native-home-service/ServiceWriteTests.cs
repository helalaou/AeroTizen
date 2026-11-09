using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Snapshot = HomeServiceWriteProbe.Snapshot;
using Report = HomeServiceWriteProbe.Report;

internal static class ServiceWriteTests
{
    private static readonly string[] Keys = {
        "db/appfw/home_appid", "db/appfw/startup_appid", "db/appfw/booting_appid_backup", "db/first_screen/type"
    };
    private static Snapshot Original(int auto = 1)
    {
        var value = new Snapshot { Uid = 5001, Firmware = "T-TEST-1245.5", Main = "another.launcher.Home", Auto = auto };
        foreach (string key in Keys) value.Strings[key] = "original." + key.Split('/').Last();
        return value;
    }
    private static Snapshot Copy(Snapshot source)
    {
        var value = new Snapshot { Uid = source.Uid, Firmware = source.Firmware, Main = source.Main, Auto = source.Auto };
        foreach (string key in Keys) value.Strings[key] = source.Strings[key];
        return value;
    }
    private static void Assert(bool value) { if (!value) throw new Exception("Assertion failed"); }
    private static void Throws(Action action)
    {
        try { action(); } catch (InvalidOperationException) { return; }
        throw new Exception("Expected stale baseline rejection");
    }
    private static object Expected(Snapshot value, string key)
    {
        if (key == "operation/main") return value.Main;
        if (key == "db/menu/smart_hub/ontvsetting/auto_start") return value.Auto;
        return value.Strings[key];
    }
    public static int Main()
    {
        int cases = 0;
        foreach (int auto in new[] { 0, 1 })
        {
            var original = Original(auto);
            var report = new Report();
            var calls = new List<string>();
            int saves = 0;
            HomeServiceWriteProbe.Execute(original, () => Copy(original), (key, value) => {
                Assert(saves > calls.Count && Equals(value, Expected(original, key)));
                calls.Add(key); return 0;
            }, value => saves++, report);
            Assert(report.success && calls.Count == 6 && report.steps.All(step => step.status == "verified"));
            cases++;
        }
        foreach (bool throwError in new[] { false, true })
        {
            var original = Original();
            var report = new Report();
            int calls = 0;
            HomeServiceWriteProbe.Execute(original, () => Copy(original), (key, value) => {
                calls++;
                if (calls == 1 && throwError) throw new UnauthorizedAccessException();
                return calls == 1 ? -13 : 0;
            }, value => {}, report);
            Assert(!report.success && calls == 6 && report.steps[0].status == "failed" && report.steps[1].status == "verified");
            cases++;
        }
        {
            var original = Original(); var changed = Copy(original); changed.Auto = 0;
            int writes = 0;
            Throws(() => HomeServiceWriteProbe.Execute(original, () => changed, (key, value) => ++writes, value => {}, new Report()));
            Assert(writes == 0); cases++;
        }
        {
            var original = Original(); var actual = Copy(original); var report = new Report();
            int writes = 0;
            Throws(() => HomeServiceWriteProbe.Execute(original, () => Copy(actual), (key, value) => {
                writes++; Assert(Equals(value, Expected(original, key)));
                actual.Auto = 0; return 0;
            }, value => {}, report));
            Assert(writes == 1 && !report.success && actual.Auto == 0); cases++;
        }
        {
            var original = Original(); int writes = 0;
            try {
                HomeServiceWriteProbe.Execute(original, () => Copy(original), (key, value) => ++writes,
                    value => { throw new IOException(); }, new Report());
                throw new Exception("Expected durable journal failure");
            } catch (IOException) { Assert(writes == 0); }
            cases++;
        }
        {
            var original = Original(); int reads = 0, writes = 0;
            Throws(() => HomeServiceWriteProbe.Execute(original, () => {
                if (++reads == 3) throw new InvalidOperationException();
                return Copy(original);
            }, (key, value) => { writes++; return 0; }, value => {}, new Report()));
            Assert(writes == 1); cases++;
        }
        Console.WriteLine(cases + " same-value setter checks passed");
        return 0;
    }
}
