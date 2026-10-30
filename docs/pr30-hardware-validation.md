# PR #30: optional Glass hardware validation

Use the exact source commit and unsigned checksum in the PR's validated-test
comment. This focused PR does not include the optional Custom Clock #28, HDMI
recognition #29, locale #27 or USB artwork draft merely because they are tested
together elsewhere. Modern browser tests do not certify real Chromium 69.

## Prerequisites

- Record TV model, firmware, Tizen/engine and installed CLI/launcher versions.
- Keep a known-working reinstallable local WGT and its SHA-256. Confirm that its
  package version can be reinstalled after the candidate; prefer the same
  version. Do not depend on an unverified downgrade or uninstall as recovery.
- Reuse the existing author/distributor signing profile already accepted by the
  TV. Never publish certificates, device profiles, passwords or private backups.
- Record favourites/order, appearance, columns, clock/weather and source labels.
  A WGT is not a backup of private settings. Preserve existing backup files.
- Save `aerotizen --tv <TV_IP> status` and, only where already supported,
  `aerotizen --tv <TV_IP> home status --json` before/after updating. Native-helper
  limitations on older TVs (#75/#84) are separate; do not enable root or remap HOME
  to run this UI test. Postpone if a safe reinstall/working connection is missing.

## Build the exact source on the PC

Set PR30_COMMIT to the full SHA accompanying green CI in the PR comment.

```sh
git clone --branch feat/launcher-unified-glass-interface https://github.com/motorgrid-ita/AeroTizen.git aerotizen-pr30
cd aerotizen-pr30
git checkout --detach "$PR30_COMMIT"
npm ci --no-audit --no-fund
npm run lint
npm run build
npm test
```

No Node/build tooling is installed on the TV. Install the compiled output, not
the legacy source renderer.

The normal upstream packager contains its inherited js/logos.js. This PR adds
no reference brand images, but inherited availability does not establish
redistribution permission. Reuse only the reviewed packager from the existing
artwork draft at its pinned commit below; no USB runtime is included. It keeps
Samsung-local lookup, plain-name fallback, weather JPEGs and their provenance,
while omitting the unreviewed legacy logo-path script.

```sh
git fetch origin feat/hd-artwork-system
python - <<'PY'
import importlib.util
import subprocess
import tempfile
from pathlib import Path

helper_commit = '042a3202109cc46ff8f21cd0d5d52d808f832c08'
source = subprocess.check_output(['git', 'show', helper_commit + ':tools/build_release.py'])
with tempfile.TemporaryDirectory(prefix='pr30-package-') as temporary:
    helper = Path(temporary) / 'build_release.py'
    helper.write_bytes(source)
    spec = importlib.util.spec_from_file_location('reviewed_release', helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    package = module.build_launcher(Path.cwd(), Path.cwd() / 'dist/pr30-reviewed', reviewed_artwork=True)
    print(package)
    print(module.checksum(package))
PY
```

Compare the unsigned SHA-256 with the validated PR comment; signing changes it.
Keep launcher-release.json and SHA256SUMS. The helper validates the compiled
manifest against this checkout. It changes packaging, not native launch policy.

## Optional tester-operated update

Only after prerequisite/build checks, use the existing working CLI and profile:

```sh
aerotizen --tv <TV_IP> install ./dist/pr30-reviewed/aerotizen-launcher-2.5.0.wgt
aerotizen --tv <TV_IP> launch DclHome001.Home
```

The local WGT is re-signed with the existing profile and updated in place.
Do not use `install launcher`, which downloads a different release. Do not run
uninstall, clear-data, home apply/restore, --boot, root or firmware commands.
Compare the saved HOME/startup values; stop if they differ or install/launch
cannot be verified.

## Physical checklist

1. Repeated Settings first-open/reopen/close, Classic and Glass. Note physical
   D-pad latency, stutter or delayed key handling rather than inferring timing.
2. All categories: Right/OK opens, Back/Left at the content edge returns to
   categories, another Back closes. Reach the last control of long lists.
3. Focus on choices, text and sliders: no double borders, invisible focus,
   clipping/overlap. Text/IME and adjustment keep navigation priority.
4. Appearance switch/reopen preserves category, focus and preferences; Home/All
   Apps tabs and Samsung Home access remain available.
5. Home/All Apps short/held OK, app actions, move/drop, rapid input and Settings
   return: no accidental launch, lost focus or duplicate handler.
6. Square/Rectangle, 3/4/5 columns, Follow card size: Big/Small only in automatic
   mode; Settings app pickers stay standard square icons with native artwork.
7. Active HDMI, available standby devices, empty ports, Hide disconnected and a
   long custom label. A label/pin never proves a live signal. Recognition from
   #29 is separate; do not attribute it to this focused #30 build.
8. HDMI source switching, Live TV/channel changes, existing HOME/Back returns,
   YouTube/Prime and Samsung Home escape. Keep existing HOME configuration.
9. Continue Watching, weather backgrounds and existing clock preferences.
   Custom Clock #28 and USB imports are outside this focused PR.
10. Tester-controlled standby/reboot and persistence. Check autostart against
    existing configuration; do not enable it for this test.

Report PASS/FAIL/NOT TESTED, exact SHA, model/firmware/engine, responsiveness and
useful screenshots/video. Physical 2020-TV performance/compatibility is pending.

## Recovery

First try Back/close and a manual launcher reopen. If necessary, reinstall the
known-working local package in place with the same CLI/signing identity, launch
DclHome001.Home and compare bindings. This restores program files, not a snapshot
of private settings. If unreachable or the package/version/profile is refused,
stop and report; never uninstall or remap HOME as a workaround.

## Compatibility correction

Explicit top/right/bottom/left replace inset for the overlay. Regression tests
check authored longhands, full-screen bounds, final source-category focus and
Back at 1280x720 and 1920x1080 in both appearances.
[Samsung engine table](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html);
[Google Chromium 87 shorthand announcement](https://web.dev/articles/logical-property-shorthands).
