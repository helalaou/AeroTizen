using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace AeroTizen.Root
{
    internal sealed record ButtonRule(string Button, string Device, ushort Code, int? Scan, string Mode, string AppId)
    {
        internal ButtonKey Key => new ButtonKey(Code, Scan);
    }

    internal sealed class ButtonService : IDisposable
    {
        internal const int Protocol = 1;
        internal const int LearnRequestSeconds = 22;
        private const int MaxRules = 12, RetrySeconds = 3;
        private const int MaxLookupCodes = 4;
        private const int MaxLabelLength = 48;
        private const int MaxInputDeviceReportJsonBytes = 5000; // Leave room for bridge identity fields.
        internal const string FileName = "buttons.json";
        private static readonly string StorePath = RootPaths.Private + "/" + FileName;
        private static readonly Regex InvalidLabelCharacters = new Regex(@"[\p{Cc}\p{Zl}\p{Zp}]");
        private static readonly StringComparer ButtonNames = StringComparer.OrdinalIgnoreCase;
        private static readonly Regex DevicePattern = new Regex(@"\A[a-f0-9]{64}\z");
        private static readonly Regex TemporaryFile = new Regex(@"\Abuttons\.json\.new-[a-f0-9]{32}\z");
        private const string Original = "default", Disabled = "disabled", App = "app";

        internal delegate void FilterRemote(string device, IReadOnlyDictionary<ButtonKey, string> codes,
            Action active, Action<string> launch, CancellationToken stop);
        private readonly Func<ButtonRule[]> read;
        private readonly Action<ButtonRule[]> save;
        private readonly Func<CancellationToken, ButtonPress> learn;
        private readonly Func<ButtonInventory> discover;
        private readonly Func<string> readKeyLayout;
        private readonly Func<CancellationToken, (int ExitCode, string Output)> readInputDevices;
        private readonly FilterRemote filter;
        private readonly Action<string> checkApp;
        private readonly Action<string, CancellationToken> openApp;
        private readonly SemaphoreSlim edit = new SemaphoreSlim(1);
        private readonly CancellationTokenSource stopping = new CancellationTokenSource();
        private readonly ConcurrentDictionary<string, string> failures = new ConcurrentDictionary<string, string>();
        private readonly ConcurrentDictionary<string, bool> active = new ConcurrentDictionary<string, bool>();
        private ButtonRule[] rules = Array.Empty<ButtonRule>();
        private string storeError;
        private CancellationTokenSource filtering;
        private Task workers = Task.CompletedTask;

        internal static bool OwnsStateFile(string name) => name == FileName || TemporaryFile.IsMatch(name);

        internal ButtonService() : this(
            () => File.Exists(StorePath)
                ? JsonSerializer.Deserialize<ButtonRule[]>(RootPaths.PrivateFile(StorePath, 0, 8192))
                : Array.Empty<ButtonRule>(),
            rules => RootPaths.WriteNew(StorePath, JsonSerializer.SerializeToUtf8Bytes(rules), overwrite: true),
            ButtonInput.Learn, ButtonInput.AppButtons, ButtonInput.ReadKeyLayout, ButtonInput.ReadInputDevices,
            ButtonInput.Filter, ButtonApp.Check, ButtonApp.Open) { }

        internal ButtonService(Func<ButtonRule[]> read, Action<ButtonRule[]> save,
            Func<CancellationToken, ButtonPress> learn, Func<ButtonInventory> discover, Func<string> readKeyLayout,
            Func<CancellationToken, (int ExitCode, string Output)> readInputDevices, FilterRemote filter,
            Action<string> checkApp, Action<string, CancellationToken> openApp)
        {
            this.read = read;
            this.save = save;
            this.learn = learn;
            this.discover = discover;
            this.readKeyLayout = readKeyLayout;
            this.readInputDevices = readInputDevices;
            this.filter = filter;
            this.checkApp = checkApp;
            this.openApp = openApp;
        }

        private static ButtonRule[] Validated(ButtonRule[] values)
        {
            if (values == null || values.Length > MaxRules
                || values.Any(rule => rule == null || !ValidLabel(rule.Button)
                    || !DevicePattern.IsMatch(rule.Device ?? "")
                    || !(ButtonInput.CanAssign(rule.Code) || ButtonLayout.RequiresSamsungAppName(rule.Code))
                    || (rule.Mode == App ? !ButtonApp.IsId(rule.AppId)
                        : (rule.Mode != Original && rule.Mode != Disabled) || rule.AppId != null))
                || values.Select(rule => rule.Button).Distinct(ButtonNames).Count() != values.Length
                || values.Any(rule => values.Any(other => !ButtonNames.Equals(other.Button, rule.Button) && Overlaps(other, rule))))
                throw new InvalidDataException("Invalid app button rules.");
            return values;
        }

        private static bool ValidLabel(string name) => name != null && name.Length is > 0 and <= MaxLabelLength
            && name == name.Trim() && !InvalidLabelCharacters.IsMatch(name);

        private bool CanAssignOnTv(ushort code) => ButtonInput.CanAssign(code)
            || (ButtonLayout.RequiresSamsungAppName(code) && ButtonLayout.ConfirmsSamsungAppCode(readKeyLayout(), code));

        private void CheckButtonCode(ushort code)
        {
            if (!CanAssignOnTv(code))
                throw new InvalidDataException($"The TV layout does not identify key code {code} as the expected app shortcut.");
        }

        private static bool Overlaps(ButtonRule left, ButtonRule right) => left.Device == right.Device
            && left.Code == right.Code && (left.Scan == null || right.Scan == null || left.Scan == right.Scan);

        internal void Start()
        {
            try
            {
                rules = Validated(read());
                StartFilters();
            }
            catch (Exception error) when (error is IOException || error is InvalidDataException
                || error is JsonException || error is UnauthorizedAccessException)
            {
                storeError = "The saved app button rules cannot be read. Use buttons reset --yes to restore all buttons.";
            }
        }

        internal async Task<object> Handle(JsonElement request, CancellationToken cancel)
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel, stopping.Token);
            await edit.WaitAsync(deadline.Token);
            try
            {
                return await Apply(request, deadline.Token);
            }
            catch (InvalidDataException error) { return Status(error: error.Message); }
            catch (IOException error) { return Status(error: error.Message); }
            catch (Win32Exception) { return Status(error: "Could not access the TV input or app service."); }
            catch (UnauthorizedAccessException) { return Status(error: "Could not access the TV's app button settings."); }
            catch (Exception error) when (error is KeyNotFoundException || error is InvalidOperationException)
            { return Status(error: "Invalid app button request."); }
            finally { edit.Release(); }
        }

        private async Task<object> Apply(JsonElement request, CancellationToken cancel)
        {
            string action = request.GetProperty("action").GetString();
            if (action == "status") return Status(error: storeError);
            if (action == "list") return Status(error: storeError, inventory: discover());
            if (action == "key-names") return KeyNames(request.GetProperty("codes"));
            if (action == "input-devices") return InputDevices(cancel);
            bool write = request.GetProperty("apply").GetBoolean();
            if (action == "reset")
            {
                if (!write) return Status(preview: "Restore all original app buttons and forget learned buttons.");
                await Replace(Array.Empty<ButtonRule>());
                return Status();
            }
            if (storeError != null) return Status(error: storeError);
            string name = request.GetProperty("button").GetString()?.Trim();
            if (!ValidLabel(name))
                throw new InvalidDataException($"Use a single-line button name of up to {MaxLabelLength} characters.");
            ButtonRule previous = rules.FirstOrDefault(rule => ButtonNames.Equals(rule.Button, name));
            if (action == "learn")
            {
                if (previous?.Mode is Disabled or App)
                    throw new InvalidDataException("Restore the original action before learning this button again.");
                if (previous == null && rules.Length == MaxRules)
                    throw new InvalidDataException("The TV has reached its learned button limit.");
                if (!write) return Status(preview: "Learn the " + name + " button.");
                // A read-only observer cannot see a device we currently hold exclusively.
                await StopFilters();
                try
                {
                    var press = await Task.Run(() => learn(cancel), cancel);
                    cancel.ThrowIfCancellationRequested();
                    if (!CanAssignOnTv(press.Key.Code))
                    {
                        string scan = press.Key.Scan is int value ? $" (scan code 0x{value:X8})" : "";
                        throw new InvalidDataException($"Key code {press.Key.Code}{scan} is reserved. Press a dedicated app button.");
                    }
                    var learned = new ButtonRule(name, press.Device, press.Key.Code, press.Key.Scan, Original, null);
                    if (rules.Any(rule => !ButtonNames.Equals(rule.Button, name) && Overlaps(rule, learned)))
                        throw new InvalidDataException("This physical button already has a name.");
                    Persist(WithRule(learned));
                }
                finally { StartFilters(); }
                return Status();
            }
            if (action is not ("map" or "disable" or "unmap")) throw new InvalidDataException("Unknown app button action.");
            if (previous == null)
            {
                var detected = Unconfigured(discover()).FirstOrDefault(rule => ButtonNames.Equals(rule.Button, name));
                if (detected == null) throw new InvalidDataException("Learn the " + name + " button first.");
                if (write && action != "unmap" && rules.Length == MaxRules)
                    throw new InvalidDataException("The TV has reached its saved button limit.");
                previous = detected;
            }
            if (action != "unmap") CheckButtonCode(previous.Code);
            string app = action == "map" ? request.GetProperty("app_id").GetString() : null;
            if (action == "map") checkApp(app);
            var next = previous with { Mode = action == "map" ? App : action == "disable" ? Disabled : Original, AppId = app };
            if (!write)
            {
                string change = action == "map" ? "Map " + name + " to " + app
                    : action == "disable" ? "Disable " + name : "Restore the original action for " + name;
                return Status(preview: change + ".");
            }
            cancel.ThrowIfCancellationRequested();
            if (next != previous) await Replace(WithRule(next));
            return Status();
        }

        private object KeyNames(JsonElement values)
        {
            if (values.ValueKind != JsonValueKind.Array || values.GetArrayLength() is < 1 or > MaxLookupCodes)
                throw new InvalidDataException($"Enter between 1 and {MaxLookupCodes} key codes.");
            var codes = new List<ushort>();
            foreach (var value in values.EnumerateArray())
            {
                if (value.ValueKind != JsonValueKind.Number || !value.TryGetUInt16(out ushort code) || code > ButtonInput.MaxKey)
                    throw new InvalidDataException($"Use key codes from 0 to {ButtonInput.MaxKey}.");
                codes.Add(code);
            }
            var matches = ButtonLayout.KeyNames(readKeyLayout(), codes.Distinct().ToArray());
            return new { key_names = matches.Select(match => new { code = match.Code, names = match.Names, truncated = match.Truncated }) };
        }

        private object InputDevices(CancellationToken cancel)
        {
            var (exitCode, raw) = readInputDevices(cancel);
            string output = Regex.Replace(raw, @"[\p{Cc}\p{Cf}\p{Zl}\p{Zp}-[\n\t]]", "").Trim();
            // Newly registered devices appear at the end of the listing.
            string report = output[Math.Max(0, output.Length - MaxInputDeviceReportJsonBytes)..];
            while (JsonEncodedText.Encode(report).EncodedUtf8Bytes.Length > MaxInputDeviceReportJsonBytes)
                report = report[(report.Length / 2)..];
            string error = null;
            if (exitCode != 0) error = $"The TV compositor query failed (exit {exitCode}).";
            else if (output.Length == 0) error = "The TV compositor returned no input device output.";
            return new { input_devices = report, truncated = report.Length < output.Length, exit_code = exitCode, error };
        }

        private ButtonRule[] WithRule(ButtonRule rule) => rules.Where(item => !ButtonNames.Equals(item.Button, rule.Button))
            .Append(rule).OrderBy(item => item.Button, ButtonNames).ToArray();

        private IEnumerable<ButtonRule> Unconfigured(ButtonInventory inventory) =>
            inventory.Buttons.Select(button =>
                new ButtonRule(button.Name, button.Press.Device, button.Press.Key.Code, button.Press.Key.Scan, Original, null))
            .Where(candidate => !rules.Any(rule => ButtonNames.Equals(rule.Button, candidate.Button) || Overlaps(rule, candidate)));

        private void Persist(ButtonRule[] next)
        {
            save(Validated(next));
            rules = next;
            storeError = null;
        }

        private async Task Replace(ButtonRule[] next)
        {
            Persist(next);
            await StopFilters();
            StartFilters();
        }

        private object Status(string preview = null, string error = null, ButtonInventory inventory = null) => new
        {
            preview, error,
            discovered = inventory == null ? null : Unconfigured(inventory)
                .Select(rule => new { button = rule.Button, code = rule.Code }).ToArray(),
            discovery_detail = inventory?.Detail,
            rules = rules.Select(rule => new
            {
                button = rule.Button, mode = rule.Mode, app_id = rule.AppId,
                active = rule.Mode != Original && active.ContainsKey(rule.Device),
                detail = rule.Mode != Original && failures.TryGetValue(rule.Device, out var failure) ? failure : null,
            }).ToArray(),
        };

        private void StartFilters()
        {
            if (stopping.IsCancellationRequested) return;
            var groups = rules.Where(rule => rule.Mode != Original).GroupBy(rule => rule.Device).ToArray();
            if (groups.Length == 0) return;
            filtering = CancellationTokenSource.CreateLinkedTokenSource(stopping.Token);
            var token = filtering.Token;
            workers = Task.WhenAll(groups.Select(group => Task.Run(() => RunFilter(group.Key, group.ToArray(), token))));
        }

        private async Task RunFilter(string device, ButtonRule[] group, CancellationToken stop)
        {
            var codes = group.ToDictionary(rule => rule.Key, rule => rule.AppId);
            while (!stop.IsCancellationRequested)
            {
                using var session = CancellationTokenSource.CreateLinkedTokenSource(stop);
                Task pending = Task.CompletedTask;
                try
                {
                    foreach (ushort code in codes.Keys.Select(key => key.Code).Distinct()) CheckButtonCode(code);
                    foreach (string app in codes.Values.Where(value => value != null).Distinct()) checkApp(app);
                    filter(device, codes,
                        () => { failures.TryRemove(device, out _); active[device] = true; },
                        app =>
                        {
                            if (!pending.IsCompleted) return;
                            pending = Task.Run(() =>
                            {
                                try { openApp(app, session.Token); }
                                catch (Exception) when (!session.IsCancellationRequested)
                                {
                                    failures[device] = "Could not open the mapped app. Original button actions resumed.";
                                    session.Cancel();
                                }
                                catch (OperationCanceledException) when (session.IsCancellationRequested) { }
                            });
                        }, session.Token);
                }
                catch (Exception error) when (error is IOException || error is InvalidDataException)
                { if (!session.IsCancellationRequested) failures[device] = error.Message; }
                catch (OperationCanceledException) when (session.IsCancellationRequested) { }
                catch (Exception)
                { if (!session.IsCancellationRequested) failures[device] = "The TV input or app service is unavailable."; }
                finally
                {
                    active.TryRemove(device, out _);
                    session.Cancel();
                    try { await pending; } catch (Exception) when (session.IsCancellationRequested) { }
                }
                try { await Task.Delay(TimeSpan.FromSeconds(RetrySeconds), stop); }
                catch (OperationCanceledException) when (stop.IsCancellationRequested) { return; }
            }
        }

        private async Task StopFilters()
        {
            filtering?.Cancel();
            await workers;
            filtering?.Dispose();
            filtering = null;
            failures.Clear();
        }

        internal async Task Remove(Action remove, CancellationToken cancel)
        {
            await edit.WaitAsync(cancel);
            try
            {
                stopping.Token.ThrowIfCancellationRequested();
                await StopFilters();
                try
                {
                    remove();
                    stopping.Cancel();
                }
                catch
                {
                    StartFilters();
                    throw;
                }
            }
            finally { edit.Release(); }
        }

        public void Dispose()
        {
            stopping.Cancel();
            edit.Wait();
            try { StopFilters().GetAwaiter().GetResult(); }
            finally { edit.Release(); }
        }
    }

    internal static class ButtonApp
    {
        private const string AppManager = "libcapi-appfw-app-manager.so.0";
        private const string Launcher = "/usr/bin/app_launcher";
        private const int UiApp = 0;
        private static readonly Regex AppIdPattern = new Regex(@"\A[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\z");
        private static readonly Regex FactoryApp = new Regex(@"factory|agingapp|test[-_.]?oqc|hotel|shopmode|retailmode",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        [DllImport(AppManager)] private static extern int app_manager_get_app_info(string appId, out IntPtr info);
        [DllImport(AppManager)] private static extern int app_info_destroy(IntPtr info);
        [DllImport(AppManager)] private static extern int app_info_get_app_component_type(IntPtr info, out int type);
        [DllImport(AppManager)] private static extern int app_info_is_nodisplay(IntPtr info, [MarshalAs(UnmanagedType.U1)] out bool hidden);
        [DllImport(AppManager)] private static extern int app_info_is_enabled(IntPtr info, [MarshalAs(UnmanagedType.U1)] out bool enabled);

        internal static bool IsId(string app) => AppIdPattern.IsMatch(app ?? "") && !FactoryApp.IsMatch(app);

        internal static void Check(string app)
        {
            if (!IsId(app)) throw new InvalidDataException("Choose an installed TV app as the target.");
            if (!File.Exists(Launcher)) throw new IOException("The TV app launcher is unavailable.");
            try
            {
                int result = app_manager_get_app_info(app, out IntPtr info);
                try
                {
                    if (result == 0 && info != IntPtr.Zero
                        && app_info_get_app_component_type(info, out int type) == 0 && type == UiApp
                        && app_info_is_nodisplay(info, out bool hidden) == 0 && !hidden
                        && app_info_is_enabled(info, out bool enabled) == 0 && enabled) return;
                }
                finally { if (info != IntPtr.Zero) app_info_destroy(info); }
            }
            catch (Exception error) when (error is DllNotFoundException || error is EntryPointNotFoundException)
            { throw new IOException("The TV cannot verify installed app targets.", error); }
            throw new InvalidDataException("The target must be an installed, enabled app with a screen.");
        }

        internal static void Open(string app, CancellationToken stop)
        {
            stop.ThrowIfCancellationRequested();
            Check(app);
            stop.ThrowIfCancellationRequested();
            if (ButtonInput.RunTool(Launcher, new[] { "-s", app }, stop).ExitCode != 0)
                throw new IOException("The TV app launcher rejected the request.");
        }
    }
}
