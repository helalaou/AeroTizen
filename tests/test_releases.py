import hashlib
import io
import json
import stat
import struct
import urllib.error
import urllib.request
import zipfile

import pytest

from aerotizen import releases

REPO = "helalaou/AeroTizen"
API = f"https://api.github.com/repos/{REPO}/releases"


def widget(version="2.2.0", app_id=releases.APP_ID, extra=None):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(
            "config.xml",
            '<widget xmlns="http://www.w3.org/ns/widgets" '
            f'xmlns:tizen="http://tizen.org/ns/widgets" version="{version}">'
            f'<tizen:application id="{app_id}" package="DclHome001"/></widget>',
        )
        for path in ("index.html", "service/index.js", "service/artmode.js"):
            z.writestr(path, "runtime")
        for path, content in extra or []:
            z.writestr(path, content)
    return data.getvalue()


def release(version="2.2.0", prefix="launcher-v", **fields):
    tag = prefix + version
    names = ["launcher-release.json", f"aerotizen-launcher-{version}.wgt"]
    return {
        "tag_name": tag,
        "draft": False,
        "prerelease": False,
        "assets": [
            {
                "name": name,
                "browser_download_url": f"https://github.com/{REPO}/releases/download/{tag}/{name}",
            }
            for name in names
        ],
        **fields,
    }


def manifest(data, version="2.2.0", **fields):
    return {
        "schema_version": 1,
        "version": version,
        "min_cli_version": "2.2.0",
        "app_id": releases.APP_ID,
        "package_id": releases.PACKAGE_ID,
        "asset": f"aerotizen-launcher-{version}.wgt",
        "sha256": hashlib.sha256(data).hexdigest(),
        **fields,
    }


@pytest.fixture
def github(monkeypatch):
    data = widget()
    item = release()
    responses = {
        f"{API}?per_page=100&page=1": [item],
        f"{API}/tags/launcher-v2.2.0": item,
        item["assets"][0]["browser_download_url"]: manifest(data),
        item["assets"][1]["browser_download_url"]: data,
    }
    calls = []

    def read(url, limit):
        calls.append(url)
        response = responses[url]
        return response if isinstance(response, bytes) else json.dumps(response).encode()

    monkeypatch.setattr(releases, "__version__", "2.2.0")
    monkeypatch.setattr(releases, "_read_url", read)
    return responses, calls


def test_download_verifies_and_writes_unsigned_release(github, tmp_path):
    result = releases.download_launcher(tmp_path)
    assert result.version == "2.2.0"
    assert result.path.read_bytes() == github[0][release()["assets"][1]["browser_download_url"]]
    assert len(github[1]) == 3
    assert all("/latest" not in url for url in github[1])


def test_latest_scans_pages_and_orders_versions_not_dates(github, tmp_path):
    responses, calls = github
    responses[f"{API}?per_page=100&page=1"] = [release("99.0.0", prefix="cli-v")] * 96 + [
        release("9.0.0", draft=True),
        release("8.0.0", prerelease=True),
        release("10.0.0-beta.1"),
        release("2.1.9"),
    ]
    responses[f"{API}?per_page=100&page=2"] = [release(), release("2.0.10")]
    assert releases.download_launcher(tmp_path).version == "2.2.0"
    assert f"{API}?per_page=100&page=2" in calls


def test_exact_version_uses_tag_endpoint(github, tmp_path):
    releases.download_launcher(tmp_path, version="2.2.0")
    assert github[1][0] == f"{API}/tags/launcher-v2.2.0"
    assert len(github[1]) == 3


@pytest.mark.parametrize("fields", [{"draft": True}, {"prerelease": True}, {"tag_name": "cli-v2.2.0"}])
def test_pin_still_requires_published_stable_launcher(github, tmp_path, fields):
    github[0][f"{API}/tags/launcher-v2.2.0"] = release(**fields)
    with pytest.raises(releases.ReleaseError, match="published stable"):
        releases.download_launcher(tmp_path, version="2.2.0")


def test_no_launcher_gives_local_development_option(github, tmp_path):
    github[0][f"{API}?per_page=100&page=1"] = [release(prefix="cli-v")]
    with pytest.raises(releases.ReleaseError, match=r"install ./launcher"):
        releases.download_launcher(tmp_path)


@pytest.mark.parametrize("version", ["latest", "../main", "2.2", "2.2.0-beta.1", "02.2.0"])
def test_invalid_version_rejected_before_network(github, tmp_path, version):
    with pytest.raises(releases.ReleaseError, match=r"X\.Y\.Z"):
        releases.download_launcher(tmp_path, version=version)
    assert github[1] == []


@pytest.mark.parametrize("repo", ["https://github.com/a/b", "../repo", "a/b/c", "a/b?token=secret"])
def test_invalid_repository_rejected_before_network(github, tmp_path, repo):
    with pytest.raises(releases.ReleaseError, match="OWNER/REPO"):
        releases.download_launcher(tmp_path, repository=repo)
    assert github[1] == []


def test_explicit_fork_is_used_for_both_metadata_and_assets(github, tmp_path):
    responses, calls = github
    fork = "metacurb/AeroTizen"
    for url, value in list(responses.items()):
        if not isinstance(value, bytes):
            value = json.loads(json.dumps(value).replace(REPO, fork))
        responses[url.replace(REPO, fork)] = value
    releases.download_launcher(tmp_path, repository=fork)
    assert all(fork in url for url in calls)


