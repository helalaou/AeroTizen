import styles from "./AppFallback.module.css";

export type AppFallbackVariant = "home" | "favourite" | "source" | "badge";

export const AppFallback = ({
  title,
  hidden,
  compact = false,
  variant = "home",
}: {
  title: string;
  hidden: boolean;
  compact?: boolean;
  variant?: AppFallbackVariant;
}) => (
  <div
    class={styles.fallback + " " + styles[variant] + (compact ? " " + styles.compact : "")}
    data-app-fallback
    hidden={hidden}
  >
    <div class={styles.label}>{title}</div>
  </div>
);
