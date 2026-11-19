import type { ContinueItem } from "../contracts/launcher";

export const cardArtwork = (item: ContinueItem) =>
  [
    { src: item.thumbnailImage, fit: "cover" },
    { src: item.backgroundImage, fit: "cover" },
    { src: item.image, fit: "contain" },
  ] as const;
