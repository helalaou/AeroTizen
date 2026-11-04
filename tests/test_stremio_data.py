"""Native reader tests use synthetic stores, never a TV, profile or real history."""

import json
import os
import shutil
import struct
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]

CRC_TABLE = []
for _number in range(256):
    _crc = _number
    for _ in range(8):
        _crc = (_crc >> 1) ^ (0x82F63B78 if _crc & 1 else 0)
    CRC_TABLE.append(_crc)


def masked_crc(raw):
    crc = 0xFFFFFFFF
    for byte in raw:
        crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >> 8)
    crc ^= 0xFFFFFFFF
    return (((crc >> 15) | (crc << 17)) + 0xA282EAD8) & 0xFFFFFFFF


def vint(number):
    raw = bytearray()
    while number >= 128:
        raw.append((number & 127) | 128)
        number >>= 7
    return bytes([*raw, number])


def field(raw):
    return vint(len(raw)) + raw


def record(raw, kind=1):
    return struct.pack("<IHB", masked_crc(bytes([kind]) + raw), len(raw), kind) + raw


def block(rows):
    body = b"".join(vint(0) + vint(len(key)) + vint(len(value)) + key + value for key, value in rows)
    return body + struct.pack("<II", 0, 1)


def table(rows):
    def trailer(raw):
        return raw + b"\0" + struct.pack("<I", masked_crc(raw + b"\0"))

    data = block([(key + struct.pack("<Q", (seq << 8) | kind), value) for seq, kind, key, value in rows])
    index = block([(b"last", vint(0) + vint(len(data)))])
    footer = vint(0) + vint(0) + vint(len(data) + 5) + vint(len(index))
    return trailer(data) + trailer(index) + footer.ljust(40, b"\0") + struct.pack("<Q", 0xDB4775248B80FB57)


def batch(sequence, rows):
    body = b"".join(bytes([kind]) + field(key) + (field(value) if kind else b"") for kind, key, value in rows)
    return struct.pack("<QI", sequence, len(rows)) + body


