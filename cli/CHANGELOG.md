# Changelog

## [3.0.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.6.0...cli-v3.0.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* **cli:** configure Home and startup with one command ([#147](https://github.com/helalaou/AeroTizen/issues/147))

### Features

* add Stremio Continue Watching on rooted TVs ([#141](https://github.com/helalaou/AeroTizen/issues/141)) ([0d188b7](https://github.com/helalaou/AeroTizen/commit/0d188b782b3ee1e2478ca7da07f75ed701548316))
* distinguish TV dev builds and the root helper ([#155](https://github.com/helalaou/AeroTizen/issues/155)) ([4ab3560](https://github.com/helalaou/AeroTizen/commit/4ab356039a55a4c51c967364be3d430df10e419c))
* **launcher:** note that the language setting only changes AeroTizen ([#156](https://github.com/helalaou/AeroTizen/issues/156)) ([1e0a5aa](https://github.com/helalaou/AeroTizen/commit/1e0a5aa2f1e42201fc9fc92999355296031a65c6))


### Bug Fixes

* **cli:** configure Home and startup with one command ([#147](https://github.com/helalaou/AeroTizen/issues/147)) ([d3d6d13](https://github.com/helalaou/AeroTizen/commit/d3d6d1394e325f244a9869fc24e4c5219959ee40))
* **cli:** recover Native Home automatic startup ([#181](https://github.com/helalaou/AeroTizen/issues/181)) ([df0c3a5](https://github.com/helalaou/AeroTizen/commit/df0c3a54a7f58179e53e2429a1b9dc37061e2620))
* **release:** isolate CLI package and preserve root installs ([#98](https://github.com/helalaou/AeroTizen/issues/98)) ([bd4e5dc](https://github.com/helalaou/AeroTizen/commit/bd4e5dc589254560060507df186d22d824772894))

## [2.6.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.5.0...cli-v2.6.0) (2026-11-03)


### Features

* **cli:** add launcher and standalone CLI updates ([#92](https://github.com/helalaou/AeroTizen/issues/92)) ([a26dfae](https://github.com/helalaou/AeroTizen/commit/a26dfaed51c3a693e0069904da75dc398af3a63d))
* **cli:** add read-only Home runtime probe ([#95](https://github.com/helalaou/AeroTizen/issues/95)) ([c731ac5](https://github.com/helalaou/AeroTizen/commit/c731ac59bc928d08a32de8e4edc0e992379c7220))
* **cli:** add untethered root setup and authenticated TV access ([#85](https://github.com/helalaou/AeroTizen/issues/85)) ([c282d25](https://github.com/helalaou/AeroTizen/commit/c282d2516c4f174810f87bf67adb127547d42b38))
* **diagnostics:** add CLI and TV diagnostic reports ([#78](https://github.com/helalaou/AeroTizen/issues/78)) ([5ce548b](https://github.com/helalaou/AeroTizen/commit/5ce548b3acec07a54d8c38ea38503d5d13e0dde7))


### Bug Fixes

* **cli:** assign startup IDs during native boot setup ([#100](https://github.com/helalaou/AeroTizen/issues/100)) ([56292a1](https://github.com/helalaou/AeroTizen/commit/56292a1e34851303801cfa3740814e20b917efda))
* **cli:** check TV runtime before native Home helpers ([#94](https://github.com/helalaou/AeroTizen/issues/94)) ([d577046](https://github.com/helalaou/AeroTizen/commit/d577046d969e094cf90eb9bdcf88178febcfda0d))
* **release:** exclude documentation from CLI release detection ([#97](https://github.com/helalaou/AeroTizen/issues/97)) ([a07be4b](https://github.com/helalaou/AeroTizen/commit/a07be4bd6e3163e2d5d54f52a63232a4983980ec))


### Documentation

* add the DU7179 and The Serif to the tested TVs ([#104](https://github.com/helalaou/AeroTizen/issues/104)) ([79ba919](https://github.com/helalaou/AeroTizen/commit/79ba9198d63002fbfa5ad620a6abfedebd33cdc5))
* add the QN990C to the tested TVs ([#111](https://github.com/helalaou/AeroTizen/issues/111)) ([6c7a185](https://github.com/helalaou/AeroTizen/commit/6c7a1851bfa2f21fafad0fed1ddfbed1a0b225c3))
* add the U8000F to the tested TVs ([#89](https://github.com/helalaou/AeroTizen/issues/89)) ([6457422](https://github.com/helalaou/AeroTizen/commit/64574228cee973095af590cd9ff387467e84d3b7))
* ask for screenshots on UI pull requests ([#96](https://github.com/helalaou/AeroTizen/issues/96)) ([62d616f](https://github.com/helalaou/AeroTizen/commit/62d616f1fed54b6c9192703551acc06c748ca595))
* update contributors ([#109](https://github.com/helalaou/AeroTizen/issues/109)) ([24e1451](https://github.com/helalaou/AeroTizen/commit/24e14519bc527df31e14583ab1cd4ede4e74845d))

## [2.5.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.4.0...cli-v2.5.0) (2026-10-29)


### Features

* **launcher:** add opt-in Continue Watching ([#62](https://github.com/helalaou/AeroTizen/issues/62)) ([5314580](https://github.com/helalaou/AeroTizen/commit/5314580d943cc91a25ff41da287fbbd0646f4f00))
* **launcher:** add optional dynamic weather wallpapers ([#35](https://github.com/helalaou/AeroTizen/issues/35)) ([c4b649b](https://github.com/helalaou/AeroTizen/commit/c4b649b4fa22a43e19842f0f6d52acdfa69cc1d3))


### Bug Fixes

* **cli:** allow launcher boot backup changes during Home apply ([#79](https://github.com/helalaou/AeroTizen/issues/79)) ([66ef53c](https://github.com/helalaou/AeroTizen/commit/66ef53c5298df353c43efcabf57fe3c23a6ec564))
* **release:** include local weather wallpapers and provenance in WGT ([#74](https://github.com/helalaou/AeroTizen/issues/74)) ([d4ea6d2](https://github.com/helalaou/AeroTizen/commit/d4ea6d27357cc68fc22f7bfe77cb24285e6d3527))
* **weather:** refresh cached forecasts missing current solar data ([#72](https://github.com/helalaou/AeroTizen/issues/72)) ([47a5911](https://github.com/helalaou/AeroTizen/commit/47a5911b15a785eee67bc886b2f6474f46aaaff4))


### Documentation

* add newly reported TVs to the tested list ([#86](https://github.com/helalaou/AeroTizen/issues/86)) ([b87cf6d](https://github.com/helalaou/AeroTizen/commit/b87cf6d9a4613c1a24b104b983955af24a674261))
* update contributors ([#87](https://github.com/helalaou/AeroTizen/issues/87)) ([a2dae26](https://github.com/helalaou/AeroTizen/commit/a2dae26873cf823b9d4cbe1606b77f6de8f43e46))

## [2.4.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.3.0...cli-v2.4.0) (2026-10-27)


### Features

* **cli:** add PC-managed native Home and boot recovery ([#49](https://github.com/helalaou/AeroTizen/issues/49)) ([30343c9](https://github.com/helalaou/AeroTizen/commit/30343c9d8a77910fc8081b2f253ccb2e5d7d3857))
* **launcher:** preserve native Samsung and Cobalt handoffs ([#64](https://github.com/helalaou/AeroTizen/issues/64)) ([7be8a27](https://github.com/helalaou/AeroTizen/commit/7be8a2767d213e6f09d9e75b42d646a9a999147b))


### Bug Fixes

* **cli:** uninstall by app ID, add an uninstall command, and fix the inspect race ([#58](https://github.com/helalaou/AeroTizen/issues/58)) ([e23b6c6](https://github.com/helalaou/AeroTizen/commit/e23b6c669031bcc8763d31d6d841b3ff7f30b03f))


### Documentation

* add the CU7000 and Frame LS03A, plus Developer Mode and autorun tips ([#53](https://github.com/helalaou/AeroTizen/issues/53)) ([9bfee5c](https://github.com/helalaou/AeroTizen/commit/9bfee5c8feebf1621a9b0d35a0fda7bdc9fc8cd1))
* add the Q7F, AU7172 and AU8000 to the tested TVs ([#66](https://github.com/helalaou/AeroTizen/issues/66)) ([5caee78](https://github.com/helalaou/AeroTizen/commit/5caee7885f0b828b114279b6916236ac789702ca))
* add the S95B OLED to the tested TVs ([#45](https://github.com/helalaou/AeroTizen/issues/45)) ([029b2a9](https://github.com/helalaou/AeroTizen/commit/029b2a97d00e63c25328ddc151da32d4476e06ff))
* keep the README contributor list up to date automatically ([#54](https://github.com/helalaou/AeroTizen/issues/54)) ([fe85480](https://github.com/helalaou/AeroTizen/commit/fe85480521fbefe4f2a6d43064011f273e845439))
* list every contributor by name and photo in the README ([#41](https://github.com/helalaou/AeroTizen/issues/41)) ([a14c631](https://github.com/helalaou/AeroTizen/commit/a14c631a6694cafc439a98ab5cb64627461480a3))
* refresh README screenshots from a real TV ([#55](https://github.com/helalaou/AeroTizen/issues/55)) ([29ed9a8](https://github.com/helalaou/AeroTizen/commit/29ed9a839a79a6a964128fcda04a92e9b224225b))

## [2.3.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.2.0...cli-v2.3.0) (2026-10-25)


### Features

* **launcher:** migrate Settings to Preact and TypeScript ([#36](https://github.com/helalaou/AeroTizen/issues/36)) ([27c0919](https://github.com/helalaou/AeroTizen/commit/27c09193035955a1e39c5da71619743655ae22f4))

## [2.2.0](https://github.com/helalaou/AeroTizen/compare/cli-v2.1.0...cli-v2.2.0) (2026-10-23)


### Features

* release CLI and launcher independently ([#23](https://github.com/helalaou/AeroTizen/issues/23)) ([c73293b](https://github.com/helalaou/AeroTizen/commit/c73293b3ceb8a8721fa85e95adaba8136fab22ec))

## CLI changelog

CLI releases use `cli-vX.Y.Z` tags. Release Please adds new entries here.
For the earlier combined release history, see [CHANGELOG.md](../CHANGELOG.md).
