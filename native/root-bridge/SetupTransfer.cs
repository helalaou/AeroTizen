using System;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AeroTizen.UntetheredProbe;

namespace AeroTizen.Root
{
    internal static class SetupTransfer
    {
        private static async Task Read(Stream stream, byte[] bytes, CancellationToken stop)
        {
            int offset = 0;
            while (offset < bytes.Length)
            {
                int count = await stream.ReadAsync(bytes.AsMemory(offset), stop);
                if (count == 0) throw new EndOfStreamException("Private setup input was truncated");
                offset += count;
            }
        }
        internal static async Task<byte[]> Fetch(string host, int port, string pin, string token)
        {
            if (!IPAddress.TryParse(host, out var address) || address.AddressFamily != AddressFamily.InterNetwork || port < 1 || port > 65535)
                throw new IOException("Invalid private setup endpoint");
            RootSettings.Hex(pin, 64); RootSettings.Hex(token, 64);
            using (var stop = new CancellationTokenSource(20000))
            using (var peer = new TcpClient(AddressFamily.InterNetwork))
            {
                await peer.ConnectAsync(address, port, stop.Token);
                using (var tls = new SslStream(peer.GetStream(), false, (_, certificate, chain, errors) =>
                    certificate != null && Bundle.Digest(certificate.GetRawCertData()) == pin))
                {
                    await tls.AuthenticateAsClientAsync(new SslClientAuthenticationOptions {
                        TargetHost = "aerotizen-setup", EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13,
                        CertificateRevocationCheckMode = X509RevocationMode.NoCheck,
                    }, stop.Token);
                    await tls.WriteAsync(Encoding.ASCII.GetBytes(token + "\n").AsMemory(), stop.Token);
                    await tls.FlushAsync(stop.Token);
                    byte[] header = new byte[4]; await Read(tls, header, stop.Token);
                    int count = (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3];
                    if (count <= 0 || count > 2 * 1024 * 1024) throw new IOException("Private setup input exceeds its limit");
                    byte[] bytes = new byte[count]; await Read(tls, bytes, stop.Token); return bytes;
                }
            }
        }
        internal static int Run(string host, string port, string pin, string token)
        {
            RootPaths.RequireTv(false);
            if (RootPaths.getuid() != 901 || RootPaths.geteuid() != 901) throw new IOException("Private setup requires SDK UID/EUID 901");
            byte[] bytes = Fetch(host, int.Parse(port, System.Globalization.CultureInfo.InvariantCulture), pin, token).GetAwaiter().GetResult();
            string directory = Bundle.StagingRoot + "/arinput-" + Guid.NewGuid().ToString("N");
            RootPaths.NewDirectory(directory, 0x1c0);
            try
            {
                string path = directory + "/request.json";
                RootPaths.WriteNew(path, bytes);
                return SetupBootstrap.Run(path);
            }
            finally { File.Delete(directory + "/request.json"); Directory.Delete(directory, false); }
        }
    }
}
