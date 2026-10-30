using System;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

internal sealed class FakeServiceHandler : HttpMessageHandler
{
    internal string Body = "{}";
    internal HttpStatusCode Status = HttpStatusCode.OK;
    internal Exception Error;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Program.Check(request.Method == HttpMethod.Get && request.RequestUri.AbsoluteUri == "http://127.0.0.1:47790/",
            "status must only read the local service");
        if (Error != null) return Task.FromException<HttpResponseMessage>(Error);
        return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent(Body) });
    }
}
internal static class ServiceDiagnosticsTests
{
    private static JsonElement Query(FakeServiceHandler handler)
    {
        using (var client = new HttpClient(handler) { Timeout = TimeSpan.FromMilliseconds(1500) })
        using (var document = JsonDocument.Parse(JsonSerializer.Serialize(HomeQuery.ReadWatcher(client))))
            return document.RootElement.Clone();
    }
    private static void Failed(FakeServiceHandler handler, string code, bool reachable)
    {
        var result = Query(handler);
        Program.Check(result.GetProperty("state").GetString() == "unknown");
        Program.Check(result.GetProperty("reachable").GetBoolean() == reachable);
        Program.Check(result.GetProperty("error").GetProperty("code").GetString() == code);
        Program.Check(!result.TryGetProperty("control", out _), "failed reads must not invent native control");
        Program.Check(!result.ToString().Contains("private-response-data"), "diagnostics must not expose exception/response data");
    }
    internal static void Run()
    {
        Program.Test("service query preserves a reachable native transaction without an error", () => {
            var result = Query(new FakeServiceHandler { Body = "{\"leaving\":false,\"homeControl\":{\"mode\":\"native\",\"transaction\":\"original-token\"}}" });
            Program.Check(result.GetProperty("state").GetString() == "native");
            Program.Check(result.GetProperty("reachable").GetBoolean());
            Program.Check(result.GetProperty("control").GetProperty("transaction").GetString() == "original-token");
            Program.Check(result.GetProperty("error").ValueKind == JsonValueKind.Null);
        });
        Program.Test("service query retains legacy active and paused responses", () => {
            foreach (bool leaving in new[] { false, true }) {
                var result = Query(new FakeServiceHandler { Body = "{\"leaving\":" + (leaving ? "true" : "false") + "}" });
                Program.Check(result.GetProperty("state").GetString() == (leaving ? "paused" : "active"));
                Program.Check(result.GetProperty("error").ValueKind == JsonValueKind.Null);
            }
        });
        Program.Test("service query reports timeout without implying uninstall", () => {
            Failed(new FakeServiceHandler { Error = new TaskCanceledException("private-response-data") }, "timeout", false);
        });
        Program.Test("service query reports connection failure without exposing exception text", () => {
            var handler = new FakeServiceHandler { Error = new HttpRequestException("private-response-data",
                new SocketException((int)SocketError.ConnectionRefused)) };
            Failed(handler, "connection_error", false);
            var result = Query(new FakeServiceHandler { Error = handler.Error });
            Program.Check(result.GetProperty("error").GetProperty("socket_error").GetString().Length > 0);
        });
        Program.Test("service query reports HTTP status separately from transport failure", () => {
            var result = Query(new FakeServiceHandler { Status = HttpStatusCode.ServiceUnavailable, Body = "private-response-data" });
            Program.Check(result.GetProperty("reachable").GetBoolean());
            Program.Check(result.GetProperty("error").GetProperty("code").GetString() == "http_error");
            Program.Check(result.GetProperty("error").GetProperty("http_status").GetInt32() == 503);
            Program.Check(!result.ToString().Contains("private-response-data"));
        });
        Program.Test("service query reports invalid JSON as a reachable invalid response", () => {
            Failed(new FakeServiceHandler { Body = "private-response-data" }, "invalid_response", true);
        });
        Program.Test("service query reports missing fields as a reachable invalid response", () => {
            Failed(new FakeServiceHandler { Body = "{}" }, "invalid_response", true);
        });
        Program.Test("service query reports malformed control as a reachable invalid response", () => {
            Failed(new FakeServiceHandler { Body = "{\"leaving\":false,\"homeControl\":{\"mode\":3}}" }, "invalid_response", true);
        });
        Program.Test("service query reports unexpected failure without claiming a response or exposing exception text", () => {
            foreach (var error in new Exception[] { new Exception("private-response-data"), new InvalidOperationException("private-response-data") })
                Failed(new FakeServiceHandler { Error = error }, "query_error", false);
        });
    }
}
