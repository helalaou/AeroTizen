import { fireEvent, screen } from "@testing-library/preact";
import { expect, test } from "vitest";

import type { ContinueItem } from "../../../contracts/launcher";
import { renderWithEnglish } from "../../../test/renderWithEnglish";
import { createCardEnvironment } from "../../test/createCardEnvironment";

import { ContinueWatchingCard } from "./ContinueWatchingCard";

const programme = "Stremio programme";
const item: ContinueItem = {
  key: "episode",
  title: programme,
  sourceId: "stremio",
  sourceName: "Stremio",
  thumbnailImage: "/episode.jpg",
  backgroundImage: "/series.jpg",
  image: "/poster.jpg",
  season: 2,
  episode: 9,
  duration: 300,
  playback: 0.001,
};

test.each([false, true])(
  "prefers the thumbnail and falls back to series artwork with showDetails=%s",
  (showDetails) => {
    renderWithEnglish(<ContinueWatchingCard env={createCardEnvironment()} item={item} showDetails={showDetails} />);
    const card = screen.getByRole("button", { name: /Stremio programme.*Stremio/ });
    const image = () => card.querySelector<HTMLImageElement>("[data-continue-part=image]")!;
    expect(image().getAttribute("src")).toBe(item.thumbnailImage);
    expect(image().getAttribute("data-fit")).toBe("cover");
    fireEvent.error(image());
    expect(image().getAttribute("src")).toBe(item.backgroundImage);
    expect(image().getAttribute("data-fit")).toBe("cover");
    fireEvent.error(image());
    expect(image().getAttribute("src")).toBe(item.image);
  },
);

test("shows the thumbnail footer and hides it in cover art mode", () => {
  const env = createCardEnvironment();
  const { rerender } = renderWithEnglish(<ContinueWatchingCard env={env} item={item} />);
  const card = screen.getByRole("button", { name: /Stremio programme.*Stremio/ });
  const progressFill = () => card.querySelector<HTMLElement>("[data-continue-part=progress-fill]");
  expect(progressFill()).toBeNull();

  const inProgress = { ...item, playback: 150 };
  rerender(<ContinueWatchingCard env={env} item={inProgress} />);
  expect(progressFill()?.style.width).toBe("50%");
  expect(screen.getByText(programme)).toBeTruthy();

  rerender(<ContinueWatchingCard coverArt env={env} item={inProgress} />);
  expect(screen.queryByText(programme)).toBeNull();
  expect(card.querySelector("[data-continue-part=progress]")).toBeNull();
  expect(card.querySelector("[data-continue-part=source-badge]")).toBeTruthy();
  expect(screen.getByRole("button", { name: /Stremio programme.*S2 E9.*Stremio/ })).toBe(card);

  rerender(<ContinueWatchingCard env={env} item={inProgress} />);
  expect(screen.getByText(programme)).toBeTruthy();
  expect(progressFill()?.style.width).toBe("50%");
});
