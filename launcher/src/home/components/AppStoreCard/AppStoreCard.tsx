import { AppStoreContent } from "../../../shared/components/AppStoreContent/AppStoreContent";
import { useTranslation } from "../../../shared/i18n/useTranslation";
import { ADD_APPS_KEY } from "../../homeControls";
import type { HomeEnvironment } from "../../types";
import { HomeAppCard } from "../HomeAppCard/HomeAppCard";

export const AppStoreCard = ({ env, registered }: { env: HomeEnvironment; registered: boolean }) => {
  const { t } = useTranslation();
  return (
    <HomeAppCard env={env} controlKey={ADD_APPS_KEY} registered={registered} title={t("apps.add")}>
      <AppStoreContent variant="home" />
    </HomeAppCard>
  );
};
