import { act, renderHook } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import type { WeatherLocation } from "../../../contracts/preferences";
import type { SettingsServices } from "../../types";

import { useWeatherSearch } from "./useWeatherSearch";

const PARIS_LABEL = "Paris, France";
const BOSTON_LABEL = "Boston, United States";
const PARIS: WeatherLocation = { name: "Paris", label: PARIS_LABEL, latitude: 48.85, longitude: 2.35 };
const BOSTON: WeatherLocation = {
  name: "Boston",
  label: BOSTON_LABEL,
  latitude: 42.36,
  longitude: -71.06,
};

const harness = (active = true) => {
  const requests: { query: string; done: (results: WeatherLocation[] | null) => void; cancel: () => void }[] = [];
  const searchLocations: SettingsServices["searchLocations"] = (query, done) => {
    const cancel = vi.fn();
    requests.push({ query, done, cancel });
    return cancel;
  };
  const hook = renderHook(({ enabled }) => useWeatherSearch(searchLocations, enabled), {
    initialProps: { enabled: active },
  });
  const query = (text: string) => {
    void act(() => hook.result.current.setQuery(text));
  };
  const search = () => {
    void act(() => hook.result.current.search());
  };
  const reply = (index: number, results: WeatherLocation[] | null) => {
    void act(() => requests[index].done(results));
  };
  return { ...hook, requests, query, search, reply };
};

test("short queries do not request data; a pending trimmed query is submitted once", () => {
  const h = harness();
  h.query(" x ");
  h.search();
  expect(h.requests).toHaveLength(0);
  expect(h.result.current).toMatchObject({ busy: false, message: "weather.searchTooShort", results: [] });
  h.query(" Paris ");
  h.search();
  h.search();
  expect(h.requests.map((request) => request.query)).toEqual(["Paris"]);
  expect(h.result.current).toMatchObject({ busy: true, message: "weather.searching", results: [] });
  h.reply(0, [PARIS]);
  expect(h.result.current).toMatchObject({ busy: false, message: "weather.searchResults", results: [PARIS] });
});

test.each([
  { results: [], message: "weather.searchEmpty" },
  { results: null, message: "weather.searchFailed" },
])("$message clears busy state and permits retrying the same query", ({ results, message }) => {
  const h = harness();
  h.query("Paris");
  h.search();
  h.reply(0, results);
  expect(h.result.current).toMatchObject({ busy: false, message, results: [] });
  h.search();
  expect(h.requests).toHaveLength(2);
  h.reply(1, [PARIS]);
  expect(h.result.current).toMatchObject({ busy: false, message: "weather.searchResults", results: [PARIS] });
});

test("editing cancels the previous request and a late reply cannot replace the new results", () => {
  const h = harness();
  h.query("Paris");
  h.search();
  h.query("Boston");
  expect(h.requests[0].cancel).toHaveBeenCalledOnce();
  expect(h.result.current).toMatchObject({ busy: false, message: "", results: [] });
  h.search();
  h.reply(1, [BOSTON]);
  h.reply(0, [PARIS]);
  expect(h.result.current.results).toEqual([BOSTON]);
});

test("clearing an editor cancels work, retains the draft and rejects a late result", () => {
  const h = harness();
  h.query("Paris");
  h.search();
  void act(() => h.result.current.clear());
  expect(h.requests[0].cancel).toHaveBeenCalledOnce();
  h.reply(0, [PARIS]);
  expect(h.result.current).toMatchObject({ query: "Paris", busy: false, message: "", results: [] });
  h.search();
  expect(h.requests).toHaveLength(2);
});

test("deactivation cancels work and prevents searches or old replies after reopening", () => {
  const h = harness();
  h.query("Paris");
  h.search();
  h.rerender({ enabled: false });
  expect(h.requests[0].cancel).toHaveBeenCalledOnce();
  h.search();
  expect(h.requests).toHaveLength(1);
  h.rerender({ enabled: true });
  h.reply(0, [PARIS]);
  expect(h.result.current).toMatchObject({ busy: false, message: "", results: [] });
  h.search();
  h.reply(1, [BOSTON]);
  expect(h.result.current.results).toEqual([BOSTON]);
});

test("an inactive editor makes no request and unmount cancels its active request", () => {
  const h = harness(false);
  h.query("Paris");
  h.search();
  expect(h.requests).toHaveLength(0);
  h.rerender({ enabled: true });
  h.search();
  h.unmount();
  expect(h.requests[0].cancel).toHaveBeenCalledOnce();
  h.reply(0, [PARIS]);
  expect(h.result.current.results).toEqual([]);
});
