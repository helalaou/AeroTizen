import type { AppPresentation, InstalledApp } from "../../contracts/launcher";

import type { ArtworkEnvironment } from "./appArtwork";
import { artworkSources, packageIcon } from "./appArtwork";
import { shortAppName } from "./appNames";

export const describeApp = (app: InstalledApp, environment: ArtworkEnvironment): AppPresentation => ({
  title: shortAppName(app.name),
  artwork: artworkSources(app, environment),
  appIcon: packageIcon(app),
});
