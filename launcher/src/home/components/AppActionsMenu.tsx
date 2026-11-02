import { useLayoutEffect, useRef, useState } from "preact/hooks";

import { useStore } from "../../shared/hooks/useStore";
import type { HomeEnvironment } from "../types";
export const AppActionsMenu = ({ env }: { env: HomeEnvironment }) => {
  const { menu } = useStore(env.state),
    panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: "0px", top: "0px" });
  useLayoutEffect(() => {
    const origin = menu && env.nodes.get("app:" + menu.id),
      element = panel.current;
    if (!origin || !element) {
      return;
    }
    const rect = origin.getBoundingClientRect(),
      width = Math.min(382, window.innerWidth - 48);
    const left = rect.right + 20 + width > window.innerWidth - 24 ? rect.left - width - 20 : rect.right + 20;
    setPosition({
      left: Math.max(24, Math.min(window.innerWidth - width - 24, left)) + "px",
      top: Math.max(24, Math.min(window.innerHeight - element.offsetHeight - 24, rect.top + 10)) + "px",
    });
  }, [env, menu]);
  if (!menu) {
    return null;
  }
  return (
    <>
      <div class="app-actions-menu__backdrop is-open" aria-hidden="true" onClick={env.dismiss} />
      <div
        ref={panel}
        style={position}
        class="app-actions-menu is-open"
        role="menu"
        aria-label={env.translate("App actions")}
      >
        <div
          class="app-actions-menu__focus-indicator"
          aria-hidden="true"
          style={{ transform: "translate3d(0," + menu.selected * 64 + "px,0)" }}
        />
        {env.menuChoices().map((choice, i) => (
          <div
            key={choice.action}
            class={"app-actions-menu__option" + (menu.selected === i ? " selected" : "")}
            role="menuitem"
            aria-selected={menu.selected === i}
            onClick={() => env.choose(i)}
          >
            <span class="app-actions-menu__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                {choice.action !== "move" ? <rect x="4" y="4" width="16" height="16" rx="4" /> : null}
                <path
                  d={
                    choice.action === "add"
                      ? "M12 8v8M8 12h8"
                      : choice.action === "move"
                        ? "M12 3v18M3 12h18M8 6.5 12 3l4 3M8 18l4 3 4-3M6 8l-3 4 3 4M18 8l3 4-3 4"
                        : "M8 12h8"
                  }
                />
              </svg>
            </span>
            <span class="app-actions-menu__label">{env.translate(choice.label)}</span>
          </div>
        ))}
      </div>
    </>
  );
};
