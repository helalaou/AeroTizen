import { expect, test, vi } from "vitest";

import { focusControl } from "./focusControl";

test("focus preserves the scroll offsets when the browser ignores focus options", () => {
  const outer = document.createElement("div");
  const inner = document.createElement("div");
  const button = document.createElement("button");
  outer.append(inner);
  inner.append(button);
  document.body.append(outer);
  outer.scrollTop = 40;
  const nativeFocus = button.focus.bind(button);
  const focus = vi.spyOn(button, "focus").mockImplementation(() => {
    nativeFocus();
    outer.scrollTop = 80;
    inner.scrollLeft = 120;
  });

  try {
    focusControl(button);

    expect(document.activeElement).toBe(button);
    expect(outer.scrollTop).toBe(40);
    expect(inner.scrollLeft).toBe(0);
  } finally {
    focus.mockRestore();
    outer.remove();
  }
});
