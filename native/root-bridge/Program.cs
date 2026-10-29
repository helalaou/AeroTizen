using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal sealed class Pairing
    {
        internal readonly string Installation, Token;
        internal readonly uint DatabaseUid, DatabaseGid;
        internal Pairing(byte[] bytes)
        {
            using (var document = JsonDocument.Parse(bytes))
            {
                var value = document.RootElement;
                if (value.GetProperty("schema_version").GetInt32() != 1) throw new InvalidDataException("Invalid private pairing format");
                Installation = RootSettings.Hex(value.GetProperty("installation_id").GetString(), 32);
                Token = RootSettings.Hex(value.GetProperty("token").GetString(), 64);
                DatabaseUid = value.GetProperty("database_uid").GetUInt32(); DatabaseGid = value.GetProperty("database_gid").GetUInt32();
                if (DatabaseUid == 0 || DatabaseGid == 0) throw new InvalidDataException("Database writer must drop privileges");
            }
        }
    }

    internal static class BridgeProgram
    {
        [DllImport("libc.so.6", SetLastError = true)] private static extern int open(string path, int flags);
        [DllImport("libc.so.6", SetLastError = true)] private static extern int dup2(int oldfd, int newfd);
        [DllImport("libc.so.6", SetLastError = true)] private static extern int close(int fd);
        [DllImport("libc.so.6", SetLastError = true)] private static extern int setxattr(string path, string name, byte[] value, UIntPtr size, int flags);
        private static Dictionary<string, object> Identity()
        {
            var registry = Registry();
            var row = registry["row"] as string[];
            var result = new Dictionary<string, object> { ["boot_id"] = RootPaths.Boot(), ["uid"] = RootPaths.getuid(),
                ["euid"] = RootPaths.geteuid(), ["gid"] = RootPaths.getgid(), ["pid"] = Environment.ProcessId,
                ["automatic_startup_enabled"] = row != null && row.Length == 7 && row[4] == "true" && !File.Exists(RootPaths.Data + "/disabled"),
                ["helper_installed"] = row != null,
                ["bootstrap_completed"] = false };
            ReadBootstrapStatus(result, RootPaths.Data + "/status.json");
            return result;
        }
        internal static void ReadBootstrapStatus(Dictionary<string, object> result, string path)
        {
            try
            {
                using (var status = JsonDocument.Parse(Bundle.ReadBounded(path, 131072)))
                {
                    var value = status.RootElement;
                    if (value.GetProperty("boot_id").GetString() == (string)result["boot_id"])
                    {
                        result["bootstrap_completed"] = value.TryGetProperty("passed", out var passed) && passed.GetBoolean()
                            && value.TryGetProperty("app_staging_cleaned", out var cleaned) && cleaned.GetBoolean();
                        if (value.TryGetProperty("error", out var error)) result["startup_error"] = error.GetString();
                    }
                }
            }
            catch (Exception error) when (error is IOException || error is InvalidDataException || error is JsonException || error is InvalidOperationException
                || error is KeyNotFoundException || error is UnauthorizedAccessException) { }
        }
        private static string Sql(string query)
        {
            var start = new ProcessStartInfo("/usr/bin/sqlite3") { UseShellExecute = false,
                RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string value in new[] { "-readonly", "/opt/dbspace/.pkgmgr_parser.db", "PRAGMA query_only=ON; " + query }) start.ArgumentList.Add(value);
            using (var process = Process.Start(start))
            {
                var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(3000)) { process.Kill(true); process.WaitForExit(); throw new IOException("Registry query timed out"); }
                if (process.ExitCode != 0) throw new IOException("Registry query failed: " + error.GetAwaiter().GetResult().Trim());
                error.GetAwaiter().GetResult(); string result = output.GetAwaiter().GetResult();
                if (result.Length > 2 * 1024 * 1024) throw new IOException("Registry query output exceeded its limit");
                return result;
            }
        }
        private static Dictionary<string, object> Registry()
        {
            string raw = Sql("SELECT app_id,package,app_type,app_component,app_onboot,app_autorestart,app_exec FROM package_app_info WHERE app_id='" + RootPaths.AppId + "';");
            string[] lines = raw.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length > 1) throw new IOException("Duplicate root helper registration");
            string[] row = lines.Length == 1 ? lines[0].TrimEnd('\r').Split('|') : null;
            string identity = File.Exists(RootPaths.Config) ? RootSettings.Load().Installation : null;
            string other = Sql("SELECT * FROM package_app_info WHERE app_id<>'" + RootPaths.AppId + "' ORDER BY app_id;");
            return new Dictionary<string, object> { ["row"] = row, ["installation_id"] = identity,
                ["other_rows_sha256"] = Bundle.Digest(Encoding.UTF8.GetBytes(other)) };
        }
        private static void Ready(string nonce)
        {
            string directory = Bundle.StagingRoot + "/aerotizen-probe-proof-" + RootSettings.Hex(nonce, 32);
            using (var proof = File.OpenRead(directory + "/proof.json"))
            {
                var metadata = RootPaths.Metadata(proof);
                if (metadata.uid != 0 || metadata.links != 1 || (metadata.mode & 0x92) != 0) throw new IOException("Untrusted launch proof");
            }
            string path = directory + "/bridge.json";
            RootPaths.WriteNew(path, JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1, uid = 0, euid = 0, gid = 0,
                boot_id = RootPaths.Boot(), nonce, payload_sha256 = "5f647158f4c4fd502f1481c2692a95663516e934d11a13b45d5cd821d85d9671" }), 0x124);
            if (setxattr(path, "security.SMACK64", new byte[] { 95 }, new UIntPtr(1), 0) != 0)
                throw new IOException("Could not label the protected bridge proof");
        }
        private static void Detach()
        {
            RootPaths.setsid();
            int file = open("/dev/null", 2);
            if (file < 0) throw new IOException("Could not detach bridge streams");
            try { for (int stream = 0; stream < 3; stream++) if (dup2(file, stream) < 0) throw new IOException("Could not detach bridge stream"); }
            finally { if (file > 2) close(file); }
        }
        private static void Diagnostic(string nonce, string phase, Exception error)
        {
            try
            {
                // At most one bounded report per fixed phase and boot; never include request data.
                string path = Bundle.StagingRoot + "/aerotizen-probe-proof-" + nonce + "/bridge-error-" + phase + ".json";
                if (File.Exists(path)) return;
                string message = error.Message;
                if (message.Length > 512) message = message.Substring(0, 512);
                RootPaths.WriteNew(path, JsonSerializer.SerializeToUtf8Bytes(new { phase, error_type = error.GetType().Name, message }), 0x124);
                setxattr(path, "security.SMACK64", new byte[] { 95 }, new UIntPtr(1), 0);
            }
            catch (IOException) { }
        }
        internal static void ValidateRemoval(string installation, string token, IReadOnlyDictionary<string, byte[]> files)
        {
            if (files.Count == 0) return; // Previous cleanup may have removed the final marker.
            foreach (string name in files.Keys)
                if (name != "pairing.json" && name != "server.pfx" && name != "installation" && name != "server.json")
                    throw new IOException("Unknown private root file retained");
            if (!files.TryGetValue("installation", out var marker) || Encoding.ASCII.GetString(marker) != installation)
                throw new IOException("Foreign or incomplete ownership marker; refusing removal");
            if (files.TryGetValue("pairing.json", out var pairingBytes))
            {
                var pairing = new Pairing(pairingBytes);
                if (pairing.Installation != installation || pairing.Token != token) throw new IOException("Foreign pairing state; refusing removal");
            }
        }
        private static void Remove(RootSettings settings, string token)
        {
            var files = new Dictionary<string, byte[]>();
            if (Directory.Exists(RootPaths.Private))
            {
                RootPaths.PrivateDirectory(RootPaths.Private, 0);
                foreach (string path in Directory.GetFileSystemEntries(RootPaths.Private))
                    files.Add(Path.GetFileName(path), RootPaths.PrivateFile(path, 0, 32768));
                ValidateRemoval(settings.Installation, token, files);
                ServerLifetime.StopOther(settings);
            }
            string disabled = RootPaths.Data + "/disabled";
            if (Directory.Exists(RootPaths.Data) && !File.Exists(disabled)) RootPaths.WriteNew(disabled, Encoding.ASCII.GetBytes(settings.Installation + "\n"), 0x124);
            if (!Directory.Exists(RootPaths.Private)) return;
            // Keep the ownership marker until last, so an interrupted cleanup can be retried.
            foreach (string name in new[] { "pairing.json", "server.pfx", "server.json", "installation" })
            {
                if (files.ContainsKey(name)) File.Delete(RootPaths.Private + "/" + name);
            }
            Directory.Delete(RootPaths.Private, false);
        }
        private static void Configure(string stage, string installation, string nonce)
        {
            if (!Regex.IsMatch(stage ?? "", "\\A/home/owner/share/tmp/sdk_tools/arsetup-[a-f0-9]{16}\\z")) throw new IOException("Invalid setup directory");
            var settings = RootSettings.Load(); settings.VerifyFiles();
            if (settings.Installation != installation) throw new IOException("Setup installation identity differs");
            byte[] pairingBytes = RootPaths.PrivateFile(stage + "/pairing.json", 901, 4096);
            byte[] pfx = RootPaths.PrivateFile(stage + "/server.pfx", 901, 32768);
            var pairing = new Pairing(pairingBytes);
            if (pairing.Installation != installation) throw new IOException("Pairing is for another installation");
            using (var certificate = new X509Certificate2(pfx, (string)null, X509KeyStorageFlags.EphemeralKeySet))
                if (!certificate.HasPrivateKey || Bundle.Digest(certificate.RawData) != settings.Certificate) throw new IOException("Setup certificate differs");
            if (Directory.Exists(RootPaths.Private))
            {
                RootPaths.PrivateDirectory(RootPaths.Private, 0);
                string marker = RootPaths.Private + "/installation";
                if (!File.Exists(marker) && Directory.GetFileSystemEntries(RootPaths.Private).Length == 0)
                    RootPaths.WriteNew(marker, Encoding.ASCII.GetBytes(installation));
                if (!File.Exists(marker) || Encoding.ASCII.GetString(RootPaths.PrivateFile(marker, 0, 64)) != installation)
                    throw new IOException("Existing root state has another ownership marker");
            }
            else
            {
                if (File.Exists(RootPaths.Private)) throw new IOException("Root state path is occupied");
                RootPaths.NewDirectory(RootPaths.Private, 0x1c0);
                RootPaths.WriteNew(RootPaths.Private + "/installation", Encoding.ASCII.GetBytes(installation));
            }
            if (File.Exists(RootPaths.Private + "/pairing.json"))
            {
                var existing = new Pairing(RootPaths.PrivateFile(RootPaths.Private + "/pairing.json", 0, 4096));
                if (existing.Installation != installation || existing.Token != pairing.Token) throw new IOException("Existing pairing differs");
            }
            else RootPaths.WriteNew(RootPaths.Private + "/pairing.json", pairingBytes);
            if (File.Exists(RootPaths.Private + "/server.pfx"))
            {
                if (Bundle.Digest(RootPaths.PrivateFile(RootPaths.Private + "/server.pfx", 0, 32768)) != Bundle.Digest(pfx))
                    throw new IOException("Existing certificate differs");
            }
            else RootPaths.WriteNew(RootPaths.Private + "/server.pfx", pfx);
            using (var file = File.OpenRead("/opt/dbspace/.pkgmgr_parser.db"))
            {
                var owner = RootPaths.Metadata(file);
                if (owner.uid != pairing.DatabaseUid || owner.gid != pairing.DatabaseGid) throw new IOException("Database owner changed");
            }
            string sql = RegistrationSql();
            var start = new ProcessStartInfo("/usr/bin/dotnet") { UseShellExecute = false, RedirectStandardInput = true,
                RedirectStandardOutput = true, RedirectStandardError = true };
            foreach (string argument in new[] { RootPaths.Package + "/res/setup/AeroTizenBootWriter.dll", "--run",
                pairing.DatabaseUid.ToString(System.Globalization.CultureInfo.InvariantCulture), pairing.DatabaseGid.ToString(System.Globalization.CultureInfo.InvariantCulture) })
                start.ArgumentList.Add(argument);
            using (var process = Process.Start(start))
            {
                var output = process.StandardOutput.ReadToEndAsync(); var error = process.StandardError.ReadToEndAsync();
                process.StandardInput.Write(sql); process.StandardInput.Close();
                if (!process.WaitForExit(8000)) { process.Kill(true); process.WaitForExit(); throw new IOException("Startup registration timed out"); }
                if (process.ExitCode != 0) throw new IOException("Startup registration failed: " + error.GetAwaiter().GetResult());
                output.GetAwaiter().GetResult();
            }
            if (File.Exists(RootPaths.Data + "/disabled")) File.Delete(RootPaths.Data + "/disabled");
            // Close the SDK shell's callback fd before starting the CLR in the detached child.
            var server = new ProcessStartInfo("/bin/sh") { UseShellExecute = false };
            server.ArgumentList.Add("-c");
            server.ArgumentList.Add(SetupLaunch(installation, nonce));
            using (var child = Process.Start(server)) { if (child == null) throw new IOException("Bridge did not start"); }
        }
        internal static string SetupLaunch(string installation, string nonce)
        {
            RootSettings.Hex(installation, 32); RootSettings.Hex(nonce, 32);
            return "exec 3>&-; exec /usr/bin/dotnet " + Bundle.Quote(RootPaths.Package + "/bin/AeroTizenRootBridge.dll")
                + " --serve " + Bundle.Quote(installation) + " " + Bundle.Quote(nonce) + " setup </dev/null >/dev/null 2>&1";
        }
        internal static string RegistrationSql()
        {
            string condition = "app_id='" + RootPaths.AppId + "' AND package='" + RootPaths.AppId
                + "' AND app_type='dotnet' AND app_component='svcapp' AND app_autorestart='false' AND app_exec='"
                + RootPaths.Package + "/bin/AeroTizenRootHelper.dll'";
            return ".bail on\nPRAGMA busy_timeout=5000;\nBEGIN IMMEDIATE;\n"
                + "CREATE TEMP TABLE guard (ok INTEGER NOT NULL CHECK(ok=1));\n"
                + "INSERT INTO guard SELECT 1+COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='package_app_info';\n"
                + "INSERT INTO guard SELECT COUNT(*) FROM package_app_info WHERE " + condition + " AND app_onboot IN ('false','true');\n"
                + "UPDATE package_app_info SET app_onboot='true' WHERE " + condition + " AND app_onboot='false';\n"
                + "INSERT INTO guard SELECT COUNT(*) FROM package_app_info WHERE " + condition + " AND app_onboot='true';\nCOMMIT;\n";
        }
        public static int Main(string[] args)
        {
            try
            {
                if (args.Length == 1 && args[0] == "--preflight")
                {
                    RootPaths.RequireTv(false);
                    if (RootPaths.getuid() != 901 || RootPaths.geteuid() != 901) throw new IOException("Preflight requires SDK context");
                    using (var file = File.OpenRead("/opt/dbspace/.pkgmgr_parser.db"))
                    {
                        var owner = RootPaths.Metadata(file);
                        Console.WriteLine("AEROTIZEN_ROOT_PREFLIGHT=" + JsonSerializer.Serialize(new { schema_version = 1,
                            runtime = Environment.Version.ToString(), boot_id = RootPaths.Boot(), database_uid = owner.uid, database_gid = owner.gid }));
                    }
                    return 0;
                }
                if (args.Length == 2 && args[0] == "--bootstrap") return SetupBootstrap.Run(args[1]);
                if (args.Length == 5 && args[0] == "--bootstrap-fetch") return SetupTransfer.Run(args[1], args[2], args[3], args[4]);
                if (args.Length == 1 && args[0] == "--registry")
                {
                    RootPaths.RequireTv(false);
                    if (RootPaths.getuid() != 901 || RootPaths.geteuid() != 901) throw new IOException("Registry reader requires SDK context");
                    Console.WriteLine("AEROTIZEN_ROOT_REGISTRY=" + JsonSerializer.Serialize(Registry())); return 0;
                }
                if (args.Length == 3 && args[0] == "--clean-upload")
                {
                    RootPaths.RequireTv(false);
                    if (RootPaths.getuid() != 901 || !Regex.IsMatch(args[1], "\\Aaerotizen-root-[a-f0-9]{32}\\.tpk\\z")) throw new IOException("Invalid upload cleanup");
                    string path = Bundle.StagingRoot + "/" + args[1];
                    if (File.Exists(path))
                    {
                        if (Bundle.Digest(Bundle.ReadBounded(path, 2 * 1024 * 1024)) != RootSettings.Hex(args[2], 64)) throw new IOException("Upload checksum differs");
                        File.Delete(path);
                    }
                    Console.WriteLine("AEROTIZEN_ROOT_UPLOAD={\"removed\":true}"); return 0;
                }
                RootPaths.RequireTv(true);
                if (args.Length == 4 && args[0] == "--install") { Configure(args[1], RootSettings.Hex(args[2], 32), RootSettings.Hex(args[3], 32)); return 0; }
                if (args.Length == 4 && args[0] == "--cleanup")
                {
                    if (!Regex.IsMatch(args[1], "\\A/home/owner/share/tmp/sdk_tools/arsetup-[a-f0-9]{16}\\z")) throw new IOException("Invalid cleanup stage");
                    var cleanupSettings = new RootSettings(RootPaths.PrivateFile(args[1] + "/root.json", 901, 16384));
                    var supplied = new Pairing(RootPaths.PrivateFile(args[1] + "/pairing.json", 901, 4096));
                    if (cleanupSettings.Installation != RootSettings.Hex(args[2], 32) || supplied.Installation != cleanupSettings.Installation)
                        throw new IOException("Cleanup installation identity differs");
                    Remove(cleanupSettings, supplied.Token); Ready(RootSettings.Hex(args[3], 32)); return 0;
                }
                if (args.Length != 4 || args[0] != "--serve" || (args[3] != "setup" && args[3] != "boot")) throw new ArgumentException("Unknown fixed root service operation");
                var settings = RootSettings.Load(); settings.VerifyFiles();
                if (settings.Installation != RootSettings.Hex(args[1], 32) || File.Exists(RootPaths.Data + "/disabled")) return 0;
                string nonce = RootSettings.Hex(args[2], 32);
                var pairing = new Pairing(RootPaths.PrivateFile(RootPaths.Private + "/pairing.json", 0, 4096));
                if (pairing.Installation != settings.Installation) throw new IOException("Root pairing identity differs");
                using (var certificate = new X509Certificate2(RootPaths.PrivateFile(RootPaths.Private + "/server.pfx", 0, 32768),
                    (string)null, X509KeyStorageFlags.EphemeralKeySet))
                using (var server = new BridgeServer(settings, certificate, pairing.Token, () => {
                    var value = Identity(); value["origin"] = args[3]; value["launch_nonce"] = nonce; return value;
                }, () => Remove(settings, pairing.Token), diagnostic: (phase, error) => Diagnostic(nonce, phase, error)))
                {
                    Detach();
                    server.Run(() => { ServerLifetime.Record(settings); Ready(nonce); }).GetAwaiter().GetResult();
                }
                return 0;
            }
            catch (Exception error) { Console.Error.WriteLine("AEROTIZEN_ROOT_SERVICE_ERROR=" + error.GetType().Name + ": " + error.Message); return 1; }
        }
    }
}
