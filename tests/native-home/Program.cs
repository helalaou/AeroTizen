using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using AeroTizen.Home;

sealed class Fake : IPlatform
{
    public string Firmware { get; set; } = "TEST-1";
    public bool Eligible = true, SideEffects, AutoSideEffects, AutoBadScreen, FailAll, SilentMain, LostCommit, ChangeDuringHold;
    public bool Installed = true, WatcherUnavailable, InstallationUnavailable, ReinstallOnWrite;
    public int FailWrite, FailFrom, Writes;
    public string MissingLibrary, MissingSymbol;
    public int PointerSize = 4;
    public Architecture ProcessArchitecture = Architecture.Arm;
    public uint Uid = 901;
    public Dictionary<string, string> Os = new Dictionary<string, string> {
        ["ID"] = "tizen", ["BUILD_ID"] = "TEST-1", ["VERSION_ID"] = "7.0.0"
    };
    public bool CompatibilityChecked;
    public readonly List<string> Events = new List<string>();
    public Snapshot Current = Original();
    public Watcher Control = new Watcher { Protocol = 1, AppId = Policy.Target, Persistent = true, Mode = "watcher" };
    public static Snapshot Original()
    {
        var strings = new Dictionary<string, string>();
        foreach (string key in Policy.Keys) strings[key] = key == Policy.HomeKey || key == "db/first_screen/type" ? "Samsung.Home" : "TV.Viewer";
        return new Snapshot { Main = "Samsung.Home", Strings = strings, AutoStart = 0 };
    }
    public void CheckCompatibility(bool applying)
    {
        Compatibility.RequireRuntime(PointerSize, ProcessArchitecture, Uid, Os);
        Compatibility.RequireApis(applying, (library, symbols) => {
            if (library == MissingLibrary || Array.IndexOf(symbols, MissingSymbol) >= 0)
                throw new Exception("required native API unavailable");
        });
        CompatibilityChecked = true;
    }
    public bool LauncherEligible() => Eligible;
    public bool LauncherInstalled()
    {
        if (InstallationUnavailable) throw new Exception("installation lookup unavailable");
        return Installed;
    }
    public Snapshot Read() => Current.Copy();
    private void Write(string kind)
    {
        Program.Check(CompatibilityChecked, "compatibility must precede every native write");
        Events.Add("write:" + kind); Writes++;
        if (FailAll || Writes == FailWrite || (FailFrom > 0 && Writes >= FailFrom)) throw new Exception("simulated write failure");
        if (ReinstallOnWrite) Installed = true;
    }
    public void SetMain(string value)
    {
        Write("main"); if (SilentMain) return;
        Current.Main = value;
        if (SideEffects && value == Policy.Target)
        {
            foreach (string key in Policy.Keys) Current.Strings[key] = value;
            Current.AutoStart = 1;
        }
    }
    public void SetString(string key, string value) { Write(key); Current.Strings[key] = value; }
    public void SetAutoStart(int value) {
        Write("auto"); Current.AutoStart = value;
        if (AutoSideEffects && value == 1) {
            Current.Strings["db/appfw/startup_appid"] = Policy.Target;
            Current.Strings["db/appfw/booting_appid_backup"] = Policy.Target;
        }
        if (AutoBadScreen && value == 1) Current.Strings["db/first_screen/type"] = "Other.Home";
    }
    public Watcher ReadWatcher()
    {
        if (WatcherUnavailable) throw new Exception("watcher must not be read after uninstall");
        return Control;
    }
    public Watcher ChangeWatcher(Watcher expected, string mode, string transaction, string hash)
    {
        Program.Check(CompatibilityChecked, "compatibility must precede watcher handoff");
        Program.Check(expected == Control, "CAS must use current control state");
        Events.Add("mode:" + mode);
        Control = new Watcher { Protocol = 1, AppId = Policy.Target, Persistent = true, Mode = mode, Transaction = transaction, BaselineHash = hash };
        if (ChangeDuringHold && mode == "hold") Current.Main = "Other.Home";
        if (LostCommit && mode == "native") throw new Exception("commit response lost");
        return Control;
    }
}
static class Program
{
    static int count;
    public static void Check(bool value, string message = "assertion failed") { if (!value) throw new Exception(message); }
    static Request Request(string action = "apply") => new Request {
        Action = action, Firmware = "TEST-1", Original = Fake.Original(),
        BaselineHash = new string('b', 64), Transaction = new string('a', 32)
    };
    internal static void Test(string name, Action test) { test(); count++; Console.WriteLine("PASS " + name); }
    static void Refused(Fake fake, Request request)
    {
        bool failed = false; try { Policy.Execute(fake, request); } catch { failed = true; }
        Check(failed); Check(fake.Events.Count == 0, "preflight must not mutate");
    }
    static void Applied(Fake fake)
    {
        fake.Current.Main = Policy.Target; fake.Current.Strings[Policy.HomeKey] = Policy.Target;
        fake.Control = new Watcher { Protocol = 1, AppId = Policy.Target, Persistent = true, Mode = "native", Transaction = new string('c', 32), BaselineHash = new string('b', 64) };
    }
    static Request RecoveryRequest(Action<Dictionary<string, object>> alter = null, string model = "QE65LS03DAUXXU", string firmware = "TEST-1")
    {
        var original = Fake.Original();
        var settings = new Dictionary<string, object>();
        foreach (string key in Policy.Keys) settings[key] = new { type = "string", value = original.Strings[key] };
        settings["db/menu/smart_hub/ontvsetting/auto_start"] = new { type = "int", value = original.AutoStart };
        byte[] raw = JsonSerializer.SerializeToUtf8Bytes(new {
            schema_version = 1, kind = "aerotizen.home-baseline",
            device = new { model = model, firmware_build = firmware },
            home = new { operation = "http://tizen.org/appcontrol/operation/main", default_app = original.Main, settings = settings }
        });
        string hash;
        using (var sha = SHA256.Create()) hash = BitConverter.ToString(sha.ComputeHash(raw)).Replace("-", "").ToLowerInvariant();
        var proof = new Dictionary<string, object> {
            ["schema_version"] = 1, ["action"] = "apply", ["boot"] = true,
            ["transaction"] = new string('b', 32), ["baseline_sha256"] = hash, ["baseline_base64"] = Convert.ToBase64String(raw)
        };
        var root = new Dictionary<string, object> {
            ["schema_version"] = 1, ["action"] = "restore", ["launcher_absent"] = true,
            ["transaction"] = new string('a', 32), ["baseline_sha256"] = hash, ["baseline_base64"] = Convert.ToBase64String(raw),
            ["recovery_apply"] = proof
        };
        alter?.Invoke(root);
        string path = Path.GetTempFileName();
        try { File.WriteAllText(path, JsonSerializer.Serialize(root)); return HomeControl.ReadRequest(path); }
        finally { File.Delete(path); }
    }
    static void BadRecovery(Action<Dictionary<string, object>> alter)
    {
        bool failed = false; try { RecoveryRequest(alter); } catch { failed = true; }
        Check(failed, "invalid PC proof must be rejected by the native parser");
    }
    static int Main()
    {
        Test("apply holds watcher before assigning Home and preserves zero autostart", () => {
            var fake = new Fake(); var result = Policy.Execute(fake, Request());
            Check(result.Success && fake.Control.Mode == "native"); Check(fake.Events[0] == "mode:hold");
            Check(fake.Current.Main == Policy.Target && fake.Current.AutoStart == 0);
            Check(fake.Current.Strings["db/appfw/startup_appid"] == "TV.Viewer");
        });
        Test("derived startup and autostart side effects are put back", () => {
            var fake = new Fake { SideEffects = true }; Check(Policy.Execute(fake, Request()).Success);
            Check(fake.Current.AutoStart == 0 && fake.Current.Strings["db/first_screen/type"] == "Samsung.Home");
        });
        for (int index = 1; index <= 5; index++) {
            int failure = index;
            Test("write failure " + index + " restores the complete baseline before watcher", () => {
                var fake = new Fake { SideEffects = true, FailWrite = failure };
                var result = Policy.Execute(fake, Request());
                Check(!result.Success && result.RolledBack && Policy.Same(fake.Current, Fake.Original()));
                Check(fake.Events[fake.Events.Count - 1] == "mode:watcher");
            });
        }
        Test("silent setter failure is caught by readback", () => {
            var fake = new Fake { SilentMain = true }; var result = Policy.Execute(fake, Request());
            Check(!result.Success && result.RolledBack && fake.Control.Mode == "watcher");
        });
        Test("changed firmware refuses all writes", () => { Refused(new Fake { Firmware = "TEST-2" }, Request()); });
        Test("changed baseline refuses all writes", () => { var fake = new Fake(); fake.Current.Main = "Other.Home"; Refused(fake, Request()); });
        Test("ineligible launcher refuses all writes", () => { Refused(new Fake { Eligible = false }, Request()); });
        Test("old watcher refuses all writes", () => { var fake = new Fake(); fake.Control.Protocol = 0; Refused(fake, Request()); });
        Test("restore refuses third-party preference changes", () => {
            var fake = new Fake(); Applied(fake); fake.Current.Strings["db/appfw/startup_appid"] = "Other.App";
            Refused(fake, Request("restore"));
        });
        Test("restore repairs an interrupted mixed assignment", () => {
            var fake = new Fake(); Applied(fake); fake.Control.Mode = "hold";
            fake.Current.Strings[Policy.HomeKey] = "Samsung.Home";
            Check(Policy.Execute(fake, Request("restore")).Success && Policy.Same(fake.Current, Fake.Original()));
            Check(fake.Control.Mode == "watcher");
        });
        Test("failed restore keeps the watcher on hold", () => {
            var fake = new Fake(); Applied(fake); fake.FailAll = true;
            var result = Policy.Execute(fake, Request("restore")); Check(!result.Success && fake.Control.Mode == "hold");
        });
        Test("lost native commit response can still roll back", () => {
            var fake = new Fake { LostCommit = true }; var result = Policy.Execute(fake, Request());
            Check(result.RolledBack && Policy.Same(fake.Current, Fake.Original()) && fake.Control.Mode == "watcher");
        });
        Test("failed rollback never reenables the watcher", () => {
            var fake = new Fake { SideEffects = true, FailFrom = 2 };
            var result = Policy.Execute(fake, Request());
            Check(!result.Success && !result.RolledBack && fake.Current.Main == Policy.Target && fake.Control.Mode == "hold");
        });
        Test("duplicate apply is refused", () => { var fake = new Fake(); Applied(fake); Refused(fake, Request()); });
        Test("restore is idempotent once original values and watcher are back", () => {
            var fake = new Fake(); Check(Policy.Execute(fake, Request("restore")).Success && fake.Events.Count == 0);
        });
        Test("mismatched transaction baseline is refused", () => {
            var fake = new Fake(); Applied(fake); fake.Control.BaselineHash = new string('d', 64); Refused(fake, Request("restore"));
        });
        Test("Home changes during hold are preserved for review", () => {
            var fake = new Fake { ChangeDuringHold = true }; var result = Policy.Execute(fake, Request());
            Check(!result.Success && fake.Writes == 0 && fake.Current.Main == "Other.Home" && fake.Control.Mode == "hold");
        });
        Test("boot enables autostart and accepts OS-derived startup IDs", () => {
            var fake = new Fake { AutoSideEffects = true }; var request = Request(); request.Boot = true;
            Check(Policy.Execute(fake, request).Success && Policy.BootReady(fake.Current, request.Original));
            Check(fake.Current.Strings["db/appfw/startup_appid"] == Policy.Target);
        });
        Test("boot restore uses matching transaction and restores all original values", () => {
            var fake = new Fake { AutoSideEffects = true }; var request = Request(); request.Boot = true;
            Check(Policy.Execute(fake, request).Success);
            var restore = Request("restore"); restore.Transaction = new string('d', 32); restore.RestoreBootTransaction = request.Transaction;
            Check(Policy.Execute(fake, restore).Success && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("boot restore retry accepts the held restore token after a failed setter", () => {
            var fake = new Fake(); var apply = Request(); apply.Boot = true; apply.Transaction = new string('c', 32);
            Check(Policy.Execute(fake, apply).Success);
            fake.FailWrite = fake.Writes + 1;
            var restore = Request("restore"); restore.Transaction = new string('d', 32);
            restore.RestoreBootTransaction = apply.Transaction;
            var failed = Policy.Execute(fake, restore);
            Check(!failed.Success && fake.Control.Mode == "hold" && fake.Current.AutoStart == 1);
            Check(fake.Control.Transaction == restore.Transaction);
            var retry = Request("restore"); retry.Transaction = new string('e', 32);
            retry.RestoreBootTransaction = restore.Transaction;
            Check(Policy.Execute(fake, retry).Success && Policy.Same(fake.Current, Fake.Original()));
            Check(fake.Control.Mode == "watcher");
        });
        Test("changed autostart without boot recovery proof is refused", () => {
            var fake = new Fake(); Applied(fake); fake.Current.AutoStart = 1; Refused(fake, Request("restore"));
        });
        Test("boot restore refuses another transaction", () => {
            var fake = new Fake(); Applied(fake); fake.Current.AutoStart = 1;
            var request = Request("restore"); request.RestoreBootTransaction = new string('e', 32); Refused(fake, request);
        });
        Test("boot proof does not permit arbitrary autostart values", () => {
            var fake = new Fake(); Applied(fake); fake.Current.AutoStart = 2;
            var request = Request("restore"); request.RestoreBootTransaction = fake.Control.Transaction; Refused(fake, request);
        });
        Test("boot restore recovers a partial held assignment", () => {
            var fake = new Fake(); Applied(fake); fake.Control.Mode = "hold"; fake.Current.AutoStart = 1;
            var request = Request("restore"); request.RestoreBootTransaction = fake.Control.Transaction;
            Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("failed autostart write restores original Home before enabling watcher", () => {
            var fake = new Fake { FailWrite = 3 }; var request = Request(); request.Boot = true;
            var result = Policy.Execute(fake, request);
            Check(result.RolledBack && Policy.Same(fake.Current, Fake.Original()) && fake.Control.Mode == "watcher");
        });
        Test("lost boot commit reply restores autostart and derived IDs", () => {
            var fake = new Fake { LostCommit = true, AutoSideEffects = true }; var request = Request(); request.Boot = true;
            Check(Policy.Execute(fake, request).RolledBack && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("boot flag is invalid on restore", () => {
            var request = Request("restore"); request.Boot = true; Refused(new Fake(), request);
        });
        Test("unexpected first-screen changes during boot are rolled back", () => {
            var fake = new Fake { AutoBadScreen = true }; var request = Request(); request.Boot = true;
            Check(Policy.Execute(fake, request).RolledBack && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("removed Art apply requests are rejected by the native parser", () => {
            BadRecovery(root => {
                root["action"] = "apply"; root["launcher_absent"] = false;
                root.Remove("recovery_apply"); root["art_return"] = true;
            });
        });
        Test("removed Art flag cannot be placed on a restore request", () => {
            BadRecovery(root => root["art_return"] = true);
        });
        Test("installed restore still recovers legacy first-screen overrides", () => {
            foreach (bool boot in new[] { false, true }) {
                var fake = new Fake(); Applied(fake);
                fake.Current.Strings["db/first_screen/type"] = Policy.Target;
                var restore = Request("restore");
                if (boot) {
                    fake.Current.AutoStart = 1;
                    fake.Current.Strings["db/appfw/startup_appid"] = Policy.Target;
                    fake.Current.Strings["db/appfw/booting_appid_backup"] = Policy.Target;
                    restore.RestoreBootTransaction = fake.Control.Transaction;
                }
                Check(Policy.Execute(fake, restore).Success && Policy.Same(fake.Current, Fake.Original()));
                Check(fake.Control.Mode == "watcher");
            }
        });
        Test("uninstalled restore accepts a legacy Art boot receipt", () => {
            var request = RecoveryRequest(root => ((Dictionary<string, object>)root["recovery_apply"])["art_return"] = true);
            var fake = new Fake { Installed = false, WatcherUnavailable = true };
            fake.Current.Main = Policy.Target; fake.Current.AutoStart = 1;
            foreach (string key in Policy.Keys) fake.Current.Strings[key] = Policy.Target;
            Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
            Check(fake.Events.TrueForAll(e => e.StartsWith("write:")));
        });
        Test("uninstalled Home restore does not contact a watcher", () => {
            var fake = new Fake(); Applied(fake); fake.Installed = false; fake.WatcherUnavailable = true;
            var request = Request("restore"); request.LauncherAbsent = true;
            Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
            Check(fake.Events.TrueForAll(e => e.StartsWith("write:")));
        });
        Test("uninstalled original state is already restored", () => {
            var fake = new Fake { Installed = false, WatcherUnavailable = true };
            var request = Request("restore"); request.LauncherAbsent = true;
            Check(Policy.Execute(fake, request).Success && fake.Events.Count == 0);
        });
        for (int index = 1; index <= 6; index++) {
            int failure = index;
            Test("uninstalled boot/Art restore retries failed setter " + index, () => {
                var fake = new Fake { Installed = false, WatcherUnavailable = true, FailWrite = failure };
                fake.Current.Main = Policy.Target; fake.Current.AutoStart = 1;
                foreach (string key in Policy.Keys) fake.Current.Strings[key] = Policy.Target;
                var request = Request("restore"); request.LauncherAbsent = true; request.RecoveryBoot = true;
                Check(!Policy.Execute(fake, request).Success);
                Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
                Check(fake.Events.TrueForAll(e => e.StartsWith("write:")));
            });
        }
        Test("uninstalled boot restore still requires PC boot evidence", () => {
            var fake = new Fake { Installed = false, WatcherUnavailable = true }; fake.Current.AutoStart = 1;
            var request = Request("restore"); request.LauncherAbsent = true; Refused(fake, request);
        });
        Test("uninstalled recovery preserves third-party preferences", () => {
            var fake = new Fake { Installed = false, WatcherUnavailable = true }; fake.Current.Main = "Other.Home";
            var request = Request("restore"); request.LauncherAbsent = true; request.RecoveryBoot = true;
            Refused(fake, request);
        });
        Test("unknown installation state cannot bypass the watcher", () => {
            Refused(new Fake { InstallationUnavailable = true }, Request("restore"));
        });
        Test("an installed app with an unavailable watcher refuses restore", () => {
            Refused(new Fake { WatcherUnavailable = true }, Request("restore"));
        });
        Test("uninstall between host and native preflight stops restore", () => {
            Refused(new Fake { Installed = false }, Request("restore"));
        });
        Test("reinstall between host and native preflight stops restore", () => {
            var request = Request("restore"); request.LauncherAbsent = true; Refused(new Fake(), request);
        });
        Test("reinstall during recovery stops further writes", () => {
            var fake = new Fake { Installed = false, WatcherUnavailable = true, ReinstallOnWrite = true };
            fake.Current.Main = Policy.Target; fake.Current.Strings[Policy.HomeKey] = Policy.Target;
            var request = Request("restore"); request.LauncherAbsent = true;
            Check(!Policy.Execute(fake, request).Success && fake.Writes == 1);
            Check(fake.Current.Strings[Policy.HomeKey] == Policy.Target);
        });
        Test("apply cannot request uninstalled recovery", () => {
            var request = Request(); request.LauncherAbsent = true; Refused(new Fake(), request);
        });
        Test("installed restore cannot use uninstalled boot permission", () => {
            var request = Request("restore"); request.RecoveryBoot = true; Refused(new Fake(), request);
        });
        Test("native request parser validates the PC boot proof", () => {
            var request = RecoveryRequest(); Check(request.LauncherAbsent && request.RecoveryBoot);
            var fake = new Fake { Installed = false, WatcherUnavailable = true }; fake.Current.AutoStart = 1;
            Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("native PC proof must contain the identical original bytes", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["baseline_base64"] = Convert.ToBase64String(new byte[] { 1 }));
        });
        Test("native PC proof must contain the identical original checksum", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["baseline_sha256"] = new string('c', 64));
        });
        Test("native PC proof requires boot apply", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["boot"] = false);
        });
        Test("native PC proof requires a valid transaction", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["transaction"] = "../other");
        });
        Test("native PC proof rejects a boolean schema", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["schema_version"] = true);
        });
        Test("native PC proof cannot use a restore as its source", () => {
            BadRecovery(root => ((Dictionary<string, object>)root["recovery_apply"])["action"] = "restore");
        });
        Test("native PC proof cannot bypass an installed watcher", () => {
            BadRecovery(root => root["launcher_absent"] = false);
        });
        foreach (string action in new[] { "apply", "restore" }) {
            string selected = action;
            foreach (string symbol in new[] { "vconf_get_str", "vconf_get_int", "vconf_set_str", "vconf_set_int",
                "app_operation_get_current_app", "app_operation_set_current_app", "app_manager_get_app_info", "app_info_destroy" }) {
                string missing = symbol;
                Test(selected + " missing " + missing + " refuses before handoff or native writes", () => {
                    Refused(new Fake { MissingSymbol = missing }, Request(selected));
                });
            }
            Test(selected + " missing native library refuses before handoff or writes", () => {
                Refused(new Fake { MissingLibrary = Compatibility.Vconf }, Request(selected));
            });
        }
        Test("apply missing eligibility API refuses before handoff", () => {
            Refused(new Fake { MissingSymbol = "util_is_appbooting_supported_webapp_byappid" }, Request());
        });
        Test("installed and absent restore do not require the apply eligibility API", () => {
            foreach (bool installed in new[] { true, false }) {
                var fake = new Fake { MissingLibrary = Compatibility.AppContext, Installed = installed, Eligible = false };
                Applied(fake);
                var request = Request("restore"); request.LauncherAbsent = !installed;
                Check(Policy.Execute(fake, request).Success && Policy.Same(fake.Current, Fake.Original()));
            }
        });
        Test("64-bit process refuses before writes", () => { Refused(new Fake { PointerSize = 8 }, Request()); });
        Test("non-ARM process refuses before writes", () => { Refused(new Fake { ProcessArchitecture = Architecture.X86 }, Request()); });
        Test("root cannot substitute for SDK UID 901", () => { Refused(new Fake { Uid = 0 }, Request()); });
        Test("non-Tizen runtime refuses before writes", () => {
            var fake = new Fake(); fake.Os["ID"] = "linux"; Refused(fake, Request());
        });
        Test("missing firmware metadata refuses before writes", () => {
            var fake = new Fake(); fake.Os.Remove("BUILD_ID"); Refused(fake, Request());
        });
        Test("empty OS metadata refuses before writes", () => {
            var fake = new Fake(); fake.Os["VERSION_ID"] = ""; Refused(fake, Request());
        });
        Test("unavailable current typed setting refuses before writes", () => {
            var fake = new Fake(); fake.Current.Strings.Remove(Policy.HomeKey); Refused(fake, Request("restore"));
        });
        Test("incomplete original refuses before compatibility and writes", () => {
            var fake = new Fake(); var request = Request(); request.Original.AutoStart = 2;
            Refused(fake, request); Check(!fake.CompatibilityChecked);
        });
        Test("different model firmware and original values can apply and restore", () => {
            var parsed = RecoveryRequest(model: "QE65S90CATXZT", firmware: "OTHER-FIRMWARE");
            var fake = new Fake { Firmware = parsed.Firmware };
            var original = Fake.Original(); original.Main = "Other.StockHome";
            original.Strings[Policy.HomeKey] = original.Main;
            original.Strings["db/appfw/startup_appid"] = "Other.Startup";
            original.Strings["db/first_screen/type"] = "Other.ArtReturn";
            fake.Current = original.Copy();
            var apply = Request(); apply.Firmware = parsed.Firmware; apply.Original = original;
            Check(Policy.Execute(fake, apply).Success);
            var restore = Request("restore"); restore.Firmware = parsed.Firmware; restore.Original = original;
            Check(Policy.Execute(fake, restore).Success && Policy.Same(fake.Current, original));
        });
        Test("native parser still rejects empty model or firmware metadata", () => {
            foreach (string field in new[] { "model", "firmware" }) {
                bool failed = false;
                try { RecoveryRequest(model: field == "model" ? "" : "Other.TV", firmware: field == "firmware" ? "" : "TEST-1"); }
                catch { failed = true; }
                Check(failed);
            }
        });
        ServiceDiagnosticsTests.Run();
        Console.WriteLine("POLICY_TESTS_PASSED=" + count); return 0;
    }
}
