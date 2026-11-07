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
    public sealed class ValueDifference
    {
        public object Expected { get; set; }
        public object Observed { get; set; }
    }
    public sealed class VerificationFailure
    {
        public string Phase { get; set; }
        public Snapshot Expected { get; set; }
        public Snapshot Observed { get; set; }
        public Dictionary<string, ValueDifference> Differences { get; set; }
    }
    internal sealed class ReadbackException : Exception
    {
        internal VerificationFailure Failure { get; }
        internal ReadbackException(string message, string phase, Snapshot expected, Snapshot observed, Exception cause = null) : base(message, cause)
        {
            var differences = new Dictionary<string, ValueDifference>();
            if (expected.Main != observed.Main) differences["operation/main"] = new ValueDifference { Expected = expected.Main, Observed = observed.Main };
            foreach (string key in Policy.Keys)
                if (expected.Strings[key] != observed.Strings[key]) differences[key] = new ValueDifference { Expected = expected.Strings[key], Observed = observed.Strings[key] };
            if (expected.AutoStart != observed.AutoStart) differences[Policy.AutoStartKey] = new ValueDifference { Expected = expected.AutoStart, Observed = observed.AutoStart };
            Failure = new VerificationFailure { Phase = phase, Expected = expected.Copy(), Observed = observed.Copy(), Differences = differences };
        }
    }
    public sealed class Result
    {
        public VerificationFailure Failure { get; set; }
        public bool StartupSettingsRestored { get; set; }
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
        private const string StartupKey = "db/appfw/startup_appid";
        private const string BootBackupKey = "db/appfw/booting_appid_backup";
        internal const string AutoStartKey = "db/menu/smart_hub/ontvsetting/auto_start";
        private static readonly string[] StartupKeys = { StartupKey, BootBackupKey };
        public static readonly string[] Keys = {
            HomeKey, StartupKey, BootBackupKey, "db/first_screen/type"
        };
        public static bool Same(Snapshot left, Snapshot right)
        {
            if (left.Main != right.Main || left.AutoStart != right.AutoStart) return false;
            foreach (string key in Keys) if (left.Strings[key] != right.Strings[key]) return false;
            return true;
        }
        private static bool MatchesApplyBaseline(Snapshot current, Snapshot original)
        {
            // Opening the launcher can update this derived startup value before
            // apply. Accept only its own ID here; keep the saved original exact.
            var expected = original.Copy();
            if (current.Strings[BootBackupKey] == Target) expected.Strings[BootBackupKey] = Target;
            return Same(current, expected);
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
        private static void WriteStrings(IPlatform platform, Snapshot desired, string[] keys, bool requireAbsent = false)
        {
            foreach (string key in keys)
            {
                if (platform.Read().Strings[key] == desired.Strings[key]) continue;
                if (requireAbsent) RequireAbsent(platform);
                try { platform.SetString(key, desired.Strings[key]); }
                catch (Exception error)
                {
                    throw new ReadbackException("Setting write failed: " + key, key, desired, platform.Read(), error);
                }
                var actual = platform.Read();
                if (actual.Strings[key] != desired.Strings[key]) throw new ReadbackException("Setting readback failed: " + key, key, desired, actual);
            }
        }
        private static Snapshot Write(IPlatform platform, Snapshot desired, bool requireAbsent = false)
        {
            if (platform.Read().Main != desired.Main)
            {
                if (requireAbsent) RequireAbsent(platform);
                platform.SetMain(desired.Main);
                var actual = platform.Read();
                if (actual.Main != desired.Main) throw new ReadbackException("Home operation readback failed.", "home_operation", desired, actual);
            }
            // Read each key after assigning Home. Firmware can set startup IDs itself.
            WriteStrings(platform, desired, Keys, requireAbsent);
            if (platform.Read().AutoStart != desired.AutoStart)
            {
                if (requireAbsent) RequireAbsent(platform);
                platform.SetAutoStart(desired.AutoStart);
                var actual = platform.Read();
                if (actual.AutoStart != desired.AutoStart) throw new ReadbackException("Autostart readback failed.", "autostart", desired, actual);
            }
            var final = platform.Read();
            if (!Same(final, desired)) throw new ReadbackException("Final Home readback failed.", "final", desired, final);
            if (requireAbsent) RequireAbsent(platform);
            return final;
        }
        private static bool StartupRejected(VerificationFailure failure, Snapshot original)
        {
            if (failure.Phase != "final" && failure.Phase != "boot" && Array.IndexOf(StartupKeys, failure.Phase) < 0) return false;
            if (failure.Differences.Count == 0) return false;
            foreach (string key in failure.Differences.Keys)
            {
                if (key == AutoStartKey && failure.Phase == "boot" && failure.Observed.AutoStart == original.AutoStart)
                    continue;
                if (Array.IndexOf(StartupKeys, key) < 0 || failure.Observed.Strings[key] != original.Strings[key])
                    return false;
            }
            return true;
        }
        private static Snapshot WriteBoot(IPlatform platform, Snapshot desired, Snapshot original)
        {
            try
            {
                var after = Write(platform, desired);
                if (after.AutoStart == 1) return after;
            }
            catch (ReadbackException error) when (error.Failure.Observed.AutoStart != 1 && StartupRejected(error.Failure, original))
            {
                // Some TVs reject direct startup ID writes but assign both IDs when autostart is enabled.
            }

            desired.AutoStart = 1;
            try { platform.SetAutoStart(1); }
            catch (Exception error)
            {
                throw new ReadbackException("Autostart write failed.", "boot", desired, platform.Read(), error);
            }
            var final = platform.Read();
            if (Same(final, desired)) return final;

            var failure = new ReadbackException("Native boot readback failed.", "boot", desired, final);
            // Enabling autostart can leave a startup ID at its original value. Retry only when the other values match.
            if (final.AutoStart != 1 || !StartupRejected(failure.Failure, original)) throw failure;

            WriteStrings(platform, desired, StartupKeys);
            final = platform.Read();
            if (!Same(final, desired)) throw new ReadbackException("Native boot retry readback failed.", "boot", desired, final);
            return final;
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
                return new Result { Failure = (error as ReadbackException)?.Failure, Error = "Restore incomplete; preserve the PC backup and receipts, inspect status and retry: " + error.Message };
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
                if (!MatchesApplyBaseline(before, request.Original) || watcher.Mode != "watcher")
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
                if (request.Action == "apply") {
                    desired.Main = Target; desired.Strings[HomeKey] = Target;
                    foreach (string key in StartupKeys) desired.Strings[key] = Target;
                }
                nativeStarted = true;
                VerificationFailure startupFailure = null;
                Snapshot after;
                try
                {
                    after = request.Boot ? WriteBoot(platform, desired, request.Original) : Write(platform, desired);
                }
                catch (ReadbackException error) when (request.Action == "apply" && StartupRejected(error.Failure, request.Original))
                {
                    // Keep Home only after verifying the saved startup settings with it.
                    foreach (string key in StartupKeys) desired.Strings[key] = request.Original.Strings[key];
                    desired.AutoStart = request.Original.AutoStart;
                    after = Write(platform, desired);
                    startupFailure = error.Failure;
                }
                watcher = Change(platform, watcher, request.Action == "apply" ? "native" : "watcher",
                    request.Action == "apply" ? request.Transaction : null,
                    request.Action == "apply" ? request.BaselineHash : null);
                return new Result { Success = true, Failure = startupFailure, StartupSettingsRestored = startupFailure != null, After = after, Watcher = watcher };
            }
            catch (Exception error)
            {
                var failure = (error as ReadbackException)?.Failure;
                if (!nativeStarted) return new Result { Failure = failure, Error = error.Message + " Watcher remains disabled for review." };
                if (request.Action == "restore")
                    return new Result { Failure = failure, Error = "Restore confirmation incomplete; inspect Home and watcher status before retrying: " + error.Message };
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
                    return new Result { Failure = failure, RolledBack = true, Error = error.Message, After = restored, Watcher = watcher };
                }
                catch (Exception recovery)
                {
                    return new Result { Failure = failure, Error = "Apply failed: " + error.Message + "; rollback incomplete; keep the watcher disabled and run restore: " + recovery.Message };
                }
            }
        }
    }
}
