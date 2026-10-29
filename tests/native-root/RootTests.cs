using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Threading.Tasks;
using AeroTizen.Root;
using AeroTizen.RootHelper;
using AeroTizen.UntetheredProbe;

internal static class RootTests
{
    private static int checks;
    private static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    private static void Reject(Action action, string message)
    { bool rejected = false; try { action(); } catch { rejected = true; } Check(rejected, message); }
    private static void Gates()
    {
        string data = Path.Combine(Path.GetTempPath(), "aerotizen-boot-gate-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(data);
        try
        {
            string baseline = Guid.NewGuid().ToString("D"), first = Guid.NewGuid().ToString("D"), second = Guid.NewGuid().ToString("D");
            string installation = Guid.NewGuid().ToString("N");
            var gate = new PerBootGate(data, installation, baseline);
            Check(gate.Decision(baseline) == "waiting-for-boot", "Installation boot could trigger root");
            Reject(() => gate.Claim(baseline), "Installation boot claimed root");
            string nonce = gate.Claim(first);
            Check(nonce.Length == 32 && gate.Decision(first) == "already-attempted", "Same-boot activation could repeat root");
            Reject(() => gate.Claim(first), "Duplicate same-boot root was accepted");
            var reopened = new PerBootGate(data, installation, baseline);
            Check(reopened.Decision(first) == "already-attempted", "Warm wake forgot the boot receipt");
            Check(reopened.Decision(second) == "run-once", "New kernel boot could not reacquire root");
            Check(reopened.Claim(second) != nonce, "New boot reused the prior root nonce");
            File.WriteAllText(Path.Combine(data, "disabled"), installation);
            Check(reopened.Decision(Guid.NewGuid().ToString("D")) == "disabled", "Removal did not disable a later boot");
            Reject(() => reopened.Claim(Guid.NewGuid().ToString("D")), "Disabled helper requested root");
            Reject(() => gate.Decision("../invalid"), "Unsafe boot identity accepted");
            Reject(() => new PerBootGate(data, "invalid", baseline), "Unsafe installation identity accepted");
            string[] command = { "/usr/bin/dotnet", RootPaths.Package + "/bin/AeroTizenRootBridge.dll", "--serve", installation, nonce, "boot" };
            Check(ServerLifetime.Matches(installation, "12", "12", command, "Uid: 0 0 0 0"), "Owned process was not recognised");
            Check(!ServerLifetime.Matches(installation, "12", "13", command, "Uid: 0 0 0 0"), "Reused PID was accepted");
            Check(!ServerLifetime.Matches(installation, "12", "12", command, "Uid: 5001 5001 5001 5001"), "Non-root process was accepted");
            command[1] = "/usr/bin/other";
            Check(!ServerLifetime.Matches(installation, "12", "12", command, "Uid: 0 0 0 0"), "Unrelated executable was accepted");
            string token = new string('a', 64);
            var files = new Dictionary<string, byte[]> {
                ["installation"] = System.Text.Encoding.ASCII.GetBytes(installation),
                ["pairing.json"] = JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1, installation_id = installation,
                    token, database_uid = 301, database_gid = 301 }),
                ["server.pfx"] = new byte[] { 1 },
            };
            BridgeProgram.ValidateRemoval(installation, token, files);
            Reject(() => BridgeProgram.ValidateRemoval(installation, new string('b', 64), files), "Foreign pairing token could remove private state");
            files.Remove("pairing.json"); BridgeProgram.ValidateRemoval(installation, token, files);
            files.Remove("server.pfx"); BridgeProgram.ValidateRemoval(installation, token, files);
            files["foreign"] = new byte[] { 1 };
            Reject(() => BridgeProgram.ValidateRemoval(installation, token, files), "Unknown private file could be deleted");
            files.Remove("foreign");
            Reject(() => BridgeProgram.ValidateRemoval(Guid.NewGuid().ToString("N"), token, files), "Foreign marker could be removed");
            files.Clear(); BridgeProgram.ValidateRemoval(installation, token, files);
            files["server.pfx"] = new byte[] { 1 };
            Reject(() => BridgeProgram.ValidateRemoval(installation, token, files), "Missing ownership marker could remove credentials");
            string statusPath = Path.Combine(data, "status.json");
            var health = new Dictionary<string, object> { ["boot_id"] = first, ["bootstrap_completed"] = false };
            BridgeProgram.ReadBootstrapStatus(health, statusPath);
            Check(!(bool)health["bootstrap_completed"], "Missing first-boot status blocked live identity");
            foreach (string value in new[] { "", "{" })
            {
                File.WriteAllText(statusPath, value); BridgeProgram.ReadBootstrapStatus(health, statusPath);
                Check(!(bool)health["bootstrap_completed"], "Incomplete boot status was accepted");
            }
            File.WriteAllBytes(statusPath, JsonSerializer.SerializeToUtf8Bytes(new { boot_id = second, passed = true, app_staging_cleaned = true }));
            BridgeProgram.ReadBootstrapStatus(health, statusPath);
            Check(!(bool)health["bootstrap_completed"], "Stale boot status was accepted");
            File.WriteAllBytes(statusPath, JsonSerializer.SerializeToUtf8Bytes(new { boot_id = first, passed = true, app_staging_cleaned = true }));
            BridgeProgram.ReadBootstrapStatus(health, statusPath);
            Check((bool)health["bootstrap_completed"], "Complete current-boot status was rejected");
        }
        finally { Directory.Delete(data, true); }
        Console.WriteLine("ROOT_GATE_CHECKS_PASSED=" + checks);
    }
    private static int Server(string fixturePath)
    {
        using (var fixture = JsonDocument.Parse(File.ReadAllBytes(fixturePath)))
        {
            var value = fixture.RootElement;
            int identityCalls = 0;
            var settings = new RootSettings(System.Text.Encoding.UTF8.GetBytes(value.GetProperty("public_config").GetRawText()));
            using (var certificate = new X509Certificate2(Convert.FromBase64String(value.GetProperty("server_pfx").GetString()),
                (string)null, System.Runtime.InteropServices.RuntimeInformation.IsOSPlatform(System.Runtime.InteropServices.OSPlatform.OSX)
                    ? X509KeyStorageFlags.DefaultKeySet : X509KeyStorageFlags.EphemeralKeySet))
            using (var server = new BridgeServer(settings, certificate, value.GetProperty("token").GetString(), () => {
                if (value.GetProperty("identity_fail_once").GetBoolean() && System.Threading.Interlocked.Increment(ref identityCalls) == 1)
                    throw new System.ComponentModel.Win32Exception(13, "Registry process refused");
                return new Dictionary<string, object> {
                ["boot_id"] = value.GetProperty("boot_id").GetString(), ["uid"] = 0, ["euid"] = 0, ["gid"] = 0,
                ["automatic_startup_enabled"] = true, ["helper_installed"] = true, ["bootstrap_completed"] = true, ["origin"] = "boot",
            }; }, () => File.WriteAllText(value.GetProperty("removed_file").GetString(), "removed"), IPAddress.Loopback, 0,
            async cancel => {
                var client = new TcpClient();
                await client.ConnectAsync(IPAddress.Loopback, value.GetProperty("sdb_port").GetInt32(), cancel); return client;
            }, (phase, error) => File.WriteAllText(value.GetProperty("diagnostic_file").GetString(),
                JsonSerializer.Serialize(new { phase, error_type = error.GetType().Name }))))
            {
                Task serving = server.Run();
                Console.WriteLine("ROOT_TEST_SERVER_PORT=" + server.Port); Console.Out.Flush();
                serving.GetAwaiter().GetResult(); return 0;
            }
        }
    }
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "--sql") { Console.Write(BridgeProgram.RegistrationSql()); return 0; }
            if (args.Length == 3 && args[0] == "--setup-launch") { Console.Write(BridgeProgram.SetupLaunch(args[1], args[2])); return 0; }
            if (args.Length == 5 && args[0] == "--fetch")
            {
                byte[] bytes = SetupTransfer.Fetch(args[1], int.Parse(args[2]), args[3], args[4]).GetAwaiter().GetResult();
                Console.WriteLine(JsonSerializer.Serialize(new { bytes = bytes.Length, sha256 = Bundle.Digest(bytes) })); return 0;
            }
            if (args.Length == 2 && args[0] == "--check-bundle")
            {
                var checkedBundle = new Bundle(args[1], allowService: true);
                Check(checkedBundle.Service != null, "Service descriptor missing");
                Reject(() => new Bundle(args[1]), "Proof-only reader accepted a service descriptor");
                Console.WriteLine("ROOT_SERVICE_DESCRIPTOR_CHECKS_PASSED=" + checks); return 0;
            }
            if (args.Length == 2 && args[0] == "--report-contract")
            {
                var bundle = new Bundle(args[1], allowService: true);
                string boot = Guid.NewGuid().ToString("D");
                var report = new Dictionary<string, object> {
                    ["schema_version"] = 1, ["passed"] = true, ["mode"] = bundle.ProofOperation,
                    ["root_attempted"] = true, ["fresh_root_proof"] = true, ["proof_inode_checked"] = true,
                    ["proof_uid"] = 0, ["system_files_unchanged"] = true, ["same_boot"] = true,
                    ["bridge_ready"] = true, ["boot_id"] = boot, ["nonce"] = bundle.Nonce,
                    ["payload_sha256"] = bundle.PayloadHash,
                };
                TextWriter original = Console.Out;
                var captured = new StringWriter();
                try { Console.SetOut(captured); AeroTizen.UntetheredProbe.Program.Write(report); }
                finally { Console.SetOut(original); }
                string output = captured.ToString() + "AEROTIZEN_PROBE_DONE\nAEROTIZEN_PROBE_CLEANED\nAEROTIZEN_ROOT_EXIT=0\n";
                var verified = AeroTizen.SdbTest.RootProofController.ParseResult(output, bundle, boot);
                Check(verified.GetProperty("mode").GetString() == "--run-service", "Service report mode was not preserved");
                Reject(() => AeroTizen.SdbTest.RootProofController.ParseResult(output.Replace("AEROTIZEN_PROOF_RESULT=", ""), bundle, boot),
                    "Unframed service output was accepted");
                Console.WriteLine("ROOT_SERVICE_REPORT_CONTRACT_PASSED=" + checks); return 0;
            }
            if (args.Length == 2 && args[0] == "--serve") return Server(args[1]);
            if (args.Length == 4 && args[0] == "--bundle")
            {
                var settings = new RootSettings(File.ReadAllBytes(args[1] + "/bin/root.json"));
                Bundle bundle = RuntimeBundle.Build(settings, args[2], args[3], args[1]);
                Check(bundle.Service != null && bundle.Service.Operation == "serve", "Per-boot bundle lost its fixed service launch");
                Reject(() => new Bundle(args[2]), "Proof-only reader accepted a service launch");
                Console.WriteLine("ROOT_SERVICE_BUNDLE_CHECKS_PASSED=" + checks); return 0;
            }
            Gates(); ReadinessTests.Run(Check, Reject); return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
