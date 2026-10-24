# Native physical HOME — S90C reference source (opt-in)

This folder contains **source code only** for the S90C-specific native HOME binding recovered from the user's original, working V992.56/Stage 6.1 workflow and adapted for review. **It is not a universal installer or proof of compatibility on other Samsung TVs.**

## Why this exists

On the tested Samsung S90C, physical remote HOME was assigned to `DclHome001.Home` by **two native system settings**, independently of the HomeWatcher JavaScript service. See [the technical explanation](../../docs/physical-home-s90c.md).

## Scope and gates

- Only `QE65S90CATXZT` **after the host independently confirms that exact model**, `T-PTMCDEUC-0090-2220.4`, ARM32 and SDK UID 901.
- The helper refuses to run on other **firmware** or incorrect architecture/UID; **it cannot independently prove the TV model**, so a separate read-only host-side model and capability check is mandatory before any staging. Do not use source-only metadata as device validation.
- `query` reads six reference settings, then stops.
- `apply CONFIRM_S90C_HOME` switches exactly `main_operation` and `db/appfw/home_appid` from stock Samsung Home to `DclHome001.Home`, only if the observed state matches the approved original reference and AeroTizen is boot-eligible.
- `restore CONFIRM_SAMSUNG_RESTORE` attempts to return only those two keys to the original Samsung Home values, and refuses unknown/altered states. A separate private recovery helper is required for derived startup/boot state changes.
- No `startup_appid`, `booting_appid_backup`, first-screen, auto-start, system database or firmware writes are in this source.

**Do not run `apply` just because you installed or upgraded AeroTizen.** If HOME already opens AeroTizen, the existing native mapping may remain valid after an in-place update with the same package ID.

## Build and transport

The native helper was previously built and verified only on the owner's Samsung S90C using a firmware-specific .NET 6 runtime and an undocumented Developer Mode transport. **The compiled device DLL, private original-state snapshot, install credentials, network address and the execution transport are intentionally NOT included.** Merely building this project does not install, activate or change the TV.

```sh
dotnet build tools/native-home-s90c/S90CHomeBinding.csproj -c Release
```

This command only compiles source on a developer machine. It is not an apply step. A maintainer must review the C# declarations and compare the build with the separately validated original native helper, then validate their own model, firmware, device, and exact-value rollback before providing any end-user execution instructions.

The Tizen/firmware-specific execution transport and rollback have **not** been revalidated as part of this upstream port; do not package this into an automatic updater.

## Acceptance before upstream distribution

1. Confirm the installed AeroTizen application ID and Tizen application boot eligibility.
2. Run non-invasive model/firmware/capability discovery on the actual test TV; never infer eligibility from a product name alone.
3. Capture the owner's private original typed values; do not commit them.
4. Verify recovery on that firmware **before** any write and obtain separate explicit device-owner authorisation.
5. After an explicitly authorised apply, query/read-back both keys and test the **physical remote HOME** from Netflix, YouTube, native Live TV, and Samsung Home.
6. Retest after firmware updates, on any new model and with Frame Art Mode enabled; do not assume S90C behaviour transfers.

This contribution is for maintainer review of the actual physical HOME mechanism. It does **not** claim this source was executed or verified on another TV.
