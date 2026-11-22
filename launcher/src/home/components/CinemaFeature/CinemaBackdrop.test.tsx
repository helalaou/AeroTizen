import { fireEvent, render } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import { CinemaBackdrop } from "./CinemaBackdrop";

test("keeps the current artwork visible while its replacement loads", () => {
  const onError = vi.fn();
  const onVisibilityChange = vi.fn();
  const view = (src?: string) => <CinemaBackdrop src={src} onError={onError} onVisibilityChange={onVisibilityChange} />;
  const { container, rerender } = render(view("/first.jpg"));
  const visibleArtwork = () => container.querySelector('[data-cinema-backdrop][data-visible="true"]');

  fireEvent.load(container.querySelector('img[src="/first.jpg"]')!);
  expect(visibleArtwork()?.getAttribute("src")).toBe("/first.jpg");

  rerender(view("/second.jpg"));
  expect(visibleArtwork()?.getAttribute("src")).toBe("/first.jpg");
  fireEvent.load(container.querySelector('img[src="/second.jpg"]')!);
  expect(visibleArtwork()?.getAttribute("src")).toBe("/second.jpg");
  expect(onVisibilityChange.mock.calls).toEqual([[true]]);

  rerender(view());
  expect(visibleArtwork()).toBeNull();
  expect(onVisibilityChange.mock.calls).toEqual([[true], [false]]);
});
