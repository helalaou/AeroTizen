# App catalogue identities

`launcher/js/app-catalog.js` contains identity pairs and artwork aliases, not logos
or brand colours. Keep records sorted by `key`. Every record must have at least one
variant. Every store variant must contain a non-empty Tizen `appId` and a numeric
Samsung `storeId`, both stored as strings. Keep regional/version variants separate;
do not mix one variant's app ID with another variant's store ID.

TizenBrew is the explicit sideloaded exception. Its variant has `sideloaded: true`
and an app ID, with no `storeId` or `preloaded` flag. Do not invent a store ID, use
an empty string, or copy the app ID into the store field. Its installed icon uses
the normal artwork loader.

`preloaded: true` is an existing discovery/watcher rule, not a description of how
an app was installed. Adding an identity does not imply that flag should be set.
TV-provided store IDs and icon-cache paths still take precedence over this catalogue.

## Identity audit, 10 November 2026

All 23 entries in the original catalogue are retained, including the six entries
that previously had branding but no identity. Existing complete pairs are preserved.
Tests require complete store pairs, unique IDs, historical coverage, direct lookups
without display-name matching, and the explicit TizenBrew exception.

Sources for the completed entries:

| Entry           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hulu            | Both IDs are paired in the [Homebridge app registry](https://github.com/blog-razrabotchika/homebridge-samsung-tizen-applications/blob/master/README.md); the Tizen app ID also appears in a [published TV inventory](https://github.com/arlogilbert/tizen-app-id).                                                                                                                                                                                              |
| Plex            | The pair is recorded in [SamsungTV Smart's app mapping](https://github.com/ollo69/ha-samsungtv-smart/blob/master/custom_components/samsungtv_smart/const.py) and the Homebridge registry.                                                                                                                                                                                                                                                                       |
| Paramount+      | International pair: [SamsungTV Smart app mapping](https://github.com/ollo69/ha-samsungtv-smart/blob/master/custom_components/samsungtv_smart/const.py). US pair: [Couch TV's app identities](https://github.com/Seagey/couch-tv/blob/main/bridge/apps.py), which distinguish the US CBS All Access package. Numeric store variants also appear in the [Homebridge application list](https://tavicu.github.io/homebridge-samsung-tizen/extra/applications.html). |
| Tubi            | Both IDs are paired in the [Homebridge app registry](https://github.com/blog-razrabotchika/homebridge-samsung-tizen-applications/blob/master/README.md); the Tizen app ID also appears in the published TV inventory.                                                                                                                                                                                                                                           |
| Jellyfin        | App ID: [official Tizen manifest](https://github.com/jellyfin/jellyfin-tizen/blob/master/config.xml). Store ID: [official client listing source](https://github.com/jellyfin/jellyfin.org/blob/master/src/data/clients.ts) and its [Samsung listing](https://www.samsung.com/us/tvs/smart-tv/samsung-tv-apps-detail/?appId=3202007021208).                                                                                                                      |
| Samsung TV Plus | The standalone app ID was read from `tizen.application.getAppsInfo()` on a 2024 Frame QE65LS03DAUXXU, Tizen 9. The existing store ID is also in the Homebridge application list. The deeplinker, background service and Privacy Settings app are separate identities and are not mapped to this store entry.                                                                                                                                                    |
| TizenBrew       | App ID: [official manifest](https://github.com/reisxd/TizenBrew/blob/main/tizenbrew-app/TizenBrew/config.xml). The [official installation guide](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md) documents sideloading.                                                                                                                                                                                                                           |

These are sourced identity mappings, not a claim that every model or region uses
the same package. New store apps were not installed during this audit. Preserve
verified variants when adding a different model's pair, and cite the source.
