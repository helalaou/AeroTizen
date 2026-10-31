using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using AeroTizen.Root;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.RootHelper
{
    internal static class RuntimeBundle
    {
        private static void Text(byte[] header, int offset, int length, string text)
        {
            byte[] value = Encoding.ASCII.GetBytes(text);
            if (value.Length > length) throw new InvalidDataException("Invalid tar field");
            Array.Copy(value, 0, header, offset, value.Length);
        }
        private static byte[] Archive(byte[] script)
        {
            byte[] header = new byte[512];
            Text(header, 0, 100, "launch.sh"); Text(header, 100, 8, "0000600\0");
            Text(header, 108, 8, "0000000\0"); Text(header, 116, 8, "0000000\0");
            Text(header, 124, 12, Convert.ToString(script.Length, 8).PadLeft(11, '0') + "\0");
            Text(header, 136, 12, "00000000000\0"); Text(header, 148, 8, "        ");
            header[156] = (byte)'0'; Text(header, 257, 6, "ustar\0"); Text(header, 263, 2, "00");
            int sum = header.Sum(value => (int)value);
            Text(header, 148, 8, Convert.ToString(sum, 8).PadLeft(6, '0') + "\0 ");
            using (var output = new MemoryStream())
            {
                using (var gzip = new GZipStream(output, CompressionLevel.Optimal, true))
                {
                    gzip.Write(header, 0, header.Length); gzip.Write(script, 0, script.Length);
                    byte[] padding = new byte[((script.Length + 511) / 512 * 512 - script.Length) + 1024];
                    gzip.Write(padding, 0, padding.Length);
                }
                return output.ToArray();
            }
        }
        internal static Bundle Build(RootSettings settings, string directory, string nonce, string packageRoot = RootPaths.Package, Action claimed = null)
        {
            RootSettings.Hex(nonce, 32);
            if (Directory.Exists(directory) || File.Exists(directory)) throw new IOException("Runtime bundle directory already exists");
            Directory.CreateDirectory(directory);
            claimed?.Invoke();
            string package = "archive-root-" + Bundle.Hex(8);
            var serviceFiles = new Dictionary<string, string>();
            foreach (string name in ServiceLaunch.Managed) serviceFiles[name] = settings.Files["bin/" + name];
            var service = new { operation = "serve", installation_id = settings.Installation, setup_stage = (string)null, files = serviceFiles };
            var values = new Dictionary<string, byte[]>();
            foreach (string name in new[] { "AeroTizenRootProbe.dll", "AeroTizenRootProbe.runtimeconfig.json", "AeroTizenRootProbe.deps.json" })
            {
                byte[] bytes = Bundle.ReadBounded(packageRoot + "/res/runner/" + name);
                if (Bundle.Digest(bytes) != settings.Files["res/runner/" + name]) throw new IOException("SDK supervisor checksum differs");
                values[name] = bytes;
            }
            foreach (string name in new[] { "SamsungTvArchiveRoot.dll", "SamsungTvArchiveRoot.runtimeconfig.json", "SamsungTvArchiveRoot.deps.json" })
                values[name] = Bundle.ReadBounded(packageRoot + "/res/payload/" + name);
            // Build the same fixed proof prefix as Bundle, then the narrow signed service launch.
            string proofDirectory = Bundle.StagingRoot + "/aerotizen-probe-proof-" + nonce;
            string script = string.Join("\n", new[] {
                "#!/bin/sh", "set -eu", "umask 077", "test \"$(id -u)\" = 0", "test \"$(id -ru)\" = 0", "test \"$(id -g)\" = 0",
                "boot=$(cat /proc/sys/kernel/random/boot_id)", "case \"$boot\" in *[!a-f0-9-]*|'') exit 80;; esac",
                "proofdir=" + proofDirectory, "test ! -e \"$proofdir\"", "test ! -L \"$proofdir\"", "mkdir -m 755 \"$proofdir\"",
                "chsmack -a _ \"$proofdir\"", "cd \"$proofdir\"", "proof=proof.json", "test ! -e \"$proof.new\"", "test ! -L \"$proof.new\"", "set -C",
                "printf '{\"schema_version\":1,\"uid\":0,\"euid\":0,\"gid\":0,\"boot_id\":\"%s\",\"nonce\":\"" + nonce
                    + "\",\"payload_sha256\":\"" + Bundle.Digest(values["SamsungTvArchiveRoot.dll"]) + "\"}\\n' \"$boot\" > \"$proof.new\"",
                "set +C", "chmod 444 \"$proof.new\"", "chsmack -a _ \"$proof.new\"", "mv -f \"$proof.new\" \"$proof\"", ""
            });
            using (var document = JsonDocument.Parse(JsonSerializer.SerializeToUtf8Bytes(service)))
                script += new ServiceLaunch(document.RootElement).Script(nonce);
            byte[] archive = Archive(Encoding.ASCII.GetBytes(script));
            using (var key = RSA.Create(2048))
            {
                values[package + ".tar.gz"] = archive;
                values[package + ".tar.gz.signature"] = key.SignData(archive, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                values["public.pem"] = Encoding.ASCII.GetBytes("-----BEGIN PUBLIC KEY-----\n"
                    + Convert.ToBase64String(key.ExportSubjectPublicKeyInfo(), Base64FormattingOptions.InsertLineBreaks)
                    + "\n-----END PUBLIC KEY-----\n");
            }
            values["passwd"] = Encoding.ASCII.GetBytes("owner:x:0:0:owner:/home/owner:/bin/sh\n");
            var hashes = values.ToDictionary(item => item.Key, item => new { sha256 = Bundle.Digest(item.Value), size = item.Value.Length });
            byte[] manifest = JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1, upstream_version = Bundle.Version,
                runtime = "6.0", package, nonce, service, files = hashes });
            foreach (var item in values) File.WriteAllBytes(Path.Combine(directory, item.Key), item.Value);
            File.WriteAllBytes(Path.Combine(directory, "probe.json"), manifest);
            return new Bundle(directory, allowService: true);
        }
    }
}
