import argparse
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from aerotizen import __version__, cli, releases, signer
from aerotizen.sdb import SdbError

APP = "DclHome001.Home"
VERSION = "2.2.0"
CONFIG = (
    '<widget xmlns="http://www.w3.org/ns/widgets" '
    f'xmlns:tizen="http://tizen.org/ns/widgets" version="{VERSION}">'
    f'<tizen:application id="{APP}" package="DclHome001"/></widget>'
)
COMPLETED = (
    f"install {APP}\npackage_path /home/owner/share/tmp/sdk_tools/DclHome001.wgt\n"
    f"app_id[{APP}] install start\napp_id[{APP}] installing[100]\n"
    f"app_id[{APP}] install completed\nspend time for wascmd is [3608]ms\n"
)


def install_args(src="launcher", **overrides):
    return argparse.Namespace(
        **{"tv": "tv", "src": src, "release_version": None, "release_repo": None, **overrides}
    )


def make_wgt(path):
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("config.xml", CONFIG)
        archive.writestr("index.html", "<html></html>")
    return path


@pytest.fixture
def installation(tmp_path, monkeypatch):
    events = []
    downloads = []
    signed_paths = []
    state = tmp_path / "state"
    cdir = state / "certs" / "test-duid"
    cdir.mkdir(parents=True)
    (cdir / "distributor.p12").write_bytes(b"certificate")
    (cdir / "device-profile.xml").write_bytes(b"profile")
    monkeypatch.setattr(cli, "STATE_DIR", str(state))

    class TV:
        output = COMPLETED
        applist_output = f"app_id={APP} app_version={VERSION}"
        before_update = None
        closed = False

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            self.closed = True

        def duid(self):
            return "test-duid"

        def capability(self):
            return {"sdk_toolpath": "/tv/sdk_tools"}

        def push(self, data, destination):
            assert (data, destination) == (b"profile", "/tv/sdk_tools/device-profile.xml")
            events.append("push-profile")

        def install(self, app_id, data, tool_path):
            assert (app_id, data, tool_path) == (APP, b"signed-widget", "/tv/sdk_tools")
            events.append("install")
            return self.output

        def applist(self):
            events.append("applist")
            if self.before_update is not None and "install" not in events:
                return self.before_update
            return self.applist_output

    tv = TV()

    def connect(host):
        assert host == "tv"
        events.append("connect")
        return tv

    def download(destination, *, version, repository):
        events.append("download")
        path = make_wgt(destination / "launcher.wgt")
        downloads.append((path, version, repository))
        return releases.DownloadedLauncher(path=path, version=VERSION)

    def sign(src, destination, cert_dir):
        assert Path(cert_dir) == cdir
        assert cli.app_metadata_of(src) == (APP, VERSION)
        events.append("sign")
        Path(destination).write_bytes(b"signed-widget")
        signed_paths.append(Path(destination))

    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(releases, "download_launcher", download)
    monkeypatch.setattr(signer, "sign_wgt", sign)
    return SimpleNamespace(
        tv=tv, events=events, downloads=downloads, signed_paths=signed_paths, cdir=cdir, tmp_path=tmp_path
    )


def test_latest_release_is_downloaded_before_connecting_and_signed_locally(installation, capsys):
    cli.cmd_install(install_args())
    assert installation.events == ["download", "connect", "sign", "push-profile", "install", "applist"]
    path, version, repository = installation.downloads[0]
    assert version is None
    assert repository == releases.DEFAULT_REPOSITORY
    assert not path.parent.exists()
    assert not installation.signed_paths[0].exists()
    assert installation.tv.closed
    output = capsys.readouterr().out
    assert f"Downloaded launcher {VERSION}." in output
    assert f"version {VERSION} verified" in output


def test_install_flags_select_a_version_and_repository(installation, monkeypatch):
    monkeypatch.setattr(
        "sys.argv",
        [
            "aerotizen",
            "--tv",
            "tv",
            "install",
            "launcher",
            "--version",
            VERSION,
            "--release-repo",
            "example/AeroTizen",
        ],
    )
    cli.main()
    assert installation.downloads[0][1:] == (VERSION, "example/AeroTizen")


