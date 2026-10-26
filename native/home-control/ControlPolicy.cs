using System;
using System.Collections.Generic;

namespace AeroTizen.Home
{
    public sealed class Snapshot
    {
        public string Main { get; set; }
        public Dictionary<string, string> Strings { get; set; }
        public int AutoStart { get; set; }
        public Snapshot Copy() => new Snapshot { Main = Main, Strings = new Dictionary<string, string>(Strings), AutoStart = AutoStart };
    }
    public sealed class Watcher
    {
        public int Protocol { get; set; }
        public string AppId { get; set; }
        public bool Persistent { get; set; }
        public string Mode { get; set; }
        public string Transaction { get; set; }
        public string BaselineHash { get; set; }
    }
    public sealed class Request
    {
        public string Action { get; set; }
        public string Firmware { get; set; }
        public string BaselineHash { get; set; }
        public string Transaction { get; set; }
        public Snapshot Original { get; set; }
        public bool Boot { get; set; }
        public string RestoreBootTransaction { get; set; }
        public bool LauncherAbsent { get; set; }
        public bool RecoveryBoot { get; set; }
    }
    public sealed class Result
    {
        public bool Success { get; set; }
        public bool RolledBack { get; set; }
        public string Error { get; set; }
        public Snapshot After { get; set; }
        public Watcher Watcher { get; set; }
    }
    public interface IPlatform
    {
        void CheckCompatibility(bool applying);
        string Firmware { get; }
        bool LauncherEligible();
        bool LauncherInstalled();
        Snapshot Read();
        void SetMain(string value);
        void SetString(string key, string value);
        void SetAutoStart(int value);
        Watcher ReadWatcher();
        Watcher ChangeWatcher(Watcher expected, string mode, string transaction, string baselineHash);
    }
    public static class Policy
    {
        public const string Target = "DclHome001.Home";
        public const string HomeKey = "db/appfw/home_appid";
        public static readonly string[] Keys = {
            HomeKey, "db/appfw/startup_appid", "db/appfw/booting_appid_backup", "db/first_screen/type"
        };
        public static bool Same(Snapshot left, Snapshot right)
        {
            if (left.Main != right.Main || left.AutoStart != right.AutoStart) return false;
            foreach (string key in Keys) if (left.Strings[key] != right.Strings[key]) return false;
            return true;
        }
        private static void ValidateValues(Snapshot snapshot)
        {
            if (snapshot == null || string.IsNullOrWhiteSpace(snapshot.Main) || snapshot.Strings == null ||
                snapshot.Strings.Count != Keys.Length || (snapshot.AutoStart != 0 && snapshot.AutoStart != 1))
                throw new Exception("Incomplete native Home values or unsupported autostart type/value.");
            foreach (string key in Keys)
                if (!snapshot.Strings.ContainsKey(key) || string.IsNullOrWhiteSpace(snapshot.Strings[key]))
                    throw new Exception("Required native Home setting is unavailable: " + key);
        }
        public static void Validate(Snapshot original)
        {
            ValidateValues(original);
            if (original.Main == Target) throw new Exception("Invalid original Home baseline.");
            foreach (string key in Keys)
                if (original.Strings[key] == Target) throw new Exception("Invalid original setting: " + key);
            if (original.Main != original.Strings[HomeKey]) throw new Exception("Original Home assignments disagree.");
        }
        private static void Compatible(Snapshot current, Snapshot original, bool restoreBoot)
        {
            if (current.Main != original.Main && current.Main != Target) throw new Exception("Another app owns Home; restore refused.");
            foreach (string key in Keys)
                if (current.Strings[key] != original.Strings[key] && current.Strings[key] != Target)
                    throw new Exception("Unrelated setting changed; restore refused: " + key);
            if (current.AutoStart != original.AutoStart && !(restoreBoot && current.AutoStart == 1))
                throw new Exception("Autostart changed; a matching boot transaction is required for restore.");
        }
        public static bool BootReady(Snapshot current, Snapshot original)
        {
            if (current.Main != Target || current.Strings[HomeKey] != Target || current.AutoStart != 1 ||
                current.Strings["db/first_screen/type"] != original.Strings["db/first_screen/type"]) return false;
            foreach (string key in Keys)
                if (current.Strings[key] != original.Strings[key] && current.Strings[key] != Target) return false;
            return true;
        }
        private static Watcher CheckWatcher(Watcher value)
        {
            if (value == null || value.Protocol != 1 || value.AppId != Target || !value.Persistent ||
                (value.Mode != "watcher" && value.Mode != "native" && value.Mode != "hold"))
                throw new Exception("Install and start the compatible persistent watcher before changing Home.");
            return value;
        }
        private static Watcher Change(IPlatform platform, Watcher expected, string mode, string transaction, string hash)
        {
            var value = CheckWatcher(platform.ChangeWatcher(expected, mode, transaction, hash));
            if (value.Mode != mode || value.Transaction != transaction || value.BaselineHash != hash)
                throw new Exception("Watcher handoff readback failed.");
            return value;
        }
        private static void RequireAbsent(IPlatform platform)
        {
            if (platform.LauncherInstalled()) throw new Exception("AeroTizen is installed; watcher coordination is required.");
        }
        private static void Write(IPlatform platform, Snapshot desired, bool requireAbsent = false)
        {
            if (platform.Read().Main != desired.Main)
            {
                if (requireAbsent) RequireAbsent(platform);
                platform.SetMain(desired.Main);
                if (platform.Read().Main != desired.Main) throw new Exception("Home operation readback failed.");
            }
            // The Home operation can have derived startup side effects. Put every
            // unrelated saved value back. Boot is enabled separately below.
            foreach (string key in Keys)
            {
                if (platform.Read().Strings[key] == desired.Strings[key]) continue;
                if (requireAbsent) RequireAbsent(platform);
                platform.SetString(key, desired.Strings[key]);
                if (platform.Read().Strings[key] != desired.Strings[key]) throw new Exception("Setting readback failed: " + key);
            }
            if (platform.Read().AutoStart != desired.AutoStart)
            {
                if (requireAbsent) RequireAbsent(platform);
                platform.SetAutoStart(desired.AutoStart);
                if (platform.Read().AutoStart != desired.AutoStart) throw new Exception("Autostart readback failed.");
            }
            if (!Same(platform.Read(), desired)) throw new Exception("Final Home readback failed.");
            if (requireAbsent) RequireAbsent(platform);
        }
        private static Result RestoreAbsent(IPlatform platform, Request request, Snapshot before)
        {
            Compatible(before, request.Original, request.RecoveryBoot);
            try
            {
                RequireAbsent(platform);
                if (!Same(platform.Read(), before)) throw new Exception("Home changed during restore preflight.");
                Write(platform, request.Original, true);
                return new Result { Success = true, After = platform.Read() };
            }
            catch (Exception error)
            {
                return new Result { Error = "Restore incomplete; preserve the PC backup and receipts, inspect status and retry: " + error.Message };
            }
        }
        public static Result Execute(IPlatform platform, Request request)
        {
            Validate(request.Original);
            if (request.Action != "apply" && request.Action != "restore") throw new Exception("Unknown Home action.");
            if ((request.Boot && request.Action != "apply") ||
                (request.RestoreBootTransaction != null && request.Action != "restore") ||
                (request.LauncherAbsent && (request.Action != "restore" || request.RestoreBootTransaction != null)) ||
                (request.RecoveryBoot && !request.LauncherAbsent))
                throw new Exception("Invalid boot request.");
            platform.CheckCompatibility(request.Action == "apply");
            if (platform.Firmware != request.Firmware) throw new Exception("Firmware differs from the saved baseline.");
            var before = platform.Read();
            ValidateValues(before);
            if (request.Action == "restore")
            {
                bool installed = platform.LauncherInstalled();
                if (installed == request.LauncherAbsent) throw new Exception("AeroTizen installation changed; query status and retry.");
                if (!installed) return RestoreAbsent(platform, request, before);
            }
            var watcher = CheckWatcher(platform.ReadWatcher());
            if (watcher.Mode != "watcher" && watcher.BaselineHash != request.BaselineHash)
                throw new Exception("Watcher belongs to a different Home baseline.");
            if (request.Action == "apply")
            {
                if (!Same(before, request.Original) || watcher.Mode != "watcher")
                    throw new Exception("Home has changed since the baseline; apply refused.");
                if (!platform.LauncherEligible()) throw new Exception("Installed AeroTizen is not eligible for native Home.");
            }
            else
            {
                bool restoreBoot = request.RestoreBootTransaction != null;
                if (restoreBoot && (watcher.Mode == "watcher" || watcher.Transaction != request.RestoreBootTransaction))
                    throw new Exception("Boot transaction changed; restore refused.");
                Compatible(before, request.Original, restoreBoot);
                if (Same(before, request.Original) && watcher.Mode == "watcher")
                    return new Result { Success = true, After = before, Watcher = watcher };
            }
            // Persist the hold before the first native write. A crash leaves
            // polling and boot relaunch disabled until an explicit restore.
            watcher = Change(platform, watcher, "hold", request.Transaction, request.BaselineHash);
            bool nativeStarted = false;
            try
            {
                if (!Same(platform.Read(), before)) throw new Exception("Home changed during the watcher handoff; no native write attempted.");
                var desired = request.Original.Copy();
                if (request.Action == "apply") { desired.Main = Target; desired.Strings[HomeKey] = Target; }
                nativeStarted = true;
                Write(platform, desired);
                if (request.Boot && platform.Read().AutoStart != 1) platform.SetAutoStart(1);
                var after = platform.Read();
                if (request.Boot && !BootReady(after, request.Original)) throw new Exception("Native boot readback failed.");
                watcher = Change(platform, watcher, request.Action == "apply" ? "native" : "watcher",
                    request.Action == "apply" ? request.Transaction : null,
                    request.Action == "apply" ? request.BaselineHash : null);
                return new Result { Success = true, After = after, Watcher = watcher };
            }
            catch (Exception error)
            {
                if (!nativeStarted) return new Result { Error = error.Message + " Watcher remains disabled for review." };
                if (request.Action == "restore")
                    return new Result { Error = "Restore confirmation incomplete; inspect Home and watcher status before retrying: " + error.Message };
                try
                {
                    var actual = CheckWatcher(platform.ReadWatcher());
                    if (actual.Transaction != request.Transaction || actual.BaselineHash != request.BaselineHash)
                        throw new Exception("Watcher transaction changed; automatic rollback refused.");
                    // A failed commit may already have persisted native mode.
                    if (actual.Mode != "hold") actual = Change(platform, actual, "hold", request.Transaction, request.BaselineHash);
                    Write(platform, request.Original);
                    var restored = platform.Read();
                    watcher = Change(platform, actual, "watcher", null, null);
                    return new Result { RolledBack = true, Error = error.Message, After = restored, Watcher = watcher };
                }
                catch (Exception recovery)
                {
                    return new Result { Error = "Apply failed: " + error.Message + "; rollback incomplete; keep the watcher disabled and run restore: " + recovery.Message };
                }
            }
        }
    }
}
