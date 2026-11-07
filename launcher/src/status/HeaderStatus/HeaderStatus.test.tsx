import { act, screen, within } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import type { ClockService } from "../../contracts/launcher";
import type { SettingsDefaults, TimeFormat } from "../../contracts/preferences";
import { createSettingsService } from "../../services/createSettingsService";
import { createTestStatus } from "../../test/createTestStatus";
import { renderWithEnglish } from "../../test/renderWithEnglish";

import { HeaderStatus } from "./HeaderStatus";

vi.mock("../hooks/useClockWidth", () => ({ useClockWidth: () => undefined }));

const timestamp = Date.UTC(2026, 9, 28, 14, 5);
const date = "2026-10-28";
const samples = [
  { format: "24", text: "14.05", hour: "14", minute: "05", dayPeriod: "" },
  { format: "12", text: "오후 2:05", hour: "2", minute: "05", dayPeriod: "오후" },
] satisfies { format: TimeFormat; text: string; hour: string; minute: string; dayPeriod: string }[];

const renderHeader = (defaults: Partial<SettingsDefaults>, sample = samples[0]) => {
  const { format, text, hour, minute, dayPeriod } = sample;
  const status = createTestStatus(timestamp);
  const clock: ClockService = {
    ...status.time,
    DATE_FORMATS: [],
    dateStyle: () => "iso",
    defaultTimeFormat: () => format,
    formatDate: (_, style) => (style === "none" ? "" : date),
    formatTime: vi.fn(() => text),
    formatTimeParts: vi.fn(() => ({ hour, minute, dayPeriod })),
    measureTime: () => 0,
    start: () => undefined,
    tick: () => undefined,
  };
  const settings = createSettingsService({
    defaults: { timeFormat: format, showWeather: false, ...defaults },
    legacyStorageKeys: [],
    locale: { timeFormat: () => format, tempUnit: () => "C" },
    speedRange: { MIN: 1, MAX: 10 },
    storage: { getItem: () => null, setItem: () => undefined },
    storageKey: "aerotizen.settings.test",
  });
  const { container } = renderWithEnglish(<HeaderStatus settings={settings} status={status} clock={clock} />);
  return { clock, container, settings, status };
};

test.each(samples)("keeps the localized time label and fields for $format-hour time", (sample) => {
  const { format, text, hour, minute, dayPeriod } = sample;
  const { clock } = renderHeader({ clockLayout: "custom", dateFormat: "iso" }, sample);

  const timeFields = within(screen.getByLabelText(text));
  expect(clock.formatTime).toHaveBeenCalledWith(new Date(timestamp), format);
  expect(clock.formatTimeParts).toHaveBeenCalledWith(new Date(timestamp), format);
  expect(timeFields.getByText(hour).textContent).toBe(hour);
  expect(timeFields.getByText(minute).textContent).toBe(dayPeriod ? `${minute} ${dayPeriod}` : minute);
  expect(screen.getByText(date).hidden).toBe(false);
});

test.each(["classic", "custom"] as const)(
  "keeps time and date visibility independent in the %s layout",
  async (clockLayout) => {
    const { container, settings, status } = renderHeader({ clockLayout, dateFormat: "iso", showTime: true });
    const timeNode = container.querySelector(clockLayout === "classic" ? "#time" : '[data-clock-part="time"]');
    const dateNode = container.querySelector(clockLayout === "classic" ? "#date" : '[data-clock-part="date"]');
    const expanded = container.querySelector('[data-clock="expanded"]');
    expect(timeNode?.hasAttribute("hidden")).toBe(false);
    expect(dateNode?.hasAttribute("hidden")).toBe(false);

    await act(() => settings.update({ showTime: false }));
    expect(timeNode?.hasAttribute("hidden")).toBe(true);
    expect(dateNode?.hasAttribute("hidden")).toBe(false);
    await act(() => status.time.set(timestamp + 60_000));
    expect(timeNode?.hasAttribute("hidden")).toBe(true);

    await act(() => settings.update({ dateFormat: "none" }));
    expect(timeNode?.hasAttribute("hidden")).toBe(true);
    expect(dateNode?.hasAttribute("hidden")).toBe(true);
    expect(expanded?.hasAttribute("hidden") ?? true).toBe(true);

    await act(() => settings.update({ showTime: true }));
    expect(timeNode?.hasAttribute("hidden")).toBe(false);
    expect(dateNode?.hasAttribute("hidden")).toBe(true);
    expect(expanded?.hasAttribute("hidden") ?? false).toBe(false);
  },
);
