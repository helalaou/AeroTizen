import type { ComponentChildren } from "preact";

import { SettingsHeading } from "../SettingsHeading/SettingsHeading";

import styles from "./SettingsField.module.css";

interface Props {
  children: ComponentChildren;
  description?: ComponentChildren;
  details?: ComponentChildren;
  detailsHidden?: boolean;
  fullWidthDetails?: boolean;
  hidden?: boolean;
  title: string;
  topAligned?: boolean;
}

export const SettingsField = ({
  children,
  description,
  details,
  detailsHidden,
  fullWidthDetails,
  hidden,
  title,
  topAligned,
}: Props) => (
  <section class={styles.field + (topAligned ? " " + styles.topAligned : "")} hidden={hidden} data-settings-field>
    <SettingsHeading class={styles.heading} title={title} description={description} variant="section" />
    <div class={styles.controls} data-settings-field-controls>
      {children}
    </div>
    {details !== undefined && (
      <div
        class={styles.details + (fullWidthDetails ? " " + styles.fullWidthDetails : "")}
        hidden={detailsHidden}
        data-settings-field-details
      >
        {details}
      </div>
    )}
  </section>
);