@pytest.mark.parametrize(
    "fields",
    [
        {"schema_version": 2},
        {"schema_version": True},
        {"version": "2.3.0"},
        {"asset": "../app.wgt"},
        {"app_id": "Other.App"},
        {"package_id": "Other"},
        {"sha256": "not a digest"},
    ],
)
def test_invalid_manifest_never_downloads_package(github, tmp_path, fields):
    responses, calls = github
    responses[release()["assets"][0]["browser_download_url"]] = manifest(widget(), **fields)
    with pytest.raises(releases.ReleaseError, match="manifest"):
        releases.download_launcher(tmp_path)
    assert len(calls) == 2
    assert list(tmp_path.iterdir()) == []


def test_new_launcher_requires_supported_cli(github, tmp_path):
    github[0][release()["assets"][0]["browser_download_url"]]["min_cli_version"] = "2.3.0"
    with pytest.raises(releases.ReleaseError, match="update it first"):
        releases.download_launcher(tmp_path)
    assert len(github[1]) == 2


def test_bad_checksum_never_writes_package(github, tmp_path):
    github[0][release()["assets"][1]["browser_download_url"]] = b"tampered"
    with pytest.raises(releases.ReleaseError, match="checksum"):
        releases.download_launcher(tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("kind", ["missing", "duplicate", "external"])
def test_incomplete_or_unexpected_assets_are_rejected(github, tmp_path, kind):
    item = github[0][f"{API}?per_page=100&page=1"][0]
    if kind == "missing":
        item["assets"].pop(0)
    elif kind == "duplicate":
        item["assets"].append(item["assets"][0].copy())
    else:
        item["assets"][0]["browser_download_url"] = "https://example.com/launcher-release.json"
    with pytest.raises(releases.ReleaseError):
        releases.download_launcher(tmp_path)
    assert len(github[1]) == 1


@pytest.mark.parametrize("data", [widget("2.3.0"), widget(app_id="Other.App"), b"not a zip"])
def test_valid_checksum_is_not_enough_for_wrong_package(github, tmp_path, data):
    item = release()
    github[0][item["assets"][0]["browser_download_url"]] = manifest(data)
    github[0][item["assets"][1]["browser_download_url"]] = data
    with pytest.raises(releases.ReleaseError, match="package"):
        releases.download_launcher(tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("name", ["../outside", "/outside", "C:/outside", "dir\\outside"])
def test_archive_paths_cannot_escape_package(name):
    with pytest.raises(releases.ReleaseError, match="paths"):
        releases._check_package(widget(extra=[(name, "bad")]), "2.2.0")


def test_archive_cannot_contain_symlinks_or_signatures():
    entry = zipfile.ZipInfo("link")
    entry.create_system = 3
    entry.external_attr = (stat.S_IFLNK | 0o777) << 16
    with pytest.raises(releases.ReleaseError, match="paths"):
        releases._check_package(widget(extra=[(entry, "../outside")]), "2.2.0")
    with pytest.raises(releases.ReleaseError, match="unsigned"):
        releases._check_package(widget(extra=[("author-signature.xml", "bad")]), "2.2.0")


def test_archive_expanded_size_is_bounded(monkeypatch):
    monkeypatch.setattr(releases, "MAX_UNPACKED_BYTES", 8)
    with pytest.raises(releases.ReleaseError, match="too large"):
        releases._check_package(widget(), "2.2.0")


def test_corrupt_compressed_stream_is_rejected_without_traceback(github, tmp_path):
    data = bytearray(widget())
    # A valid ZIP header and matching release checksum do not guarantee a valid DEFLATE stream.
    name_length, extra_length = struct.unpack_from("<HH", data, 26)
    offset = 30 + name_length + extra_length
    data[offset] = (data[offset] & ~6) | 6  # Reserved DEFLATE block type.
    item = release()
    github[0][item["assets"][0]["browser_download_url"]] = manifest(data)
    github[0][item["assets"][1]["browser_download_url"]] = bytes(data)
    with pytest.raises(releases.ReleaseError, match="valid application package"):
        releases.download_launcher(tmp_path)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("response", [b"broken JSON", {"message": "unexpected"}, [None]])
def test_malformed_release_responses_give_clear_errors(github, tmp_path, response):
    github[0][f"{API}?per_page=100&page=1"] = response
    with pytest.raises(releases.ReleaseError):
        releases.download_launcher(tmp_path)


@pytest.mark.parametrize("code, message", [(404, "not found"), (403, "rate limit"), (500, "HTTP 500")])
def test_http_errors_are_readable(monkeypatch, code, message):
    class Opener:
        def open(self, request, timeout):
            assert timeout == 30
            raise urllib.error.HTTPError(request.full_url, code, "failed", {}, io.BytesIO())

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args: Opener())
    with pytest.raises(releases.ReleaseError, match=message):
        releases._read_url(API, 100)


def test_network_timeout_is_readable(monkeypatch):
    class Opener:
        def open(self, request, timeout):
            raise TimeoutError("timed out")

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args: Opener())
    with pytest.raises(releases.ReleaseError, match="Check your connection"):
        releases._read_url(API, 100)


def test_response_read_is_bounded(monkeypatch):
    class Opener:
        def open(self, request, timeout):
            return io.BytesIO(b"x" * 11)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args: Opener())
    with pytest.raises(releases.ReleaseError, match="download size"):
        releases._read_url(API, 10)


def test_download_redirect_cannot_downgrade_https():
    with pytest.raises(releases.ReleaseError, match="insecure"):
        releases._HTTPSRedirect().redirect_request(None, None, 302, "", {}, "http://example.com/app")
