# TV compatibility

These are results for individual TVs and firmware. A result for one TV does not
establish support for the whole model range. **Unknown** means the report does
not establish that result. Use the full model code from your TV to find a match.

| TV | Year | Tizen | Launcher opens | Home return | Cold boot | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Samsung 55" Crystal UHD U8000F (UE55U8000FKXXU) | 2026 | Tizen 9.0 | Unknown | Unknown | Unknown | — |
| Samsung 75" QLED Q7F (QE75Q7FAAUXXH) | 2025 | Tizen 9.0 | Unknown | Unknown | Unknown | — |
| Samsung 55" Crystal UHD U8092F (UE55U8092FUXXH) | 2025 | Tizen 9.0 | Unknown | Native apply failed | Unknown | Native Home apply fails ([#69](https://github.com/helalaou/AeroTizen/issues/69)) |
| Samsung 55" OLED S95F (TQ55S95FATXXC) | 2025 | Tizen 9.0 | Yes | Native with boot | Yes | With CLI 2.6.0, `--boot` worked and Home-only rolled back ([#159](https://github.com/helalaou/AeroTizen/issues/159)). |
| Samsung 75" QLED Q70D (QA75Q70DAUXZN) | 2024 | Tizen 9.0 | Yes | Native with boot | Yes | With CLI 2.6.0, `--boot` worked and Home-only rolled back ([#162](https://github.com/helalaou/AeroTizen/issues/162)). |
| Samsung 65" Crystal UHD DU7200 (UN65DU7200FXZA) | 2024 | Tizen 9.0 | Unknown | Unknown | Unknown | — |
| Samsung 85" Crystal UHD DU7179 (GU85DU7179UXZG) | 2024 | Tizen 8.0 | Yes | Native | Yes | Native Home and boot work; Steam Link on HDMI shows black ([#103](https://github.com/helalaou/AeroTizen/issues/103)) |
| Samsung 65" The Frame LS03D (QE65LS03DAUXXU) | 2024 | Tizen 9.0 | Yes | Watcher and Native | Native with boot | [Frame tests](home-pc-flow.md#compatibility-and-testing-on-another-tv). Watcher cold boot is unverified. |
| Samsung 98" Neo QLED 8K QN990C (QA98QN990CUXZN) | 2023 | Unknown | Unknown | Unknown | Unknown | — |
| Samsung 70" Crystal UHD CU7000 (UN70CU7000DXZA) | 2023 | Tizen 9.0 | Unknown | Unknown | Unknown | — |
| Samsung 65" Crystal UHD CU7000 (UN65CU7000DXZA) | 2023 | Tizen 9.0 | Yes | Native | Unknown | Native Home works; Add apps fix in [#81](https://github.com/helalaou/AeroTizen/pull/81) |
| Samsung 65" Crystal UHD CU7172 (UE65CU7172UXXH) | 2023 | Tizen 9.0 | Yes | Native | Unknown | Native Home works |
| Samsung 65" OLED S90C (QE65S90CATXZT) | 2023 | Tizen 7.0 / 9.0 | Yes | Native | Yes | [Native Home, startup and restore tested on Tizen 9](home-s90c-tv-20261027.json). |
| Samsung 55" OLED S90C (TQ55S90CATXXC) | 2023 | Tizen 9.0 | Yes | Native | Unknown | Startup from standby passed ([#118](https://github.com/helalaou/AeroTizen/issues/118)). |
| Samsung 75" QLED Q60B (QE75Q60BAUXXC) | 2022 | Tizen 6.5 | Unknown | Unknown | Unknown | — |
| Samsung 55" QLED Q60B (QE55Q60BAUXZT) | 2022 | Tizen 6.5 | Yes | Native | Yes | Native Home and cold boot work ([#115](https://github.com/helalaou/AeroTizen/issues/115)) |
| Samsung 55" OLED S95B (QE55S95BATXXC) | 2022 | Tizen 6.5 | Unknown | Unknown | Issue reported | Cold boot issue ([#47](https://github.com/helalaou/AeroTizen/issues/47)) |
| Samsung 55" QLED Q80B (QE55Q80BATXXC) | 2022 | Unknown | Yes | Watcher | Unknown | Watcher works; native Home apply fixed in [#79](https://github.com/helalaou/AeroTizen/pull/79) |
| Samsung 50" The Serif LS01B (QE50LS01BAUXXH) | 2022 | Tizen 6.5 | Yes | Native | Unknown | Native Home works |
| Samsung 65" The Frame LS03A (QN65LS03AAFXZC) | 2021 | Unknown | Yes | Return failed | Unknown | Runs; Home doesn't return yet ([#65](https://github.com/helalaou/AeroTizen/issues/65)) |
| Samsung 65" Crystal UHD AU7172 (UE65AU7172UXXH) | 2021 | Tizen 6.0 | Yes | Return failed | Unknown | Home doesn't return yet ([#65](https://github.com/helalaou/AeroTizen/issues/65)) |
| Samsung 43" Crystal UHD AU8000 (UN43AU8000FXZC) | 2021 | Unknown | Yes | Return failed | Failed | Runs; Home and power-on don't work yet ([#65](https://github.com/helalaou/AeroTizen/issues/65)) |
| Samsung 82" Crystal UHD TU8070 (UE82TU8070UXZT) | 2020 | Tizen 5.5 | Yes | Unknown | Unknown | Runs; manual IP worked ([#124](https://github.com/helalaou/AeroTizen/issues/124)) |
| Samsung 70" Crystal UHD TU700D (UN70TU700DBXZA) | 2020 | Tizen 5.5 | Yes | Watcher and Native failed | Failed | Runs; watcher and native Home fail; auto-start fails on warm and cold boots ([#122](https://github.com/helalaou/AeroTizen/issues/122#issuecomment-6649571277)) |
| Samsung 65" Crystal UHD TU7179 (GU65TU7179UXZG) | 2020 | Tizen 5.5 | Yes | Native preflight failed | Unknown | TV lacks the runtime for the Native Home helper ([#84](https://github.com/helalaou/AeroTizen/issues/84)). |
| Samsung 32" The Frame LS03T (QE32LS03TCUXZT) | 2020 | Tizen 5.5 | Yes | Native failed | Unknown | Runs; native Home doesn't work yet ([#75](https://github.com/helalaou/AeroTizen/issues/75)) |
| Samsung 65" UHD RU8000 (UE65RU8000UXZT) | 2019 | Tizen 5.0 | Yes | Unknown | Unknown | Runs; manual IP worked ([#123](https://github.com/helalaou/AeroTizen/issues/123)) |

[Report a TV model](https://github.com/helalaou/AeroTizen/issues/new?template=model_report.yml).
Include the full model code, firmware, CLI and launcher versions, and what happened
when you opened AeroTizen, pressed Home, and started the TV from disconnected power.
Say which [Home option](home-pc-flow.md) you used.

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
