import type { ContinueFeedItem } from "../../contracts/continueWatching";

import type { Candidate } from "./backdropMetadata";
import { asRecord, titleKey } from "./backdropMetadata";

const LEADING_RELEASE_YEAR = /^([0-9]{4})\b/;

// null marks a confirmed miss. undefined leaves incomplete or ambiguous lookups retryable.
export const findCinemetaMatch = (
  item: ContinueFeedItem,
  results: readonly (Candidate | undefined)[],
): Candidate | null | undefined => {
  if (item.imdbId) {
    const matches = results.map((result) => asRecord(result?.meta)).filter((meta) => meta?.id === item.imdbId);
    return matches.length === 1 ? matches[0] : undefined;
  }

  const exactTitle = titleKey(item.title);
  const matches: Candidate[] = [];
  let complete = true;
  for (const result of results) {
    if (!Array.isArray(result?.metas)) {
      return undefined;
    }
    for (const row of result.metas as unknown[]) {
      const candidate = asRecord(row);
      const name = titleKey(candidate?.name);
      if (!candidate || !name) {
        complete = false;
      } else if (name === exactTitle) {
        matches.push(candidate);
      }
    }
  }
  if (matches.length === 0) {
    return complete ? null : undefined;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  // A feed year can describe an episode. Use it only to distinguish identical titles.
  if (item.releaseYear) {
    const byYear = matches.filter(
      ({ releaseInfo }) =>
        typeof releaseInfo === "string" && Number(LEADING_RELEASE_YEAR.exec(releaseInfo)?.[1]) === item.releaseYear,
    );
    return byYear.length === 1 ? byYear[0] : undefined;
  }
  return undefined;
};
