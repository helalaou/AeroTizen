"""aerotizen: clean up a Samsung Tizen TV from your computer.

  aerotizen discover            find TVs on your network
  aerotizen status              model, Developer Mode, sdb capabilities
  aerotizen apps                list installed packages, classified
  aerotizen debloat             pick packages to remove, then remove them
  aerotizen debloat --remove PKGID[,PKGID...] [--yes]
  aerotizen certs               sign in to Samsung, create signing certs for this TV
  aerotizen install launcher    download, sign, and install the latest launcher
  aerotizen install PATH        sign + install a local app folder or .wgt
  aerotizen uninstall launcher  remove the launcher (or: uninstall APPID for another app you installed)
  aerotizen key KEY_VOLUP [n]   press a remote button
  aerotizen launch APPID        open an app and check that it came up
  aerotizen inspect launcher    restart the launcher with Chrome DevTools
  aerotizen inspect APPID       inspect another app (--port defaults to 9222)
  aerotizen home status         read native Home state as the SDK user
  aerotizen home probe          inventory runtime files without .NET or Home changes
  aerotizen home backup         save an immutable local Home baseline
  aerotizen home apply          preview native Home assignment (--yes writes)
  aerotizen home restore        preview baseline restore (--yes writes)

Add --tv IP to target a specific TV (otherwise the first one found is used).
"""

import argparse
import datetime
import json
import os
import re
import shutil
import sys
import time
import xml.etree.ElementTree as ET
import zipfile
from collections import OrderedDict
from pathlib import Path
from tempfile import TemporaryDirectory

from aerotizen import __version__, catalog, discover, remote
from aerotizen.device import DeviceSession
from aerotizen.sdb import SdbError

STATE_DIR = remote.CONFIG_DIR


def pick_tv(args):
    if args.tv:
        return args.tv
    tvs = discover.discover()
    if not tvs:
        sys.exit("No Samsung TV found. Pass --tv <ip>.")
    return tvs[0]["ip"]


