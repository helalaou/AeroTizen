import { CirclePlus } from "lucide-preact";
import type { ComponentChildren, VNode } from "preact";

import { useTranslation } from "../../i18n/useTranslation";
import { Icon } from "../../icons/Icon/Icon";

import styles from "./StoreCard.module.css";

interface ControlProps {
  children: ComponentChildren;
  className: string;
  label: string;
}

interface Props {
  renderControl(props: ControlProps): VNode;
  size: "large" | "small";
}

export const StoreCard = ({ size, renderControl }: Props) => {
  const { t } = useTranslation();
  return renderControl({
    className: styles.card + " " + styles[size],
    label: t("apps.add"),
    children: (
      <>
        <Icon icon={CirclePlus} class={styles.icon} data-app-store-part="icon" />
        <div class={styles.label} data-app-store-part="label">
          {t("apps.add")}
          <div class={styles.subtitle} data-app-store-part="subtitle">
            {t("apps.store")}
          </div>
        </div>
      </>
    ),
  });
};
