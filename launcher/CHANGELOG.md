# Changelog

## [2.7.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.6.0...launcher-v2.7.0) (2026-11-07)


### Features

* add Stremio Continue Watching on rooted TVs ([#141](https://github.com/helalaou/AeroTizen/issues/141)) ([0d188b7](https://github.com/helalaou/AeroTizen/commit/0d188b782b3ee1e2478ca7da07f75ed701548316))
* **i18n:** add Italian launcher translation ([#27](https://github.com/helalaou/AeroTizen/issues/27)) ([4db4421](https://github.com/helalaou/AeroTizen/commit/4db44211d0f44144ed8050a2d7de6c172acb78ff))
* **launcher:** add Arabic translation with right-to-left layout ([#149](https://github.com/helalaou/AeroTizen/issues/149)) ([50c87f8](https://github.com/helalaou/AeroTizen/commit/50c87f8e8961801eb9c997edaa658295884e3185))
* **launcher:** add Back to top and dock Home inputs ([#132](https://github.com/helalaou/AeroTizen/issues/132)) ([4b13b45](https://github.com/helalaou/AeroTizen/commit/4b13b457db0bf11b3c2229b29f2eb049812ff033))
* **launcher:** add custom colours and gradients ([#175](https://github.com/helalaou/AeroTizen/issues/175)) ([ff231b6](https://github.com/helalaou/AeroTizen/commit/ff231b670a11a69b52673e302810db0bd41ad395)), closes [#138](https://github.com/helalaou/AeroTizen/issues/138)
* **launcher:** add French translation ([#150](https://github.com/helalaou/AeroTizen/issues/150)) ([92eb694](https://github.com/helalaou/AeroTizen/commit/92eb6945f3fc6a17791db8f3f826eff2d03aab35))
* **launcher:** add language support ([#121](https://github.com/helalaou/AeroTizen/issues/121)) ([38729f1](https://github.com/helalaou/AeroTizen/commit/38729f1fc574469fa03e9f4e04ca8441d29b240f))
* **launcher:** add Russian translation catalogue ([#128](https://github.com/helalaou/AeroTizen/issues/128)) ([1f5aafa](https://github.com/helalaou/AeroTizen/commit/1f5aafa20145236f50700d748cdd298499c6fa91))
* **launcher:** fill in the Settings About page ([#153](https://github.com/helalaou/AeroTizen/issues/153)) ([1ca2bab](https://github.com/helalaou/AeroTizen/commit/1ca2babb502f68aa8a85b2e7521b07aa687d156a))
* **launcher:** note that the language setting only changes AeroTizen ([#156](https://github.com/helalaou/AeroTizen/issues/156)) ([1e0a5aa](https://github.com/helalaou/AeroTizen/commit/1e0a5aa2f1e42201fc9fc92999355296031a65c6))
* **launcher:** refine Home and Settings layouts ([#125](https://github.com/helalaou/AeroTizen/issues/125)) ([b8a49fb](https://github.com/helalaou/AeroTizen/commit/b8a49fba4c8141e8ca7c29188055209dcbeb4799))
* **launcher:** show available updates and release notes in Settings ([#126](https://github.com/helalaou/AeroTizen/issues/126)) ([6b50641](https://github.com/helalaou/AeroTizen/commit/6b50641b89a60fbc35e9d9c162e96b79bd6c109a))
* **launcher:** simplify app layouts and add Home scrolling ([#165](https://github.com/helalaou/AeroTizen/issues/165)) ([a6e54f8](https://github.com/helalaou/AeroTizen/commit/a6e54f8082a96f56f198918fe9192210477b7023))


### Bug Fixes

* **launcher:** correct Home scrolling and wallpaper controls ([#134](https://github.com/helalaou/AeroTizen/issues/134)) ([093c2d5](https://github.com/helalaou/AeroTizen/commit/093c2d5f341c9486ff4806608dbf9984052396cc))
* **launcher:** enable Spotify in Continue Watching ([#142](https://github.com/helalaou/AeroTizen/issues/142)) ([c2fda89](https://github.com/helalaou/AeroTizen/commit/c2fda89b41fc20293e91b058f815e7c13ce41253))
* **launcher:** refresh installed apps on return ([#157](https://github.com/helalaou/AeroTizen/issues/157)) ([3d4273b](https://github.com/helalaou/AeroTizen/commit/3d4273bc4c6128bf171c7ad73f27efe2419ac294))


### Performance Improvements

* **launcher:** render particle backgrounds with WebGL 1 ([#119](https://github.com/helalaou/AeroTizen/issues/119)) ([773c410](https://github.com/helalaou/AeroTizen/commit/773c4108f2ff3049f10649d91f4e2a9165b8cf8d))

## [2.6.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.5.0...launcher-v2.6.0) (2026-11-03)


### Features

* **diagnostics:** add CLI and TV diagnostic reports ([#78](https://github.com/helalaou/AeroTizen/issues/78)) ([5ce548b](https://github.com/helalaou/AeroTizen/commit/5ce548b3acec07a54d8c38ea38503d5d13e0dde7))
* **launcher:** offer classic and custom clock layouts ([#28](https://github.com/helalaou/AeroTizen/issues/28)) ([dd457ea](https://github.com/helalaou/AeroTizen/commit/dd457eae51838e4e8ca8f323a2338440989fd5ad))
* **launcher:** offer Square and Rectangle Home card layouts ([#34](https://github.com/helalaou/AeroTizen/issues/34)) ([91a7dbe](https://github.com/helalaou/AeroTizen/commit/91a7dbe6d0e611a4611a15203b282e84889572f2))
* **launcher:** retain recognised HDMI devices in standby ([#29](https://github.com/helalaou/AeroTizen/issues/29)) ([aee7373](https://github.com/helalaou/AeroTizen/commit/aee737386044ec479c0c975635256f38333f8fc8))
* **launcher:** unify glass settings and Home navigation ([#30](https://github.com/helalaou/AeroTizen/issues/30)) ([faacf92](https://github.com/helalaou/AeroTizen/commit/faacf92952d9bd19db4511c068f6a3d51202b0d3))


### Bug Fixes

* **launcher:** close embedded HDMI on native Home return ([#101](https://github.com/helalaou/AeroTizen/issues/101)) ([a2d86a2](https://github.com/helalaou/AeroTizen/commit/a2d86a2be939f0fc04e41ff071fb481bd10a4124))

## [2.5.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.4.0...launcher-v2.5.0) (2026-10-29)


### Features

* **launcher:** add opt-in Continue Watching ([#62](https://github.com/helalaou/AeroTizen/issues/62)) ([5314580](https://github.com/helalaou/AeroTizen/commit/5314580d943cc91a25ff41da287fbbd0646f4f00))
* **launcher:** add optional dynamic weather wallpapers ([#35](https://github.com/helalaou/AeroTizen/issues/35)) ([c4b649b](https://github.com/helalaou/AeroTizen/commit/c4b649b4fa22a43e19842f0f6d52acdfa69cc1d3))


### Bug Fixes

* **launcher:** open com.samsung.tv.store before the org.volt.apps alias ([#81](https://github.com/helalaou/AeroTizen/issues/81)) ([c1ca91f](https://github.com/helalaou/AeroTizen/commit/c1ca91f3de14dc29f80ac548ab401c8b5beebd65))
* **weather:** refresh cached forecasts missing current solar data ([#72](https://github.com/helalaou/AeroTizen/issues/72)) ([47a5911](https://github.com/helalaou/AeroTizen/commit/47a5911b15a785eee67bc886b2f6474f46aaaff4))

## [2.4.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.3.0...launcher-v2.4.0) (2026-10-27)


### Features

* **cli:** add PC-managed native Home and boot recovery ([#49](https://github.com/helalaou/AeroTizen/issues/49)) ([30343c9](https://github.com/helalaou/AeroTizen/commit/30343c9d8a77910fc8081b2f253ccb2e5d7d3857))
* **launcher:** preserve native Samsung and Cobalt handoffs ([#64](https://github.com/helalaou/AeroTizen/issues/64)) ([7be8a27](https://github.com/helalaou/AeroTizen/commit/7be8a2767d213e6f09d9e75b42d646a9a999147b))


### Bug Fixes

* **launcher:** preserve Samsung signal levels and unknown network status ([#43](https://github.com/helalaou/AeroTizen/issues/43)) ([f9baca7](https://github.com/helalaou/AeroTizen/commit/f9baca7f57586643ef778c41d7791038abe846af)), closes [#38](https://github.com/helalaou/AeroTizen/issues/38)
* recognise preloaded Apple TV ([#48](https://github.com/helalaou/AeroTizen/issues/48)) ([6edbe67](https://github.com/helalaou/AeroTizen/commit/6edbe679e74a460a03ace7cb6b754f3613cb28b5))
* **settings:** press OK to adjust the speed slider ([#57](https://github.com/helalaou/AeroTizen/issues/57)) ([5b7e5b6](https://github.com/helalaou/AeroTizen/commit/5b7e5b674c5039efa8dd6a404d64aecfb61cea8f))

## [2.3.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.2.0...launcher-v2.3.0) (2026-10-25)


### Features

* **launcher:** manage Home favourites from app tiles ([#26](https://github.com/helalaou/AeroTizen/issues/26)) ([2716815](https://github.com/helalaou/AeroTizen/commit/2716815559db61b915e53a274d58229491119708))
* **launcher:** migrate Settings to Preact and TypeScript ([#36](https://github.com/helalaou/AeroTizen/issues/36)) ([27c0919](https://github.com/helalaou/AeroTizen/commit/27c09193035955a1e39c5da71619743655ae22f4))

## [2.2.0](https://github.com/helalaou/AeroTizen/compare/launcher-v2.1.0...launcher-v2.2.0) (2026-10-23)


### Features

* release CLI and launcher independently ([#23](https://github.com/helalaou/AeroTizen/issues/23)) ([c73293b](https://github.com/helalaou/AeroTizen/commit/c73293b3ceb8a8721fa85e95adaba8136fab22ec))

## Launcher changelog

Launcher releases use `launcher-vX.Y.Z` tags. Release Please adds new entries here.
For the earlier combined release history, see [CHANGELOG.md](../CHANGELOG.md).
