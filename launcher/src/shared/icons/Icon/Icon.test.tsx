import { render } from "@testing-library/preact";
import { Settings } from "lucide-preact";
import { expect, test } from "vitest";

import { Icon } from "./Icon";

test("decorative icons stay out of the accessibility tree and use the shared stroke", () => {
  const { container } = render(<Icon icon={Settings} />);
  const icon = container.querySelector("svg");
  expect(icon?.getAttribute("aria-hidden")).toBe("true");
  expect(icon?.getAttribute("focusable")).toBe("false");
  expect(icon?.getAttribute("stroke")).toBe("currentColor");
  expect(icon?.getAttribute("stroke-width")).toBe("2");
});
