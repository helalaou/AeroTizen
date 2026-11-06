import type { ComponentChildren } from "preact";

import styles from "./SettingsSection.module.css";

export const SettingsSection = ({
  title,
  description,
  children,
  hidden,
  label,
}: {
  title: string;
  description?: string;
  children: ComponentChildren;
  hidden?: boolean;
  label?: string;
}) => (
  <section class={styles.section} hidden={hidden} aria-label={label}>
    <header class={styles.header}>
      <h3 class={styles.title}>{title}</h3>
      {description && <p class={styles.description}>{description}</p>}
    </header>
    {children}
  </section>
);
