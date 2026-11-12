import { describe, expect, it } from "vitest";

import { zonedDate } from "./zonedDate";

// 2026-01-15T12:30:00Z
const NOON_UTC = Date.UTC(2026, 0, 15, 12, 30);

describe("zonedDate", () => {
  it("keeps the TV time without a zone", () => {
    expect(zonedDate(NOON_UTC, "").getTime()).toBe(NOON_UTC);
  });

  it("shows the wall-clock time of the zone", () => {
    const tokyo = zonedDate(NOON_UTC, "Asia/Tokyo");
    expect([tokyo.getDate(), tokyo.getHours(), tokyo.getMinutes()]).toEqual([15, 21, 30]);
    const newYork = zonedDate(NOON_UTC, "America/New_York");
    expect([newYork.getDate(), newYork.getHours(), newYork.getMinutes()]).toEqual([15, 7, 30]);
  });

  it("falls back to the TV time for an unknown zone", () => {
    expect(zonedDate(NOON_UTC, "Not/A_Zone").getTime()).toBe(NOON_UTC);
  });
});
