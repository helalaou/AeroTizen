using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AeroTizen.UntetheredProbe
{
    internal static class Proof
    {
        private static (uint owner, uint mode, uint links) Metadata(FileStream file)
        {
            IntPtr metadata = Marshal.AllocHGlobal(256);
            try
            {
                int fd = file.SafeFileHandle.DangerousGetHandle().ToInt32();
                if (statx(fd, "", 0x1000, 0x20f, metadata) != 0 || (Marshal.ReadInt32(metadata) & 0x20f) != 0x20f)
                    throw new IOException("Root proof ownership could not be checked");
                return (unchecked((uint)Marshal.ReadInt32(metadata, 20)),
                    unchecked((ushort)Marshal.ReadInt16(metadata, 28)), unchecked((uint)Marshal.ReadInt32(metadata, 16)));
            }
            finally { Marshal.FreeHGlobal(metadata); }
        }
        internal static void CheckPlatform(string path)
        {
            // Exercise statx on our own staged manifest without claiming root.
            using (var file = File.OpenRead(path)) Metadata(file);
        }
        internal static void Validate(string json, Bundle bundle, string boot, uint owner, uint mode, uint links)
        {
            // A root-looking JSON string is insufficient: the opened inode must
            // be a root-owned, read-only regular file from this exact boot/run.
            if (owner != 0 || (mode & 0xf000) != 0x8000 || (mode & 0x92) != 0 || links != 1)
                throw new InvalidDataException("Root proof inode is not trusted");
            using (var document = JsonDocument.Parse(json))
            {
                var root = document.RootElement;
                if (root.GetProperty("schema_version").GetInt32() != 1 || root.GetProperty("uid").GetInt32() != 0
                    || root.GetProperty("euid").GetInt32() != 0 || root.GetProperty("gid").GetInt32() != 0
                    || root.GetProperty("boot_id").GetString() != boot || root.GetProperty("nonce").GetString() != bundle.Nonce
                    || root.GetProperty("payload_sha256").GetString() != bundle.PayloadHash)
                    throw new InvalidDataException("Root proof does not match this boot and bundle");
            }
        }
        internal static void Read(Bundle bundle, string boot, string path = null)
        {
            using (var file = File.OpenRead(path ?? bundle.ProofPath))
            {
                if (file.Length <= 0 || file.Length > 4096) throw new InvalidDataException("Invalid root proof size");
                var metadata = Metadata(file);
                    // Linux statx has the same fixed layout on ARM32 and ARM64.
                    // AT_EMPTY_PATH verifies the opened descriptor, avoiding a
                    // second path lookup between ownership and content checks.
                    using (var buffer = new MemoryStream())
                    {
                        var chunk = new byte[1024];
                        int count;
                        while ((count = file.Read(chunk, 0, chunk.Length)) > 0)
                        {
                            if (buffer.Length + count > 4096) throw new InvalidDataException("Oversized root proof");
                            buffer.Write(chunk, 0, count);
                        }
                        Validate(Encoding.UTF8.GetString(buffer.ToArray()), bundle, boot, metadata.owner, metadata.mode, metadata.links);
                    }
            }
        }
        [DllImport("libc.so.6", SetLastError = true)]
        private static extern int statx(int fd, string path, int flags, uint mask, IntPtr buffer);
    }

    internal static class Program
    {
        [DllImport("libc.so.6")] private static extern uint getuid();
        [DllImport("libc.so.6")] private static extern uint geteuid();
        [DllImport("libc.so.6", SetLastError = true)] private static extern int chmod(string path, uint mode);
        internal static bool HasMarker(string output, string marker)
        {
            return output.Replace("\r\n", "\n").Split('\n').Count(line => line == marker) == 1;
        }
        private static string FileHash(string path) { return Bundle.Digest(File.ReadAllBytes(path)); }
        private static void RequireTv()
        {
            if (!RuntimeInformation.IsOSPlatform(OSPlatform.Linux)
                || (RuntimeInformation.ProcessArchitecture != Architecture.Arm && RuntimeInformation.ProcessArchitecture != Architecture.Arm64)
                || !File.ReadAllText("/etc/os-release").Contains("tizen"))
                throw new InvalidOperationException("Live modes require a Tizen ARM TV");
            if (geteuid() == 0) throw new InvalidOperationException("Run the probe without existing root privileges");
        }
        public static int Main(string[] args)
        {
            var report = new Dictionary<string, object> { ["schema_version"] = 1, ["passed"] = false, ["boot_registration"] = false,
                ["root_attempted"] = false, ["sdk_staging_cleaned"] = null };
            string work = null;
            bool rootAttempted = false, cleaned = false;
            try
            {
                if (args.Length == 2 && (args[0] == "--run-payload" || args[0] == "--run-proof" || args[0] == "--run-service"))
                {
                    RequireTv();
                    if (getuid() != 901 || geteuid() != 901)
                        throw new InvalidOperationException("The payload supervisor requires SDK UID/EUID 901");
                    var staged = new Bundle(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), allowService: args[0] == "--run-service");
                    report["mode"] = args[0];
                    string initialBoot = File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
                    string passwd = FileHash("/etc/passwd"), key = FileHash("/usr/share/sdbd/public.pem");
                    rootAttempted = true;
                    report["root_attempted"] = true;
                    PayloadRunner.Run(staged, args[1]);
                    if (args[0] == "--run-proof" || args[0] == "--run-service")
                    {
                        Proof.Read(staged, initialBoot);
                        if (staged.Service != null)
                        {
                            string ready = staged.ProofDirectory + "/bridge.json";
                            var clock = System.Diagnostics.Stopwatch.StartNew();
                            while (!File.Exists(ready) && clock.ElapsedMilliseconds < 6000) System.Threading.Thread.Sleep(100);
                            Proof.Read(staged, initialBoot, ready);
                            report["bridge_ready"] = true;
                        }
                        report["fresh_root_proof"] = true;
                        report["proof_inode_checked"] = true;
                        report["proof_uid"] = 0;
                        report["nonce"] = staged.Nonce;
                        report["boot_id"] = initialBoot;
                        report["payload_sha256"] = staged.PayloadHash;
                        report["retained_proof_path"] = staged.ProofPath;
                        report["system_files_unchanged"] = passwd == FileHash("/etc/passwd") && key == FileHash("/usr/share/sdbd/public.pem");
                        report["same_boot"] = initialBoot == File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
                        if (!(bool)report["system_files_unchanged"] || !(bool)report["same_boot"])
                            throw new IOException("System-file or boot verification failed");
                    }
                    report["passed"] = true;
                    report["payload_deadline_ms"] = PayloadRunner.DeadlineMs;
                    return Write(report);
                }
                if (args.Length != 1 || (args[0] != "--check" && args[0] != "--handshake" && args[0] != "--prove-root"))
                    throw new ArgumentException("Use --check, --handshake or --prove-root");
                var bundle = new Bundle(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location));
                report["mode"] = args[0]; report["upstream_version"] = Bundle.Version;
                report["bundle_directory"] = bundle.DirectoryPath;
                report["payload_sha256"] = bundle.PayloadHash;
                report["retained_proof_path"] = bundle.ProofPath;
                if (args[0] == "--check")
                {
                    if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux) && File.ReadAllText("/etc/os-release").Contains("tizen"))
                    {
                        Proof.CheckPlatform(Path.Combine(bundle.DirectoryPath, "probe.json"));
                        report["proof_metadata_api_checked"] = true;
                        report["sdk_stage_location_valid"] = PayloadRunner.IsStageLocation(bundle.DirectoryPath, bundle.Package);
                    }
                    report["passed"] = true;
                    return Write(report);
                }
                RequireTv(); report["initial_uid"] = getuid(); report["initial_euid"] = geteuid();
                report["initial_label"] = File.ReadAllText("/proc/self/attr/current").Trim();
                string boot = File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
                report["boot_id"] = boot;
                string beforePasswd = FileHash("/etc/passwd"), beforeKey = FileHash("/usr/share/sdbd/public.pem");
                using (var sdb = new LoopbackSdb())
                {
                    sdb.Connect();
                    sdb.Service("capability:");
                    report["local_sdb_authorized"] = true;
                    if (args[0] == "--handshake") { report["passed"] = true; return Write(report); }
                    work = "/tmp/aerotizen-root-probe-" + Bundle.Hex(8);
                    if (Directory.Exists(work) || File.Exists(work)) throw new IOException("Temporary probe directory exists");
                    Directory.CreateDirectory(work);
                    if (chmod(work, 0x1ed) != 0) throw new IOException("Probe directory permissions could not be set"); // 0755
                    foreach (string name in bundle.Hashes.Keys)
                    {
                        byte[] data = Bundle.ReadBounded(bundle.DirectoryPath + "/" + name);
                        if (Bundle.Digest(data) != bundle.Hashes[name]) throw new IOException("Bundle changed during staging");
                        File.WriteAllBytes(work + "/" + name, data);
                        if (chmod(work + "/" + name, 0x1a4) != 0) throw new IOException("Probe file permissions could not be set"); // 0644
                    }
                    File.WriteAllBytes(work + "/probe.json", bundle.ManifestBytes);
                    if (chmod(work + "/probe.json", 0x1a4) != 0)
                        throw new IOException("Probe manifest permissions could not be set");
                    File.WriteAllText(work + "/invoke.sh", bundle.Invocation(work), new UTF8Encoding(false));
                    File.WriteAllText(work + "/cleanup.sh", bundle.Cleanup(work), new UTF8Encoding(false));
                    if (chmod(work + "/invoke.sh", 0x1a4) != 0 || chmod(work + "/cleanup.sh", 0x1a4) != 0)
                        throw new IOException("Probe script permissions could not be set");
                    try
                    {
                        rootAttempted = true;
                        string output = sdb.Service("shell:" + Bundle.Injection("cat " + Bundle.Quote(work + "/invoke.sh") + " | bash", Bundle.Hex(8)), 30000);
                        if (!HasMarker(output, "AEROTIZEN_PROBE_DONE")) throw new IOException("Root invocation was not confirmed");
                        Proof.Read(bundle, boot);
                        report["fresh_root_proof"] = true;
                    }
                    finally
                    {
                        if (rootAttempted)
                        {
                            try
                            {
                                string output = sdb.Service("shell:" + Bundle.Injection("cat " + Bundle.Quote(work + "/cleanup.sh") + " | bash", Bundle.Hex(8)), 5000);
                                cleaned = HasMarker(output, "AEROTIZEN_PROBE_CLEANED");
                                if (!cleaned) report["cleanup_error"] = "SDK probe cleanup was not confirmed";
                            }
                            catch (Exception error) { report["cleanup_error"] = error.GetType().Name + ": " + error.Message; }
                        }
                    }
                }
                report["system_files_unchanged"] = beforePasswd == FileHash("/etc/passwd") && beforeKey == FileHash("/usr/share/sdbd/public.pem");
                report["same_boot"] = boot == File.ReadAllText("/proc/sys/kernel/random/boot_id").Trim();
                report["passed"] = (bool)report["system_files_unchanged"] && (bool)report["same_boot"] && cleaned;
            }
            catch (Exception error) { report["error"] = error.GetType().Name + ": " + error.Message; }
            finally
            {
                report["root_attempted"] = rootAttempted; report["sdk_staging_cleaned"] = cleaned;
                if (work != null)
                {
                    try
                    {
                        foreach (string path in Directory.GetFiles(work)) File.Delete(path);
                        Directory.Delete(work, false);
                        report["local_staging_cleaned"] = true;
                    }
                    catch (Exception error) { report["local_cleanup_error"] = error.GetType().Name; report["passed"] = false; }
                }
            }
            return Write(report);
        }
        internal static int Write(Dictionary<string, object> report)
        {
            string prefix = report.TryGetValue("mode", out object mode) && ((string)mode == "--run-proof" || (string)mode == "--run-service")
                ? "AEROTIZEN_PROOF_RESULT=" : "";
            Console.WriteLine(prefix + JsonSerializer.Serialize(report));
            return report.TryGetValue("passed", out object passed) && passed is bool value && value ? 0 : 1;
        }
    }
}
