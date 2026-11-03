using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace AeroTizen.UntetheredProbe
{
    internal sealed class ServiceLaunch
    {
        internal const string AppId = "org.aerotizen.roothelper";
        internal const string Bin = "/opt/usr/apps/" + AppId + "/bin/";
        internal static readonly string[] Managed = { "AeroTizenRootBridge.dll", "AeroTizenRootBridge.runtimeconfig.json", "AeroTizenRootBridge.deps.json" };
        internal readonly string Operation, Installation, SetupStage;
        internal readonly Dictionary<string, string> Hashes = new Dictionary<string, string>();
        internal ServiceLaunch(JsonElement value)
        {
            string[] names = { "operation", "installation_id", "setup_stage", "files" };
            if (!value.EnumerateObject().Select(item => item.Name).OrderBy(item => item).SequenceEqual(names.OrderBy(item => item)))
                throw new InvalidDataException("Unexpected root service descriptor");
            Operation = value.GetProperty("operation").GetString();
            Installation = value.GetProperty("installation_id").GetString();
            SetupStage = value.GetProperty("setup_stage").GetString();
            if (!Regex.IsMatch(Installation ?? "", "\\A[a-f0-9]{32}\\z") || (Operation != "install" && Operation != "serve" && Operation != "remove")
                || (Operation == "serve" && SetupStage != null)
                || (Operation != "serve" && !Regex.IsMatch(SetupStage ?? "", "\\A/home/owner/share/tmp/sdk_tools/arsetup-[a-f0-9]{16}\\z")))
                throw new InvalidDataException("Invalid fixed root service operation");
            foreach (var item in value.GetProperty("files").EnumerateObject())
            {
                string hash = item.Value.GetString();
                if (!Managed.Contains(item.Name) || !Regex.IsMatch(hash ?? "", "\\A[a-f0-9]{64}\\z") || Hashes.ContainsKey(item.Name))
                    throw new InvalidDataException("Invalid root service checksum");
                Hashes.Add(item.Name, hash);
            }
            if (Hashes.Count != Managed.Length) throw new InvalidDataException("Incomplete root service checksums");
        }
        internal string Script(string nonce)
        {
            var lines = new List<string>();
            string bin = Operation == "remove" ? SetupStage + "/" : Bin;
            foreach (string name in Managed)
            {
                string path = bin + name;
                lines.Add("test ! -L " + Bundle.Quote(path));
                lines.Add("printf '%s  %s\\n' " + Bundle.Quote(Hashes[name]) + " " + Bundle.Quote(path) + " | sha256sum -c - >/dev/null");
            }
            if (Operation == "install")
                lines.Add("exec /usr/bin/dotnet " + Bundle.Quote(Bin + Managed[0]) + " --install " + Bundle.Quote(SetupStage)
                    + " " + Bundle.Quote(Installation) + " " + Bundle.Quote(nonce));
            else if (Operation == "remove")
                lines.Add("exec /usr/bin/dotnet " + Bundle.Quote(bin + Managed[0]) + " --cleanup " + Bundle.Quote(SetupStage)
                    + " " + Bundle.Quote(Installation) + " " + Bundle.Quote(nonce));
            else
                lines.Add("/usr/bin/dotnet " + Bundle.Quote(Bin + Managed[0]) + " --serve " + Bundle.Quote(Installation)
                    + " " + Bundle.Quote(nonce) + " boot </dev/null >/dev/null 2>&1 3>&- &");
            return string.Join("\n", lines) + "\n";
        }
    }
}
