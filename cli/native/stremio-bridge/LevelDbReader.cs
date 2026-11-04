using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

// A bounded decoder, not a LevelDB client. It never creates LOCK, repairs a
// journal, changes a manifest, or opens application code. Formats follow the
// LevelDB log/table and Snappy specifications.
internal static class LevelDbReader
{
    const int Limit = 32 * 1024 * 1024;
    const int TotalLimit = 64 * 1024 * 1024;
    static readonly uint[] CrcTable = MakeCrcTable();
    static readonly Encoding StrictUnicode = new UnicodeEncoding(false, false, true);

    sealed class Version
    {
        public ulong Sequence;
        public int Kind;
        public byte[] Value;
    }

    sealed class Snapshot
    {
        readonly Dictionary<string, Tuple<long, DateTime>> identities = new Dictionary<string, Tuple<long, DateTime>>();
        int total;

        public byte[] Read(string path, int limit = Limit)
        {
            var info = new FileInfo(path);
            info.Refresh();
            if (!info.Exists || (info.Attributes & FileAttributes.ReparsePoint) != 0 || info.Length > limit)
                throw new InvalidDataException("Invalid storage file");
            long size = info.Length;
            var stamp = info.LastWriteTimeUtc;
            if (size > TotalLimit - total) throw new InvalidDataException("Storage snapshot too large");
            total += (int)size;
            var bytes = new byte[(int)size];
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                int position = 0;
                while (position < bytes.Length)
                {
                    int n = stream.Read(bytes, position, bytes.Length - position);
                    if (n == 0) throw new InvalidDataException("Storage file changed");
                    position += n;
                }
                if (stream.ReadByte() != -1) throw new InvalidDataException("Storage file changed");
            }
            info.Refresh();
            if (!info.Exists || info.Length != size || info.LastWriteTimeUtc != stamp)
                throw new InvalidDataException("Storage file changed");
            identities[path] = Tuple.Create(size, stamp);
            return bytes;
        }

