using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.SdbTest
{
    // Managed-only code: this public app never invokes native libraries or a
    // privileged executable. Only the fixed localhost SDK operation can do so.
    internal sealed class RootProofIntent
    {
        private readonly string receipt;
        internal bool Armed { get; private set; }
        internal bool Used => File.Exists(receipt);
        internal RootProofIntent(string dataDirectory, string nonce)
        {
            if (!Regex.IsMatch(nonce ?? "", @"\A[a-f0-9]{32}\z")) throw new InvalidDataException("Invalid proof nonce");
            receipt = Path.Combine(dataDirectory, "root-attempt-" + nonce + ".json");
        }
        internal void Arm(bool prepared)
        {
            if (!prepared || Used) throw new InvalidOperationException("Prepare a fresh proof before arming");
            Armed = true;
        }
        internal void Cancel() { Armed = false; }
        internal void Claim(string boot)
        {
            if (!Armed) throw new InvalidOperationException("The root proof is not armed");
            Armed = false;
            using (var stream = new FileStream(receipt, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                byte[] data = JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1,
                    action = "root_attempt_requested", boot_id = boot });
                stream.Write(data, 0, data.Length);
                stream.Flush(true);
            }
        }
    }

    internal sealed class RootPreparation : IDisposable
    {
        internal readonly Bundle Source;
        internal readonly string Work;
        private readonly HashSet<string> ownFiles = new HashSet<string>();
        internal RootPreparation(Bundle bundle)
        {
            Source = bundle;
            Work = "/tmp/aerotizen-root-probe-" + Bundle.Hex(8);
            if (Directory.Exists(Work) || File.Exists(Work)) throw new IOException("Proof work path exists");
            Directory.CreateDirectory(Work);
            try
            {
                Write("owner.json", JsonSerializer.SerializeToUtf8Bytes(new { nonce = bundle.Nonce }));
                foreach (var item in bundle.Hashes)
                {
                    byte[] data = Bundle.ReadBounded(Path.Combine(bundle.DirectoryPath, item.Key));
                    if (Bundle.Digest(data) != item.Value) throw new InvalidDataException("Proof source changed");
                    Write(item.Key, data);
                }
                Write("probe.json", bundle.ManifestBytes);
                Write("check.sh", Encoding.UTF8.GetBytes(Script(bundle, Work, "--check")));
            }
            catch { Dispose(); throw; }
        }
        internal void Write(string name, byte[] data)
        {
            if (!Regex.IsMatch(name ?? "", @"\A[A-Za-z0-9_.-]+\z")) throw new InvalidDataException("Invalid proof file name");
            using (var file = new FileStream(Path.Combine(Work, name), FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                ownFiles.Add(name);
                file.Write(data, 0, data.Length);
            }
        }
        internal static string Script(Bundle bundle, string work, string operation, int port = 0, string token = null)
        {
            if (operation != "--check" && operation != "--run-proof" && operation != "--run-service") throw new InvalidDataException("Invalid proof operation");
            bool callback = operation != "--check";
            if (callback && (port < 1024 || port > 65535 || !Regex.IsMatch(token ?? "", @"\A[a-f0-9]{32}\z")))
                throw new InvalidDataException("Invalid local proof callback");
            var lines = new List<string> { "set -u", "umask 077", "test \"$(id -u)\" = 901 || exit 79" };
            if (callback)
            {
                lines.Add("exec 3<>/dev/tcp/127.0.0.1/" + port + " || exit 80");
                lines.Add("printf '%s\\n' " + Bundle.Quote(token) + " >&3");
                lines.Add("read -r -t 5 acknowledgement <&3 || exit 81");
                lines.Add("test \"$acknowledgement\" = GO || exit 82");
                lines.Add("exec 1>&3 2>&3");
            }
            lines.Add("cleanup() {");
            lines.Add("result=$?; trap - EXIT");
            lines.Add("(\n" + bundle.Cleanup(work) + ") || result=91");
            lines.Add("printf '\\nAEROTIZEN_ROOT_EXIT=%s\\n' \"$result\"");
            lines.Add("exit \"$result\"\n}");
            lines.Add("trap cleanup EXIT");
            lines.Add("(\n" + bundle.Invocation(work, operation) + ")");
            lines.Add("exit \"$?\"");
            return string.Join("\n", lines) + "\n";
        }
        public void Dispose()
        {
            if (!Directory.Exists(Work)) return;
            if ((new DirectoryInfo(Work).Attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Proof work path became a link");
            foreach (string name in ownFiles) File.Delete(Path.Combine(Work, name));
            Directory.Delete(Work, false); // Never remove unknown files or recurse.
        }
    }

    internal static class RootProofController
    {
        internal const string ResultPrefix = "AEROTIZEN_PROOF_RESULT=";
        internal static Dictionary<string, object> CheckFiles(Bundle bundle, out RootPreparation preparation)
        {
            preparation = new RootPreparation(bundle);
            // Test the required bind as the ordinary app without sending an SDK command.
            var listener = new TcpListener(IPAddress.Loopback, 0);
            try { listener.Start(); }
            finally { listener.Stop(); }
            return new Dictionary<string, object> {
                ["schema_version"] = 1, ["passed"] = true, ["root_attempted"] = false,
                ["work"] = preparation.Work, ["check_script"] = preparation.Work + "/check.sh",
                ["nonce"] = bundle.Nonce, ["payload_sha256"] = bundle.PayloadHash,
                ["local_callback_bind_verified"] = true,
                ["app_umask"] = File.ReadLines("/proc/self/status").FirstOrDefault(line => line.StartsWith("Umask:", StringComparison.Ordinal)),
            };
        }
        internal static JsonElement ParseResult(string output, Bundle bundle, string boot)
        {
            string[] lines = output.Replace("\r\n", "\n").Split('\n');
            string[] records = lines.Where(line => line.StartsWith(ResultPrefix, StringComparison.Ordinal)).ToArray();
            if (records.Length != 1 || lines.Count(line => line == "AEROTIZEN_PROBE_DONE") != 1
                || lines.Count(line => line == "AEROTIZEN_PROBE_CLEANED") != 1
                || lines.Count(line => line == "AEROTIZEN_ROOT_EXIT=0") != 1)
                throw new InvalidDataException("Proof completion or SDK cleanup was not confirmed");
            using (var document = JsonDocument.Parse(records[0].Substring(ResultPrefix.Length)))
            {
                var value = document.RootElement;
                if (value.GetProperty("schema_version").GetInt32() != 1 || !value.GetProperty("passed").GetBoolean()
                    || value.GetProperty("mode").GetString() != bundle.ProofOperation
                    || !value.GetProperty("root_attempted").GetBoolean()
                    || !value.GetProperty("fresh_root_proof").GetBoolean() || !value.GetProperty("proof_inode_checked").GetBoolean()
                    || value.GetProperty("proof_uid").GetInt32() != 0 || !value.GetProperty("system_files_unchanged").GetBoolean()
                    || !value.GetProperty("same_boot").GetBoolean() || value.GetProperty("boot_id").GetString() != boot
                    || value.GetProperty("nonce").GetString() != bundle.Nonce
                    || value.GetProperty("payload_sha256").GetString() != bundle.PayloadHash)
                    throw new InvalidDataException("Proof does not match this run or its protected inode");
                if (bundle.Service != null && !value.GetProperty("bridge_ready").GetBoolean())
                    throw new InvalidDataException("Privileged bridge readiness was not verified");
                return value.Clone();
            }
        }
        internal static (JsonElement proof, bool serviceRefused) CompleteProof(string output, Bundle bundle,
            string boot, Task<string> transport, Deadline deadline)
        {
            // The fixed appinstall transport can close without opening its SDB
            // stream after the callback has already proved root and cleanup.
            // Accept that specific refusal only after every proof check passes.
            JsonElement proof = ParseResult(output, bundle, boot);
            if (Task.WaitAny(new Task[] { transport }, deadline.Remaining) < 0)
                throw new TimeoutException("SDK transport did not finish");
            try { transport.GetAwaiter().GetResult(); }
            catch (SdbServiceRefusedException) { return (proof, true); }
            return (proof, false);
        }
        private static string ReadToken(NetworkStream stream, Deadline deadline)
        {
            var token = new StringBuilder();
            while (token.Length <= 32)
            {
                stream.ReadTimeout = deadline.Remaining;
                int value = stream.ReadByte();
                if (value == '\n') return token.ToString();
                if (value < 0) break;
                token.Append((char)value);
            }
            throw new InvalidDataException("Invalid callback authentication");
        }
        internal static string Receive(TcpClient peer, string token, Deadline deadline)
        {
            using (NetworkStream stream = peer.GetStream())
            {
                if (!IPAddress.IsLoopback(((IPEndPoint)peer.Client.RemoteEndPoint).Address)
                    || ReadToken(stream, deadline) != token) throw new InvalidDataException("Callback was not authenticated");
                byte[] go = Encoding.ASCII.GetBytes("GO\n");
                stream.WriteTimeout = deadline.Remaining;
                stream.Write(go, 0, go.Length);
                using (var output = new MemoryStream())
                {
                    byte[] buffer = new byte[2048];
                    while (true)
                    {
                        stream.ReadTimeout = deadline.Remaining;
                        int count = stream.Read(buffer, 0, buffer.Length);
                        if (count == 0) break;
                        if (output.Length + count > 65536) throw new InvalidDataException("SDK proof response too large");
                        output.Write(buffer, 0, count);
                    }
                    return Encoding.UTF8.GetString(output.ToArray());
                }
            }
        }
        internal static Dictionary<string, object> Run(RootPreparation preparation, RootProofIntent intent)
        {
            var result = new Dictionary<string, object> { ["schema_version"] = 1, ["passed"] = false,
                ["root_attempted"] = false, ["boot_registration"] = false, ["settings_changed"] = false,
                ["nonce"] = preparation.Source.Nonce, ["retained_proof_path"] = preparation.Source.ProofPath };
            Task<string> transport = null;
            try
            {
                if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux)
                    || (RuntimeInformation.ProcessArchitecture != Architecture.Arm && RuntimeInformation.ProcessArchitecture != Architecture.Arm64)
                    || !File.ReadAllText("/etc/os-release").Contains("tizen"))
                    throw new InvalidOperationException("Root proof requires a Tizen ARM TV");
                string uid = File.ReadLines("/proc/self/status").First(line => line.StartsWith("Uid:", StringComparison.Ordinal));
                string[] identities = uid.Split((char[])null, StringSplitOptions.RemoveEmptyEntries).Skip(1).ToArray();
                if (identities.Length != 4 || identities.Any(value => !uint.TryParse(value, out uint parsed) || parsed == 0))
                    throw new InvalidOperationException("The test must start without root");
                result["initial_uid"] = uint.Parse(identities[0]);
                result["initial_euid"] = uint.Parse(identities[1]);
                result["initial_label"] = File.ReadAllText("/proc/self/attr/current").Trim();
                string boot = File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
                intent.Claim(boot); // Durable, exclusive one-shot receipt before any SDK operation.
                using (var client = new LoopbackSdb())
                {
                    client.Connect(); client.Service("capability:");
                    var listener = new TcpListener(IPAddress.Loopback, 0);
                    listener.Start();
                    try
                    {
                        string token = Bundle.Hex(16);
                        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
                        preparation.Write("run.sh", Encoding.UTF8.GetBytes(RootPreparation.Script(preparation.Source,
                            preparation.Work, preparation.Source.ProofOperation, port, token)));
                        result["root_attempted"] = true;
                        var deadline = new Deadline(45000);
                        transport = Task.Run(() => client.Service("shell:" + Bundle.Injection(
                            "cat " + Bundle.Quote(preparation.Work + "/run.sh") + " | bash", Bundle.Hex(8)), 40000));
                        var accepted = listener.AcceptTcpClientAsync();
                        if (!accepted.Wait(8000)) throw new TimeoutException("SDK callback did not arrive");
                        using (TcpClient peer = accepted.GetAwaiter().GetResult())
                            result["sdk_output"] = Receive(peer, token, deadline);
                        var completed = CompleteProof((string)result["sdk_output"], preparation.Source, boot, transport, deadline);
                        result["proof"] = completed.proof;
                        result["sdb_service_refused_after_verified_proof"] = completed.serviceRefused;
                        result["sdk_staging_cleaned"] = true;
                        result["passed"] = true;
                    }
                    finally { listener.Stop(); }
                }
            }
            catch (Exception error) { result["error"] = error.GetBaseException().GetType().Name + ": " + error.GetBaseException().Message; }
            finally
            {
                if (transport != null)
                {
                    if (!transport.IsCompleted && Task.WaitAny(new Task[] { transport }, 1500) < 0)
                    { result["passed"] = false; result["transport_cleanup_unconfirmed"] = true; }
                    if (transport.IsFaulted) { var ignored = transport.Exception; }
                }
            }
            return result;
        }
    }
}
