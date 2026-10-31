using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using AeroTizen.AutoRoot;
using AeroTizen.UntetheredProbe;

internal static class ReadinessTests
{
    internal static void Run(Action<bool, string> check, Action<Action, string> reject)
    {
        long now = 0;
        int probes = 0, sleeps = 0;
        var records = new List<SdbReadinessAttempt>();
        SdbReadiness.Wait(budget =>
        {
            now += 30; probes++;
            return new SdbReadinessAttempt { ready = probes == 3, stage = probes == 3 ? "service-complete" : "cnxn-reply",
                error = probes == 3 ? null : "EndOfStreamException: Truncated SDB header (0/24 bytes)" };
        }, () => now, milliseconds => { now += milliseconds; sleeps++; }, records.Add);
        check(probes == 3 && sleeps == 2 && now > 20000, "Readiness stopped at the old 20-second window");
        check(records.Count == 3 && records[0].attempt == 1 && records[2].attempt == 3, "Readiness attempts were not retained");
        check(records[0].stage == "cnxn-reply" && records[0].error.Contains("0/24"), "Handshake failure context was lost");
        check(records[2].ready && records[2].elapsed_ms == now, "Successful readiness was not recorded before return");

        now = 0; probes = 0; records.Clear();
        reject(() => SdbReadiness.Wait(budget =>
        {
            check(budget > 0 && budget <= SdbReadiness.AttemptMilliseconds && budget <= 180000 - now,
                "Readiness request exceeded the remaining deadline");
            probes++; now += Math.Min(50, budget);
            return new SdbReadinessAttempt { stage = "cnxn-reply", error = "closed" };
        }, () => now, milliseconds => now += milliseconds, records.Add), "Unavailable SDB was accepted");
        check(now == 180000 && probes == 18 && records.Count == 18, "Retry window was not bounded to three minutes");

        now = 0; probes = 0;
        reject(() => SdbReadiness.Wait(budget =>
        {
            probes++; now += budget + 1;
            return new SdbReadinessAttempt { ready = true };
        }, () => now, milliseconds => now += milliseconds, record => { }, limit: 5), "Late success bypassed the deadline");
        check(probes == 1, "Expired readiness started a second request");

        now = 0; probes = 0; sleeps = 0;
        reject(() => SdbReadiness.Wait(budget =>
        {
            probes++; return new SdbReadinessAttempt { ready = true };
        }, () => now, milliseconds => sleeps++, record => throw new IOException("No space left")),
            "A failed diagnostic write allowed the trial to proceed");
        check(probes == 1 && sleeps == 0, "A failed evidence write continued retries");
        reject(() => SdbReadiness.Wait(_ => null, () => 0, _ => { }, _ => { }, 0), "Zero readiness deadline accepted");
        reject(() => SdbReadiness.Wait(_ => null, () => 0, _ => { }, _ => { }, 180001), "Unbounded readiness deadline accepted");

        var metadata = new SdbReadinessAttempt();
        SdbReadiness.ParseMetadata(Encoding.UTF8.GetBytes("{\"device\":{\"developerMode\":\"1\",\"developerIP\":\"127.0.0.1\",\"token\":\"private-value\",\"duid\":\"private-device\"}}"), metadata);
        check(metadata.developer_mode == "1" && metadata.developer_host == "127.0.0.1", "Developer Mode diagnostic fields were lost");
        check(!JsonSerializer.Serialize(metadata).Contains("private"), "Private metadata escaped the field allowlist");
        reject(() => SdbReadiness.ParseMetadata(new byte[16385], metadata), "Oversized local metadata accepted");
        reject(() => SdbReadiness.ParseMetadata(Encoding.UTF8.GetBytes("{\"device\":{\"developerMode\":\"1\",\"developerIP\":\"elsewhere.example\"}}"), metadata),
            "A non-IP metadata host was accepted");
        reject(() => SdbReadiness.ParseMetadata(Encoding.UTF8.GetBytes("{\"device\":{\"developerMode\":\"true\",\"developerIP\":\"127.0.0.1\"}}"), metadata),
            "An unknown Developer Mode state was accepted");

        ClosedConnection(check, service: false, partial: false);
        ClosedConnection(check, service: false, partial: true);
        ClosedConnection(check, service: true, partial: false);
        using (var client = new LoopbackSdb())
        {
            reject(() => client.Connect(milliseconds: 0), "Zero handshake deadline accepted");
            reject(() => client.Connect(milliseconds: 6001), "Unbounded handshake deadline accepted");
        }
    }

    private static void ClosedConnection(Action<bool, string> check, bool service, bool partial)
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Task server = Task.Run(() =>
        {
            using (var peer = listener.AcceptTcpClient())
            using (var stream = peer.GetStream())
            {
                Frame.Read(stream, new Deadline(2000));
                if (service)
                {
                    new Frame("CNXN", 0x01000000, 4096, Encoding.ASCII.GetBytes("device::test\0")).Write(stream);
                    Frame.Read(stream, new Deadline(2000));
                }
                if (partial) stream.Write(new byte[] { 67, 78, 88 }, 0, 3);
            }
        });
        try
        {
            using (var client = new LoopbackSdb())
            {
                bool rejected = false;
                try { client.Connect(port); if (service) client.Service("capability:"); }
                catch (EndOfStreamException error)
                {
                    rejected = true;
                    check(error.Message.Contains(partial ? "3/24" : "0/24"), "SDB close lost its partial-frame byte count");
                }
                check(rejected, "Closed SDB connection was accepted");
                check(client.Stage == (service ? "service-reply" : "cnxn-reply"), "SDB close lost its connection stage");
            }
            server.GetAwaiter().GetResult();
        }
        finally { listener.Stop(); }
    }
}
