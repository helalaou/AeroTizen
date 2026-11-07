import type { LucideIcon, LucideProps } from "lucide-preact";

import styles from "./Icon.module.css";

export const ICON_DEFAULTS = { size: 24, strokeWidth: 2, color: "currentColor" } as const;
interface Props extends Omit<
  LucideProps,
  "aria-hidden" | "aria-label" | "children" | "role" | "focusable" | "class" | "className"
> {
  class?: string;
  icon: LucideIcon;
  label?: string;
  mirrorInRtl?: boolean;
}

// Controls supply their own labels. Standalone status icons opt into a label.
export const Icon = ({ icon: Glyph, label, mirrorInRtl = false, class: className = "", ...props }: Props) => (
  <Glyph
    {...ICON_DEFAULTS}
    {...props}
    class={styles.icon + " " + className + (mirrorInRtl ? " " + styles.mirror : "")}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? "img" : undefined}
    focusable="false"
  />
);
