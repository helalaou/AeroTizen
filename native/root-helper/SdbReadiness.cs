using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.AutoRoot
{
    internal sealed class SdbReadinessAttempt
    {
        public int attempt { get; set; }
        public int budget_ms { get; set; }
        public long started_elapsed_ms { get; set; }
        public long elapsed_ms { get; set; }
        public bool ready { get; set; }
        public string stage { get; set; }
        public string error { get; set; }
        public string developer_mode { get; set; }
        public string developer_host { get; set; }
        public string metadata_error { get; set; }
    }

    internal static class SdbReadiness
    {
        internal const int LimitMilliseconds = 180000, RetryMilliseconds = 10000, AttemptMilliseconds = 10000;

        internal static void ParseMetadata(byte[] bytes, SdbReadinessAttempt result)
        {
            if (bytes.Length > 16384) throw new InvalidDataException("Local metadata response is too large");
            using (var json = JsonDocument.Parse(bytes))
            {
                var device = json.RootElement.GetProperty("device");
                string mode = device.GetProperty("developerMode").GetString();
                string host = device.GetProperty("developerIP").GetString();
                if ((mode != "0" && mode != "1") || !IPAddress.TryParse(host, out IPAddress address)
                    || address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
                    throw new InvalidDataException("Local Developer Mode metadata was not recognised");
                // Keep only these two fields; never persist the full device response.
                result.developer_mode = mode; result.developer_host = address.ToString();
            }
        }

        private static void ReadMetadata(SdbReadinessAttempt result, int milliseconds)
        {
            try
            {
                using (var cancel = new CancellationTokenSource(milliseconds))
                using (var handler = new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false, MaxResponseHeadersLength = 8 })
                using (var client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan })
                using (var response = client.GetAsync("http://127.0.0.1:8001/api/v2/", HttpCompletionOption.ResponseHeadersRead,
                    cancel.Token).GetAwaiter().GetResult())
                {
                    if (response.StatusCode != HttpStatusCode.OK) throw new IOException("Local metadata HTTP " + (int)response.StatusCode);
                    using (var stream = response.Content.ReadAsStreamAsync(cancel.Token).GetAwaiter().GetResult())
                    using (var body = new MemoryStream())
                    {
                        byte[] buffer = new byte[1024];
                        while (true)
                        {
                            int count = stream.ReadAsync(buffer.AsMemory(), cancel.Token).GetAwaiter().GetResult();
                            if (count == 0) break;
                            if (body.Length + count > 16384) throw new InvalidDataException("Local metadata response is too large");
                            body.Write(buffer, 0, count);
                        }
                        ParseMetadata(body.ToArray(), result);
                    }
                }
            }
            catch (Exception error) { result.metadata_error = error.GetType().Name + ": " + error.Message; }
        }

        internal static SdbReadinessAttempt Probe(int milliseconds)
        {
            if (milliseconds <= 0 || milliseconds > AttemptMilliseconds) throw new ArgumentOutOfRangeException(nameof(milliseconds));
            var result = new SdbReadinessAttempt { budget_ms = milliseconds };
            var watch = Stopwatch.StartNew();
            // Metadata is diagnostic only. SDB's actual handshake decides readiness.
            ReadMetadata(result, Math.Min(1000, milliseconds));
            using (var client = new LoopbackSdb())
            {
                try
                {
                    int left = milliseconds - (int)watch.ElapsedMilliseconds;
                    if (left <= 0) throw new TimeoutException("Readiness attempt deadline expired");
                    client.Connect(milliseconds: Math.Min(6000, left));
                    left = milliseconds - (int)watch.ElapsedMilliseconds;
                    if (left <= 0) throw new TimeoutException("Readiness attempt deadline expired");
                    string capability = client.Service("capability:", Math.Min(3000, left));
                    if (!capability.Contains("platform_version:", StringComparison.Ordinal))
                        throw new InvalidDataException("Local SDB capability response was not recognised");
                    result.ready = true;
                }
                catch (Exception error) { result.error = error.GetType().Name + ": " + error.Message; }
                result.stage = client.Stage;
            }
            return result;
        }

        internal static void Wait(Action<SdbReadinessAttempt> report)
        {
            var watch = Stopwatch.StartNew();
            Wait(Probe, () => watch.ElapsedMilliseconds, Thread.Sleep, report);
        }

        // Monotonic clock and read-only probe seams allow deadline/retry tests without root or a real TV.
        internal static void Wait(Func<int, SdbReadinessAttempt> probe, Func<long> elapsed,
            Action<int> delay, Action<SdbReadinessAttempt> report, int limit = LimitMilliseconds)
        {
            if (limit <= 0 || limit > LimitMilliseconds) throw new ArgumentOutOfRangeException(nameof(limit));
            int count = 0;
            SdbReadinessAttempt last = null;
            while (elapsed() < limit)
            {
                long started = elapsed();
                int budget = (int)Math.Min(AttemptMilliseconds, limit - started);
                if (budget <= 0) break;
                last = probe(budget);
                last.attempt = ++count; last.budget_ms = budget;
                last.started_elapsed_ms = started; last.elapsed_ms = elapsed();
                report(last); // Persist before proceeding; a failed write must stop the trial.
                if (last.ready && last.elapsed_ms <= limit) return;
                long left = limit - elapsed();
                if (left <= 0) break;
                delay((int)Math.Min(RetryMilliseconds, left));
            }
            throw new IOException("Local SDB was not ready within " + limit + " ms after " + count
                + " attempts; last stage=" + last?.stage + "; " + last?.error);
        }
    }
}
