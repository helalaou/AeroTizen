"""CLI version checks use GitHub metadata without TV access or binary downloads."""

import pytest

from aerotizen import cli, releases, self_update


@pytest.fixture
def cli_check(monkeypatch):
    selected = releases.CLIRelease(
        version="2.2.0",
        release_url="https://github.com/helalaou/AeroTizen/releases/tag/cli-v2.2.0",
        download_url="https://github.com/helalaou/AeroTizen/releases/download/cli-v2.2.0/aerotizen-2.2.0-macos-arm64.tar.gz",
    )
    repositories = []

    def resolve(*, repository):
        repositories.append(repository)
        return selected

    def forbidden(*args, **kwargs):
        pytest.fail("CLI version checks must not access a TV, signing profile or binary download")

    monkeypatch.setattr(cli, "__version__", "2.1.0")
    monkeypatch.setattr(releases, "resolve_cli", resolve)
    monkeypatch.setattr(cli, "pick_tv", forbidden)
    monkeypatch.setattr(cli, "require_sdb", forbidden)
    monkeypatch.setattr(cli, "cert_dir_for", forbidden)
    monkeypatch.setattr(releases, "_read_url", forbidden)
    monkeypatch.setattr("sys.argv", ["aerotizen", "update", "cli", "--check"])
    return selected, repositories


def test_cli_check_reports_an_update_and_matching_archive(cli_check, capsys):
    cli.main()
    selected, repositories = cli_check
    output = capsys.readouterr().out
    assert "Installed CLI: 2.1.0" in output
    assert "Latest stable CLI: 2.2.0" in output
    assert "A CLI update is available." in output
    assert f"Download: {selected.download_url}" in output
    assert f"Release: {selected.release_url}" in output
    assert repositories == [releases.DEFAULT_REPOSITORY]


@pytest.mark.parametrize(
    "version,message", [("2.2.0", "up to date"), ("2.10.0", "newer than the latest stable")]
)
def test_cli_check_does_not_offer_a_reinstall_or_downgrade(cli_check, monkeypatch, capsys, version, message):
    monkeypatch.setattr(cli, "__version__", version)
    cli.main()
    output = capsys.readouterr().out
    assert message in output
    assert "Download:" not in output
    assert "A CLI update is available." not in output


def test_cli_check_links_to_release_page_if_no_archive_matches(cli_check, monkeypatch, capsys):
    selected, _ = cli_check
    monkeypatch.setattr(
        releases,
        "resolve_cli",
        lambda **kwargs: releases.CLIRelease(selected.version, selected.release_url, None),
    )
    cli.main()
    output = capsys.readouterr().out
    assert "No matching CLI archive" in output
    assert f"Release: {selected.release_url}" in output


def test_cli_check_passes_an_explicit_repository(cli_check, monkeypatch):
    monkeypatch.setattr(
        "sys.argv", ["aerotizen", "update", "cli", "--check", "--release-repo", "example/AeroTizen"]
    )
    cli.main()
    assert cli_check[1] == ["example/AeroTizen"]


def test_cli_update_calls_the_executable_updater(cli_check, monkeypatch, tmp_path, capsys):
    calls = []

    def install(release, *, repository):
        calls.append((release, repository))
        return self_update.UpdateResult(tmp_path / "previous-cli")

    monkeypatch.setattr(self_update, "install", install)
    monkeypatch.setattr("sys.argv", ["aerotizen", "update", "cli"])
    cli.main()
    assert calls == [(cli_check[0], releases.DEFAULT_REPOSITORY)]
    assert "Updated CLI to 2.2.0" in capsys.readouterr().out


def test_cli_update_reports_windows_handoff_as_pending(cli_check, monkeypatch, tmp_path, capsys):
    result = self_update.UpdateResult(tmp_path / "previous-cli", tmp_path / "result.json")
    monkeypatch.setattr(self_update, "install", lambda *args, **kwargs: result)
    monkeypatch.setattr("sys.argv", ["aerotizen", "update", "cli"])
    cli.main()
    output = capsys.readouterr().out
    assert "CLI update staged" in output and str(result.receipt) in output
    assert "Updated CLI to" not in output


def test_cli_check_reports_release_lookup_failure(cli_check, monkeypatch):
    def fail(**kwargs):
        raise releases.ReleaseError("GitHub rate limit was reached")

    monkeypatch.setattr(releases, "resolve_cli", fail)
    with pytest.raises(SystemExit, match="CLI update check failed: GitHub rate limit"):
        cli.main()