@pytest.mark.parametrize("source", ["./launcher", "app.wgt"])
def test_explicit_local_sources_do_not_download(installation, monkeypatch, source):
    monkeypatch.chdir(installation.tmp_path)
    if source == "./launcher":
        Path("launcher").mkdir()
        Path("launcher/config.xml").write_text(CONFIG)
    else:
        make_wgt(Path(source))
    cli.cmd_install(install_args(source))
    assert not installation.downloads
    assert installation.events == ["connect", "sign", "push-profile", "install", "applist"]
    assert installation.tv.closed


@pytest.mark.parametrize("option", [{"release_version": VERSION}, {"release_repo": "example/AeroTizen"}])
def test_release_flags_are_rejected_for_local_sources_before_connecting(installation, option):
    with pytest.raises(SystemExit, match="apply only to"):
        cli.cmd_install(install_args("./launcher", **option))
    assert not installation.events


@pytest.mark.parametrize("source", ["missing.wgt", "not-a-widget.txt", "bad.wgt", "bad-config"])
def test_invalid_sources_fail_before_connecting(installation, monkeypatch, source):
    monkeypatch.chdir(installation.tmp_path)
    Path("not-a-widget.txt").write_text(CONFIG)
    Path("bad.wgt").write_bytes(b"not a zip archive")
    Path("bad-config").mkdir()
    Path("bad-config/config.xml").write_text("<broken>")
    with pytest.raises(SystemExit, match="Install failed"):
        cli.cmd_install(install_args(source))
    assert not installation.events


def test_bad_app_id_is_rejected_before_connecting(installation):
    source = installation.tmp_path / "launcher"
    source.mkdir()
    (source / "config.xml").write_text(CONFIG.replace(APP, "invalid;command"))
    with pytest.raises(SystemExit, match="no valid"):
        cli.cmd_install(install_args(str(source)))
    assert not installation.events


def test_download_error_removes_temporary_files_without_connecting(installation, monkeypatch):
    directories = []

    def failed_download(destination, **kwargs):
        directories.append(destination)
        (destination / "partial.wgt").write_bytes(b"partial")
        raise releases.ReleaseError("Checksum mismatch")

    monkeypatch.setattr(releases, "download_launcher", failed_download)
    with pytest.raises(SystemExit, match="Checksum mismatch"):
        cli.cmd_install(install_args())
    assert not installation.events
    assert not directories[0].exists()


def test_missing_certificates_close_connection_and_remove_download(installation):
    (installation.cdir / "distributor.p12").unlink()
    with pytest.raises(SystemExit, match="No certificates"):
        cli.cmd_install(install_args())
    assert installation.events == ["download", "connect"]
    assert installation.tv.closed
    assert not installation.downloads[0][0].parent.exists()


@pytest.mark.parametrize("stage", ["sign", "install"])
def test_signing_and_tv_errors_close_connection_and_remove_download(installation, monkeypatch, stage):
    def fail(*args):
        raise SdbError("test failure") if stage == "install" else ValueError("test failure")

    target = signer if stage == "sign" else installation.tv
    monkeypatch.setattr(target, "sign_wgt" if stage == "sign" else "install", fail)
    with pytest.raises(SystemExit, match="test failure"):
        cli.cmd_install(install_args())
    assert installation.tv.closed
    assert not installation.downloads[0][0].parent.exists()
    assert "applist" not in installation.events


@pytest.mark.parametrize(
    ("output", "applist", "reason"),
    [
        (f"app_id[{APP}] install failed", f"app_id={APP} app_version={VERSION}", "installation error"),
        ("Error: invalid signature", APP, "installation error"),
        (COMPLETED, f"app_id={APP} app_version=2.1.0", "expected 2.2.0"),
        (COMPLETED, "DclHome001.Watcher", "does not list"),
        (f"app_id[{APP}] installing[100]", APP, "did not confirm"),
        ("", APP, "did not confirm"),
    ],
)
def test_install_verification_rejects_failed_or_unverified_update(installation, output, applist, reason):
    installation.tv.output = output
    installation.tv.applist_output = applist
    with pytest.raises(SystemExit, match=reason):
        cli.cmd_install(install_args())
    assert installation.tv.closed
    assert not installation.downloads[0][0].parent.exists()


