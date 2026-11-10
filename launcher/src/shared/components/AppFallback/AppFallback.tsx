import styles from "./AppFallback.module.css";

export type AppFallbackVariant = "home" | "favourite" | "source" | "badge";

export const AppFallback = ({
  title,
  hidden,
  variant = "home",
}: {
  title: string;
  hidden: boolean;
  variant?: AppFallbackVariant;
}) => (
  <div class={styles.fallback + " " + styles[variant]} data-app-fallback hidden={hidden}>
    <div class={styles.label}>{title}</div>
  </div>
);
