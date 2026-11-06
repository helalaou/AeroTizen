import type { ComponentChildren, JSX } from "preact";

import styles from "./SettingsHeading.module.css";

interface Props extends Omit<JSX.HTMLAttributes<HTMLHeadingElement>, "children" | "class" | "title"> {
  children?: ComponentChildren;
  class?: string;
  description?: string;
  descriptionId?: string;
  kicker?: string;
  title: string;
  variant?: "panel" | "section";
}

export const SettingsHeading = ({
  title,
  description,
  descriptionId,
  kicker,
  variant = "panel",
  children,
  class: className = "",
  ...headingProps
}: Props) => {
  const Heading = variant === "section" ? "h3" : "h2";
  return (
    <header class={className} data-settings-heading={variant}>
      {kicker && <span class={styles.kicker}>{kicker}</span>}
      <Heading {...headingProps} class={styles.title} data-settings-heading-title data-variant={variant}>
        {title}
      </Heading>
      {description && (
        <p class={styles.description} id={descriptionId} data-settings-heading-description>
          {description}
        </p>
      )}
      {children}
    </header>
  );
};
