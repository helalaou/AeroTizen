import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createCardEnvironment } from "../test/createCardEnvironment";

import { AppCard } from "./AppCard";

const app = { id: "demo", name: "Demo app", icon: "/icon.png" };
const sources = ["/first.png", "/second.png"];
const artwork = (card: HTMLElement) => card.querySelector<HTMLImageElement>("[data-app-artwork]");
const fallback = (card: HTMLElement) => card.querySelector<HTMLElement>("[data-app-fallback]");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("successful fallback artwork preserves the card's name, focus and click handler", () => {
  const env = createCardEnvironment(`app:${app.id}`, { artwork: sources, useAppIcon: false });
  render(<AppCard env={env} app={app} active />);
  const card = screen.getByRole("button", { name: app.name });

  fireEvent.error(artwork(card)!);
  expect(artwork(card)?.getAttribute("src")).toBe(sources[1]);
  fireEvent.load(artwork(card)!);

  expect(fallback(card)?.hidden).toBe(true);
  expect(artwork(card)?.hidden).toBe(false);
  expect(card.getAttribute("data-focused")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: app.name }));
  expect(env.activate).toHaveBeenCalledExactlyOnceWith(`app:${app.id}`);
  expect(vi.getTimerCount()).toBe(0);
});

test("keeps a branded fallback visible when artwork stalls and the next candidate fails", async () => {
  const env = createCardEnvironment(`app:${app.id}`, { artwork: sources, useAppIcon: false, logoPath: "M0 0" });
  render(<AppCard env={env} app={app} active />);
  const card = screen.getByRole("button", { name: app.name });
  const stalled = artwork(card)!;

  await act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(artwork(card)?.getAttribute("src")).toBe(sources[1]);
  fireEvent.load(stalled);
  fireEvent.error(artwork(card)!);

  expect(artwork(card)).toBeNull();
  expect(fallback(card)?.querySelector("svg")).not.toBeNull();
  expect(screen.getByText(app.name).closest("[data-app-fallback]")?.hasAttribute("hidden")).toBe(false);
  expect(card.getAttribute("data-focused")).toBe("true");
  expect(vi.getTimerCount()).toBe(0);
});

test("defers inactive artwork and keeps an unknown app's label if its own icon fails too", () => {
  const env = createCardEnvironment("", { artwork: sources });
  const { rerender } = render(<AppCard env={env} app={app} active={false} />);
  const card = screen.getByRole("button", { name: app.name });
  expect(card.querySelector("img")).toBeNull();
  expect(screen.getByText(app.name)).toBeDefined();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.click(card);
  expect(env.activate).toHaveBeenCalledExactlyOnceWith(`app:${app.id}`);

  rerender(<AppCard env={env} app={app} active />);
  expect(artwork(card)?.getAttribute("src")).toBe(sources[0]);
  fireEvent.error(artwork(card)!);
  fireEvent.error(artwork(card)!);
  const icon = fallback(card)?.querySelector("img");
  expect(icon?.getAttribute("src")).toBe(app.icon);
  fireEvent.error(icon!);
  expect(card.querySelector("img")).toBeNull();
  expect(screen.getByText(app.name)).toBeDefined();
  expect(vi.getTimerCount()).toBe(0);
});
