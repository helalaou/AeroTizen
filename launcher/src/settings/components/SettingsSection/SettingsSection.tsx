import type { ComponentChildren } from "preact";

import { SettingsHeading } from "../SettingsHeading/SettingsHeading";

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
    <SettingsHeading class={styles.header} title={title} description={description} variant="section" />
    {children}
  </section>
);
