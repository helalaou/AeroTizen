# Physical HOME compatibility across Samsung firmware families

## Conclusion

The **method** is not specific to firmware `T-PTMCDEUC-0090-2220.4`. The S90C **binary/helper** is: its source deliberately rejects every other firmware, process architecture or SDK identity. The existence of multiple independent successful cases does **not** imply that the S90C binary or original-setting assumptions are portable.

The public Tizen app-control APIs cover launching applications, not replacing the consumer TV's physical HOME handler. The native reassignment uses **undocumented Samsung firmware interfaces**. The binary, recovery procedure and expectations about the startup keys must be validated for each target device.

## Independently reported successful HOME-key reassignment

| Reference | Device | Firmware | System | Evidence | Important difference |
| --- | --- | --- | --- | --- | --- |
| Our V992.56 | Samsung S90C QE65S90CATXZT | `T-PTMCDEUC-0090-2220.4` | Tizen 9.0, ARMv7 | Owner's 21 Oct 2026 native readback + physical tests | `auto_start=0`; changed **two** HOME assignments |
| [CleanFrame](https://github.com/nthnclrk/CleanFrame/blob/main/docs/agent-tv-setup-guide.md) | The Frame QA55LS03DAWXXY, LS03D | `T-PTMDUABC-0090-2130.0` | Tizen 9.0, ARMv7 | Independent reference documents physical HOME from Netflix | Frame Art Mode, startup and Samsung Home escape need independent validation |
| [arn0-tv](https://github.com/NelsonEU/arn0-tv/blob/main/docs/setup-tv.md) | Q70B QE65Q70BATXXC | `T-PTMDEUC-1720.7` | Tizen 6.5, ARMv7 | Independent reference documents physical HOME | **`auto_start=1`**, not our 0; reference code has different baseline restrictions |

Additional example: [Clean Home's 2024 helper](https://github.com/chaosmanage/samsung-tv-launcher/blob/main/docs/HOME-TAKEOVER.md) documents 2024 Samsung models with the same broad mechanism and a per-device original-state snapshot. It is not an official supported firmware list.

**Do not conclude that Tizen 6.5–9.0, every Samsung OLED, or an arbitrary firmware update is compatible.** Tizen 10.0/2026 models may also use different binaries/libraries (Samsung documents the move to GCC 14.2 for 2026).

## What can be reused

- The overall technique: resolve current main operation, inspect `db/appfw/home_appid`, verify the installed launcher identity, and use native setters only after prerequisites.
- A host-side read-only check of model and SDB capabilities.
- A change plan that touches only necessary settings and verifies the effect.
- Per-device baseline capture, explicit owner approval, tested rollback and physical TV acceptance tests.
- The launcher package/app ID and HomeWatcher hooks, with their device-specific behaviour checked separately.

## What must NOT be reused unchanged

- The S90C **firmware equality guard**, 32-bit native executable/runtime assumptions or SDB transport.
- Its six original setting values, notably `auto_start=0` and the native Samsung Home ID.
- A fixed `DclHome001.Home` target for unrelated forks with different app IDs.
- Frame boot/Art Mode behaviour or unverified automatic recovery.
- A copy of the user's private original-state snapshot or a pre-signed WGT.

## Safe expansion workflow

1. **Discover (read-only):** use `tools/native-home-compatibility/survey.py` to query the model, platform and architecture. It records an evidence category; it never stages an executable or authorizes a write.
2. **Investigate:** confirm exact firmware independently on the TV, ABI, native library and SDK-user eligibility. The same firmware family name is not sufficient.
3. **Query native values with separately reviewed code:** save an original, typed six-key baseline **privately**. A model's original `auto_start` is not transferable to another model.
4. **Design a firmware-specific write adapter and inverse restore** from that baseline. Do not weaken `S90CHomeBinding.cs` guards to accommodate an unknown TV.
5. **Validate recovery first:** demonstrate the native query and restore transport can operate safely on that model. An uploaded file or a successful build is insufficient.
6. **Request explicit approval for an individual device**, then perform the minimum required native assignment. Requery after each native setter.
7. **Test actual physical remote HOME** from Netflix and YouTube, native Live TV, Samsung Home, standby and (for Frame) Art Mode.
8. Add this firmware/model to the tested allowlist only after repeated successful physical-device tests and documented recovery.

## Read-only compatibility survey

From a developer checkout with AeroTizen's Python package available:

```sh
python tools/native-home-compatibility/survey.py --host <PRIVATE_TV_IPV4>
```

The local-network address is read from the command line; the survey does not save the address, connect to a third-party server, or invoke a native setter. It reads TV identification via the TV's local `/api/v2/` API and SDB's **capability service**. This is still device access: run it only against your own authorised TV. The output **always** contains `native_write_authorized: false` and `restore_validated: false`.

The JSON references are examples, not authorization profiles. An unlisted TV can still be investigated safely. An exact reported model plus Tizen version is not a firmware/ABI verification, and an exact firmware must not be assumed from a reference.

## Branch policy

This branch keeps the tested original S90C write source tightly guarded and adds only a generic read-only survey, compatibility references and tests. No universal automated remap or installer hook is introduced.

**Status:** Cross-firmware technique confirmed by independent reference work; multi-model physical HOME support **not yet validated for AeroTizen**. The S90C portable-code port passed offline build and tests, but no deployment from this branch has been attempted.