def snapshot(host, text):
    os.makedirs(STATE_DIR, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = os.path.join(STATE_DIR, f"{host}-applist-{stamp}.txt")
    with open(path, "w") as f:
        f.write(text)
    return path


def packages(applist_text):
    """Group apps into packages: {pkgid: {"apps": [...], "class": ...}}."""
    pkgs = OrderedDict()
    for app in catalog.parse_applist(applist_text):
        pkgs.setdefault(app["pkgid"], {"apps": []})["apps"].append(app)
    for _pkgid, pkg in pkgs.items():
        classes = [catalog.classify(a) for a in pkg["apps"]]
        # A package goes as a unit, so one protected app protects the whole package.
        pkg["class"] = (
            "protected" if "protected" in classes else "bloat" if "bloat" in classes else "optional"
        )
        pkg["name"] = min((a["name"] for a in pkg["apps"]), key=len)
    return pkgs


def require_sdb(host):
    try:
        return DeviceSession(host).connect()
    except SdbError as e:
        d = remote.info(host)
        sys.exit(
            f"sdb: {e}\nTV reports developerMode={d.get('developerMode')} "
            f"developerIP={d.get('developerIP')}. See README > Developer Mode."
        )


def cmd_discover(args):
    for tv in discover.discover():
        print(json.dumps(tv))


def cmd_status(args):
    host = pick_tv(args)
    d = remote.info(host)
    print(f"{d['name'].replace('&quot;', chr(34))}  {d.get('modelName')}  {host}")
    print(
        f"power={d.get('PowerState')} developerMode={d.get('developerMode')} "
        f"developerIP={d.get('developerIP')}"
    )
    if d.get("developerMode") == "1":
        with require_sdb(host) as s:
            print("sdb banner:", s.banner)
            for k, v in s.capability().items():
                print(f"  {k:<24} {v}")


def cmd_apps(args):
    host = pick_tv(args)
    with require_sdb(host) as s:
        text = s.applist()
    print("snapshot:", snapshot(host, text))
    pkgs = packages(text)
    if args.raw:
        print(text)
        return
    for cls in ("bloat", "optional", "protected"):
        group = [(p, v) for p, v in pkgs.items() if v["class"] == cls]
        if cls == "protected" and not args.all:
            print(f"\n[protected] {len(group)} platform packages hidden (use --all)")
            continue
        print(f"\n[{cls}] {len(group)}")
        for pkgid, v in group:
            extra = f" (+{len(v['apps']) - 1} more)" if len(v["apps"]) > 1 else ""
            print(f"  {pkgid:<28} {v['name']}{extra}")


def cmd_debloat(args):
    host = pick_tv(args)
    with require_sdb(host) as s:
        _debloat(args, host, s)


def _debloat(args, host, s):
    before = s.applist()
    print("snapshot:", snapshot(host, before))
    pkgs = packages(before)
    candidates = [(p, v) for p, v in pkgs.items() if v["class"] != "protected"]

    if args.remove:
        chosen = [p.strip() for p in args.remove.split(",") if p.strip()]
    else:
        print("\nRemovable packages:")
        for i, (pkgid, v) in enumerate(candidates, 1):
            print(f"  {i:>2}. [{v['class']:<8}] {v['name']:<36} {pkgid}")
        answer = input(
            "\nNumbers to remove (e.g. 1 3 5), 'bloat' for all bloat, or Enter to cancel: "
        ).strip()
        if not answer:
            return
        if answer == "bloat":
            chosen = [p for p, v in candidates if v["class"] == "bloat"]
        else:
            chosen = [candidates[int(n) - 1][0] for n in answer.replace(",", " ").split()]

    for pkgid in chosen:
        if pkgid not in pkgs:
            sys.exit(f"{pkgid} is not installed.")
        if pkgs[pkgid]["class"] == "protected":
            sys.exit(f"{pkgid} is a protected platform package; refusing.")
    print("\nWill remove:")
    for pkgid in chosen:
        print(f"  {pkgs[pkgid]['name']:<36} {pkgid}")
    if not args.yes and input("Proceed? [y/N] ").strip().lower() != "y":
        return

    current, refused = before, []
    for pkgid in chosen:
        out = s.uninstall(pkgs[pkgid]["apps"][0]["appid"]).strip()
        after = s.applist()
        gone = pkgid not in packages(after)
        print(f"{'removed' if gone else 'STILL PRESENT'}  {pkgs[pkgid]['name']} ({pkgid})")
        if not gone:
            reason = next((ln for ln in out.splitlines() if "fail" in ln or "can not" in ln), out[-120:])
            print("   TV said:", reason or "(nothing)")
            refused.append(pkgs[pkgid]["name"])
        current = after
    print("snapshot:", snapshot(host, current))
    if refused:
        # Tizen 6+ retail firmware only lets sdb remove developer-installed apps.
        print(
            "\nThis firmware won't let sdb remove store/preloaded apps. Delete them on the TV instead:\n"
            "  Home > Apps > Settings (gear, top right) > select the app > Delete\n"
            "  Apps: " + ", ".join(refused)
        )


def cert_dir_for(duid):
    return os.path.join(STATE_DIR, "certs", duid)


def cmd_certs(args):
    from aerotizen import certs

    host = pick_tv(args)
    with require_sdb(host) as s:
        duid = s.duid()
    out = cert_dir_for(duid)
    if os.path.exists(os.path.join(out, "distributor.p12")) and not args.force:
        print(f"Certificates for {duid} already exist in {out} (use --force to recreate).")
        return
    certs.create_profile(duid, out)
    print(f"Certificates for TV {duid} saved to {out}")


def app_metadata_of(src):
    """Read the application ID and widget version before opening a TV connection."""
    path = Path(src)
    if path.is_dir():
        xml = (path / "config.xml").read_bytes()
    elif path.is_file() and path.suffix.lower() == ".wgt":
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("config.xml")
    else:
        raise ValueError(f"Not an app folder or .wgt file: {src}")
    root = ET.fromstring(xml)
    application = root.find("{http://tizen.org/ns/widgets}application")
    app_id = application.get("id", "") if application is not None else ""
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", app_id):
        raise ValueError("config.xml has no valid <tizen:application id=...>")
    return app_id, root.get("version")


def verify_install(app_id, version, output, applist):
    """Require the exact app and reject an old installation after an install error."""
    statuses = []
    for line in output.splitlines():
        # IDs and filenames can contain words such as "Error" without describing a failure.
        if re.fullmatch(rf"\s*install\s+{re.escape(app_id)}\s*", line):
            continue
        if re.fullmatch(r"\s*package_path\s+\S+\s*", line):
            continue
        statuses.append(re.sub(r"app_id\[[A-Za-z0-9_.-]+\]", "", line))
    if re.search(r"\b(?:fail(?:ed|ure)?|error|denied|cannot)\b|\bcan\s+not\b", "\n".join(statuses), re.I):
        raise ValueError("The TV reported an installation error. See its reply above.")
    installed = next((app for app in catalog.parse_applist(applist) if app["appid"] == app_id), None)
    if installed is None:
        raise ValueError(f"The TV does not list {app_id} as installed.")
    installed_version = installed.get("version")
    if version and installed_version:
        if installed_version != version:
            raise ValueError(f"The TV reports version {installed_version}; expected {version}.")
        print(f"\nInstalled: {app_id} (version {installed_version} verified)")
        return
    # Captured vd_appinstall reply from a Samsung Frame; progress alone is not confirmation.
    completed = re.search(rf"app_id\[{re.escape(app_id)}\]\s+install completed\b", output, re.I)
    if not completed:
        raise ValueError("The TV did not confirm installation; the installed version is unverified.")
    print(f"\nTV confirmed installation: {app_id}. Installed version is unverified.")


def cmd_install(args):
    from aerotizen import releases, signer

    if args.src != "launcher" and (args.release_version is not None or args.release_repo is not None):
        sys.exit("--version and --release-repo apply only to 'install launcher'.")
    try:
        with TemporaryDirectory(prefix="aerotizen-install-") as temporary:
            src = args.src
            if src == "launcher":
                downloaded = releases.download_launcher(
                    Path(temporary),
                    version=args.release_version,
                    repository=args.release_repo or releases.DEFAULT_REPOSITORY,
                )
                src = downloaded.path
                print(f"Downloaded launcher {downloaded.version}.")
            app_id, version = app_metadata_of(src)
            host = pick_tv(args)
            with require_sdb(host) as s:
                duid = s.duid()
                tool_path = s.capability().get("sdk_toolpath", "/home/owner/share/tmp/sdk_tools")
                cdir = cert_dir_for(duid)
                if not os.path.exists(os.path.join(cdir, "distributor.p12")):
                    sys.exit(f"No certificates for this TV yet. Run: aerotizen --tv {host} certs")
                signed = Path(temporary) / f"{app_id.split('.')[0]}-signed.wgt"
                signer.sign_wgt(src, signed, cdir)
                with open(os.path.join(cdir, "device-profile.xml"), "rb") as f:
                    s.push(f.read(), f"{tool_path}/device-profile.xml")
                output = s.install(app_id, signed.read_bytes(), tool_path)
                print(output.strip())
                verify_install(app_id, version, output, s.applist())
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError, KeyError, SdbError) as exc:
        sys.exit(f"Install failed: {exc}")


