# Native boot and Frame Art Mode

Use the existing immutable Home backup. Other models and firmware can test after
[compatibility checks](home-pc-flow.md#compatibility-and-testing-on-another-tv).
The original boot results below cover the recorded Frame and firmware. A later
[contributor S90C report](home-s90c-tv-20261027.json) also passed native boot and
installed-app restore; its startup duration was not measured. Test Home and restore
before adding boot.

```sh
aerotizen home apply --boot                 # offline preview
aerotizen --tv TV_IP home apply --boot --yes
aerotizen --tv TV_IP home restore --yes
```

Apply requires the exact original state. Restore an existing native assignment
first before adding boot. Plain `home apply` still preserves the original startup
settings. `--boot` also enables Smart Hub autostart (`1`). It lets the TV derive
its startup and boot-backup IDs and preserves the saved first-screen preference.
It does not install a boot daemon or enable the watcher.

The boot request is saved in a private transaction receipt before the writer runs.
Restore permits changed autostart only when the current service transaction matches
that receipt, including its original backup bytes and checksum. If the application
registry confirms AeroTizen was uninstalled, the same restore command validates a
matching boot apply receipt on the PC instead. This recovery branch has local
test coverage; its physical TV test is pending. A missing or
unrelated receipt blocks that restore before any write. Preserve the whole private
device backup folder, not only `original-home.json`. Older Home control builds
cannot restore the new boot setting; use the boot-aware build or this checkout.

The native policy checks every write, disables the watcher before changes and
restores the complete original snapshot after an apply failure. Both the boot
enable and exact restore path were exercised on the TV before the power-cycle test.
Root is not used.

## Cold-boot result

A full power disconnect changed the kernel boot ID. AeroTizen opened automatically
without a Home press or a CLI app launch. Native Home, autostart and the derived
startup IDs survived. The service recovered its saved native transaction and made
zero polls, Art queries or launch calls after boot.

Startup was slow: the user first saw a black screen and then AeroTizen. The delay
was not timed. The metadata API and service were initially unavailable to the
first checks and became ready without intervention. This run proves automatic
launch, not a fast startup.

The saved standalone recovery CLI successfully queried the same device after
startup. See the [device evidence](home-native-boot-tv-20261024.json).
The user chose to leave native Home and boot enabled. Art Mode was left active;
the watcher remains disabled. The original Samsung settings backup is unchanged.

## Frame Art Mode result

With native boot enabled, the user confirmed that artwork stayed visible for
60 seconds. Seven read-only API samples over 60 seconds also reported Art Mode on.
The native-mode service added no polls, Art queries or launch calls.
The user repeated the 60-second Art Mode check after the cold boot and confirmed
the artwork stayed visible. Seven post-boot API samples also reported Art Mode on.

Art exit uses two Home presses on this TV: the first showed Samsung Home; the
second opened AeroTizen. All native Home/startup assignments remained correct.
This is a recorded navigation limit; the current implementation does not intercept
that first Art exit with a watcher.

## Device test procedure

1. Confirm Art Mode stays visible for at least 60 seconds with boot enabled.
2. Confirm Home returns from Art Mode to AeroTizen.
3. Record the kernel boot ID and native settings with `home status --json`.
4. Perform a full power cycle. Do not manually open AeroTizen after power-on.
5. Verify a new kernel boot ID, native assignments, autostart and persistent
   watcher suppression. Confirm the screen that appears automatically.
6. Repeat the Art Mode and return test after the cold boot.

The read-only query reports `boot.id` and `boot.uptime_seconds`. A warm wake with
the same boot ID is not cold-boot evidence. Queries stage and clean a bounded SDK
helper; they do not launch the UI. Screen checks remain separate from settings
readback and service counters.

Samsung's [Frame cold-boot guidance](https://www.samsungsvc.co.kr/solution/1014650)
specifies a power disconnect rather than the generic remote-hold method. Turn the
TV fully off, disconnect power for 60 seconds, reconnect and turn it on. A short
Power press is used separately to test Art Mode.

The configuration follows the published [Tizen 9 native startup experiment](https://github.com/splitcipher/couchroot/blob/83906b468836869933012da03a4018fb339462b3/docs/devices/s90d/README.md#startup-validation).
That source establishes a test approach, not compatibility proof for this Frame.

The later [startup and Art return investigation](home-startup-art-return.md)
records a first-screen override that was subsequently removed. Current applies
preserve Samsung's first-screen setting, as did the configuration above.
