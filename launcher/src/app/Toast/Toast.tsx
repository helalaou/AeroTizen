import styles from "./Toast.module.css";

export const Toast = ({ message }: { message: string | null }) => (
  <div id="toast" role="status" class={styles.toast} hidden={message === null}>
    {message}
  </div>
);
