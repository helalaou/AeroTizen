import type { ComponentChildren } from "preact";

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
  <section class="settings-section" hidden={hidden} aria-label={label}>
    <header class="settings-section__header">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </header>
    {children}
  </section>
);
