import type { ContinueFeedItem } from "../../contracts/continueWatching";
import type { ContinueSource } from "../../contracts/launcher";
import { readImdbId } from "../../shared/continueWatchingArtwork";

const text = (value: unknown, limit: number) => (typeof value === "string" ? value.slice(0, limit) : "");
const imageUrl = (value: unknown) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? text(value, 4000) : "";
const nonnegative = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

const readMediaKind = (value: unknown): ContinueFeedItem["mediaKind"] => {
  switch (value) {
    case "film":
    case "movie":
      return "movie";
    case "episode":
    case "series":
    case "tv":
      return "tv";
    default:
      return undefined;
  }
};

const MIN_RELEASE_YEAR = 1000;
const MAX_RELEASE_YEAR = 9999;
const readReleaseYear = (value: unknown) => {
  const year = typeof value === "string" && /^[0-9]{4}$/.test(value) ? Number(value) : value;
  return typeof year === "number" && Number.isInteger(year) && year >= MIN_RELEASE_YEAR && year <= MAX_RELEASE_YEAR
    ? year
    : undefined;
};

const activity = (value: unknown, now: number) => {
  const number = nonnegative(value);
  const seconds = number > 100000000000 ? number / 1000 : number;
  // Expiry, release and fetch times do not establish viewing activity.
  return seconds > 0 && seconds <= now / 1000 + 86400 ? seconds : 0;
};

export const normalizeContinueItems = (source: ContinueSource, records: unknown, now: number): ContinueFeedItem[] => {
  if (!Array.isArray(records)) {
    throw new Error("Invalid feed");
  }
  const result = new Map<string, ContinueFeedItem>();
  for (const value of records.slice(0, 200) as unknown[]) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const record = value as Record<string, unknown>;
    const storeId = typeof record.app_id === "number" ? String(record.app_id) : record.app_id;
    const title = text(record.content_title, 300);
    const id = text(record.content_id, 500);
    const payload = text(record.payload, 16000);
    if (
      storeId !== source.storeId ||
      !title ||
      !id ||
      !payload ||
      (record.content_id as string).length > 500 ||
      (record.payload as string).length > 16000
    ) {
      continue;
    }
    const thumbnail = imageUrl(record.thumbnail_url);
    const background = imageUrl(record.background_url);
    const imdbId = readImdbId(record.imdb_id) ?? (source.supportsSeparateBackdrop ? readImdbId(id) : undefined);
    const season = nonnegative(record.season);
    const episode = nonnegative(record.episode);
    const mediaKind =
      readMediaKind(record.media_type) ?? readMediaKind(record.content_type) ?? (season || episode ? "tv" : undefined);
    const releaseYear = readReleaseYear(record.release);
    const item: ContinueFeedItem = {
      key: source.id + ":" + id,
      sourceId: source.id,
      sourceName: source.name,
      sourceIcon: source.icon || "",
      title,
      season,
      episode,
      payload,
      duration: nonnegative(record.duration),
      playback: nonnegative(record.playback),
      timestamp: activity(record.timestamp, now),
      image: imageUrl(record.image_url),
      ...(thumbnail ? { thumbnailImage: thumbnail } : {}),
      ...(background ? { backgroundImage: background } : {}),
      ...(background && source.supportsSeparateBackdrop ? { backdropImage: background } : {}),
      ...(imdbId ? { imdbId } : {}),
      ...(mediaKind ? { mediaKind } : {}),
      ...(releaseYear ? { releaseYear } : {}),
    };
    const previous = result.get(id);
    if (!previous || item.timestamp > previous.timestamp) {
      result.set(id, item);
    }
  }
  // Keep zero-progress next episodes and distinct episode IDs, even with the same title.
  return [...result.values()];
};
