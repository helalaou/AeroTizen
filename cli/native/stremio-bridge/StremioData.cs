using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class StremioData
{
    const string DirectoryPath = "/opt/usr/home/owner/apps_rw/IkWsFHtOY9/data/Local Storage/leveldb";
    const string Origin = "file://";
    const string StoreId = "3202306031311";

    static void CheckCachePath()
    {
        for (var path = new DirectoryInfo(DirectoryPath); path != null; path = path.Parent)
            if (!path.Exists || (path.Attributes & FileAttributes.ReparsePoint) != 0)
                throw new InvalidDataException("Invalid storage directory.");
    }

    // Capability discovery must not read any viewing records. CURRENT is only
    // the LevelDB manifest name; opening that manifest tests read permission.
    public static bool CanRead()
    {
        try
        {
            CheckCachePath();
            string current = Path.Combine(DirectoryPath, "CURRENT");
            var info = new FileInfo(current);
            if (!info.Exists || info.Length < 1 || info.Length > 128 ||
                (info.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            string manifest;
            using (var stream = new FileStream(current, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                var bytes = new byte[129]; int n = stream.Read(bytes, 0, bytes.Length);
                if (n < 1 || n > 128 || stream.ReadByte() != -1) return false;
                manifest = Encoding.ASCII.GetString(bytes, 0, n).Trim();
            }
            if (!Regex.IsMatch(manifest, @"\AMANIFEST-[0-9]+\z")) return false;
            info = new FileInfo(Path.Combine(DirectoryPath, manifest));
            if (!info.Exists || (info.Attributes & FileAttributes.ReparsePoint) != 0) return false;
            using (var stream = new FileStream(info.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                return stream.Length > 0 && stream.Length <= 32 * 1024 * 1024;
        }
        catch { return false; }
    }

    public static object Read()
    {
        CheckCachePath();
        return ReadDirectory(DirectoryPath);
    }

    // Kept internal for synthetic fixture tests. The HTTP host never accepts a
    // path or origin from its caller, and this returns normalized cards only.
    internal static object ReadDirectory(string directory)
    {
        var documents = LevelDbReader.Read(directory, Origin);
        if (!documents.TryGetValue("profile", out JsonElement profile)) return Array.Empty<object>();
        string user = Text(Property(Property(Property(profile, "auth"), "user"), "_id"), 256);
        if (user.Length == 0 || !documents.TryGetValue("library_recent", out JsonElement recent) ||
            Text(Property(recent, "uid"), 256) != user) return Array.Empty<object>();
        var items = Items(recent);
        var notifications = new Dictionary<string, JsonElement>();
        if (documents.TryGetValue("notifications", out JsonElement cached) && Text(Property(cached, "uid"), 256) == user)
            notifications = Items(cached);
        var records = new List<Tuple<long, Dictionary<string, object>>>();
        foreach (var pair in items)
        {
            JsonElement item = pair.Value, state = Property(item, "state");
            if (!ValidItem(pair.Key, item)) continue;
            double offset = Number(Property(state, "timeOffset"));
            bool resume = Text(Property(item, "type"), 64) != "other" &&
                (!Yes(Property(item, "removed")) || Yes(Property(item, "temp"))) && offset > 0;
            string nextId = ""; long firstReleased = long.MaxValue, latestReleased = 0;
            if (notifications.TryGetValue(pair.Key, out JsonElement episodes) && episodes.ValueKind == JsonValueKind.Object)
            {
                foreach (var episode in episodes.EnumerateObject())
                {
                    string id = Text(Property(episode.Value, "videoId"), 512);
                    if (id.Length == 0 || id != episode.Name || Text(Property(episode.Value, "metaId"), 500) != pair.Key) continue;
                    long released = SourceTime(Property(episode.Value, "videoReleased"));
                    if (released <= 0) continue;
                    latestReleased = Math.Max(latestReleased, released);
                    if (released < firstReleased)
                    {
                        nextId = id; firstReleased = released;
                    }
                }
            }
            // The installed UI consumes the already computed notification cache.
            // Recalculating notifications from library history would diverge from
            // its row and require fresh metadata or account requests.
            if (!resume && nextId.Length == 0) continue;
            var card = Card(pair.Key, item, resume ? Text(Property(state, "video_id"), 512) : nextId, !resume);
            records.Add(Tuple.Create(latestReleased > 0 ? latestReleased : SourceTime(Property(item, "_mtime")), card));
        }
        // RD/rr in the packaged core choose its first 100 by notification date
        // or _mtime. Only lastWatched leaves this process as playback activity.
        return records.OrderByDescending(entry => entry.Item1).Take(100)
            .Select(entry => entry.Item2).OrderByDescending(record => (long)record["timestamp"]).ToArray();
    }

    static Dictionary<string, JsonElement> Items(JsonElement document)
    {
        var result = new Dictionary<string, JsonElement>();
        var items = Property(document, "items");
        if (items.ValueKind != JsonValueKind.Object) return result;
        foreach (var item in items.EnumerateObject())
        {
            if (result.Count >= 10000) throw new InvalidDataException("Too many cached items");
            if (item.Name.Length <= 500) result[item.Name] = item.Value;
        }
        return result;
    }

    static bool ValidItem(string id, JsonElement item)
    {
        string type = Text(Property(item, "type"), 64);
        return id.Length > 0 && Text(Property(item, "_id"), 500) == id && type.Length > 0 &&
            Property(item, "state").ValueKind == JsonValueKind.Object;
    }

    static Dictionary<string, object> Card(string id, JsonElement item, string videoId, bool notification)
    {
        JsonElement state = Property(item, "state"); string type = Text(Property(item, "type"), 64);
        int season = 0, episode = 0;
        var match = Regex.Match(videoId, @":([0-9]{1,5}):([0-9]{1,5})\z");
        if (match.Success)
        {
            int.TryParse(match.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out season);
            int.TryParse(match.Groups[2].Value, NumberStyles.None, CultureInfo.InvariantCulture, out episode);
        }
        string image = Text(Property(item, "poster"), 2048);
        if (!Uri.TryCreate(image, UriKind.Absolute, out Uri uri) || uri.Scheme != "https" || uri.UserInfo.Length != 0) image = "";
        string title = Text(Property(item, "name"), 300);
        if (title.Length == 0) title = id;
        return new Dictionary<string, object> {
            ["app_id"] = StoreId, ["content_id"] = id, ["content_title"] = title,
            ["season"] = season, ["episode"] = episode,
            ["duration"] = notification ? 0 : Number(Property(state, "duration")) / 1000,
            ["playback"] = notification ? 0 : Number(Property(state, "timeOffset")) / 1000,
            // A release date or library edit is not evidence of playback.
            ["timestamp"] = Timestamp(Property(state, "lastWatched")), ["image_url"] = image,
            ["payload"] = JsonSerializer.Serialize(new { provider = "stremio", type, id, videoId,
                kind = notification ? "newEpisode" : "resume" })
        };
    }

    static JsonElement Property(JsonElement value, string key) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out JsonElement child) ? child : default;
    static string Text(JsonElement value, int limit) =>
        value.ValueKind == JsonValueKind.String && value.GetString().Length <= limit ? value.GetString() : "";
    static double Number(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out double number) &&
        !double.IsNaN(number) && !double.IsInfinity(number) && number > 0 ? number : 0;
    static bool Yes(JsonElement value) => value.ValueKind == JsonValueKind.True ||
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out int number) && number == 1;
    static long Timestamp(JsonElement value) => SourceTime(value) / 1000;
    static long SourceTime(JsonElement value)
    {
        string text = Text(value, 64);
        return DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTimeOffset date) &&
            date.ToUnixTimeMilliseconds() > 0 ? date.ToUnixTimeMilliseconds() : 0;
    }
}
