using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using AeroTizen.Root;

// This feed has its own loopback listener and credential. It has no CLI or SDB operations.
internal sealed class StremioFeed : IDisposable
{
    internal const string AppId = "IkWsFHtOY9.Stremio";
    private const int Port = 47791;
    private const string CredentialPath = "/v1/credential";
    private const int NoSuchApp = -0x01110000 | 0x01;
    [DllImport("libcapi-appfw-app-manager.so.0")] private static extern int app_manager_get_app_info(string appId, out IntPtr info);
    [DllImport("libcapi-appfw-app-manager.so.0")] private static extern int app_info_destroy(IntPtr info);

    private readonly TcpListener listener = new TcpListener(IPAddress.Loopback, Port);
    private readonly CancellationTokenSource stopping = new CancellationTokenSource();
    private readonly StremioCredential credential = new StremioCredential(Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant());
    private bool published;

    internal void Start()
    {
        try { listener.Start(8); }
        catch (SocketException) { return; }
        _ = Task.Run(Serve);
    }

    private async Task Serve()
    {
        try
        {
            while (!stopping.IsCancellationRequested)
            {
                using (TcpClient client = await listener.AcceptTcpClientAsync(stopping.Token))
                {
                    client.ReceiveTimeout = 2000;
                    client.SendTimeout = 2000;
                    try { Respond(client.GetStream(), credential.Token, PrepareCredential); }
                    catch (IOException) { }
                    catch (SocketException) { }
                }
            }
        }
        catch (OperationCanceledException) when (stopping.IsCancellationRequested) { }
        catch (SocketException) { }
        finally { Dispose(); }
    }

    private bool PrepareCredential()
    {
        try
        {
            lock (credential)
            {
                if (stopping.IsCancellationRequested || RootPaths.geteuid() != 0 || !Installed()) return false;
                if (!credential.EnsurePublished()) return false;
                published = true;
                return true;
            }
        }
        catch (InvalidOperationException) { return false; }
        catch (DllNotFoundException) { return false; }
        catch (EntryPointNotFoundException) { return false; }
    }

    public void Dispose()
    {
        lock (credential)
        {
            if (stopping.IsCancellationRequested) return;
            stopping.Cancel();
            listener.Stop();
            if (published) credential.Remove();
        }
    }

    private static bool Installed()
    {
        IntPtr info;
        int result = app_manager_get_app_info(AppId, out info);
        try
        {
            if (result == 0 && info != IntPtr.Zero) return true;
            if (result == NoSuchApp && info == IntPtr.Zero) return false;
            throw new InvalidOperationException("Installation unavailable.");
        }
        finally { if (info != IntPtr.Zero) app_info_destroy(info); }
    }