def test_completed_install_without_reported_version_is_explicitly_unverified(installation, capsys):
    installation.tv.applist_output = APP
    cli.cmd_install(install_args())
    assert f"TV confirmed installation: {APP}. Installed version is unverified." in capsys.readouterr().out


@pytest.mark.parametrize("app_id", ["abcdefghij.Error", "abcdefghij.Failed"])
@pytest.mark.parametrize("reported_version", [False, True])
def test_app_ids_and_paths_do_not_count_as_install_errors(app_id, reported_version, capsys):
    output = COMPLETED.replace(APP, app_id).replace("DclHome001.wgt", "failed/Error.wgt")
    applist = f"app_id={app_id} app_version={VERSION}" if reported_version else app_id
    cli.verify_install(app_id, VERSION, output, applist)
    assert app_id in capsys.readouterr().out


@pytest.mark.parametrize(
    "failure", ["app_id[abcdefghij.Error] install failed", "Error: invalid signature", "access denied"]
)
def test_install_status_errors_override_a_matching_version(failure):
    app_id = "abcdefghij.Error"
    output = COMPLETED.replace(APP, app_id) + failure
    with pytest.raises(ValueError, match="installation error"):
        cli.verify_install(app_id, VERSION, output, f"app_id={app_id} app_version={VERSION}")


def test_global_version_exits_without_tv_access(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aerotizen", "--version"])
    with pytest.raises(SystemExit) as exc:
        cli.main()
    assert exc.value.code == 0
    assert capsys.readouterr().out.strip() == f"aerotizen {__version__}"


def test_install_help_explains_release_and_local_sources(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aerotizen", "install", "--help"])
    with pytest.raises(SystemExit) as exc:
        cli.main()
    assert exc.value.code == 0
    output = capsys.readouterr().out
    assert "./launcher" in output
    assert "--version X.Y.Z" in output
    assert "--release-repo OWNER/REPO" in output


@pytest.fixture
def updating(installation, monkeypatch):
    installation.tv.before_update = f"app_id={APP} app_version=2.1.0"
    repositories = []

    def resolve(*, repository):
        installation.events.append("resolve")
        repositories.append(repository)
        return SimpleNamespace(
            version=VERSION,
            min_cli_version="2.2.0",
            download=lambda destination: releases.download_launcher(
                destination, version=VERSION, repository=repository
            ),
        )

    monkeypatch.setattr(releases, "resolve_launcher", resolve)
    installation.repositories = repositories
    return installation


def update_args(**overrides):
    return argparse.Namespace(
        **{"target": "launcher", "tv": "tv", "check": False, "release_repo": None, **overrides}
    )


def test_update_uses_one_session_and_the_saved_signing_profile(updating, capsys):
    cli.cmd_update(update_args())
    assert updating.events == [
        "resolve",
        "connect",
        "applist",
        "download",
        "sign",
        "push-profile",
        "install",
        "applist",
    ]
    assert updating.downloads[0][1:] == (VERSION, releases.DEFAULT_REPOSITORY)
    assert not updating.downloads[0][0].parent.exists()
    assert not updating.signed_paths[0].exists()
    assert updating.tv.closed
    output = capsys.readouterr().out
    assert "Installed launcher: 2.1.0" in output
    assert f"Latest stable launcher: {VERSION}" in output
    assert "update is available" in output
    assert f"version {VERSION} verified" in output


def test_update_check_needs_no_certificates_and_downloads_no_widget(updating, monkeypatch, capsys):
    (updating.cdir / "distributor.p12").unlink()
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "tv", "update", "launcher", "--check"])
    cli.main()
    assert updating.events == ["resolve", "connect", "applist"]
    assert not updating.downloads
    assert updating.tv.closed
    assert "update is available" in capsys.readouterr().out


