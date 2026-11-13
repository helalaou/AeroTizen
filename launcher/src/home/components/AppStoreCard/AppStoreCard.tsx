import { StoreCard } from "../../../shared/components/StoreCard/StoreCard";
import { ADD_APPS_KEY } from "../../homeControls";
import type { HomeEnvironment } from "../../types";
import { HomeControl } from "../HomeControl/HomeControl";

export const AppStoreCard = ({ env, registered }: { env: HomeEnvironment; registered: boolean }) => {
  return (
    <StoreCard
      size="large"
      renderControl={({ className, label, children }) => (
        <HomeControl env={env} controlKey={ADD_APPS_KEY} registered={registered} className={className} title={label}>
          {children}
        </HomeControl>
      )}
    />
  );
};
