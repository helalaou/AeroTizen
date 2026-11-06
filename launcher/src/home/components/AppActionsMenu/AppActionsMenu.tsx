import { Move, SquareMinus, SquarePlus } from "lucide-preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

import { useStore } from "../../../shared/hooks/useStore";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { Icon } from "../../../shared/icons/Icon/Icon";
import type { HomeEnvironment } from "../../types";

import styles from "./AppActionsMenu.module.css";
const ACTION_ICONS = { add: SquarePlus, move: Move, remove: SquareMinus } as const;

export const AppActionsMenu = ({ env }: { env: HomeEnvironment }) => {
  const { t } = useTranslation();
  const { menu } = useStore(env.state);
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: "0px", top: "0px" });
  useLayoutEffect(() => {
    const origin = menu && env.nodes.get("app:" + menu.id);
    const element = panel.current;
    if (!origin || !element) {
      return;
    }
    const rect = origin.getBoundingClientRect();
    const width = Math.min(382, window.innerWidth - 48);
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
      <div class={styles.backdrop} data-app-actions-backdrop aria-hidden="true" onClick={env.dismiss} />
      <div ref={panel} style={position} class={styles.menu} role="menu" aria-label={t("home.appActions")}>
        <div
          class={styles.focus}
          data-app-actions-focus
          aria-hidden="true"
          style={{ transform: "translate3d(0," + menu.selected * 64 + "px,0)" }}
        />
        {env.menuChoices().map((choice, i) => (
          <div
            key={choice.action}
            class={styles.option}
            role="menuitem"
            aria-selected={menu.selected === i}
            onClick={() => env.choose(i)}
          >
            <span class={styles.icon} aria-hidden="true">
              <Icon icon={ACTION_ICONS[choice.action]} />
            </span>
            <span class={styles.label}>{t(choice.label)}</span>
          </div>
        ))}
      </div>
    </>
  );
};