@pytest.mark.parametrize("version", [VERSION, "2.10.0"])
def test_update_skips_current_and_newer_versions_without_certificates(updating, version, capsys):
    updating.tv.before_update = f"app_id={APP} app_version={version}"
    (updating.cdir / "distributor.p12").unlink()
    cli.cmd_update(update_args())
    assert updating.events == ["resolve", "connect", "applist"]
    assert updating.tv.closed
    assert "No changes made" in capsys.readouterr().out


@pytest.mark.parametrize("inventory", [APP, f"app_id={APP} app_version=invalid"])
def test_unknown_version_stops_and_directs_to_install(updating, inventory, capsys):
    updating.tv.before_update = inventory
    with pytest.raises(SystemExit, match="aerotizen install launcher"):
        cli.cmd_update(update_args())
    assert updating.events == ["resolve", "connect", "applist"]
    assert updating.tv.closed
    assert "update cannot be confirmed" in capsys.readouterr().out


def test_unknown_version_check_reports_uncertainty_without_installing(updating, capsys):
    updating.tv.before_update = APP
    cli.cmd_update(update_args(check=True))
    output = capsys.readouterr().out
    assert "version unavailable" in output
    assert "update cannot be confirmed" in output
    assert "up to date" not in output
    assert updating.events == ["resolve", "connect", "applist"]
    assert updating.tv.closed


@pytest.mark.parametrize("inventory", ["DclHome001.Watcher", "", f"{APP}\n{APP}"])
def test_update_requires_one_installed_launcher(updating, inventory):
    updating.tv.before_update = inventory
    with pytest.raises(SystemExit, match=r"not installed|unexpected launcher package"):
        cli.cmd_update(update_args())
    assert updating.events == ["resolve", "connect", "applist"]
    assert updating.tv.closed


def test_update_selects_fork_for_metadata_and_exact_download(updating, monkeypatch):
    monkeypatch.setattr(
        "sys.argv", ["aerotizen", "--tv", "tv", "update", "launcher", "--release-repo", "example/AeroTizen"]
    )
    cli.main()
    assert updating.repositories == ["example/AeroTizen"]
    assert updating.downloads[0][1:] == (VERSION, "example/AeroTizen")


def test_update_rejects_failed_install_even_if_target_version_is_listed(updating):
    updating.tv.output = f"app_id[{APP}] install failed"
    with pytest.raises(SystemExit, match="installation error"):
        cli.cmd_update(update_args())
    assert updating.tv.closed
    assert not updating.downloads[0][0].parent.exists()


def test_update_rejects_stale_version_after_install(updating):
    updating.tv.applist_output = f"app_id={APP} app_version=2.1.0"
    with pytest.raises(SystemExit, match=r"expected 2\.2\.0"):
        cli.cmd_update(update_args())
    assert updating.tv.closed


def test_update_metadata_error_does_not_connect_to_tv(updating, monkeypatch):
    def fail(**kwargs):
        raise releases.ReleaseError("Invalid release metadata")

    monkeypatch.setattr(releases, "resolve_launcher", fail)
    with pytest.raises(SystemExit, match="Invalid release metadata"):
        cli.cmd_update(update_args())
    assert not updating.events


def test_update_download_error_releases_session_and_removes_partial_widget(updating, monkeypatch):
    paths = []

    def fail(destination, **kwargs):
        paths.append(destination)
        (destination / "partial.wgt").write_bytes(b"partial")
        raise releases.ReleaseError("Checksum mismatch")

    monkeypatch.setattr(releases, "download_launcher", fail)
    with pytest.raises(SystemExit, match="Checksum mismatch"):
        cli.cmd_update(update_args())
    assert updating.tv.closed
    assert not paths[0].exists()
    assert "install" not in updating.events


@pytest.mark.parametrize("flags", [["--force"], ["--check", "--force"]])
@pytest.mark.parametrize("target", ["launcher", "cli"])
def test_update_rejects_force_before_any_device_or_release_access(updating, monkeypatch, flags, target):
    monkeypatch.setattr("sys.argv", ["aerotizen", "update", target, *flags])
    with pytest.raises(SystemExit) as exc:
        cli.main()
    assert exc.value.code == 2
    assert not updating.events
