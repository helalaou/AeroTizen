import { StoreCard } from "../../../../shared/components/StoreCard/StoreCard";
import { SettingsControl } from "../../../components/SettingsControl/SettingsControl";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => {
  return (
    <StoreCard
      size="small"
      renderControl={({ className, label, children }) => (
        <SettingsControl
          class={className}
          focusKey="add"
          onClick={onSelect}
          role="button"
          aria-label={label}
          title={label}
          data-settings-card="store"
          data-settings-focus-owner="control"
        >
          {children}
        </SettingsControl>
      )}
    />
  );
};
