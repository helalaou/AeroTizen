# Physical Samsung HOME key — optional native S90C integration

**Scope of the bundled *write helper*: Samsung QE65S90CATXZT with firmware T-PTMCDEUC-0090-2220.4.** The **underlying physical HOME reassignment method is not restricted to this firmware**: independent references show similar native routing on Tizen 6.5 and Tizen 9.0. See [cross-firmware compatibility research](native-home-compatibility.md). This remains an undocumented Samsung platform technique, **not** an official consumer Tizen API or universal installer.

## What V992.56 actually required

The TV-tested physical HOME behaviour has two independent components:

1. An **out-of-app native assignment** of `http://tizen.org/appcontrol/operation/main` and `db/appfw/home_appid` from Samsung Home (`com.samsung.tv.csfs`) to AeroTizen (`DclHome001.Home`). The user's 21 October 2026 activation log records both writes and matching read-back.
2. The **existing Tizen HomeWatcher service** and launcher-side `/leave`, `/home`, `/watch` coordination. This alone cannot override the physical remote's OS-level HOME destination, especially while Cobalt/YouTube reports `visible=false`.

The previously closed upstream PR #32 transferred only launcher-side native application handoffs. It did **not** implement component 1, and should not be reopened or described as a physical HOME remap.

## Source of truth

The reference is the original **Stage 6.1 HOME_NATIVE_COMPLETO** package and its separately preserved original-Samsung-state recovery bundle. The package contains `S90CHomeApply.cs`, `S90CHomeRecovery.cs`, and their offline status / apply / restore tools. Unlike the complete development package, this repository must **never commit** the original-state snapshot, compiled device DLLs, personal IPs, device identifiers, certificates, or log files.

The original activation changed **only two native Home assignments**, leaving these S90C settings at their observed original values:

| Setting | Original / preserved value |
| --- | --- |
| `main_operation` | `com.samsung.tv.csfs` → `DclHome001.Home` |
| `db/appfw/home_appid` | `com.samsung.tv.csfs` → `DclHome001.Home` |
| `db/appfw/startup_appid` | `org.tizen.tv-viewer` |
| `db/appfw/booting_appid_backup` | `org.tizen.tv-viewer` |
| `db/first_screen/type` | `com.samsung.tv.csfs` |
| `db/menu/smart_hub/ontvsetting/auto_start` | integer 0 |

## Proposed upstream behaviour

- **Do not perform native writes during install, update, first launch, CI, or boot.**
- Preserve the AeroTizen web app/package ID `DclHome001.Home`. If the owner already assigned HOME to that ID, a normal in-place update should not re-run the native activation.
- Require an explicit, isolated host-side workflow with separately reviewed `query`, `apply`, and `restore` phases.
- Fail closed unless exact model, full firmware, ARM32, SDK UID, native runtime, installed-app eligibility and the original readback match the tested reference.
- Preserve the owner-specific original snapshot outside the Git checkout, with SHA-256 verification and a separately tested recovery transport. An older backup does not prove current state.
- Verify both native assignments immediately after changing them, then physically test **HOME from Netflix and YouTube**, HOME from Live TV, Samsung Home escape, restart, and return from standby.
- Require specific device/firmware validation before extending to other Samsung models. The Tizen JavaScript launcher cannot change these OS assignments through public web APIs.

## Implementation state

This branch is **S90C-specific review work**, not yet a ready-to-merge universal installer. The actual original helper was recovered from the saved Stage 6.1 package; a generic model-safe apply/restore and the transport have not been validated on other devices. Never ask users to rerun `apply` when HOME already opens AeroTizen.

**No device was contacted or modified while preparing this contribution.**

### References

- [S90C/Frame native Home experimental setup and risks](https://github.com/nthnclrk/CleanFrame/blob/main/docs/agent-tv-setup-guide.md)
- [Tizen AppControl fundamentals](https://docs.tizen.org/application/native/guides/app-management/app-controls/)