@pytest.fixture(scope="session")
def native_reader(tmp_path_factory):
    dotnet = os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip("Set AEROTIZEN_DOTNET to a .NET 6 SDK for native reader tests")
    project = tmp_path_factory.mktemp("native-stremio-data")
    (project / "NuGet.Config").write_text(
        "<configuration><packageSources><clear /></packageSources></configuration>"
    )
    source = ROOT / "cli/native/stremio-bridge"
    sources = [source / "LevelDbReader.cs", source / "StremioData.cs"]
    includes = "".join(f'<Compile Include="{path}" Link="{path.name}" />' for path in sources)
    (project / "Reader.csproj").write_text(
        '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType>'
        "<TargetFramework>net6.0</TargetFramework><CheckEolTargetFramework>false</CheckEolTargetFramework>"
        "</PropertyGroup><ItemGroup>" + includes + "</ItemGroup></Project>"
    )
    (project / "Program.cs").write_text(
        """using System; using System.Text.Json;
static class Program {
  static int Main(string[] args) {
    try {
      object result;
      if (args[0] == "records") {
        var type = typeof(LevelDbReader).Assembly.GetType("StremioData");
        var flags = System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic;
        var method = type.GetMethod("ReadDirectory", flags);
        result = method.Invoke(null, new object[] {args[1]});
      } else result = LevelDbReader.Read(args[1], "file://");
      Console.WriteLine(JsonSerializer.Serialize(result)); return 0;
    } catch { Console.WriteLine("{\\"error\\":\\"unavailable\\"}"); return 1; }
  }
}"""
    )
    subprocess.run(
        [
            dotnet,
            "build",
            str(project / "Reader.csproj"),
            "--nologo",
            "-v:q",
            "--configfile",
            str(project / "NuGet.Config"),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )

    def run(directory, mode="documents", ok=True):
        result = subprocess.run(
            [dotnet, str(project / "bin/Debug/net6.0/Reader.dll"), mode, str(directory)],
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert result.returncode == (0 if ok else 1), result.stdout + result.stderr
        return json.loads(result.stdout)

    return run


def local_key(name, origin="file://", unicode=False):
    return (
        b"_"
        + origin.encode("ascii")
        + b"\0"
        + (b"\0" + name.encode("utf-16le") if unicode else b"\1" + name.encode("ascii"))
    )


def encoded(value, unicode=False):
    raw = json.dumps(value, ensure_ascii=False)
    return b"\0" + raw.encode("utf-16le") if unicode else b"\1" + raw.encode("latin1")


def database(directory, rows, journal_rows=()):
    directory.mkdir(exist_ok=True)
    data = table(rows)
    (directory / "000010.ldb").write_bytes(data)
    manifest = (
        vint(1)
        + field(b"leveldb.BytewiseComparator")
        + vint(2)
        + vint(11)
        + vint(7)
        + vint(0)
        + vint(10)
        + vint(len(data))
        + field(b"a")
        + field(b"z")
    )
    (directory / "CURRENT").write_text("MANIFEST-000001\n")
    (directory / "MANIFEST-000001").write_bytes(record(manifest))
    (directory / "000011.log").write_bytes(record(batch(100, journal_rows)))


def test_native_reader_uses_active_files_newest_sequence_tombstones_and_exact_origin(native_reader, tmp_path):
    database(
        tmp_path,
        [
            (1, 1, local_key("profile"), encoded({"marker": "old"})),
            (2, 1, local_key("library"), encoded({"marker": "remove"})),
            (
                3,
                1,
                local_key("library_recent", origin="https://old.example"),
                encoded({"marker": "wrong origin"}),
            ),
            (4, 1, local_key("unrelated"), b"invalid and must not be decoded"),
        ],
        [(1, local_key("profile"), encoded({"marker": "new"})), (0, local_key("library"), b"")],
    )
    (tmp_path / "000009.ldb").write_bytes(b"obsolete files must not be read")
    (tmp_path / "000012.log").write_bytes(
        record(
            batch(
                200, [(1, local_key("notifications", unicode=True), encoded({"name": "Café"}, unicode=True))]
            )
        )
    )
    assert native_reader(tmp_path) == {"profile": {"marker": "new"}, "notifications": {"name": "Café"}}


@pytest.mark.parametrize("name", ["000010.ldb", "000011.log", "MANIFEST-000001"])
def test_native_reader_missing_live_file_is_unavailable(native_reader, tmp_path, name):
    database(tmp_path, [(1, 1, local_key("library"), encoded({}))])
    (tmp_path / name).unlink()
    assert native_reader(tmp_path, ok=False) == {"error": "unavailable"}


@pytest.mark.parametrize("name", ["000010.ldb", "000011.log"])
def test_native_reader_corruption_is_unavailable(native_reader, tmp_path, name):
    database(tmp_path, [(1, 1, local_key("library"), encoded({}))])
    data = bytearray((tmp_path / name).read_bytes())
    data[8] ^= 1
    (tmp_path / name).write_bytes(data)
    assert native_reader(tmp_path, ok=False) == {"error": "unavailable"}


def test_native_reader_rejects_manifest_path_traversal_and_oversized_files(native_reader, tmp_path):
    database(tmp_path, [(1, 1, local_key("library"), encoded({}))])
    (tmp_path / "CURRENT").write_text("../outside")
    assert native_reader(tmp_path, ok=False) == {"error": "unavailable"}
    (tmp_path / "CURRENT").write_text("MANIFEST-000001\n")
    with (tmp_path / "000010.ldb").open("wb") as stream:
        stream.truncate(32 * 1024 * 1024 + 1)
    assert native_reader(tmp_path, ok=False) == {"error": "unavailable"}


def test_native_reader_handles_compressed_tables_and_fragmented_journal(native_reader, tmp_path):
    database(tmp_path, [])
    raw = block(
        [(local_key("library_recent") + struct.pack("<Q", (1 << 8) | 1), encoded({"marker": "compressed"}))]
    )
    # Independent Snappy literal encoding for the complete table data block.
    length = len(raw) - 1
    if length < 60:
        compressed = vint(len(raw)) + bytes([length << 2]) + raw
    else:
        width = (length.bit_length() + 7) // 8
        compressed = vint(len(raw)) + bytes([(59 + width) << 2])
        compressed += length.to_bytes(width, "little") + raw
    index = block([(b"last", vint(0) + vint(len(compressed)))])
    footer = vint(0) + vint(0) + vint(len(compressed) + 5) + vint(len(index))
    data = compressed + b"\1" + struct.pack("<I", masked_crc(compressed + b"\1"))
    data += index + b"\0" + struct.pack("<I", masked_crc(index + b"\0"))
    data += footer.ljust(40, b"\0") + struct.pack("<Q", 0xDB4775248B80FB57)
    (tmp_path / "000010.ldb").write_bytes(data)
    manifest = vint(2) + vint(11)
    manifest += vint(7) + vint(0) + vint(10) + vint(len(data))
    manifest += field(b"a") + field(b"z")
    (tmp_path / "MANIFEST-000001").write_bytes(record(manifest))
    journal = batch(100, [(1, local_key("profile"), encoded({"padding": "a" * 40000}))])
    first = 32768 - 7
    (tmp_path / "000011.log").write_bytes(record(journal[:first], 2) + record(journal[first:], 4))
    result = native_reader(tmp_path)
    assert result["library_recent"] == {"marker": "compressed"}
    assert len(result["profile"]["padding"]) == 40000
    # A correctly checksummed but malformed compressed block must still fail.
    bad = bytearray(data)
    bad[0] = 0  # Declared output no longer matches the literal.
    bad[len(compressed) + 1 : len(compressed) + 5] = struct.pack(
        "<I", masked_crc(bytes(bad[: len(compressed)]) + b"\1")
    )
    (tmp_path / "000010.ldb").write_bytes(bad)
    assert native_reader(tmp_path, ok=False) == {"error": "unavailable"}


def item(name, offset=30000, **extra):
    return {
        "_id": name,
        "type": "series",
        "name": "Example series",
        "poster": "https://images.example/poster.jpg",
        "removed": False,
        "temp": False,
        "_mtime": "2026-10-25T11:00:00Z",
        "state": {
            "timeOffset": offset,
            "duration": 120000,
            "video_id": name + ":2:3",
            "lastWatched": "2026-10-24T10:00:00Z",
            "noNotif": False,
            "flaggedWatched": 0,
        },
        **extra,
    }


def documents(recent, library=None, notifications=None):
    return {
        "profile": {"auth": {"key": "SECRET_TOKEN", "user": {"_id": "PRIVATE_UID"}}},
        "library_recent": {"uid": "PRIVATE_UID", "items": recent},
        "library": {"uid": "PRIVATE_UID", "items": library or {}},
        "notifications": {"uid": "PRIVATE_UID", "items": notifications or {}},
    }


def cards(native_reader, directory, docs, other_rows=()):
    rows = [(n, 1, local_key(key), encoded(value)) for n, (key, value) in enumerate(docs.items(), 1)]
    database(directory, [*rows, *other_rows])
    before = {path.name: path.read_bytes() for path in directory.iterdir()}
    result = native_reader(directory, mode="records")
    assert before == {path.name: path.read_bytes() for path in directory.iterdir()}
    return result


def test_native_cards_emit_small_resume_list_and_do_not_export_account_or_history(native_reader, tmp_path):
    recent = {"current": item("current")}
    recent.update({f"history-{n}": item(f"history-{n}", offset=0) for n in range(200)})
    docs = documents(recent, library={"current": item("current", offset=0)})
    result = cards(native_reader, tmp_path, docs)
    assert len(result) == 1
    card = result[0]
    assert card["app_id"] == "3202306031311"
    assert card["content_id"] == "current"
    assert card["content_title"] == "Example series"
    assert set(card) == {
        "app_id",
        "content_id",
        "content_title",
        "season",
        "episode",
        "duration",
        "playback",
        "timestamp",
        "image_url",
        "payload",
    }
    assert (card["season"], card["episode"]) == (2, 3)
    assert (card["duration"], card["playback"]) == (120, 30)
    assert card["timestamp"] == 1792836000  # lastWatched, not the newer library _mtime.
    assert json.loads(card["payload"]) == {
        "provider": "stremio",
        "type": "series",
        "id": "current",
        "videoId": "current:2:3",
        "kind": "resume",
    }
    serialized = json.dumps(result)
    assert "SECRET" not in serialized and "PRIVATE_UID" not in serialized and "history-" not in serialized


def test_native_cards_include_zero_offset_new_episodes_once_per_series(native_reader, tmp_path):
    show = item("new", offset=0)
    show["state"]["lastWatched"] = "2026-10-20T12:00:00Z"
    episodes = {
        "new:3:1": {"metaId": "new", "videoId": "new:3:1", "videoReleased": "2026-10-21T12:00:00Z"},
        "new:3:2": {"metaId": "new", "videoId": "new:3:2", "videoReleased": "2026-10-22T12:00:00Z"},
    }
    result = cards(native_reader, tmp_path, documents({"new": show}, {}, {"new": episodes}))
    assert len(result) == 1
    assert (result[0]["season"], result[0]["episode"]) == (3, 1)
    assert (result[0]["duration"], result[0]["playback"]) == (0, 0)
    assert json.loads(result[0]["payload"])["kind"] == "newEpisode"


@pytest.mark.parametrize(
    ("field", "value", "expected"),
    [("removed", True, 0), ("temp", True, 1), ("type", "other", 0), ("behaviorHints", {"isLive": True}, 1)],
)
def test_native_resume_eligibility(native_reader, tmp_path, field, value, expected):
    show = item("show", **{field: value})
    assert len(cards(native_reader, tmp_path, documents({"show": show}))) == expected


@pytest.mark.parametrize("document", ["library_recent", "notifications"])
def test_native_cards_do_not_join_different_accounts(native_reader, tmp_path, document):
    show = item("new", offset=0)
    show["state"]["lastWatched"] = "2026-10-20T12:00:00Z"
    episodes = {"new:3:1": {"metaId": "new", "videoId": "new:3:1", "videoReleased": "2026-10-21T12:00:00Z"}}
    docs = documents({"new": show}, {}, {"new": episodes})
    docs[document]["uid"] = "OTHER_ACCOUNT"
    assert cards(native_reader, tmp_path, docs) == []


@pytest.mark.parametrize("change", ["noNotif", "removed", "future", "before_watch", "wrong_meta"])
def test_native_notifications_follow_cached_model_without_guessing_new_eligibility(
    native_reader, tmp_path, change
):
    show = item("new", offset=0)
    show["state"]["lastWatched"] = "2026-10-20T12:00:00Z"
    episode = {"metaId": "new", "videoId": "new:3:1", "videoReleased": "2026-10-21T12:00:00Z"}
    if change == "noNotif":
        show["state"]["noNotif"] = True
    elif change == "removed":
        show["removed"] = True
    elif change == "future":
        episode["videoReleased"] = "2026-11-01T12:00:00Z"
    elif change == "before_watch":
        episode["videoReleased"] = "2026-10-19T12:00:00Z"
    elif change == "wrong_meta":
        episode["metaId"] = "other"
    result = cards(native_reader, tmp_path, documents({"new": show}, {}, {"new": {"new:3:1": episode}}))
    assert len(result) == (0 if change == "wrong_meta" else 1)


def test_native_cards_do_not_expand_recent_history_with_library_only_notifications(native_reader, tmp_path):
    show = item("new", offset=0)
    episode = {"metaId": "new", "videoId": "new:3:1", "videoReleased": "2026-10-21T12:00:00Z"}
    assert cards(native_reader, tmp_path, documents({}, {"new": show}, {"new": {"new:3:1": episode}})) == []


def test_native_cards_keep_native_membership_cap_before_cross_service_sort(native_reader, tmp_path):
    recent = {}
    for n in range(120):
        name = f"show-{n}"
        show = item(name)
        show["_mtime"] = (datetime(2026, 10, 20, tzinfo=timezone.utc) + timedelta(minutes=n)).isoformat()
        recent[name] = show
    # A newer watch timestamp must not import a record outside Stremio's own
    # first 100. The cross-service sort cannot expand native row membership.
    recent["show-0"]["state"]["lastWatched"] = "2026-10-25T11:00:00Z"
    result = cards(native_reader, tmp_path, documents(recent))
    assert len(result) == 100
    assert {card["content_id"] for card in result} == {f"show-{n}" for n in range(20, 120)}
