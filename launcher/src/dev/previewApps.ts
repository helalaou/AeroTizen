import type { InstalledApp } from "../contracts/launcher";

// Preserve preview IDs before sorting, including the partial last row.
const NAMES = [
  "YouTube",
  "Netflix",
  "Stremio",
  "Prime Video",
  "Spotify - Music and Podcasts",
  "TizenBrew",
  "Disney+",
  "Plex",
  "Apple TV",
  "BBC iPlayer",
  "Channel 4",
  "Crunchyroll",
  "DAZN",
  "discovery+",
  "Hulu",
  "ITVX",
  "Jellyfin",
  "Max",
  "My5",
  "NOW",
  "Paramount+",
  "Rakuten TV",
  "Samsung TV Plus",
  "Tubi",
  "Twitch",
] as const;

export const previewAppId = (name: (typeof NAMES)[number]) => "demo" + NAMES.indexOf(name);

export const previewApps: readonly InstalledApp[] = Object.freeze(
  NAMES.map((name, index) => Object.freeze({ id: "demo" + index, name, icon: "" })).sort((left, right) =>
    left.name.localeCompare(right.name),
  ),
);
