import { Notifications, notifications } from "@mantine/notifications";
import { Check, CircleAlert } from "lucide-react";
import { useEffect } from "react";
import styles from "./styles.module.css";

const SUCCESS_DURATION_MS = 4000;
const ERROR_DURATION_MS = 8000;

export function showToast(message: string, tone: "success" | "error" = "success") {
  const failed = tone === "error";
  const Icon = failed ? CircleAlert : Check;
  notifications.show({
    message,
    color: failed ? "red" : "green",
    role: failed ? "alert" : "status",
    icon: <Icon size={16} aria-hidden="true" />,
    closeButtonProps: { "aria-label": "Dismiss notification" },
    autoClose: failed ? ERROR_DURATION_MS : SUCCESS_DURATION_MS,
  });
}

export function Toasts() {
  useEffect(() => () => notifications.clean(), []);
  return (
    <Notifications position="bottom-center" containerWidth={380} limit={2} classNames={{ root: styles.toastStack }} />
  );
}