def cmd_uninstall(args):
    from aerotizen import releases

    app_id = releases.APP_ID if args.appid == "launcher" else args.appid
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", app_id):
        sys.exit("Expected 'launcher' or an application ID (letters, digits, _, . or -).")
    with require_sdb(pick_tv(args)) as s:
        installed = {a["appid"]: a for a in catalog.parse_applist(s.applist())}
        if app_id not in installed:
            sys.exit(f"{app_id} is not installed.")
        name = installed[app_id]["name"]
        launcher_package = installed[app_id]["pkgid"] == releases.PACKAGE_ID
        note = " Its settings on the TV are removed too." if launcher_package else ""
        if not args.yes and input(f"Uninstall {name} ({app_id})?{note} [y/N] ").strip().lower() != "y":
            return
        if launcher_package:
            from aerotizen import home

            try:
                status = home.read_status(s, None, {})
            except (OSError, SdbError, ValueError) as exc:
                sys.exit(f"Cannot verify native Home assignments; uninstall stopped: {exc}")
            if not status["complete"]:
                sys.exit("Cannot verify all native Home assignments; uninstall stopped.")
            values = [status["home"]["main_operation"], *status["home"]["settings"].values()]
            if any(
                item["type"] == "string" and item["value"].split(".", 1)[0] == releases.PACKAGE_ID
                for item in values
            ):
                sys.exit(
                    "AeroTizen is still assigned to native Home or startup. "
                    "Run 'aerotizen home restore --yes', fully restart the TV, then retry uninstall."
                )
        out = s.uninstall(app_id).strip()
        if app_id in {a["appid"] for a in catalog.parse_applist(s.applist())}:
            reason = next((ln for ln in out.splitlines() if "fail" in ln or "can not" in ln), out[-120:])
            sys.exit(f"{name} is still installed. TV said: {reason or '(nothing)'}")
        print(f"Uninstalled {name} ({app_id}).")


def cmd_key(args):
    with remote.Remote(pick_tv(args)) as r:
        r.key(args.key, args.times)


def wait_on_screen(host, app_id, seconds=12.0):
    """Poll the TV until app_id reports visible; returns the last status (None if unknown)."""
    deadline, status = time.monotonic() + seconds, None
    while True:
        status = remote.app_status(host, app_id) or status
        if (status and status.get("visible")) or time.monotonic() >= deadline:
            return status
        time.sleep(0.5)


