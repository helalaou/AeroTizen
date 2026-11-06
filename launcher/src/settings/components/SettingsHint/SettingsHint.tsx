import type { JSX } from "preact";

import styles from "./SettingsHint.module.css";

interface Props extends Omit<JSX.HTMLAttributes<HTMLParagraphElement>, "class"> {
  class?: string;
}

export const SettingsHint = ({ class: className = "", ...props }: Props) => (
  <p {...props} class={styles.hint + " " + className} />
);
