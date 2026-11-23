import type { ContinueItem } from "../contracts/launcher";

const IMDB_ID_PATTERN = /^tt[0-9]{7,12}$/;

export const readImdbId = (value: unknown) =>
  typeof value === "string" && IMDB_ID_PATTERN.test(value) ? value : undefined;

export const cardArtwork = (item: ContinueItem) =>
  [
    { src: item.thumbnailImage, fit: "cover" },
    { src: item.backgroundImage, fit: "cover" },
    { src: item.image, fit: "contain" },
  ] as const;