    internal sealed class Request
    {
        public string Method, Path;
        public readonly Dictionary<string, string> Headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }
    internal static Request ParseRequest(Stream stream)
    {
        var bytes = new List<byte>();
        var time = Stopwatch.StartNew();
        while (bytes.Count < 8192)
        {
            if (time.ElapsedMilliseconds >= 3000) throw new InvalidDataException("Request timed out.");
            int value = stream.ReadByte();
            if (value < 0 || value == 0 || value > 127) throw new InvalidDataException("Invalid request.");
            bytes.Add((byte)value);
            int n = bytes.Count;
            if (n >= 4 && bytes[n - 4] == 13 && bytes[n - 3] == 10 && bytes[n - 2] == 13 && bytes[n - 1] == 10) break;
        }
        if (bytes.Count >= 8192) throw new InvalidDataException("Request too large.");
        string[] lines = Encoding.ASCII.GetString(bytes.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
        string[] first = lines[0].Split(' ');
        if (first.Length != 3 || first[2] != "HTTP/1.1") throw new InvalidDataException("Invalid request line.");
        var request = new Request { Method = first[0], Path = first[1] };
        for (int i = 1; i < lines.Length && lines[i].Length > 0; i++)
        {
            int colon = lines[i].IndexOf(':');
            if (colon < 1 || char.IsWhiteSpace(lines[i][0])) throw new InvalidDataException("Invalid header.");
            string key = lines[i].Substring(0, colon);
            if (key.Trim() != key || request.Headers.ContainsKey(key)) throw new InvalidDataException("Duplicate header.");
            request.Headers.Add(key, lines[i].Substring(colon + 1).Trim());
        }
        if (request.Headers.ContainsKey("Transfer-Encoding") ||
            (request.Headers.TryGetValue("Content-Length", out string size) && size != "0"))
            throw new InvalidDataException("Request body refused.");
        return request;
    }
    internal static bool FixedPath(string path) { return path == CredentialPath || path == "/v1/capabilities" || path == "/v1/stremio/items"; }
    internal static bool OriginAllowed(string origin) { return origin == null || origin == "null" || origin == "file://"; }
    internal static bool TokenEquals(string observed, string expected)
    {
        if (observed == null || observed.Length != expected.Length) return false;
        int difference = 0;
        for (int i = 0; i < expected.Length; i++) difference |= expected[i] ^ observed[i];
        return difference == 0;
    }
    internal static object Capabilities(bool root, bool installed, bool readable)
    {
        return new { schema_version = 1, root = root, stremio_installed = installed, stremio_app_id = AppId,
            stremio_readable = root && installed && readable };
    }
    internal static void Respond(Stream stream, string token, Func<bool> prepareCredential)
    {
        Request request;
        try { request = ParseRequest(stream); }
        catch (InvalidDataException) { Reply(stream, 400, null, new { error = "invalid_request" }); return; }
        request.Headers.TryGetValue("Origin", out string origin);
        if (!OriginAllowed(origin)) { Reply(stream, 403, null, new { error = "origin_refused" }); return; }
        if (!FixedPath(request.Path)) { Reply(stream, 404, origin, new { error = "not_found" }); return; }
        if (request.Path == CredentialPath)
        {
            // The credential only goes to the launcher's private file.
            if (request.Method != "POST") Reply(stream, 405, origin, new { error = "method_refused" });
            else if (prepareCredential()) Reply(stream, 204, origin, null);
            else Reply(stream, 503, origin, new { error = "unavailable" });
            return;
        }
        if (request.Method == "OPTIONS")
        {
            request.Headers.TryGetValue("Access-Control-Request-Method", out string method);
            request.Headers.TryGetValue("Access-Control-Request-Headers", out string headers);
            if (origin == null || method != "GET" || !string.Equals(headers, "X-AeroTizen-Token", StringComparison.OrdinalIgnoreCase))
                Reply(stream, 403, origin, new { error = "preflight_refused" });
            else Reply(stream, 204, origin, null, preflight: true);
            return;
        }
        if (request.Method != "GET") { Reply(stream, 405, origin, new { error = "method_refused" }); return; }
        request.Headers.TryGetValue("X-AeroTizen-Token", out string observed);
        if (!TokenEquals(observed, token)) { Reply(stream, 401, origin, new { error = "unauthorized" }); return; }
        bool root = RootPaths.geteuid() == 0, installed = false, readable = false;
        try { installed = Installed(); readable = root && installed && StremioData.CanRead(); } catch (Exception) { }
        if (request.Path == "/v1/capabilities")
        {
            Reply(stream, 200, origin, Capabilities(root, installed, readable));
            return;
        }
        if (!readable) { Reply(stream, 503, origin, new { schema_version = 1, records = new object[0], error = "unavailable" }); return; }
        try { Reply(stream, 200, origin, new { schema_version = 1, records = StremioData.Read() }); }
        catch (Exception) { Reply(stream, 503, origin, new { schema_version = 1, records = new object[0], error = "unavailable" }); }
    }
    private static void Reply(Stream stream, int status, string origin, object value, bool preflight = false)
    {
        byte[] data = value == null ? new byte[0] : JsonSerializer.SerializeToUtf8Bytes(value);
        if (data.Length > 1024 * 1024) throw new InvalidDataException("Response too large.");
        string header = "HTTP/1.1 " + status + " Response\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\nContent-Length: " + data.Length + "\r\n";
        if (origin != null) header += "Access-Control-Allow-Origin: " + origin + "\r\nVary: Origin\r\n";
        if (preflight) header += "Access-Control-Allow-Methods: GET\r\nAccess-Control-Allow-Headers: X-AeroTizen-Token\r\n";
        byte[] headers = Encoding.ASCII.GetBytes(header + "\r\n");
        stream.Write(headers, 0, headers.Length); stream.Write(data, 0, data.Length);
    }
}
