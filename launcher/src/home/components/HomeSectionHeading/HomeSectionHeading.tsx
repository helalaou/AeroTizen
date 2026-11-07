import styles from "./HomeSectionHeading.module.css";

export const HomeSectionHeading = ({ title }: { title: string }) => (
  <h2 class={styles.heading} data-home-section-heading>
    {title}
  </h2>
);