def cmd_launch(args):
    host = pick_tv(args)
    accepted, reply = remote.rest_launch(host, args.appid)
    print(f"REST launch: {reply}")
    if not accepted:
        # Older firmware may only take launches over the remote channel.
        try:
            with remote.Remote(host) as r:
                answer = r.launch(args.appid)
            print(f"remote-channel launch: {'no reply' if answer is None else answer}")
            accepted = answer in (200, "200")  # TVs that reply send 200 on success, an error code otherwise
        except Exception as e:
            print(f"remote-channel launch failed: {e}")
    status = wait_on_screen(host, args.appid)
    if status is None:
        print(f"{args.appid}: the TV doesn't report this app's state. Check the screen.")
        if not accepted:
            sys.exit("The TV did not confirm the launch.")
        return
    print(f"{args.appid}: running={status.get('running')} visible={status.get('visible')}")
    if status.get("visible"):
        return
    if accepted and status.get("running"):
        # Some apps (YouTube, Prime Video) never report themselves on screen.
        print("The TV accepted the launch, but doesn't report the app as on screen. Check the screen.")
        return
    sys.exit(f"{args.appid} did not come to the screen.")


def cmd_inspect(args):
    from aerotizen import inspect_app, releases

    app_id = releases.APP_ID if args.appid == "launcher" else args.appid
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", app_id):
        sys.exit("Expected 'launcher' or an application ID (letters, digits, _, . or -).")
    if not 1 <= args.port <= 65535:
        sys.exit("--port must be between 1 and 65535.")
    try:
        inspect_app.run(pick_tv(args), app_id, args.port)
    except KeyboardInterrupt:
        print("\nInspector stopped.")
    except (OSError, SdbError) as exc:
        sys.exit(f"Inspect failed: {exc}")


def cmd_home_probe(args):
    from aerotizen import home_probe

    try:
        output = args.output.expanduser()
        if os.path.lexists(output):
            raise ValueError("Report already exists; choose another --output path.")
        if not output.parent.is_dir():
            raise ValueError("The report's parent folder must already exist.")
        host = pick_tv(args)
        with require_sdb(host) as session:
            report = home_probe.collect(session)
        home_probe.save_report(report, output)
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            print(f"Saved read-only Home probe: {output}")
            print("Review the report before sharing it. File presence does not prove Native Home support.")
    except (OSError, SdbError, ValueError) as error:
        sys.exit(f"Home probe failed: {error}")


def cmd_home(args):
    from aerotizen import home, home_control
    from aerotizen.root import SamsungTvRoot

    try:
        writing = args.home_command in ("apply", "restore")
        if writing and not args.yes:
            plan = home_control.preview(
                args.home_command,
                args.backup,
                boot=getattr(args, "boot", False),
            )
            if args.json:
                print(json.dumps(plan, indent=2))
            else:
                print(f"Home {args.home_command}: preview only. No TV connection or changes.")
                print(f"Target: {plan['target']}; watcher: {plan['watcher_after']}.")
                print(plan["startup"])
                print("Use --yes only when ready to change Home on the TV.")
            return
        provider = None
        if not writing and getattr(args, "root", False):
            executable = args.root_tool or shutil.which("samsung-tv-root")
            sdb = args.sdb or os.environ.get("SDB") or shutil.which("sdb")
            if not executable or not sdb:
                sys.exit("Pass --root-tool PATH and --sdb PATH, or put the verified tools on PATH.")
            provider = SamsungTvRoot(executable, sdb)
        if writing:
            home_control.load_helper()
        home.load_helper()
        host = pick_tv(args)
        with require_sdb(host) as session:
            info = home.device_info(session, host, backup=getattr(args, "backup", None), state_dir=STATE_DIR)
            if writing:
                status = home_control.change(
                    session,
                    info,
                    args.home_command,
                    backup=args.backup,
                    state_dir=STATE_DIR,
                    boot=getattr(args, "boot", False),
                )
            else:
                status = home.read_status(session, provider, info)
                if args.home_command == "backup":
                    status["backup"] = home.save_backup(status, output=args.output, state_dir=STATE_DIR)
        if args.json:
            print(json.dumps(status, indent=2))
        elif writing:
            print(f"Home {args.home_command} completed and read back.")
            print(f"Original backup: {status['backup']}")
            print(f"Transaction receipt: {status['receipt']}")
            print("Home-button behavior and boot behavior still need separate physical tests.")
        elif args.home_command == "backup":
            backup = status["backup"]
            print(f"{'Saved' if backup['created'] else 'Kept existing'} Home baseline: {backup['path']}")
            print(
                f"matches current={backup['matches_current']} firmware matches={backup['firmware_matches']}"
            )
        else:
            print(f"{status['device']['model']}  native Home mode={status['home']['mode']}")
            values = {"main operation": status["home"]["main_operation"], **status["home"]["settings"]}
            for key, item in values.items():
                value = item["value"] if item["status"] == "ok" else f"unavailable ({item['error']})"
                print(f"{key}: {value}")
            print(f"watcher: {status['watcher']['state']}")
            diagnostic = status["watcher"].get("error")
            if diagnostic:
                detail = diagnostic.get("socket_error") or diagnostic.get("http_status")
                suffix = f" ({detail})" if detail else ""
                print(f"service query: {diagnostic['code']}{suffix}: {diagnostic['message']}")
        if not writing and not status["complete"]:
            sys.exit("Some native Home values are unavailable; a complete backup cannot be made.")
    except (OSError, SdbError, ValueError, KeyError) as exc:
        sys.exit(f"Home {args.home_command} failed: {exc}")


