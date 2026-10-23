"""aerotizen: clean up a Samsung Tizen TV from your computer.

  aerotizen discover            find TVs on your network
  aerotizen status              model, Developer Mode, sdb capabilities
  aerotizen apps                list installed packages, classified
  aerotizen debloat             pick packages to remove, then remove them
  aerotizen debloat --remove PKGID[,PKGID...] [--yes]
  aerotizen certs               sign in to Samsung, create signing certs for this TV
  aerotizen install PATH        sign + install an app folder or .wgt (e.g. launcher)
  aerotizen key KEY_VOLUP [n]   press a remote button
  aerotizen launch APPID        open an app and check that it came up

Add --tv IP to target a specific TV (otherwise the first one found is used).
"""

import argparse
import datetime
import json
import os
import sys
import time
from collections import OrderedDict

from aerotizen import catalog, discover, remote
from aerotizen.sdb import Sdb, SdbError

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
        return Sdb(host).connect()
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
    s = require_sdb(host)
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
        out = s.uninstall(pkgid).strip()
        after = s.applist()
        gone = pkgid not in packages(after)
        print(f"{'removed' if gone else 'STILL PRESENT'}  {pkgs[pkgid]['name']} ({pkgid})")
        if not gone:
            reason = next((ln for ln in out.splitlines() if "fail" in ln or "can not" in ln), out[-120:])
            print("   TV said:", reason or "(nothing)")
            refused.append(pkgs[pkgid]["name"])
        current = after
    print("snapshot:", snapshot(host, current))
    s.close()
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


def app_id_of(src):
    """Read <tizen:application id="..."> from a folder's or .wgt's config.xml."""
    import re
    import zipfile

    if os.path.isdir(src):
        with open(os.path.join(src, "config.xml"), encoding="utf-8") as f:
            xml = f.read()
    else:
        with zipfile.ZipFile(src) as z:
            xml = z.read("config.xml").decode("utf-8")
    m = re.search(r"<tizen:application[^>]*\bid=\"([^\"]+)\"", xml)
    if not m:
        sys.exit("config.xml has no <tizen:application id=...>")
    return m.group(1)


def cmd_install(args):
    from aerotizen import signer

    host = pick_tv(args)
    s = require_sdb(host)
    duid, tool_path = s.duid(), s.capability().get("sdk_toolpath", "/home/owner/share/tmp/sdk_tools")
    cdir = cert_dir_for(duid)
    if not os.path.exists(os.path.join(cdir, "distributor.p12")):
        sys.exit(f"No certificates for this TV yet. Run: aerotizen --tv {host} certs")
    app_id = app_id_of(args.src)
    signed = os.path.join(STATE_DIR, f"{app_id.split('.')[0]}-signed.wgt")
    signer.sign_wgt(args.src, signed, cdir)
    with open(os.path.join(cdir, "device-profile.xml"), "rb") as f:
        s.push(f.read(), f"{tool_path}/device-profile.xml")
    with open(signed, "rb") as f:
        out = s.install(app_id, f.read(), tool_path)
    print(out.strip())
    installed = app_id.split(".")[0] in s.applist()
    s.close()
    print(f"\n{'Installed' if installed else 'NOT installed'}: {app_id}")
    if not installed:
        sys.exit(1)


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


def main():
    parser = argparse.ArgumentParser(
        prog="aerotizen", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--tv", help="TV IP address")
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
    p.add_argument("src", help="app folder (with config.xml) or .wgt file")
    p.set_defaults(fn=cmd_install)
    p = sub.add_parser("key")
    p.add_argument("key")
    p.add_argument("times", nargs="?", type=int, default=1)
    p.set_defaults(fn=cmd_key)
    p = sub.add_parser("launch")
    p.add_argument("appid")
    p.set_defaults(fn=cmd_launch)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
