import { AppStoreContent } from "../../../../shared/components/AppStoreContent/AppStoreContent";
import { SettingsAppCard } from "../SettingsAppCard/SettingsAppCard";

import styles from "./AppStoreOption.module.css";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => {
  return (
    <SettingsAppCard class={styles.store} focusKey="add" onClick={onSelect}>
      <AppStoreContent variant="settings" />
    </SettingsAppCard>
  );
};
