using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal static class SetupBootstrap
    {
        internal static int Run(string requestPath)
        {
            var report = new Dictionary<string, object> { ["schema_version"] = 1, ["passed"] = false, ["root_attempted"] = false };
            string stage = null, privateStage = null;
            Bundle bundle = null;
            bool stageClaimed = false, privateClaimed = false;
            var written = new List<string>();
            try
            {
                RootPaths.RequireTv(false);
                if (RootPaths.getuid() != 901 || RootPaths.geteuid() != 901) throw new IOException("Setup bootstrap requires SDK UID/EUID 901");
                using (var request = JsonDocument.Parse(RootPaths.PrivateFile(requestPath, 901, 2 * 1024 * 1024)))
                {
                    var root = request.RootElement;
                    string package = root.GetProperty("package").GetString();
                    if (!System.Text.RegularExpressions.Regex.IsMatch(package ?? "", "\\Aarchive-root-[a-f0-9]{16}\\z"))
                        throw new IOException("Invalid setup package identity");
                    stage = Bundle.StagingRoot + "/" + package;
                    privateStage = root.GetProperty("setup_stage").GetString();
                    if (!System.Text.RegularExpressions.Regex.IsMatch(privateStage ?? "", "\\A/home/owner/share/tmp/sdk_tools/arsetup-[a-f0-9]{16}\\z"))
                        throw new IOException("Invalid private setup stage");
                    if (Directory.Exists(stage) || File.Exists(stage) || Directory.Exists(privateStage) || File.Exists(privateStage))
                        throw new IOException("Setup stage already exists");
                    RootPaths.NewDirectory(privateStage, 0x1c0);
                    privateClaimed = true;
                    if (RootPaths.chmod(privateStage, 0x1c0) != 0) throw new IOException("Could not protect setup stage");
                    RootPaths.WriteNew(privateStage + "/pairing.json", Encoding.UTF8.GetBytes(root.GetProperty("pairing_json").GetString()));
                    RootPaths.WriteNew(privateStage + "/server.pfx", Convert.FromBase64String(root.GetProperty("server_pfx").GetString()));
                    RootPaths.WriteNew(privateStage + "/root.json", Encoding.UTF8.GetBytes(root.GetProperty("root_json").GetString()));
                    foreach (string name in ServiceLaunch.Managed)
                        RootPaths.WriteNew(privateStage + "/" + name, Convert.FromBase64String(root.GetProperty("bridge_files").GetProperty(name).GetString()));
                    RootPaths.NewDirectory(stage, 0x1ed);
                    stageClaimed = true;
                    if (RootPaths.chmod(stage, 0x1ed) != 0) throw new IOException("Could not protect root stage");
                    foreach (var item in root.GetProperty("files").EnumerateObject())
                    {
                        if (!System.Text.RegularExpressions.Regex.IsMatch(item.Name, "\\A[A-Za-z0-9_.-]{1,100}\\z")) throw new IOException("Invalid staged filename");
                        RootPaths.WriteNew(stage + "/" + item.Name, Convert.FromBase64String(item.Value.GetString()), 0x1a4);
                        written.Add(item.Name);
                    }
                    bundle = new Bundle(stage, allowService: true);
                    if (bundle.Service == null || bundle.Service.Operation == "serve" || bundle.Service.SetupStage != privateStage)
                        throw new IOException("Setup archive is not bound to the private stage");
                    string claim = Bundle.Hex(8);
                    RootPaths.WriteNew(stage + "/probe-owner", Encoding.ASCII.GetBytes(claim));
                    string demand = Bundle.StagingRoot + "/on-demand";
                    if (Directory.Exists(demand) && (File.GetAttributes(demand) & FileAttributes.ReparsePoint) != 0) throw new IOException("Linked on-demand directory refused");
                    Directory.CreateDirectory(demand);
                    foreach (string name in new[] { bundle.Archive, bundle.Archive + ".signature" })
                        RootPaths.WriteNew(demand + "/" + name, Bundle.ReadBounded(stage + "/" + name), 0x1a4);
                    string boot = RootPaths.Boot(), passwd = Bundle.Digest(File.ReadAllBytes("/etc/passwd")), key = Bundle.Digest(File.ReadAllBytes("/usr/share/sdbd/public.pem"));
                    report["root_attempted"] = true;
                    PayloadRunner.Run(bundle, claim);
                    Proof.Read(bundle, boot);
                    var wait = Stopwatch.StartNew();
                    while (!File.Exists(bundle.ProofDirectory + "/bridge.json") && wait.ElapsedMilliseconds < 6000) Thread.Sleep(100);
                    Proof.Read(bundle, boot, bundle.ProofDirectory + "/bridge.json");
                    report["protected_proof_verified"] = true;
                    report["bridge_ready"] = bundle.Service.Operation == "install";
                    report["cleanup_verified"] = bundle.Service.Operation == "remove";
                    report["system_files_unchanged"] = passwd == Bundle.Digest(File.ReadAllBytes("/etc/passwd")) && key == Bundle.Digest(File.ReadAllBytes("/usr/share/sdbd/public.pem"));
                    report["same_boot"] = boot == RootPaths.Boot(); report["boot_id"] = boot; report["nonce"] = bundle.Nonce;
                    report["passed"] = (bool)report["system_files_unchanged"] && (bool)report["same_boot"];
                }
            }
            catch (Exception error) { report["error"] = error.GetType().Name + ": " + error.Message; }
            finally
            {
                try
                {
                    if (bundle != null)
                    {
                        foreach (string name in new[] { bundle.Archive, bundle.Archive + ".signature" })
                        {
                            string path = Bundle.StagingRoot + "/on-demand/" + name;
                            if (!File.Exists(path)) continue;
                            if (Bundle.Digest(Bundle.ReadBounded(path)) != bundle.Hashes[name]) throw new IOException("Foreign on-demand archive refused");
                            File.Delete(path);
                        }
                    }
                    if (stageClaimed && Directory.Exists(stage))
                    {
                        var known = new HashSet<string>(written.Concat(new[] { "probe-owner", "launcher.log" }));
                        foreach (string path in Directory.GetFiles(stage))
                        {
                            if (!known.Contains(Path.GetFileName(path))) throw new IOException("Unknown setup-stage file retained");
                            File.Delete(path);
                        }
                        Directory.Delete(stage, false);
                    }
                    if (privateClaimed && Directory.Exists(privateStage))
                    {
                        foreach (string name in new[] { "pairing.json", "server.pfx", "root.json" }.Concat(ServiceLaunch.Managed)) File.Delete(privateStage + "/" + name);
                        Directory.Delete(privateStage, false);
                    }
                    report["staging_cleaned"] = true;
                }
                catch (Exception error) { report["passed"] = false; report["cleanup_error"] = error.Message; }
            }
            Console.WriteLine("AEROTIZEN_ROOT_BOOTSTRAP=" + JsonSerializer.Serialize(report));
            return (bool)report["passed"] ? 0 : 1;
        }
    }
}
