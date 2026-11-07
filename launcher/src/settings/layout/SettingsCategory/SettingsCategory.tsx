import type { LucideIcon } from "lucide-preact";
import { ChevronRight } from "lucide-preact";

import { Icon } from "../../../shared/icons/Icon/Icon";
import { SettingsControl } from "../../components/SettingsControl/SettingsControl";

import styles from "./SettingsCategory.module.css";

interface Props {
  accessibleLabel?: string;
  current?: boolean;
  expanded?: boolean;
  focusKey: string;
  hint?: string;
  icon: LucideIcon;
  id?: string;
  label: string;
  notice?: boolean;
  onSelect(): void;
  variant?: "category" | "return";
}

export const SettingsCategory = ({
  accessibleLabel,
  current = false,
  expanded,
  focusKey,
  hint,
  icon,
  id,
  label,
  notice = false,
  onSelect,
  variant = "category",
}: Props) => (
  <SettingsControl
    id={id}
    class={styles.item + (variant === "return" ? " " + styles.return : "")}
    data-current={current ? "true" : undefined}
    focusKey={focusKey}
    role="button"
    aria-label={accessibleLabel}
    aria-expanded={expanded}
    onClick={onSelect}
  >
    <span class={styles.icon}>
      <Icon icon={icon} />
    </span>
    {variant === "return" ? (
      <strong class={styles.title}>{label}</strong>
    ) : (
      <span class={styles.label}>
        <strong class={styles.title + " " + styles.categoryTitle}>
          {label}
          {notice && <span class={styles.notice} data-settings-update-notice aria-hidden="true" />}
        </strong>
        <small class={styles.hint}>{hint}</small>
      </span>
    )}
    {variant === "category" && (
      <span class={styles.chevron}>
        <Icon icon={ChevronRight} mirrorInRtl />
      </span>
    )}
  </SettingsControl>
);
