import type { ComponentChildren } from "preact";

import styles from "./ControlGroup.module.css";

export const ControlGroup = ({
  id,
  label,
  grid = false,
  children,
}: {
  id: string;
  label?: string;
  grid?: boolean;
  children: ComponentChildren;
}) => (
  <div
    id={id}
    class={styles.group + (grid ? " " + styles.grid : "")}
    role={label ? "group" : undefined}
    aria-label={label}
  >
    {children}
  </div>
);
