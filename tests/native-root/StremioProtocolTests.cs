using System;
using System.IO;
using System.Text;
using System.Text.Json;

internal static class StremioProtocolTests
{
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Reject(string text)
    {
        try { StremioFeed.ParseRequest(new MemoryStream(Encoding.ASCII.GetBytes(text))); }
        catch (InvalidDataException) { return; }
        throw new Exception("Accepted unsafe HTTP request.");
    }
    private static string Reply(string request, Func<bool> prepare = null)
    {
        byte[] data = Encoding.ASCII.GetBytes(request);
        using (var stream = new MemoryStream())
        {
            stream.Write(data, 0, data.Length); stream.Position = 0;
            StremioFeed.Respond(stream, new string('a', 64), prepare ?? (() => false));
            return Encoding.UTF8.GetString(stream.ToArray(), data.Length, (int)stream.Length - data.Length);
        }
    }
    internal static void Run()
    {
        Check(StremioFeed.OriginAllowed(null), "SDK/no-origin requests need token authentication.");
        Check(StremioFeed.OriginAllowed("null") && StremioFeed.OriginAllowed("file://"), "Widget origins.");
        Check(!StremioFeed.OriginAllowed("https://example.test") && !StremioFeed.OriginAllowed("file://evil"), "Origin boundary.");
        Check(StremioFeed.TokenEquals("secret", "secret") && !StremioFeed.TokenEquals("secreu", "secret") &&
            !StremioFeed.TokenEquals(null, "secret"), "Token authentication.");
        Check(!StremioFeed.FixedPath("/v1/stremio/items?path=/etc/passwd"), "No caller-selected paths.");
        Check(Reply("GET /v1/stremio/items HTTP/1.1\r\nOrigin: null\r\n\r\n").StartsWith("HTTP/1.1 401"), "Missing token.");
        Check(Reply("GET /v1/stremio/items HTTP/1.1\r\nX-AeroTizen-Token: wrong\r\n\r\n").StartsWith("HTTP/1.1 401"), "Wrong token.");
        Check(Reply("POST /v1/stremio/items HTTP/1.1\r\n\r\n").StartsWith("HTTP/1.1 405"), "No mutation endpoint.");
        Check(Reply("GET /v1/exec HTTP/1.1\r\n\r\n").StartsWith("HTTP/1.1 404"), "No shell endpoint.");
        Check(Reply("GET /v1/capabilities HTTP/1.1\r\nOrigin: https://example.test\r\n\r\n").StartsWith("HTTP/1.1 403"), "Deny web origins.");
        const string prepare = "POST /v1/credential HTTP/1.1\r\nOrigin: null\r\nContent-Length: 0\r\n\r\n";
        Check(Reply(prepare).StartsWith("HTTP/1.1 503"), "Credential preparation can be unavailable.");
        string prepared = Reply(prepare, () => true);
        Check(prepared.StartsWith("HTTP/1.1 204") && prepared.EndsWith("\r\n\r\n") &&
            !prepared.Contains(new string('a', 64)), "The credential never leaves through HTTP.");
        Func<bool> forbidden = () => throw new Exception("Unexpected credential publication");
        Check(Reply(prepare.Replace("Origin: null", "Origin: https://example.test"), forbidden).StartsWith("HTTP/1.1 403"), "Deny web credential requests.");
        Check(Reply(prepare.Replace("POST", "GET"), forbidden).StartsWith("HTTP/1.1 405"), "Credential publication requires POST.");
        Check(Reply(prepare.Replace("/v1/credential", "/v1/credential?path=/tmp/x"), forbidden).StartsWith("HTTP/1.1 404"), "Credential path cannot be supplied by the caller.");
        Check(Reply(prepare.Replace("Content-Length: 0", "Content-Length: 1"), forbidden).StartsWith("HTTP/1.1 400"), "Credential requests accept no body.");
        string preflight = "OPTIONS /v1/stremio/items HTTP/1.1\r\nOrigin: null\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: x-aerotizen-token\r\n\r\n";
        Check(Reply(preflight).StartsWith("HTTP/1.1 204"), "Widget preflight.");
        Check(Reply(preflight.Replace("x-aerotizen-token", "x-aerotizen-token, x-command")).StartsWith("HTTP/1.1 403"), "Strict preflight headers.");
        Reject("GET /v1/capabilities HTTP/1.1\r\nContent-Length: 2\r\n\r\nxx");
        Reject("GET /v1/capabilities HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n");
        Reject("GET /v1/capabilities HTTP/1.1\r\nX-AeroTizen-Token: a\r\nx-aerotizen-token: b\r\n\r\n");
        Reject("GET /v1/capabilities HTTP/1.1\r\nX-Pad: " + new string('x', 8192) + "\r\n\r\n");
        Reject("GET /v1/capabilities HTTP/1.1\r\n");
        foreach (bool root in new[] { false, true }) foreach (bool installed in new[] { false, true })
        {
            using (var document = JsonDocument.Parse(JsonSerializer.Serialize(StremioFeed.Capabilities(root, installed, true))))
            {
                Check(document.RootElement.GetProperty("stremio_readable").GetBoolean() == (root && installed), "Live capability gates.");
                Check(document.RootElement.GetProperty("root").GetBoolean() == root, "Actual root state.");
                Check(document.RootElement.GetProperty("stremio_installed").GetBoolean() == installed, "Actual installation state.");
            }
        }
        Console.WriteLine("Stremio feed protocol checks passed.");
    }
}
