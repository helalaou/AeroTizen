using System;
using System.IO;
using System.Text.Json;
using AeroTizen.Root;

namespace AeroTizen.RootHelper
{
    internal sealed class PerBootGate
    {
        private readonly string data, installation, baseline;
        internal PerBootGate(string data, string installation, string baseline)
        {
            this.data = data; this.installation = RootSettings.Hex(installation, 32); this.baseline = Boot(baseline);
        }
        private static string Boot(string value)
        {
            if (!Guid.TryParseExact(value, "D", out Guid id) || value != id.ToString("D")) throw new InvalidDataException("Invalid kernel boot identity");
            return value;
        }
        private string Receipt(string boot) { return Path.Combine(data, "boot-" + Boot(boot) + ".json"); }
        internal string Decision(string boot)
        {
            Boot(boot);
            if (File.Exists(Path.Combine(data, "disabled"))) return "disabled";
            if (boot == baseline) return "waiting-for-boot";
            return File.Exists(Receipt(boot)) ? "already-attempted" : "run-once";
        }
        internal string Claim(string boot)
        {
            if (Decision(boot) != "run-once") throw new InvalidOperationException("This boot cannot request root again");
            string nonce = Guid.NewGuid().ToString("N");
            using (var file = new FileStream(Receipt(boot), FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(new { schema_version = 1, installation_id = installation,
                    boot_id = boot, nonce, root_attempted = false });
                file.Write(bytes, 0, bytes.Length); file.Flush(true);
            }
            return nonce;
        }
    }
}
