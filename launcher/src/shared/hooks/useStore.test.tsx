import { act, render, screen } from "@testing-library/preact";
import { expect, test, vi } from "vitest";

import { createStore } from "../state/createStore";

import { useStoreSelector } from "./useStore";

test("only controls whose focus changes render when selection moves", async () => {
  const store = createStore({ selected: "first", active: true });
  const rendered = vi.fn<(id: string) => void>();
  const Control = ({ id }: { id: string }) => {
    const focused = useStoreSelector(store, (state) => state.active && state.selected === id);
    rendered(id);
    return <button aria-pressed={focused}>{id}</button>;
  };
  render(
    <>
      {["first", "second", "third"].map((id) => (
        <Control key={id} id={id} />
      ))}
    </>,
  );
  rendered.mockClear();
  await act(() => store.set({ selected: "second", active: true }));
  expect(rendered.mock.calls.map(([id]) => id).sort()).toEqual(["first", "second"]);
  expect(screen.getByRole("button", { name: "second" }).getAttribute("aria-pressed")).toBe("true");
  rendered.mockClear();
  await act(() => store.set({ selected: "second", active: false }));
  expect(rendered.mock.calls).toEqual([["second"]]);
});