        public void Validate()
        {
            foreach (var pair in identities)
            {
                var info = new FileInfo(pair.Key);
                info.Refresh();
                if (!info.Exists || info.Length != pair.Value.Item1 || info.LastWriteTimeUtc != pair.Value.Item2)
                    throw new InvalidDataException("Storage snapshot changed");
            }
        }
    }

    public static Dictionary<string, JsonElement> Read(string directory, string origin)
    {
        var snapshot = new Snapshot();
        var current = snapshot.Read(Path.Combine(directory, "CURRENT"), 128);
        string manifestName = Encoding.ASCII.GetString(current).Trim();
        if (!Regex.IsMatch(manifestName, @"\AMANIFEST-[0-9]+\z"))
            throw new InvalidDataException("Invalid storage manifest");
        string manifestPath = Path.Combine(directory, manifestName);
        var manifest = snapshot.Read(manifestPath);
        var tables = new Dictionary<ulong, ulong>();
        ulong currentLog = 0, previousLog = 0;
        foreach (var record in LogRecords(manifest))
        {
            int p = 0;
            while (p < record.Length)
            {
                ulong tag = Varint(record, ref p);
                if (tag == 1) Field(record, ref p);
                else if (tag == 2 || tag == 3 || tag == 4 || tag == 9)
                {
                    ulong number = Varint(record, ref p);
                    if (tag == 2) currentLog = number;
                    if (tag == 9) previousLog = number;
                }
                else if (tag == 5) { Varint(record, ref p); Field(record, ref p); }
                else if (tag == 6 || tag == 7)
                {
                    Varint(record, ref p);
                    ulong number = Varint(record, ref p);
                    if (tag == 6) tables.Remove(number);
                    else
                    {
                        tables[number] = Varint(record, ref p);
                        Field(record, ref p); Field(record, ref p);
                    }
                }
                else throw new InvalidDataException("Unsupported storage manifest edit");
                if (tables.Count > 128) throw new InvalidDataException("Too many storage tables");
            }
        }
        var logs = FindLogs(directory, currentLog, previousLog);
        if ((currentLog != 0 && !logs.ContainsKey(currentLog)) || (previousLog != 0 && !logs.ContainsKey(previousLog)))
            throw new InvalidDataException("Missing storage journal");
        var latest = new Dictionary<string, Version>();
        foreach (var table in tables)
        {
            string name = table.Key.ToString("D6");
            string path = Path.Combine(directory, name + ".ldb");
            if (!File.Exists(path)) path = Path.Combine(directory, name + ".sst");
            byte[] bytes = snapshot.Read(path);
            if ((ulong)bytes.Length != table.Value) throw new InvalidDataException("Storage table size mismatch");
            ReadTable(bytes, (seq, kind, key, value) => Merge(latest, origin, seq, kind, key, value));
        }
        foreach (var log in logs)
            foreach (var batch in LogRecords(snapshot.Read(log.Value)))
                ReadBatch(batch, (seq, kind, key, value) => Merge(latest, origin, seq, kind, key, value));
        snapshot.Validate();
        if (!current.SequenceEqual(snapshot.Read(Path.Combine(directory, "CURRENT"), 128)) ||
            !manifest.SequenceEqual(snapshot.Read(manifestPath)) ||
            !logs.Keys.OrderBy(n => n).SequenceEqual(FindLogs(directory, currentLog, previousLog).Keys.OrderBy(n => n)))
            throw new InvalidDataException("Storage snapshot changed");
        var result = new Dictionary<string, JsonElement>();
        foreach (var pair in latest)
        {
            if (pair.Value.Kind == 0) continue;
            using (var json = JsonDocument.Parse(DecodeString(pair.Value.Value), new JsonDocumentOptions { MaxDepth = 32 }))
                result[pair.Key] = json.RootElement.Clone();
        }
        return result;
    }

    static Dictionary<ulong, string> FindLogs(string directory, ulong current, ulong previous)
    {
        var result = new Dictionary<ulong, string>();
        int entries = 0;
        foreach (string path in Directory.EnumerateFiles(directory, "*.log"))
        {
            if (++entries > 128) throw new InvalidDataException("Too many storage journals");
            string name = Path.GetFileNameWithoutExtension(path);
            if (Regex.IsMatch(name, @"\A[0-9]+\z") && ulong.TryParse(name, out ulong number) &&
                (number >= current || number == previous)) result[number] = path;
        }
        if (result.Count > 32) throw new InvalidDataException("Too many active storage journals");
        return result;
    }

    static void Merge(Dictionary<string, Version> latest, string origin, ulong sequence, int kind, byte[] key, byte[] value)
    {
        if (kind != 0 && kind != 1) throw new InvalidDataException("Unknown storage record kind");
        byte[] prefix = Encoding.UTF8.GetBytes("_" + origin + "\0");
        if (key.Length <= prefix.Length || !key.Take(prefix.Length).SequenceEqual(prefix)) return;
        string name = DecodeString(Slice(key, prefix.Length, key.Length - prefix.Length));
        if (name != "profile" && name != "library_recent" && name != "notifications") return;
        if (!latest.TryGetValue(name, out Version old) || sequence > old.Sequence)
            latest[name] = new Version { Sequence = sequence, Kind = kind, Value = value };
        else if (sequence == old.Sequence && (kind != old.Kind || !value.SequenceEqual(old.Value)))
            throw new InvalidDataException("Conflicting storage records");
    }

    static string DecodeString(byte[] value)
    {
        if (value.Length == 0 || (value[0] != 0 && value[0] != 1))
            throw new InvalidDataException("Unsupported storage string encoding");
        return (value[0] == 0 ? StrictUnicode : Encoding.GetEncoding(28591)).GetString(value, 1, value.Length - 1);
    }

    static IEnumerable<byte[]> LogRecords(byte[] raw)
    {
        int p = 0;
        MemoryStream fragment = null;
        try
        {
            while (p < raw.Length)
            {
                int left = 32768 - p % 32768;
                if (left < 7)
                {
                    int end = Math.Min(p + left, raw.Length);
                    while (p < end) if (raw[p++] != 0) throw new InvalidDataException("Invalid journal trailer");
                    continue;
                }
                if (p > raw.Length - 7) throw new InvalidDataException("Incomplete journal header");
                uint checksum = U32(raw, p);
                int size = raw[p + 4] | raw[p + 5] << 8, kind = raw[p + 6]; p += 7;
                if (checksum == 0 && size == 0 && kind == 0)
                {
                    int end = Math.Min(p + left - 7, raw.Length);
                    while (p < end) if (raw[p++] != 0) throw new InvalidDataException("Invalid empty journal record");
                    continue;
                }
                if (size > left - 7 || size > raw.Length - p) throw new InvalidDataException("Incomplete journal record");
                byte[] data = Slice(raw, p, size); p += size;
                if (MaskedCrc(data, (byte)kind, true) != checksum) throw new InvalidDataException("Journal checksum mismatch");
                if (kind == 1 && fragment == null) yield return data;
                else if (kind == 2 && fragment == null) { fragment = new MemoryStream(); fragment.Write(data, 0, size); }
                else if ((kind == 3 || kind == 4) && fragment != null)
                {
                    if (fragment.Length + size > Limit) throw new InvalidDataException("Journal record too large");
                    fragment.Write(data, 0, size);
                    if (kind == 4) { byte[] complete = fragment.ToArray(); fragment.Dispose(); fragment = null; yield return complete; }
                }
                else throw new InvalidDataException("Invalid journal fragmentation");
            }
            if (fragment != null) throw new InvalidDataException("Incomplete journal fragment");
        }
        finally { if (fragment != null) fragment.Dispose(); }
    }

    static void ReadBatch(byte[] raw, Action<ulong, int, byte[], byte[]> merge)
    {
        if (raw.Length < 12) throw new InvalidDataException("Incomplete storage batch");
        ulong sequence = U64(raw, 0); uint count = U32(raw, 8); int p = 12;
        if (count > 100000 || sequence > ulong.MaxValue - count) throw new InvalidDataException("Invalid storage batch size");
        for (uint i = 0; i < count; i++)
        {
            if (p >= raw.Length || raw[p] > 1) throw new InvalidDataException("Invalid storage operation");
            int kind = raw[p++]; byte[] key = Field(raw, ref p);
            byte[] value = kind == 1 ? Field(raw, ref p) : Array.Empty<byte>();
            merge(sequence + i, kind, key, value);
        }
        if (p != raw.Length) throw new InvalidDataException("Unexpected storage batch suffix");
    }

    static void ReadTable(byte[] raw, Action<ulong, int, byte[], byte[]> merge)
    {
        if (raw.Length < 48 || U64(raw, raw.Length - 8) != 0xDB4775248B80FB57UL)
            throw new InvalidDataException("Invalid storage table footer");
        int p = raw.Length - 48;
        Varint(raw, ref p); Varint(raw, ref p);
        ulong offset = Varint(raw, ref p), size = Varint(raw, ref p);
        foreach (var entry in Entries(Block(raw, offset, size)))
        {
            int handle = 0; ulong dataOffset = Varint(entry.Value, ref handle), dataSize = Varint(entry.Value, ref handle);
            if (handle != entry.Value.Length) throw new InvalidDataException("Invalid storage block handle");
            foreach (var row in Entries(Block(raw, dataOffset, dataSize)))
            {
                if (row.Key.Length < 8) throw new InvalidDataException("Missing internal storage key");
                ulong tag = U64(row.Key, row.Key.Length - 8);
                merge(tag >> 8, (int)(tag & 255), Slice(row.Key, 0, row.Key.Length - 8), row.Value);
            }
        }
    }

    static byte[] Block(byte[] raw, ulong offset, ulong size)
    {
        if (offset > (ulong)(raw.Length - 48) || size > Limit || size + 5 > (ulong)(raw.Length - 48) - offset)
            throw new InvalidDataException("Storage block outside file");
        int p = (int)offset, n = (int)size; byte compression = raw[p + n];
        byte[] data = Slice(raw, p, n);
        if (MaskedCrc(data, compression, false) != U32(raw, p + n + 1)) throw new InvalidDataException("Table checksum mismatch");
        if (compression == 1) return Snappy(data);
        if (compression != 0) throw new InvalidDataException("Unsupported table compression");
        return data;
    }

    static IEnumerable<KeyValuePair<byte[], byte[]>> Entries(byte[] raw)
    {
        if (raw.Length < 8) throw new InvalidDataException("Incomplete storage block");
        uint restarts = U32(raw, raw.Length - 4);
        if (restarts < 1 || restarts > (raw.Length - 4) / 4) throw new InvalidDataException("Invalid restart array");
        int end = raw.Length - 4 - (int)restarts * 4, p = 0; byte[] previous = Array.Empty<byte>();
        while (p < end)
        {
            ulong shared = Varint(raw, ref p), extra = Varint(raw, ref p), valueSize = Varint(raw, ref p);
            if (shared > (ulong)previous.Length || extra > (ulong)Math.Max(0, end - p) || valueSize > (ulong)Math.Max(0, end - p) - extra)
                throw new InvalidDataException("Invalid table entry");
            var key = new byte[(int)shared + (int)extra];
            Buffer.BlockCopy(previous, 0, key, 0, (int)shared);
            Buffer.BlockCopy(raw, p, key, (int)shared, (int)extra); p += (int)extra;
            byte[] value = Slice(raw, p, (int)valueSize); p += (int)valueSize;
            previous = key;
            yield return new KeyValuePair<byte[], byte[]>(key, value);
        }
        if (p != end) throw new InvalidDataException("Table entry exceeds block");
    }

    static byte[] Snappy(byte[] raw)
    {
        int p = 0; ulong size = Varint(raw, ref p);
        if (size > Limit) throw new InvalidDataException("Snappy output too large");
        var output = new byte[(int)size]; int written = 0;
        while (p < raw.Length)
        {
            int tag = raw[p++], kind = tag & 3, length, offset = 0;
            if (kind == 0)
            {
                ulong n = (ulong)(tag >> 2);
                if (n >= 60)
                {
                    int width = (int)n - 59; n = 0;
                    if (width > raw.Length - p) throw new InvalidDataException("Incomplete Snappy literal size");
                    for (int i = 0; i < width; i++) n |= (ulong)raw[p++] << (i * 8);
                }
                n++;
                if (n > (ulong)(raw.Length - p) || n > (ulong)(output.Length - written)) throw new InvalidDataException("Invalid Snappy literal");
                Buffer.BlockCopy(raw, p, output, written, (int)n); p += (int)n; written += (int)n;
            }
            else
            {
                int width = kind == 1 ? 1 : kind == 2 ? 2 : 4;
                if (width > raw.Length - p) throw new InvalidDataException("Incomplete Snappy copy");
                ulong rawOffset = 0;
                for (int i = 0; i < width; i++) rawOffset |= (ulong)raw[p++] << (i * 8);
                if (kind == 1) rawOffset |= (uint)((tag & 0xE0) << 3);
                if (rawOffset == 0 || rawOffset > (ulong)written) throw new InvalidDataException("Invalid Snappy copy offset");
                offset = (int)rawOffset; length = kind == 1 ? 4 + ((tag >> 2) & 7) : 1 + (tag >> 2);
                if (length > output.Length - written) throw new InvalidDataException("Invalid Snappy copy length");
                for (int i = 0; i < length; i++) { output[written] = output[written - offset]; written++; }
            }
        }
        if (written != output.Length) throw new InvalidDataException("Incomplete Snappy output");
        return output;
    }

    static ulong Varint(byte[] raw, ref int p)
    {
        ulong value = 0;
        for (int shift = 0; shift <= 63; shift += 7)
        {
            if (p >= raw.Length) throw new InvalidDataException("Incomplete storage integer");
            byte b = raw[p++];
            if (shift == 63 && b > 1) throw new InvalidDataException("Storage integer too large");
            value |= (ulong)(b & 127) << shift;
            if (b < 128) return value;
        }
        throw new InvalidDataException("Storage integer too large");
    }

    static byte[] Field(byte[] raw, ref int p)
    {
        ulong n = Varint(raw, ref p);
        if (n > Limit || n > (ulong)(raw.Length - p)) throw new InvalidDataException("Invalid storage field");
        byte[] value = Slice(raw, p, (int)n); p += (int)n; return value;
    }

    static byte[] Slice(byte[] raw, int p, int size)
    {
        var result = new byte[size]; Buffer.BlockCopy(raw, p, result, 0, size); return result;
    }

    static uint U32(byte[] raw, int p) => (uint)raw[p] | (uint)raw[p + 1] << 8 | (uint)raw[p + 2] << 16 | (uint)raw[p + 3] << 24;
    static ulong U64(byte[] raw, int p) => U32(raw, p) | (ulong)U32(raw, p + 4) << 32;
    static uint[] MakeCrcTable()
    {
        var table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            uint crc = i;
            for (int j = 0; j < 8; j++) crc = crc >> 1 ^ ((crc & 1) != 0 ? 0x82F63B78U : 0);
            table[i] = crc;
        }
        return table;
    }
    static uint MaskedCrc(byte[] data, byte tag, bool tagFirst)
    {
        uint crc = uint.MaxValue;
        if (tagFirst) crc = CrcTable[(crc ^ tag) & 255] ^ crc >> 8;
        foreach (byte b in data) crc = CrcTable[(crc ^ b) & 255] ^ crc >> 8;
        if (!tagFirst) crc = CrcTable[(crc ^ tag) & 255] ^ crc >> 8;
        crc ^= uint.MaxValue;
        return unchecked(((crc >> 15) | (crc << 17)) + 0xA282EAD8U);
    }
}
