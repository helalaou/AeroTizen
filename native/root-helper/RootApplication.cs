using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AeroTizen.AutoRoot;
using AeroTizen.Root;
using AeroTizen.SdbTest;
using Tizen.Applications;

namespace AeroTizen.RootHelper
{
    internal sealed class RootApplication : ServiceApplication
    {
        private void Save(object value)
        {
            string path = Path.Combine(DirectoryInfo.Data, "status.json"), temporary = path + ".new-" + Guid.NewGuid().ToString("N");
            try
            {
                using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(value); file.Write(bytes, 0, bytes.Length); file.Flush(true);
                }
                File.Move(temporary, path, true);
            }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        private void Bootstrap()
        {
            RootPaths.RequireTv(false);
            var settings = RootSettings.Load(); settings.VerifyFiles();
            string boot = RootPaths.Boot();
            var gate = new PerBootGate(DirectoryInfo.Data, settings.Installation, settings.Baseline);
            string decision = gate.Decision(boot);
            if (decision != "run-once")
            {
                if (decision != "already-attempted" || !File.Exists(Path.Combine(DirectoryInfo.Data, "status.json")))
                    Save(new { schema_version = 1, boot_id = boot, decision, root_attempted = false });
                return;
            }
            string nonce = gate.Claim(boot);
            var result = new Dictionary<string, object> { ["schema_version"] = 1, ["installation_id"] = settings.Installation,
                ["boot_id"] = boot, ["nonce"] = nonce, ["root_attempted"] = false, ["passed"] = false };
            string directory = Path.Combine(DirectoryInfo.Data, "runtime-" + nonce);
            RootPreparation preparation = null;
            bool claimed = false;
            try
            {
                var attempts = new List<SdbReadinessAttempt>();
                SdbReadiness.Wait(attempt => { attempts.Add(attempt); result["readiness"] = attempts; Save(result); });
                var bundle = RuntimeBundle.Build(settings, directory, nonce, claimed: () => claimed = true);
                RootProofController.CheckFiles(bundle, out preparation);
                var intent = new RootProofIntent(DirectoryInfo.Data, nonce); intent.Arm(true);
                var proof = RootProofController.Run(preparation, intent);
                result["root_attempted"] = proof["root_attempted"]; result["passed"] = proof["passed"]; result["proof"] = proof;
                if (proof.TryGetValue("error", out var error)) result["error"] = error;
            }
            catch (Exception error) { result["error"] = error.GetType().Name + ": " + error.Message; }
            finally
            {
                try { preparation?.Dispose(); if (claimed && Directory.Exists(directory)) Directory.Delete(directory, true); result["app_staging_cleaned"] = true; }
                catch (Exception error) { result["passed"] = false; result["cleanup_error"] = error.Message; }
                Save(result);
            }
        }
        protected override void OnCreate()
        {
            base.OnCreate(); var context = SynchronizationContext.Current;
            Task.Run(() =>
            {
                try { Bootstrap(); }
                catch (Exception error) { Save(new { error = error.GetType().Name + ": " + error.Message, root_attempted = (bool?)null }); }
                finally { if (context == null) Exit(); else context.Post(_ => Exit(), null); }
            });
        }
        public static void Main(string[] args) { using (var app = new RootApplication()) app.Run(args); }
    }
}
