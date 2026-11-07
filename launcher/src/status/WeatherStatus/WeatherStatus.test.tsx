import { screen } from "@testing-library/preact";
import { expect, test } from "vitest";

import { renderWithEnglish } from "../../test/renderWithEnglish";

import { WeatherStatus } from "./WeatherStatus";

const cloudy = { city: "London", code: 3, condition: "Cloudy", text: "12°", temperature: 12, visible: true };

test.each([
  { code: 0, glyph: "sun" },
  { code: 2, glyph: "cloud-sun" },
  { code: 3, glyph: "cloud" },
  { code: 45, glyph: "cloud-fog" },
  { code: 51, glyph: "cloud-rain" },
  { code: 71, glyph: "cloud-snow" },
  { code: 95, glyph: "cloud-lightning" },
])("renders $glyph for weather code $code without changing the temperature", ({ code, glyph }) => {
  const weather = { ...cloudy, code, showLocation: false };
  const { container } = renderWithEnglish(
    <WeatherStatus layout="compact" only={false} weather={weather} showWeather showLocation={false} />,
  );

  expect(container.querySelector(`svg.lucide-${glyph}`)).not.toBeNull();
  expect(screen.getByText("12°")).toBeDefined();
  expect(screen.queryByText("London")).toBeNull();
});

test.each(["compact", "vertical"] as const)("hides the location while keeping %s weather visible", (layout) => {
  const view = (showLocation: boolean) => (
    <WeatherStatus
      layout={layout}
      only={false}
      weather={{ ...cloudy, showLocation }}
      showWeather
      showLocation={showLocation}
    />
  );
  const { rerender } = renderWithEnglish(view(true));
  expect(screen.getByText("London").hidden).toBe(false);
  if (layout === "vertical") {
    expect(screen.getByText("Cloudy")).toBeDefined();
  }

  rerender(view(false));
  const location = screen.queryByText("London");
  expect(location === null || location.hidden).toBe(true);
  expect(screen.getByText("12°").hidden).toBe(false);
});
