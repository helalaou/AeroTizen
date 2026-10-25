using System;
using System.Collections.Generic;
using AeroTizen.Home;

sealed class Fake : IPlatform
{
    public string Firmware { get; set; } = "TEST-1";
    public bool Eligible = true, SideEffects, AutoSideEffects, AutoBadScreen, FailAll, SilentMain, LostCommit, ChangeDuringHold;
    public int FailWrite, FailFrom, Writes;
    public readonly List<string> Events = new List<string>();
    public Snapshot Current = Original();
    public Watcher Control = new Watcher { Protocol = 1, AppId = Policy.Target, Persistent = true, Mode = "watcher" };
    public static Snapshot Original()
    {
        var strings = new Dictionary<string, string>();
        foreach (string key in Policy.Keys) strings[key] = key == Policy.HomeKey || key == "db/first_screen/type" ? "Samsung.Home" : "TV.Viewer";
        return new Snapshot { Main = "Samsung.Home", Strings = strings, AutoStart = 0 };
    }
    public bool LauncherEligible() => Eligible;
    public Snapshot Read() => Current.Copy();
    private void Write(string kind)
    {
        Events.Add("write:" + kind); Writes++;
        if (FailAll || Writes == FailWrite || (FailFrom > 0 && Writes >= FailFrom)) throw new Exception("simulated write failure");
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
    public Watcher ReadWatcher() => Control;
    public Watcher ChangeWatcher(Watcher expected, string mode, string transaction, string hash)
    {
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
    static void Test(string name, Action test) { test(); count++; Console.WriteLine("PASS " + name); }
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
        Test("Art return explicitly changes first screen and boot validates it", () => {
            var fake = new Fake { AutoSideEffects = true }; var request = Request(); request.Boot = true; request.ArtReturn = true;
            Check(Policy.Execute(fake, request).Success && Policy.BootReady(fake.Current, request.Original, true));
            Check(fake.Current.Strings["db/first_screen/type"] == Policy.Target);
            var restore = Request("restore"); restore.RestoreBootTransaction = request.Transaction;
            Check(Policy.Execute(fake, restore).Success && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("Art target write failure rolls back exact original before watcher", () => {
            var fake = new Fake { FailWrite = 3 }; var request = Request(); request.ArtReturn = true;
            Check(Policy.Execute(fake, request).RolledBack && Policy.Same(fake.Current, Fake.Original()));
        });
        Test("Art return flag is invalid on restore", () => {
            var request = Request("restore"); request.ArtReturn = true; Refused(new Fake(), request);
        });
        Test("unrelated first screen during Art boot rolls back", () => {
            var fake = new Fake { AutoBadScreen = true }; var request = Request(); request.ArtReturn = true; request.Boot = true;
            Check(Policy.Execute(fake, request).RolledBack && Policy.Same(fake.Current, Fake.Original()));
        });
        Console.WriteLine("POLICY_TESTS_PASSED=" + count); return 0;
    }
}