def main():
    parser = argparse.ArgumentParser(
        prog="aerotizen", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--tv", help="TV IP address")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("discover").set_defaults(fn=cmd_discover)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("apps")
    p.add_argument("--all", action="store_true")
    p.add_argument("--raw", action="store_true")
    p.set_defaults(fn=cmd_apps)
    p = sub.add_parser("debloat")
    p.add_argument("--remove")
    p.add_argument("--yes", action="store_true")
    p.set_defaults(fn=cmd_debloat)
    p = sub.add_parser("certs")
    p.add_argument("--force", action="store_true")
    p.set_defaults(fn=cmd_certs)
    p = sub.add_parser("install")
    p.add_argument("src", help="'launcher' for a release, or a local app folder (./launcher) or .wgt file")
    p.add_argument("--version", dest="release_version", metavar="X.Y.Z", help="install this launcher version")
    p.add_argument(
        "--release-repo", metavar="OWNER/REPO", help="download launcher releases from this repository"
    )
    p.set_defaults(fn=cmd_install)
    p = sub.add_parser("uninstall", help="remove the launcher or another app you installed")
    p.add_argument("appid", help="'launcher' or an application ID")
    p.add_argument("--yes", action="store_true", help="don't ask for confirmation")
    p.set_defaults(fn=cmd_uninstall)
    p = sub.add_parser("key")
    p.add_argument("key")
    p.add_argument("times", nargs="?", type=int, default=1)
    p.set_defaults(fn=cmd_key)
    p = sub.add_parser("launch")
    p.add_argument("appid")
    p.set_defaults(fn=cmd_launch)
    p = sub.add_parser("inspect", help="restart an app with its web inspector")
    p.add_argument("appid", help="'launcher' or an application ID")
    p.add_argument("--port", type=int, default=9222, help="local inspector port (default: 9222)")
    p.set_defaults(fn=cmd_inspect)
    p = sub.add_parser("home", help="probe, inspect, back up, assign or restore native Home")
    commands = p.add_subparsers(dest="home_command", required=True)
    command = commands.add_parser("probe", help="read-only runtime inventory; does not require .NET")
    command.add_argument(
        "--output", type=Path, default=Path("home-probe.json"), help="new local report; never overwritten"
    )
    command.add_argument("--json", action="store_true", help="also print the report as JSON")
    command.set_defaults(fn=cmd_home_probe)
    for name in ("status", "backup", "apply", "restore"):
        command = commands.add_parser(name)
        if name in ("status", "backup"):
            command.add_argument(
                "--root", action="store_true", help="use temporary root instead of the default SDK user"
            )
            command.add_argument("--root-tool", type=Path, help="verified samsung-tv-root v0.0.12 executable")
            command.add_argument("--sdb", type=Path, help="Samsung SDB executable for --root")
        elif name in ("apply", "restore"):
            command.add_argument(
                "--yes", action="store_true", help="allow Home writes; default is an offline preview"
            )
            command.add_argument(
                "--backup", type=Path, help="original Home backup (default: this TV's immutable baseline)"
            )
        command.add_argument("--json", action="store_true", help="print machine-readable state")
        if name == "backup":
            command.add_argument(
                "--output", type=Path, help="new backup path; existing files are never replaced"
            )
        if name == "apply":
            command.add_argument("--boot", action="store_true", help="also enable native Smart Hub autostart")
        command.set_defaults(fn=cmd_home)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
