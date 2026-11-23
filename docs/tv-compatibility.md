# TV compatibility

The table lists results for the TV, firmware and AeroTizen versions tested. Use
the full model code from your TV to find a match. For current setup steps, see
[Native Home setup](home-pc-flow.md#native-home-setup).

**✅ Works** · **❌ Failed** · **— Unknown** (results are missing or unclear)

The [Native Home and Watcher](home-pc-flow.md) columns cover setup and Home
button return in each mode. Startup from standby uses the remote with power
still connected. Cold boot starts after the TV or One Connect box has been
unplugged. Startup results apply to the setup in the linked report.

| TV | Year | Tizen | Launcher opens | Native Home | Watcher | Startup from standby | Cold boot | Notes |
| --- | --- | --- | :---: | :---: | :---: | :---: | :---: | --- |
| Samsung 55" Crystal UHD U8000H (UA55U8000HKXXM) | 2026 | Tizen 10.0 | ✅ | — | ❌ | — | — | Watcher did not return from Samsung Home on launcher 3.3.2 ([#319](https://github.com/helalaou/AeroTizen/issues/319)). |
| Samsung 55" Crystal UHD U8000F (UE55U8000FKXXU) | 2026 | Tizen 9.0 | — | — | — | — | — | — |
| Samsung 75" QLED Q7F (QE75Q7FAAUXXH) | 2025 | Tizen 9.0 | — | — | — | — | — | — |
| Samsung 55" Crystal UHD U8092F (UE55U8092FUXXH) | 2025 | Tizen 9.0 | ✅ | ❌ | — | — | — | Native Home setup rolled back in the original test ([#69](https://github.com/helalaou/AeroTizen/issues/69)). |
| Samsung 55" OLED S95F (TQ55S95FATXXC) | 2025 | Tizen 9.0 | ✅ | ✅ | — | — | ✅ | Tested with CLI 2.6.0 ([#159](https://github.com/helalaou/AeroTizen/issues/159)). |
| Samsung 75" QLED Q70D (QA75Q70DAUXZN) | 2024 | Tizen 9.0 | ✅ | ✅ | ✅ | — | ✅ | Tested with CLI 2.6.0. Watcher return failed from YouTube and Prime Video ([#162](https://github.com/helalaou/AeroTizen/issues/162)). |
| Samsung 65" Crystal UHD DU7200 (UN65DU7200FXZA) | 2024 | Tizen 9.0 | — | — | — | — | — | — |
| Samsung 85" Crystal UHD DU7179 (GU85DU7179UXZG) | 2024 | Tizen 8.0 | ✅ | ✅ | — | — | — | Startup worked, with the power method unclear. Steam Link on HDMI showed a black screen on launcher 2.5.0 ([#103](https://github.com/helalaou/AeroTizen/issues/103)). |
| Samsung 65" The Frame LS03D (QE65LS03DAUXXU) | 2024 | Tizen 9.0 | ✅ | ✅ | ✅ | — | ✅ | [Frame tests](home-pc-flow.md#compatibility-and-testing-on-another-tv). Cold boot passed with Native Home and startup enabled. |
| Samsung 98" Neo QLED 8K QN990C (QA98QN990CUXZN) | 2023 | Unknown | — | — | — | — | — | — |
| Samsung 70" Crystal UHD CU7000 (UN70CU7000DXZA) | 2023 | Tizen 9.0 | — | — | — | — | — | — |
| Samsung 65" Crystal UHD CU7000 (UN65CU7000DXZA) | 2023 | Tizen 9.0 | ✅ | ✅ | ❌ | — | — | Watcher failed on launcher 2.4.0 soon after install. A restart before the test was unconfirmed ([#82](https://github.com/helalaou/AeroTizen/issues/82)). |
| Samsung 65" Crystal UHD CU7172 (UE65CU7172UXXH) | 2023 | Tizen 9.0 | ✅ | ✅ | — | — | — | — |
| Samsung 75" Crystal UHD CU7650 (UA75CU7650KXXL) | 2023 | Tizen 9.0 | ✅ | ❌ | ✅ | — | — | Native Home backup and root setup failed on CLI 3.0.1 and launcher 3.1.0. SDB recovered after a power cycle ([#270](https://github.com/helalaou/AeroTizen/issues/270)). |
| Samsung 65" OLED S90C (QE65S90CATXZT) | 2023 | Tizen 7.0 / 9.0 | ✅ | ✅ | — | — | ✅ | [Native Home, startup and restore tested on Tizen 9](home-s90c-tv-20261027.json). |
| Samsung 55" OLED S90C (TQ55S90CATXXC) | 2023 | Tizen 9.0 | ✅ | ✅ | — | ✅ | — | Tested with CLI and launcher 2.6.0 ([#118](https://github.com/helalaou/AeroTizen/issues/118)). |
| Samsung 55" BU8000 (UE55BU8000KXXC) | 2022 | Tizen 6.5 | ✅ | ✅ | — | — | ✅ | Home return varied by HDMI device in the test ([#192](https://github.com/helalaou/AeroTizen/issues/192)). |
| Samsung 75" QLED Q60B (QE75Q60BAUXXC) | 2022 | Tizen 6.5 | — | — | — | — | — | — |
| Samsung 55" QLED Q60B (QE55Q60BAUXZT) | 2022 | Tizen 6.5 | ✅ | ✅ | — | — | ✅ | Tested with CLI and launcher 2.6.0 ([#115](https://github.com/helalaou/AeroTizen/issues/115)). |
| Samsung 50" QLED Q60B (QE50Q60BAUXXC) | 2022 | Tizen 6.5 | ✅ | ✅ | — | ✅ | ✅ | Startup tested with Native Home. Home did nothing during HDMI playback with Samsung viewer on launcher 3.1.0 ([#259](https://github.com/helalaou/AeroTizen/issues/259)). |
| Samsung 55" OLED S95B (QE55S95BATXXC) | 2022 | Tizen 6.5 | ✅ | — | ✅ | ✅ | ❌ | With Watcher, cold boot opened Samsung Home. AeroTizen sometimes opened later ([#31](https://github.com/helalaou/AeroTizen/issues/31), [#47](https://github.com/helalaou/AeroTizen/issues/47)). |
| Samsung 55" QLED Q80B (QE55Q80BATXXC) | 2022 | Unknown | ✅ | — | ✅ | — | — | Watcher returned from Samsung Home. Native Home still needs a TV retest after the setup fix ([#76](https://github.com/helalaou/AeroTizen/issues/76)). |
| Samsung 50" The Serif LS01B (QE50LS01BAUXXH) | 2022 | Tizen 6.5 | ✅ | ✅ | — | — | — | — |
| Samsung 65" The Frame LS03A (QN65LS03AAFXZC) | 2021 | Tizen 6.0 | ✅ | — | ❌ | — | — | [#52](https://github.com/helalaou/AeroTizen/issues/52) |
| Samsung 65" Crystal UHD AU7172 (UE65AU7172UXXH) | 2021 | Tizen 6.0 | ✅ | — | — | — | — | Home return failed and startup worked. The Home mode and power method are unclear ([#63](https://github.com/helalaou/AeroTizen/issues/63)). |
| Samsung 75" Crystal UHD AU8000 (UN75AU8000FXZA) | 2021 | Tizen 6.0 | ✅ | ❌ | ✅ | — | — | Native Home backup failed. Power-on reopened AeroTizen with Autorun Last App on. The power method is unclear ([#65](https://github.com/helalaou/AeroTizen/issues/65#issuecomment-7085833155)). |
| Samsung 43" Crystal UHD AU8000 (UN43AU8000FXZC) | 2021 | Tizen 6.0 | ✅ | — | ❌ | — | ❌ | Watcher return failed from YouTube, Disney+ and Netflix ([#61](https://github.com/helalaou/AeroTizen/issues/61)). |
| Samsung 82" Crystal UHD TU8070 (UE82TU8070UXZT) | 2020 | Tizen 5.5 | ✅ | — | — | — | — | Manual IP worked ([#124](https://github.com/helalaou/AeroTizen/issues/124)). |
| Samsung 70" Crystal UHD TU700D (UN70TU700DBXZA) | 2020 | Tizen 5.5 | ✅ | ❌ | ❌ | — | ❌ | Warm and cold boots returned to the last selected input ([#122](https://github.com/helalaou/AeroTizen/issues/122#issuecomment-6649571277)). |
| Samsung 65" Crystal UHD TU7179 (GU65TU7179UXZG) | 2020 | Tizen 5.5 | ✅ | ❌ | — | — | — | Native Home setup was blocked when the helper failed to start ([#84](https://github.com/helalaou/AeroTizen/issues/84)). |
| Samsung 32" The Frame LS03T (QE32LS03TCUXZT) | 2020 | Tizen 5.5 | ✅ | ❌ | — | — | — | Native Home query failed ([#75](https://github.com/helalaou/AeroTizen/issues/75)). |
| Samsung 65" UHD RU8000 (UE65RU8000UXZT) | 2019 | Tizen 5.0 | ✅ | — | — | — | — | Manual IP worked ([#123](https://github.com/helalaou/AeroTizen/issues/123)). |
| Samsung 43" UHD NU7470 (UA43NU7470) | 2018 | Tizen 4.0 | ❌ | — | — | — | — | Installation and power-on start worked. Syntax errors stopped the launcher UI and diagnostics ([#264](https://github.com/helalaou/AeroTizen/issues/264)). |

[Report a TV model](https://github.com/helalaou/AeroTizen/issues/new?template=model_report.yml).
Include the full model code, firmware, CLI and launcher versions. Select an outcome
for each check and list the apps or inputs you used to test the Home button.

## Third-party reports

- Native Home worked on Samsung QN65Q7FDAFXZA (Tizen 9.0.0, firmware
  `T-RSLFAKUC-0090-REL-202608061938`) with a modified Calm Home build
  ([#316](https://github.com/helalaou/AeroTizen/issues/316)).

## TV limits

- Samsung's **Autorun Samsung TV Plus** and **Autorun Last App** options can open
  another app first. See [Samsung settings](settings.md) to find these options.
- On Tizen 6 and newer, use **Apps → Settings** on the TV to delete store and
  preinstalled apps where Samsung permits it. System apps such as TV Plus and
  Gaming Hub can only be disabled.
- The TV draws app interfaces at 1920 × 1080 and upscales them on 4K panels. Video
  can play at 4K.
- Samsung controls its own menus. See [Samsung settings](settings.md) and
  [DNS blocklists](../dns/) for options to reduce ads and tracking.
