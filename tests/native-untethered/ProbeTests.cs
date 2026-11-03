using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AeroTizen.SdbTest;

namespace AeroTizen.UntetheredProbe
{
    internal static class ProbeTests
    {
        private static int checks;
        private static void Check(bool condition, string message)
        {
            checks++;
            if (!condition) throw new Exception(message);
        }
        private static void Reject(Action action, string message)
        {
            bool rejected = false;
            try { action(); } catch (Exception) { rejected = true; }
            Check(rejected, message);
        }
        private static byte[] Bytes(Frame frame)
        {
            using (var stream = new MemoryStream()) { frame.Write(stream); return stream.ToArray(); }
        }
        private sealed class FragmentedStream : MemoryStream
        {
            internal FragmentedStream(byte[] data) : base(data) { }
            public override int Read(byte[] buffer, int offset, int count) { return base.Read(buffer, offset, Math.Min(1, count)); }
        }
        private static void Frames()
        {
            byte[] data = Bytes(new Frame("WRTE", 7, 8, Encoding.ASCII.GetBytes("fragmented")));
            using (var stream = new FragmentedStream(data))
            {
                Frame frame = Frame.Read(stream, new Deadline(1000));
                Check(frame.Command == "WRTE" && frame.Arg0 == 7 && frame.Arg1 == 8, "Fragmented header changed");
                Check(Encoding.ASCII.GetString(frame.Payload) == "fragmented", "Fragmented payload changed");
            }
            foreach (int offset in new[] { 0, 16, 20 })
            {
                byte[] bad = (byte[])data.Clone(); bad[offset] ^= 1;
                Reject(() => Frame.Read(new MemoryStream(bad), new Deadline(1000)), "Corrupt frame accepted");
            }
            byte[] huge = (byte[])data.Clone();
            Array.Copy(BitConverter.GetBytes(uint.MaxValue), 0, huge, 12, 4);
            Reject(() => Frame.Read(new MemoryStream(huge), new Deadline(1000)), "Oversized frame accepted");
            Reject(() => Frame.Read(new MemoryStream(data.Take(10).ToArray()), new Deadline(1000)), "Truncated header accepted");
            Reject(() => Frame.Read(new MemoryStream(data.Take(data.Length - 1).ToArray()), new Deadline(1000)), "Truncated payload accepted");
            var deadline = new Deadline(1); Thread.Sleep(5);
            Reject(() => Frame.Read(new MemoryStream(data), deadline), "Expired deadline accepted");
        }
        private static void Loopback(bool wrongId = false, bool refuse = false, bool excessive = false, bool stall = false,
            bool serviceRefuse = false)
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            Task server = Task.Run(() =>
            {
                using (var peer = listener.AcceptTcpClient())
                using (var stream = peer.GetStream())
                {
                    Frame hello = Frame.Read(stream, new Deadline(2000));
                    if (hello.Command != "CNXN") throw new Exception("Missing handshake");
                    new Frame(refuse ? "AUTH" : "CNXN", 0x01000000, 4096, Encoding.ASCII.GetBytes("device::test\0")).Write(stream);
                    if (refuse) return;
                    Frame open = Frame.Read(stream, new Deadline(2000));
                    if (open.Command != "OPEN" || Encoding.ASCII.GetString(open.Payload) != "capability:\0")
                        throw new Exception("Unexpected service");
                    if (serviceRefuse)
                    {
                        new Frame("CLSE", 0, open.Arg0, Array.Empty<byte>()).Write(stream);
                        return;
                    }
                    if (stall) { Thread.Sleep(200); return; }
                    uint local = wrongId ? open.Arg0 + 1 : open.Arg0;
                    new Frame("OKAY", 9, local, Array.Empty<byte>()).Write(stream);
                    if (wrongId) return;
                    new Frame("WRTE", 9, local, excessive ? new byte[16385] : Encoding.ASCII.GetBytes("first ")).Write(stream);
                    if (excessive) return;
                    Frame.Read(stream, new Deadline(2000));
                    new Frame("WRTE", 9, local, Encoding.ASCII.GetBytes("second")).Write(stream);
                    Frame.Read(stream, new Deadline(2000));
                    new Frame("CLSE", 9, local, Array.Empty<byte>()).Write(stream);
                    Frame.Read(stream, new Deadline(2000));
                }
            });
            var watch = Stopwatch.StartNew();
            try
            {
                using (var client = new LoopbackSdb())
                {
                    Action operation = () => { client.Connect(port); Check(client.Service("capability:", stall ? 40 : 2000) == "first second", "Service data changed"); };
                    if (serviceRefuse)
                    {
                        bool specificRefusal = false;
                        try { operation(); } catch (SdbServiceRefusedException) { specificRefusal = true; }
                        Check(specificRefusal, "Unopened SDB service did not report a specific refusal");
                    }
                    else if (wrongId || refuse || excessive || stall) Reject(operation, "Invalid peer accepted");
                    else operation();
                }
                Check(watch.ElapsedMilliseconds < 3000, "Loopback operation did not remain bounded");
                server.GetAwaiter().GetResult();
            }
            finally { listener.Stop(); }
        }
        private static string ProofJson(Bundle bundle, string boot, string nonce = null)
        {
            return JsonSerializer.Serialize(new { schema_version = 1, uid = 0, euid = 0, gid = 0,
                boot_id = boot, nonce = nonce ?? bundle.Nonce, payload_sha256 = bundle.PayloadHash });
        }
        private static int Shell(string command)
        {
            var start = new ProcessStartInfo("/bin/sh") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            start.ArgumentList.Add("-c"); start.ArgumentList.Add(command);
            using (var process = Process.Start(start))
            {
                var output = process.StandardOutput.ReadToEndAsync();
                var error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(3000)) { process.Kill(); throw new TimeoutException("Cleanup test hung"); }
                output.GetAwaiter().GetResult(); error.GetAwaiter().GetResult();
                return process.ExitCode;
            }
        }
        private static void CleanupOwnership(Bundle bundle)
        {
            if (!File.Exists("/bin/sh")) return;
            string root = Path.Combine(Path.GetTempPath(), "aerotizen-cleanup-test-" + Bundle.Hex(8));
            string stage = root + "/" + bundle.Package, shared = root + "/on-demand";
            string script = bundle.Cleanup("/tmp/aerotizen-root-probe-0123456789abcdef").Replace(Bundle.StagingRoot, root);
            Directory.CreateDirectory(stage); Directory.CreateDirectory(shared);
            try
            {
                File.WriteAllText(stage + "/public.pem", "original");
                Check(Shell(script) != 0 && File.ReadAllText(stage + "/public.pem") == "original", "Unclaimed staging was deleted");
                File.WriteAllText(stage + "/probe-owner", "some-other-run");
                Check(Shell(script) != 0 && File.Exists(stage + "/public.pem"), "Another run's staging was deleted");
                File.WriteAllText(stage + "/probe-owner", "0123456789abcdef");
                File.WriteAllText(shared + "/keep", "shared data");
                string proofDirectory = root + "/aerotizen-probe-proof-" + bundle.Nonce;
                Directory.CreateDirectory(proofDirectory);
                string proof = proofDirectory + "/proof.json";
                File.WriteAllText(proof, "retained evidence");
                File.WriteAllText(shared + "/" + bundle.Archive, "different data");
                Check(Shell(script) != 0 && File.ReadAllText(shared + "/" + bundle.Archive) == "different data", "Foreign archive was deleted");
                File.Copy(bundle.DirectoryPath + "/" + bundle.Archive, shared + "/" + bundle.Archive, true);
                File.Copy(bundle.DirectoryPath + "/" + bundle.Archive + ".signature", shared + "/" + bundle.Archive + ".signature", true);
                Check(Shell(script) == 0 && !Directory.Exists(stage), "Owned staging did not clean up");
                Check(File.ReadAllText(shared + "/keep") == "shared data" && Directory.Exists(shared), "Shared directory changed");
                Check(File.ReadAllText(proof) == "retained evidence", "Boot evidence was removed during cleanup");
                File.Copy(bundle.DirectoryPath + "/" + bundle.Archive, shared + "/" + bundle.Archive);
                Check(Shell(script) != 0 && File.Exists(shared + "/" + bundle.Archive), "Orphaned archive falsely reported as cleaned");
            }
            finally { Directory.Delete(root, true); }
        }
        private static ProcessStartInfo Command(string script)
        {
            var start = new ProcessStartInfo("/bin/sh");
            start.ArgumentList.Add("-c"); start.ArgumentList.Add(script);
            return start;
        }
        private static void PayloadDeadlines()
        {
            if (!File.Exists("/bin/sh")) return;
            ProcessResult success = BoundedProcess.Run(Command("printf done; printf diagnostic >&2"), 2000);
            Check(success.ExitCode == 0 && success.Output == "done" && success.Error == "diagnostic", "Payload output was lost");
            Check(BoundedProcess.Run(Command("exit 7"), 2000).ExitCode == 7, "Payload failure exit was lost");
            string pidFile = Path.Combine(Path.GetTempPath(), "aerotizen-timer-test-" + Bundle.Hex(8));
            var watch = Stopwatch.StartNew();
            try
            {
                Reject(() => BoundedProcess.Run(Command("echo $$ > " + Bundle.Quote(pidFile) + "; while :; do sleep 1; done"), 150), "Hanging payload accepted");
                Check(watch.ElapsedMilliseconds < 4000, "Hanging payload exceeded termination grace");
                int pid = int.Parse(File.ReadAllText(pidFile).Trim());
                bool alive;
                try { using (var process = Process.GetProcessById(pid)) alive = !process.HasExited; }
                catch (ArgumentException) { alive = false; }
                Check(!alive, "Timed-out payload is still running");
                watch.Restart();
                Reject(() => BoundedProcess.Run(Command("while :; do printf 0123456789; done"), 2000, 64), "Oversized payload output accepted");
                Check(watch.ElapsedMilliseconds < 4000, "Output overflow did not stop the payload");
                Reject(() => BoundedProcess.Run(Command("true"), 0), "Unbounded process deadline accepted");
            }
            finally { if (File.Exists(pidFile)) File.Delete(pidFile); }
        }
        private static void BundleAndProof(Bundle bundle)
        {
            string boot = "11111111-2222-3333-4444-555555555555";
            string proof = ProofJson(bundle, boot);
            Proof.Validate(proof, bundle, boot, 0, 0x8124, 1);
            Check(true, "Valid proof rejected");
            Reject(() => Proof.Validate(proof, bundle, "another-boot", 0, 0x8124, 1), "Old boot accepted");
            Reject(() => Proof.Validate(ProofJson(bundle, boot, new string('0', 32)), bundle, boot, 0, 0x8124, 1), "Old nonce accepted");
            Reject(() => Proof.Validate(proof, bundle, boot, 901, 0x8124, 1), "SDK-owned proof accepted");
            Reject(() => Proof.Validate(proof, bundle, boot, 0, 0x81a4, 1), "Writable proof accepted");
            Reject(() => Proof.Validate(proof, bundle, boot, 0, 0xa124, 1), "Non-file proof accepted");
            Reject(() => Proof.Validate(proof, bundle, boot, 0, 0x8124, 2), "Linked proof accepted");
            string work = "/tmp/aerotizen-root-probe-0123456789abcdef";
            string invocation = bundle.Invocation(work), cleanup = bundle.Cleanup(work);
            ProcessStartInfo start = PayloadRunner.StartInfo(bundle);
            Check(start.FileName == "/usr/bin/dotnet" && start.ArgumentList.Count == 2
                && start.ArgumentList[0] == bundle.Stage + "/SamsungTvArchiveRoot.dll" && start.ArgumentList[1] == bundle.Package,
                "Stock one-argument contract changed");
            Check(invocation.Contains(" --run-payload '") && !invocation.Contains("timeout")
                && PayloadRunner.DeadlineMs == 20000, "Managed payload deadline is missing");
            Reject(() => PayloadRunner.Run(bundle, "0123456789abcdef"), "Payload supervisor accepted a non-SDK bundle location");
            Reject(() => PayloadRunner.Run(bundle, "0123456789abcdef\n"), "Payload supervisor accepted an invalid ownership token");
            Check(PayloadRunner.IsStageLocation(bundle.Stage, bundle.Package), "SDK home alias rejected");
            Check(PayloadRunner.IsStageLocation("/opt/usr/home/owner/share/tmp/sdk_tools/" + bundle.Package, bundle.Package), "SDK physical path rejected");
            Check(!PayloadRunner.IsStageLocation("/tmp/" + bundle.Package, bundle.Package), "Arbitrary payload stage accepted");
            Check(invocation.IndexOf("test ! -e '" + bundle.Stage + "'", StringComparison.Ordinal)
                < invocation.IndexOf("mkdir -m 755", StringComparison.Ordinal), "Writes precede destination guard");
            Check(cleanup.IndexOf("probe-owner", StringComparison.Ordinal) < cleanup.IndexOf("rm -f", StringComparison.Ordinal), "Cleanup precedes ownership guard");
            Check(!cleanup.Contains("rm -r") && !cleanup.Contains("rmdir '" + Bundle.StagingRoot + "/on-demand'"), "Cleanup can remove shared directories");
            Reject(() => bundle.Invocation("/tmp/'; unsafe"), "Untrusted work path accepted");
            Reject(() => bundle.Invocation(work + "\n"), "Newline work path accepted");
            string injection = Bundle.Injection("cat " + Bundle.Quote(work + "/invoke.sh") + " | bash", "0123456789abcdef");
            Check(injection.Length <= 510 && injection.StartsWith("0 appinstall tpk "), "Invalid injection envelope");
            Reject(() => Bundle.Injection(new string('x', 1000), "0123456789abcdef"), "Oversized injection accepted");
            Reject(() => Bundle.Injection("true", "$(wrong)"), "Untrusted gate accepted");
            Reject(() => Bundle.Injection("true", "0123456789abcdef\n"), "Newline gate accepted");
            Check(Program.HasMarker("prefix\r\nDONE\r\n", "DONE"), "Exact marker not found");
            Check(!Program.HasMarker("NOT_DONE\n", "DONE") && !Program.HasMarker("DONE\nDONE\n", "DONE"), "Ambiguous marker accepted");
            Check(!Program.HasMarker("DO\rNE\n", "DONE"), "Malformed marker accepted");
        }
        private static string SdkProof(Bundle bundle, string boot, string nonce = null, bool inode = true,
            bool unchanged = true, int uid = 0)
        {
            string record = JsonSerializer.Serialize(new { schema_version = 1, passed = true, mode = "--run-proof",
                root_attempted = true, fresh_root_proof = true, proof_inode_checked = inode, proof_uid = uid,
                system_files_unchanged = unchanged, same_boot = true, boot_id = boot,
                nonce = nonce ?? bundle.Nonce, payload_sha256 = bundle.PayloadHash });
            return RootProofController.ResultPrefix + record + "\nAEROTIZEN_PROBE_DONE\nAEROTIZEN_PROBE_CLEANED\nAEROTIZEN_ROOT_EXIT=0\n";
        }
        private static void ManualProof(Bundle bundle)
        {
            string data = Path.Combine(Path.GetTempPath(), "aerotizen-arm-test-" + Bundle.Hex(8));
            Directory.CreateDirectory(data);
            try
            {
                var intent = new RootProofIntent(data, bundle.Nonce);
                Check(!intent.Used && !intent.Armed, "Root was armed or consumed on construction");
                Reject(() => intent.Claim("boot"), "An unarmed root request was accepted");
                Check(Directory.GetFiles(data).Length == 0, "Unarmed request wrote a receipt");
                Reject(() => intent.Arm(false), "Unprepared root request was armed");
                intent.Arm(true); intent.Cancel();
                Reject(() => intent.Claim("boot"), "Cancelled root request was accepted");
                intent.Arm(true); intent.Claim("boot");
                Check(intent.Used && !intent.Armed, "Root attempt was not durably consumed");
                Reject(() => new RootProofIntent(data, bundle.Nonce).Arm(true), "Reopening allowed a second root request");
                using (var preparation = new RootPreparation(bundle))
                {
                    Check(File.Exists(preparation.Work + "/probe.json"), "App did not stage the verified manifest");
                    string check = File.ReadAllText(preparation.Work + "/check.sh");
                    Check(check.Contains(" --check\n") && !check.Contains(" --run-proof") && !check.Contains(" --run-payload"),
                        "Read-only staging check can execute the root payload");
                    string script = RootPreparation.Script(bundle, preparation.Work, "--run-proof", 43210, new string('a', 32));
                    Check(script.IndexOf("test \"$acknowledgement\" = GO", StringComparison.Ordinal)
                        < script.IndexOf("mkdir -m 755", StringComparison.Ordinal), "Root staging precedes callback authorisation");
                    Check(script.Contains("/dev/tcp/127.0.0.1/43210") && !script.Contains("0.0.0.0"), "Callback is not local only");
                    Reject(() => RootPreparation.Script(bundle, preparation.Work, "bad"), "Arbitrary SDK operation accepted");
                    Reject(() => RootPreparation.Script(bundle, preparation.Work, "--run-proof", 80, new string('a', 32)), "Privileged callback port accepted");
                    Reject(() => RootPreparation.Script(bundle, preparation.Work, "--run-proof", 43210, "wrong"), "Invalid callback token accepted");
                    string command = Bundle.Injection("cat " + Bundle.Quote(preparation.Work + "/run.sh") + " | bash", Bundle.Hex(8));
                    Check(command.Length <= 510, "Manual proof injection is too long");
                }
                string boot = "11111111-2222-3333-4444-555555555555";
                string valid = SdkProof(bundle, boot);
                Check(RootProofController.ParseResult(valid, bundle, boot).GetProperty("passed").GetBoolean(), "Valid SDK proof rejected");
                Reject(() => RootProofController.ParseResult(valid.Replace("AEROTIZEN_PROBE_CLEANED", "MISSING"), bundle, boot), "Unconfirmed cleanup accepted");
                Reject(() => RootProofController.ParseResult(valid + valid, bundle, boot), "Duplicate SDK proof accepted");
                Reject(() => RootProofController.ParseResult(valid, bundle, "other-boot"), "Previous boot accepted");
                Reject(() => RootProofController.ParseResult(SdkProof(bundle, boot, new string('0', 32)), bundle, boot), "Wrong proof nonce accepted");
                Reject(() => RootProofController.ParseResult(SdkProof(bundle, boot, inode: false), bundle, boot), "Unchecked root inode accepted");
                Reject(() => RootProofController.ParseResult(SdkProof(bundle, boot, unchanged: false), bundle, boot), "Changed system file accepted");
                Reject(() => RootProofController.ParseResult(SdkProof(bundle, boot, uid: 901), bundle, boot), "SDK UID accepted as root proof");
            }
            finally { Directory.Delete(data, true); }
        }
        private static void ProofCallback(bool badToken = false, bool excessive = false, bool stall = false)
        {
            string token = new string('a', 32);
            var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            bool authorised = false;
            Task sender = Task.Run(() =>
            {
                try
                {
                    using (var client = new TcpClient())
                    {
                        client.Connect(IPAddress.Loopback, port);
                        using (var stream = client.GetStream())
                        {
                            if (stall) { Thread.Sleep(150); return; }
                            byte[] hello = Encoding.ASCII.GetBytes((badToken ? new string('b', 32) : token) + "\n");
                            foreach (byte value in hello) stream.WriteByte(value);
                            var response = new byte[3]; int offset = 0;
                            while (offset < 3)
                            {
                                int received = stream.Read(response, offset, 3 - offset);
                                if (received == 0) return;
                                offset += received;
                            }
                            authorised = Encoding.ASCII.GetString(response) == "GO\n";
                            if (!authorised) return;
                            byte[] body = excessive ? new byte[65537] : Encoding.ASCII.GetBytes("proof output");
                            stream.Write(body, 0, body.Length);
                        }
                    }
                }
                catch (IOException) when (badToken || excessive || stall) { }
            });
            try
            {
                using (var peer = listener.AcceptTcpClient())
                {
                    Action receive = () => Check(RootProofController.Receive(peer, token, new Deadline(stall ? 40 : 2000)) == "proof output",
                        "Proof callback output changed");
                    if (badToken || excessive || stall) Reject(receive, "Invalid proof callback accepted");
                    else receive();
                }
                sender.GetAwaiter().GetResult();
                Check(badToken || stall ? !authorised : authorised, "Root callback authorisation order changed");
            }
            finally { listener.Stop(); }
        }
        private static void ProofCompletion(Bundle bundle)
        {
            string boot = "11111111-2222-3333-4444-555555555555";
            string valid = SdkProof(bundle, boot);
            Task<string> refused = Task.FromException<string>(new SdbServiceRefusedException());
            var result = RootProofController.CompleteProof(valid, bundle, boot, refused, new Deadline(1000));
            Check(result.proof.GetProperty("passed").GetBoolean() && result.serviceRefused,
                "Verified root and cleanup were rejected because the final SDB service was refused");
            Check(!RootProofController.CompleteProof(valid, bundle, boot, Task.FromResult(""), new Deadline(1000)).serviceRefused,
                "Normal SDB completion was marked refused");
            Reject(() => RootProofController.CompleteProof("", bundle, boot, refused, new Deadline(1000)),
                "SDB refusal without proof was accepted");
            Reject(() => RootProofController.CompleteProof(valid, bundle, "wrong-boot", refused, new Deadline(1000)),
                "SDB refusal bypassed trial identity validation");
            Reject(() => RootProofController.CompleteProof(valid.Replace("AEROTIZEN_PROBE_CLEANED", "MISSING"), bundle, boot,
                refused, new Deadline(1000)), "SDB refusal bypassed cleanup validation");
            Reject(() => RootProofController.CompleteProof(SdkProof(bundle, boot, inode: false), bundle, boot,
                refused, new Deadline(1000)), "SDB refusal bypassed protected inode validation");
            Reject(() => RootProofController.CompleteProof(valid, bundle, boot,
                Task.FromException<string>(new InvalidDataException("Malformed SDB frame")), new Deadline(1000)),
                "Malformed transport was accepted after proof");
            Reject(() => RootProofController.CompleteProof(valid, bundle, boot,
                Task.FromException<string>(new IOException("Connection lost")), new Deadline(1000)),
                "Broken transport was accepted after proof");
            var pending = new TaskCompletionSource<string>();
            Reject(() => RootProofController.CompleteProof(valid, bundle, boot, pending.Task, new Deadline(20)),
                "Unfinished transport was accepted after proof");
            pending.SetResult("");
        }
        public static int Main(string[] args)
        {
            try
            {
                if (args.Length == 4 && args[0] == "--replay-refused-proof")
                {
                    var replayBundle = new Bundle(args[1]);
                    using (var saved = JsonDocument.Parse(Bundle.ReadBounded(args[2])))
                    using (var receipt = JsonDocument.Parse(Bundle.ReadBounded(args[3])))
                    {
                        var completed = RootProofController.CompleteProof(saved.RootElement.GetProperty("sdk_output").GetString(),
                            replayBundle, receipt.RootElement.GetProperty("boot_id").GetString(),
                            Task.FromException<string>(new SdbServiceRefusedException()), new Deadline(1000));
                        Console.WriteLine(JsonSerializer.Serialize(new { replay_only = true,
                            passed = completed.proof.GetProperty("passed").GetBoolean(),
                            sdb_service_refused_after_verified_proof = completed.serviceRefused }));
                        return 0;
                    }
                }
                if (args.Length == 3 && args[0] == "--print-sdk-check")
                {
                    Console.Write(RootPreparation.Script(new Bundle(args[1]), args[2], "--check"));
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--process-only")
                {
                    PayloadDeadlines();
                    Console.WriteLine("UNTETHERED_PROCESS_CHECKS_PASSED=" + checks);
                    return 0;
                }
                if (args.Length != 1) throw new ArgumentException("Pass the prepared bundle path");
                var bundle = new Bundle(args[0]);
                Frames(); Loopback(); Loopback(wrongId: true); Loopback(refuse: true); Loopback(excessive: true); Loopback(stall: true);
                Loopback(serviceRefuse: true);
                BundleAndProof(bundle); CleanupOwnership(bundle); PayloadDeadlines(); ManualProof(bundle);
                ProofCallback(); ProofCallback(badToken: true); ProofCallback(excessive: true); ProofCallback(stall: true);
                ProofCompletion(bundle);
                Console.WriteLine("UNTETHERED_PROBE_CHECKS_PASSED=" + checks);
                return 0;
            }
            catch (Exception error) { Console.Error.WriteLine(error); return 1; }
        }
    }
}
