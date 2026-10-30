using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace AeroTizen.UntetheredProbe
{
    internal sealed class ProcessResult
    {
        internal readonly int ExitCode;
        internal readonly string Output, Error;
        internal ProcessResult(int exitCode, string output, string error)
        { ExitCode = exitCode; Output = output; Error = error; }
    }

    internal static class BoundedProcess
    {
        private const int StopGraceMs = 1500;
        private static async Task<string> Read(StreamReader reader, int limit)
        {
            var output = new StringBuilder();
            var buffer = new char[1024];
            int count;
            while ((count = await reader.ReadAsync(buffer, 0, buffer.Length)) != 0)
            {
                if (output.Length + count > limit) throw new InvalidDataException("Payload output limit exceeded");
                output.Append(buffer, 0, count);
            }
            return output.ToString();
        }
        internal static ProcessResult Run(ProcessStartInfo start, int milliseconds, int outputLimit = 16384)
        {
            if (milliseconds <= 0 || milliseconds > 30000 || outputLimit <= 0 || outputLimit > 65536)
                throw new ArgumentOutOfRangeException("Invalid process bounds");
            start.UseShellExecute = false;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            var watch = Stopwatch.StartNew();
            using (var process = new Process { StartInfo = start })
            {
                if (!process.Start()) throw new IOException("Payload did not start");
                Task<string> output = Read(process.StandardOutput, outputLimit);
                Task<string> error = Read(process.StandardError, outputLimit);
                Task completed = Task.WhenAll(output, error);
                try
                {
                    while (true)
                    {
                        if (output.IsFaulted) output.GetAwaiter().GetResult();
                        if (error.IsFaulted) error.GetAwaiter().GetResult();
                        int remaining = milliseconds - (int)watch.ElapsedMilliseconds;
                        if (remaining <= 0) throw new TimeoutException("Payload process deadline expired");
                        if (process.WaitForExit(Math.Min(remaining, 25))) break;
                    }
                    int drainTime = milliseconds - (int)watch.ElapsedMilliseconds;
                    if (drainTime <= 0 || Task.WaitAny(new[] { completed }, drainTime) < 0)
                        throw new TimeoutException("Payload output deadline expired; descendants may still be running");
                    completed.GetAwaiter().GetResult();
                    return new ProcessResult(process.ExitCode, output.Result, error.Result);
                }
                catch (Exception operationError)
                {
                    try
                    {
                        if (!process.HasExited) process.Kill(entireProcessTree: true);
                        if (!process.WaitForExit(StopGraceMs)) throw new IOException("Payload termination was not confirmed");
                        if (!completed.IsCompleted && Task.WaitAny(new[] { completed }, StopGraceMs) < 0)
                            throw new IOException("Payload descendants did not close their output streams");
                    }
                    catch (Exception stopError)
                    {
                        throw new IOException("Payload failed and process cleanup is unconfirmed: " + stopError.Message, operationError);
                    }
                    throw;
                }
                finally
                {
                    process.StandardOutput.Dispose();
                    process.StandardError.Dispose();
                    // Observe the grouped fault when one reader caused early termination.
                    if (completed.IsFaulted) { var ignored = completed.Exception; }
                }
            }
        }
    }

    internal static class PayloadRunner
    {
        internal const int DeadlineMs = 20000;
        internal static bool IsStageLocation(string directory, string package)
        {
            // Tizen's CLR can report the physical /opt path for the /home alias.
            return directory == Bundle.StagingRoot + "/" + package
                || directory == "/opt/usr/home/owner/share/tmp/sdk_tools/" + package;
        }
        internal static ProcessStartInfo StartInfo(Bundle bundle)
        {
            var start = new ProcessStartInfo("/usr/bin/dotnet");
            start.ArgumentList.Add(bundle.Stage + "/SamsungTvArchiveRoot.dll");
            start.ArgumentList.Add(bundle.Package);
            return start;
        }
        internal static void Run(Bundle bundle, string claim)
        {
            if (!Regex.IsMatch(claim ?? "", @"\A[a-f0-9]{16}\z")
                || !IsStageLocation(bundle.DirectoryPath, bundle.Package)
                || Encoding.ASCII.GetString(Bundle.ReadBounded(bundle.Stage + "/probe-owner", 64)) != claim)
                throw new InvalidDataException("Payload runner does not own this SDK stage");
            ProcessResult result = BoundedProcess.Run(StartInfo(bundle), DeadlineMs);
            if (result.ExitCode != 0)
                throw new IOException("Upstream payload exit " + result.ExitCode + ": " + result.Error);
        }
    }
}
