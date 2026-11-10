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
        internal const string ScopeRunner = "/usr/bin/systemd-run";
        internal static readonly string[] Managed = { "AeroTizenRootBridge.dll", "AeroTizenRootBridge.runtimeconfig.json", "AeroTizenRootBridge.deps.json" };
        internal readonly string Operation, Installation, SetupStage;
        internal readonly Dictionary<string, string> Hashes = new Dictionary<string, string>();
        internal static void RequireScopeRunner()
        {
            if (!File.Exists(ScopeRunner))
                throw new FileNotFoundException("The root bridge requires systemd-run for process isolation", ScopeRunner);
        }
        internal static string ServerCommand(string installation, string nonce, string origin)
        {
            if (!Regex.IsMatch(installation ?? "", "\\A[a-f0-9]{32}\\z")
                || !Regex.IsMatch(nonce ?? "", "\\A[a-f0-9]{32}\\z") || (origin != "boot" && origin != "setup"))
                throw new InvalidDataException("Invalid root bridge launch identity");
            // setsid detaches the terminal, but the process would still belong to
            // sdbd.service and be killed when Samsung restarts the developer daemon.
            string unit = "aerotizen-root-" + installation + "-" + nonce + ".scope";
            return ScopeRunner + " --quiet --scope --unit=" + Bundle.Quote(unit)
                + " -- /usr/bin/dotnet " + Bundle.Quote(Bin + Managed[0])
                + " --serve " + Bundle.Quote(installation) + " " + Bundle.Quote(nonce) + " " + Bundle.Quote(origin);
        }
        internal ServiceLaunch(JsonElement value)
        {
            string[] names = { "operation", "installation_id", "setup_stage", "files" };
            if (!value.EnumerateObject().Select(item => item.Name).OrderBy(item => item).SequenceEqual(names.OrderBy(item => item)))
                throw new InvalidDataException("Unexpected root service descriptor");
            Operation = value.GetProperty("operation").GetString();
            Installation = value.GetProperty("installation_id").GetString();
            SetupStage = value.GetProperty("setup_stage").GetString();
            if (!Regex.IsMatch(Installation ?? "", "\\A[a-f0-9]{32}\\z")
                || (Operation != "install" && Operation != "upgrade" && Operation != "serve" && Operation != "remove")
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
            if (Operation == "serve")
                lines.Add(ServerCommand(Installation, nonce, "boot") + " </dev/null >/dev/null 2>&1 3>&- &");
            else
            {
                string command = Operation == "install" ? "--install" : Operation == "upgrade" ? "--repair-startup" : "--cleanup";
                lines.Add("exec /usr/bin/dotnet " + Bundle.Quote(bin + Managed[0]) + " " + command + " " + Bundle.Quote(SetupStage)
                    + " " + Bundle.Quote(Installation) + " " + Bundle.Quote(nonce));
            }
            return string.Join("\n", lines) + "\n";
        }
    }
}
