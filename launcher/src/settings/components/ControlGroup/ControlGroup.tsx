import type { ComponentChildren } from "preact";

import styles from "./ControlGroup.module.css";

export const ControlGroup = ({ id, label, children }: { id: string; label?: string; children: ComponentChildren }) => (
  <div id={id} class={styles.group} data-settings-control-group role={label ? "group" : undefined} aria-label={label}>
    {children}
  </div>
);
