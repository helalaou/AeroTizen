using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal sealed class BridgeServer : IDisposable
    {
        private readonly RootSettings settings;
        private readonly X509Certificate2 certificate;
        private readonly byte[] secret;
        private readonly TcpListener listener;
        private readonly SemaphoreSlim capacity = new SemaphoreSlim(4);
        private readonly CancellationTokenSource stopping = new CancellationTokenSource();
        private readonly Func<Dictionary<string, object>> identity;
        private readonly Action remove;
        private readonly Func<CancellationToken, Task<TcpClient>> connectSdb;
        private readonly Action<string, Exception> diagnostic;
        internal int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
        internal BridgeServer(RootSettings settings, X509Certificate2 certificate, string token,
            Func<Dictionary<string, object>> identity, Action remove, IPAddress bind = null, int? port = null,
            Func<CancellationToken, Task<TcpClient>> connectSdb = null, Action<string, Exception> diagnostic = null)
        {
            this.settings = settings; this.certificate = certificate; this.identity = identity; this.remove = remove;
            this.connectSdb = connectSdb ?? ConnectLocalSdb;
            this.diagnostic = diagnostic;
            secret = Encoding.ASCII.GetBytes(RootSettings.Hex(token, 64));
            if (Bundle.Digest(certificate.RawData) != settings.Certificate) throw new InvalidDataException("Root TLS certificate pin differs");
            listener = new TcpListener(bind ?? IPAddress.Any, port ?? settings.Port);
        }
        internal async Task Run(Action ready = null)
        {
            listener.Start(8);
            try
            {
                ready?.Invoke();
                while (!stopping.IsCancellationRequested)
                {
                    TcpClient peer = await listener.AcceptTcpClientAsync(stopping.Token);
                    if (!capacity.Wait(0)) { peer.Dispose(); continue; }
                    _ = Serve(peer).ContinueWith(task => { var ignored = task.Exception; capacity.Release(); }, TaskScheduler.Default);
                }
            }
            catch (OperationCanceledException) when (stopping.IsCancellationRequested) { }
            finally { listener.Stop(); }
        }
        private static async Task<JsonDocument> Request(Stream stream, CancellationToken cancel)
        {
            using (var bytes = new MemoryStream())
            {
                byte[] next = new byte[1];
                while (bytes.Length <= 1024)
                {
                    if (await stream.ReadAsync(next.AsMemory(), cancel) == 0) throw new EndOfStreamException();
                    if (next[0] == 10) return JsonDocument.Parse(bytes.ToArray());
                    bytes.WriteByte(next[0]);
                }
                throw new InvalidDataException("Bridge request is too large");
            }
        }
        private async Task Serve(TcpClient peer)
        {
            using (peer)
            using (var tls = new SslStream(peer.GetStream(), false))
            using (var deadline = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token))
            {
                string phase = "tls";
                try
                {
                    deadline.CancelAfter(5000);
                    await tls.AuthenticateAsServerAsync(new SslServerAuthenticationOptions {
                        ServerCertificate = certificate, ClientCertificateRequired = false,
                        EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                        CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                    }, deadline.Token);
                    phase = "request";
                    using (var request = await Request(tls, deadline.Token))
                    {
                        var value = request.RootElement;
                        if (value.GetProperty("protocol").GetInt32() != 1) throw new InvalidDataException("Unsupported bridge protocol");
                        string supplied = value.GetProperty("token").GetString();
                        byte[] suppliedBytes = Encoding.ASCII.GetBytes(supplied ?? "");
                        if (suppliedBytes.Length != secret.Length || !CryptographicOperations.FixedTimeEquals(suppliedBytes, secret))
                            throw new AuthenticationException("Pairing failed");
                        string nonce = RootSettings.Hex(value.GetProperty("nonce").GetString(), 32);
                        string operation = value.GetProperty("operation").GetString();
                        if (operation != "status" && operation != "sdb" && operation != "remove") throw new InvalidDataException("Unknown bridge operation");
                        phase = "identity";
                        var result = identity();
                        result["protocol"] = 1; result["authenticated"] = true; result["nonce"] = nonce;
                        result["installation_id"] = settings.Installation; result["device_identity_sha256"] = settings.Identity;
                        result["app_id"] = RootPaths.AppId; result["version"] = RootPaths.Version;
                        TcpClient sdb = null;
                        bool removalCompleted = false;
                        try
                        {
                            if (operation == "sdb")
                            {
                                phase = "sdb";
                                sdb = await connectSdb(deadline.Token);
                            }
                            if (operation == "remove")
                            {
                                phase = "remove"; remove(); removalCompleted = true;
                                result["prepared_for_removal"] = true;
                            }
                            phase = "reply";
                            byte[] reply = JsonSerializer.SerializeToUtf8Bytes(result);
                            await tls.WriteAsync(reply.AsMemory(), deadline.Token);
                            await tls.WriteAsync(new byte[] { 10 }.AsMemory(), deadline.Token);
                            await tls.FlushAsync(deadline.Token);
                            if (operation != "sdb") return;
                            // One authenticated stream, fixed loopback target, bounded idle/lifetime.
                            deadline.CancelAfter(TimeSpan.FromHours(1));
                            using (var local = sdb.GetStream())
                            {
                                Task outgoing = Relay(tls, local, deadline.Token);
                                Task incoming = Relay(local, tls, deadline.Token);
                                await Task.WhenAny(outgoing, incoming);
                                deadline.Cancel(); sdb.Dispose();
                                try { await Task.WhenAll(outgoing, incoming); } catch (OperationCanceledException) { }
                            }
                        }
                        finally
                        {
                            sdb?.Dispose();
                            // Removal must stop access even when its acknowledgement cannot be delivered.
                            if (removalCompleted) { stopping.Cancel(); listener.Stop(); }
                        }
                    }
                }
                catch (Exception error)
                { diagnostic?.Invoke(phase, error); }
            }
        }
        private static async Task Relay(Stream source, Stream target, CancellationToken stop)
        {
            byte[] buffer = new byte[16384];
            while (true)
            {
                using (var idle = CancellationTokenSource.CreateLinkedTokenSource(stop))
                {
                    idle.CancelAfter(TimeSpan.FromSeconds(90));
                    int count = await source.ReadAsync(buffer.AsMemory(), idle.Token);
                    if (count == 0) return;
                    await target.WriteAsync(buffer.AsMemory(0, count), idle.Token);
                    await target.FlushAsync(idle.Token);
                }
            }
        }
        private static async Task<TcpClient> ConnectLocalSdb(CancellationToken stop)
        {
            var client = new TcpClient(AddressFamily.InterNetwork);
            try { await client.ConnectAsync(IPAddress.Loopback, 26101, stop); return client; }
            catch { client.Dispose(); throw; }
        }
        public void Dispose() { stopping.Cancel(); listener.Stop(); }
    }
}
