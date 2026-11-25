using System;
using System.Collections.Generic;
using System.Diagnostics;

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
        public IReadOnlyList<ControlStep> Steps { get; set; }
        public VerificationFailure Failure { get; set; }
        public bool StartupSettingsRestored { get; set; }
        public bool Success { get; set; }
        public bool RolledBack { get; set; }
        public string Error { get; set; }
        public Snapshot After { get; set; }
        public Watcher Watcher { get; set; }
    }
    public sealed class ControlStep
    {
        public string Step { get; internal set; }
        public string Setting { get; internal set; }
        public string Outcome { get; internal set; }
        public int Depth { get; internal set; }
        public long DurationMs { get; internal set; }
        public IEnumerable<string> Differences { get; internal set; }
    }
    public sealed class ControlTrace
    {
        private const int MaxSteps = 96;
        private readonly List<ControlStep> steps = new List<ControlStep>();
        private int depth;
        public IReadOnlyList<ControlStep> Steps => steps;

        private ControlStep Add(string step, string outcome, string setting)
        {
            var entry = new ControlStep { Step = step, Outcome = outcome, Depth = depth, Setting = setting };
            if (steps.Count < MaxSteps) steps.Add(entry);
            return entry;
        }

        internal void Skip(string step, string setting) => Add(step, "already_set", setting);

        internal T Run<T>(string step, Func<T> action, string setting = null)
        {
            var entry = Add(step, "failed", setting);
            var clock = Stopwatch.StartNew();
            depth++;
            try
            {
                var result = action();
                entry.Outcome = "ok";
                return result;
            }
            catch (ReadbackException error)
            {
                entry.Differences = error.Failure.Differences.Keys;
                throw;
            }
            finally
            {
                depth--;
                entry.DurationMs = clock.ElapsedMilliseconds;
            }
        }

        internal void Run(string step, Action action, string setting = null) =>
            Run(step, () => { action(); return true; }, setting);
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
        private static void WriteStrings(IPlatform platform, Snapshot desired, string[] keys, ControlTrace trace, bool requireAbsent = false)
        {
            foreach (string key in keys)
            {
                if (platform.Read().Strings[key] == desired.Strings[key])
                {
                    trace.Skip("setting_write", key);
                    continue;
                }
                if (requireAbsent) RequireAbsent(platform);
                try { trace.Run("setting_write", () => platform.SetString(key, desired.Strings[key]), key); }
                catch (Exception error)
                {
                    throw new ReadbackException("Setting write failed: " + key, key, desired, platform.Read(), error);
                }
                trace.Run("setting_readback", () => {
                    var actual = platform.Read();
                    if (actual.Strings[key] != desired.Strings[key]) throw new ReadbackException("Setting readback failed: " + key, key, desired, actual);
                }, key);
            }
        }
        private static Snapshot Write(IPlatform platform, Snapshot desired, ControlTrace trace, bool requireAbsent = false)
        {
            if (platform.Read().Main != desired.Main)
            {
                if (requireAbsent) RequireAbsent(platform);
                trace.Run("setting_write", () => platform.SetMain(desired.Main), "operation/main");
                trace.Run("setting_readback", () => {
                    var actual = platform.Read();
                    if (actual.Main != desired.Main) throw new ReadbackException("Home operation readback failed.", "home_operation", desired, actual);
                }, "operation/main");
            }
            else trace.Skip("setting_write", "operation/main");
            // Read each key after assigning Home. Firmware can set startup IDs itself.
            WriteStrings(platform, desired, Keys, trace, requireAbsent);
            if (platform.Read().AutoStart != desired.AutoStart)
            {
                if (requireAbsent) RequireAbsent(platform);
                trace.Run("setting_write", () => platform.SetAutoStart(desired.AutoStart), AutoStartKey);
                trace.Run("setting_readback", () => {
                    var actual = platform.Read();
                    if (actual.AutoStart != desired.AutoStart) throw new ReadbackException("Autostart readback failed.", "autostart", desired, actual);
                }, AutoStartKey);
            }
            else trace.Skip("setting_write", AutoStartKey);
            return trace.Run("verify_settings", () => {
                var final = platform.Read();
                if (!Same(final, desired)) throw new ReadbackException("Final Home readback failed.", "final", desired, final);
                if (requireAbsent) RequireAbsent(platform);
                return final;
            });
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
        private static Snapshot WriteBoot(IPlatform platform, Snapshot desired, Snapshot original, ControlTrace trace)
        {
            try
            {
                var after = trace.Run("direct_write", () => Write(platform, desired, trace));
                if (after.AutoStart == 1) return after;
            }
            catch (ReadbackException error) when (error.Failure.Observed.AutoStart != 1 && StartupRejected(error.Failure, original))
            {
                // Some TVs reject direct startup ID writes but assign both IDs when autostart is enabled.
            }

            desired.AutoStart = 1;
            try { trace.Run("enable_autostart", () => platform.SetAutoStart(1)); }
            catch (Exception error)
            {
                throw new ReadbackException("Autostart write failed.", "boot", desired, platform.Read(), error);
            }
            try
            {
                return trace.Run("verify_boot", () => {
                    var final = platform.Read();
                    if (!Same(final, desired)) throw new ReadbackException("Native boot readback failed.", "boot", desired, final);
                    return final;
                });
            }
            // Enabling autostart can leave a startup ID at its original value. Retry only when the other values match.
            catch (ReadbackException error) when (error.Failure.Observed.AutoStart == 1 && StartupRejected(error.Failure, original))
            {
                return trace.Run("retry_startup_ids", () => {
                    WriteStrings(platform, desired, StartupKeys, trace);
                    var final = platform.Read();
                    if (!Same(final, desired)) throw new ReadbackException("Native boot retry readback failed.", "boot", desired, final);
                    return final;
                });
            }
        }
        private static Result RestoreAbsent(IPlatform platform, Request request, Snapshot before, ControlTrace trace)
        {
            Compatible(before, request.Original, request.RecoveryBoot);
            try
            {
                return trace.Run("restore_without_launcher", () => {
                    RequireAbsent(platform);
                    if (!Same(platform.Read(), before)) throw new Exception("Home changed during restore preflight.");
                    Write(platform, request.Original, trace, true);
                    return new Result { Success = true, After = platform.Read() };
                });
            }
            catch (Exception error)
            {
                return new Result { Failure = (error as ReadbackException)?.Failure, Error = "Restore incomplete; preserve the PC backup and receipts, inspect status and retry: " + error.Message };
            }
        }
        public static Result Execute(IPlatform platform, Request request, ControlTrace trace = null)
        {
            trace = trace ?? new ControlTrace();
            var result = ExecuteTraced(platform, request, trace);
            result.Steps = trace.Steps;
            return result;
        }

        private static Result ExecuteTraced(IPlatform platform, Request request, ControlTrace trace)
        {
            Validate(request.Original);
            if (request.Action != "apply" && request.Action != "restore") throw new Exception("Unknown Home action.");
            if ((request.Boot && request.Action != "apply") ||
                (request.RestoreBootTransaction != null && request.Action != "restore") ||
                (request.LauncherAbsent && (request.Action != "restore" || request.RestoreBootTransaction != null)) ||
                (request.RecoveryBoot && !request.LauncherAbsent))
                throw new Exception("Invalid boot request.");
            trace.Run("runtime_compatibility", () => platform.CheckCompatibility(request.Action == "apply"));
            trace.Run("firmware_check", () => {
                if (platform.Firmware != request.Firmware) throw new Exception("Firmware differs from the saved baseline.");
            });
            var before = trace.Run("read_current_settings", () => {
                var current = platform.Read();
                ValidateValues(current);
                return current;
            });
            if (request.Action == "restore")
            {
                bool installed = platform.LauncherInstalled();
                if (installed == request.LauncherAbsent) throw new Exception("AeroTizen installation changed; query status and retry.");
                if (!installed) return RestoreAbsent(platform, request, before, trace);
            }
            var watcher = trace.Run("watcher_preflight", () => {
                var current = CheckWatcher(platform.ReadWatcher());
                if (current.Mode != "watcher" && current.BaselineHash != request.BaselineHash)
                    throw new Exception("Watcher belongs to a different Home baseline.");
                return current;
            });
            if (request.Action == "apply")
            {
                trace.Run("verify_baseline", () => {
                    if (!MatchesApplyBaseline(before, request.Original) || watcher.Mode != "watcher")
                        throw new Exception("Home has changed since the baseline; apply refused.");
                });
                trace.Run("launcher_eligibility", () => {
                    if (!platform.LauncherEligible()) throw new Exception("Installed AeroTizen is not eligible for native Home.");
                });
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
            watcher = trace.Run("watcher_hold", () => Change(platform, watcher, "hold", request.Transaction, request.BaselineHash));
            bool nativeStarted = false;
            try
            {
                trace.Run("verify_handoff_settings", () => {
                    if (!Same(platform.Read(), before)) throw new Exception("Home changed during the watcher handoff; no native write attempted.");
                });
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
                    after = request.Boot
                        ? WriteBoot(platform, desired, request.Original, trace)
                        : trace.Run("direct_write", () => Write(platform, desired, trace));
                }
                catch (ReadbackException error) when (request.Action == "apply" && StartupRejected(error.Failure, request.Original))
                {
                    // Keep Home only after verifying the saved startup settings with it.
                    foreach (string key in StartupKeys) desired.Strings[key] = request.Original.Strings[key];
                    desired.AutoStart = request.Original.AutoStart;
                    after = trace.Run("restore_startup_settings", () => Write(platform, desired, trace));
                    startupFailure = error.Failure;
                }
                watcher = trace.Run("watcher_commit", () => Change(platform, watcher, request.Action == "apply" ? "native" : "watcher",
                    request.Action == "apply" ? request.Transaction : null,
                    request.Action == "apply" ? request.BaselineHash : null));
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
                    return trace.Run("rollback", () => {
                        var actual = trace.Run("verify_rollback_watcher", () => {
                            var current = CheckWatcher(platform.ReadWatcher());
                            if (current.Transaction != request.Transaction || current.BaselineHash != request.BaselineHash)
                                throw new Exception("Watcher transaction changed; automatic rollback refused.");
                            return current;
                        });
                        // A failed commit may already have persisted native mode.
                        if (actual.Mode != "hold")
                            actual = trace.Run("watcher_hold", () => Change(platform, actual, "hold", request.Transaction, request.BaselineHash));
                        Write(platform, request.Original, trace);
                        var restored = platform.Read();
                        watcher = trace.Run("watcher_resume", () => Change(platform, actual, "watcher", null, null));
                        return new Result { Failure = failure, RolledBack = true, Error = error.Message, After = restored, Watcher = watcher };
                    });
                }
                catch (Exception recovery)
                {
                    return new Result { Failure = failure, Error = "Apply failed: " + error.Message + "; rollback incomplete; keep the watcher disabled and run restore: " + recovery.Message };
                }
            }
        }
    }
}
