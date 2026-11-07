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

test("prefers the episode thumbnail and falls back to series artwork on error", () => {
  renderWithEnglish(<ContinueWatchingCard env={createCardEnvironment()} item={item} />);
  const card = screen.getByRole("button", { name: /Stremio programme.*Stremio/ });
  const image = () => card.querySelector<HTMLImageElement>("[data-continue-part=image]")!;
  expect(image().getAttribute("src")).toBe(item.thumbnailImage);
  expect(image().getAttribute("data-fit")).toBe("cover");
  fireEvent.error(image());
  expect(image().getAttribute("src")).toBe(item.backgroundImage);
  expect(image().getAttribute("data-fit")).toBe("cover");
});

test("omits the progress fill for sub-second playback", () => {
  const env = createCardEnvironment();
  const { rerender } = renderWithEnglish(<ContinueWatchingCard env={env} item={item} />);
  const card = screen.getByRole("button", { name: /Stremio programme.*Stremio/ });
  const progressFill = () => card.querySelector<HTMLElement>("[data-continue-part=progress-fill]");
  expect(progressFill()).toBeNull();

  rerender(<ContinueWatchingCard env={env} item={{ ...item, playback: 150 }} />);
  expect(progressFill()?.style.width).toBe("50%");
});
