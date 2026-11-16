using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;

namespace AeroTizen.Root
{
    internal sealed record DiscoveredButton(string Name, ButtonPress Press);
    internal sealed record ButtonInventory(DiscoveredButton[] Buttons, string Detail = null);
    internal sealed record ButtonKeyNames(ushort Code, string[] Names, bool Truncated);

    internal static class ButtonLayout
    {
        private const int MaxNamesPerCode = 4, MaxNameLength = 64;
        private const ushort SamsungPrimeVideoCode = 221, SamsungNetflixCode = 226;
        // Accept explicit app names only. Numbered LaunchApp keys need a physical press.
        private static readonly Dictionary<string, string> AppNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["netflix"] = "netflix",
            ["amazon"] = "prime-video", ["amazonprime"] = "prime-video", ["primevideo"] = "prime-video",
            ["disney"] = "disney-plus", ["disneyplus"] = "disney-plus",
            ["rakuten"] = "rakuten-tv", ["rakutentv"] = "rakuten-tv",
            ["samsungtvplus"] = "samsung-tv-plus", ["tvplus"] = "samsung-tv-plus",
            ["youtube"] = "youtube", ["hulu"] = "hulu",
        };

        internal static DiscoveredButton[] Find(string layout, IEnumerable<(string Identity, Func<int, bool> HasKey)> devices)
        {
            var remotes = devices.ToArray();
            return ReadCodes(layout).GroupBy(row => row.Code)
                .Select(group => (Code: group.Key, Names: group.Select(row => AppName(row.Name)).Distinct().ToArray()))
                .Where(entry => entry.Names.Length == 1 && entry.Names[0] != null
                    && (ButtonInput.CanAssign(entry.Code) || MatchesSamsungAppCode(entry.Code, entry.Names[0])))
                .SelectMany(entry => remotes.Where(device => device.HasKey(entry.Code)).Select(device =>
                    new DiscoveredButton(entry.Names[0], new ButtonPress(device.Identity, new ButtonKey(entry.Code, null)))))
                .GroupBy(button => button.Name)
                .Where(group => group.Count() == 1)
                .Select(group => group.Single())
                .OrderBy(button => button.Name, StringComparer.Ordinal)
                .ToArray();
        }

        // Some Samsung app shortcuts use codes that Linux also assigns to ordinary keys.
        internal static bool RequiresSamsungAppName(ushort code) => SamsungAppName(code) != null;

        internal static bool ConfirmsSamsungAppCode(string layout, ushort code)
        {
            string expected = SamsungAppName(code);
            if (expected == null) return false;
            var names = ReadCodes(layout).Where(row => row.Code == code)
                .Select(row => AppName(row.Name)).Distinct().ToArray();
            return names.Length == 1 && names[0] == expected;
        }

        private static bool MatchesSamsungAppCode(ushort code, string name) =>
            name != null && name == SamsungAppName(code);

        private static string SamsungAppName(ushort code) => code switch
        {
            SamsungPrimeVideoCode => "prime-video",
            SamsungNetflixCode => "netflix",
            _ => null,
        };

        internal static ButtonKeyNames[] KeyNames(string layout, ushort[] codes)
        {
            var entries = ReadCodes(layout).Where(row => codes.Contains(row.Code)).ToLookup(row => row.Code, row => row.Name);
            return codes.Select(code =>
            {
                var names = entries[code].Distinct(StringComparer.Ordinal).Take(MaxNamesPerCode + 1).ToArray();
                return new ButtonKeyNames(code, names.Take(MaxNamesPerCode).Select(name =>
                    name.Length > MaxNameLength ? name.Substring(0, MaxNameLength) : name).ToArray(),
                    names.Length > MaxNamesPerCode || names.Any(name => name.Length > MaxNameLength));
            }).ToArray();
        }

        private static string AppName(string name)
        {
            string key = name.Replace("_", "").Replace("-", "");
            if (key.StartsWith("XF86", StringComparison.OrdinalIgnoreCase)) key = key.Substring("XF86".Length);
            else if (key.StartsWith("KEY", StringComparison.OrdinalIgnoreCase)) key = key.Substring("KEY".Length);
            return AppNames.GetValueOrDefault(key);
        }

        private static IEnumerable<(ushort Code, string Name)> ReadCodes(string layout)
        {
            using var reader = new StringReader(layout.TrimStart('\ufeff'));
            string line;
            while ((line = reader.ReadLine()) != null)
            {
                var fields = line.Split((char[])null, StringSplitOptions.RemoveEmptyEntries);
                if (fields.Length < 2 || fields[0].StartsWith('#')
                    || !ushort.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out ushort code)) continue;
                yield return (code, fields[0]);
            }
        }
    }
}
