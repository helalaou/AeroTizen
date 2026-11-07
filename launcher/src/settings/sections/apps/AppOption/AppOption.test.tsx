import { act, fireEvent, render, screen } from "@testing-library/preact";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { AppPresentation } from "../../../../contracts/launcher";
import { createNavigation } from "../../../../shared/navigation/createNavigation";

import { AppOption } from "./AppOption";

const navigation = createNavigation(() => undefined);
vi.mock("../../../hooks/useSettingsEnvironment", () => ({
  useSettingsEnvironment: () => ({ navigation }),
}));

const app = { id: "demo", name: "Demo app" };
const describeApp = (): AppPresentation => ({
  artwork: ["/first.png", "/second.png"],
  background: "black",
  label: app.name,
  largeLogo: false,
  logoColour: "white",
  logoPath: null,
  textColour: "white",
  title: app.name,
  useAppIcon: false,
});

const artwork = (button: HTMLElement) => button.querySelector<HTMLImageElement>("[data-app-artwork]");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("cancels pending artwork, ignores stale loads and shows the fallback after both deadlines", async () => {
  const props = { app, describeApp, onSelect: vi.fn(), selected: false };
  const { rerender } = render(<AppOption {...props} active />);
  const button = screen.getByRole("button", { name: app.name });
  const firstAttempt = artwork(button)!;
  expect(firstAttempt.getAttribute("src")).toBe("/first.png");
  expect(vi.getTimerCount()).toBe(1);

  rerender(<AppOption {...props} active={false} />);
  expect(artwork(button)).toBeNull();
  expect(vi.getTimerCount()).toBe(0);

  rerender(<AppOption {...props} active />);
  fireEvent.load(firstAttempt);
  expect(artwork(button)?.hidden).toBe(true);
  expect(button.hasAttribute("data-artwork-loaded")).toBe(false);

  await act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(artwork(button)?.getAttribute("src")).toBe("/second.png");
  expect(vi.getTimerCount()).toBe(1);
  await act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(artwork(button)).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(button.querySelector("[data-app-fallback]")?.hasAttribute("hidden")).toBe(false);
});

test("retries failed artwork on reactivation without replacing another card's loaded image", () => {
  const cachedApp = { id: "cached", name: "Cached app" };
  const describeCachedApp = () => ({ ...describeApp(), title: cachedApp.name, artwork: ["/cached.png"] });
  const props = { onSelect: vi.fn(), selected: false };
  const view = (active: boolean) => (
    <>
      <AppOption {...props} app={app} describeApp={describeApp} active={active} />
      <AppOption {...props} app={cachedApp} describeApp={describeCachedApp} active={active} />
    </>
  );
  const { rerender } = render(view(true));
  const button = screen.getByRole("button", { name: app.name });
  const cachedButton = screen.getByRole("button", { name: cachedApp.name });
  const cachedImage = artwork(cachedButton)!;
  fireEvent.load(cachedImage);
  expect(cachedImage.hidden).toBe(false);

  fireEvent.error(artwork(button)!);
  expect(artwork(button)?.getAttribute("src")).toBe("/second.png");
  fireEvent.error(artwork(button)!);
  expect(artwork(button)).toBeNull();

  rerender(view(false));
  rerender(view(true));
  const loaded = artwork(button)!;
  expect(loaded.getAttribute("src")).toBe("/first.png");
  fireEvent.load(loaded);
  expect(loaded.hidden).toBe(false);
  expect(button.hasAttribute("data-artwork-loaded")).toBe(true);
  expect(artwork(cachedButton)).toBe(cachedImage);
  expect(cachedImage.hidden).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("shows a check only while selected and calls onSelect when clicked", () => {
  const onSelect = vi.fn();
  const props = { app, describeApp, onSelect, active: false };
  const { rerender } = render(<AppOption {...props} selected />);
  const button = screen.getByRole("button", { name: app.name, pressed: true });
  expect(button.querySelector("[data-selection-indicator] .lucide-check")).not.toBeNull();
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledTimes(1);

  rerender(<AppOption {...props} selected={false} />);
  const unselected = screen.getByRole("button", { name: app.name, pressed: false });
  expect(unselected.querySelector("[data-selection-indicator]")).toBeNull();
});
