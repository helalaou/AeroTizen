import styles from "./Toast.module.css";

export const Toast = ({ message }: { message: string | null }) => (
  <div id="toast" class={styles.toast} hidden={message === null}>
    {message}
  </div>
);
