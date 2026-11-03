import { CirclePlus } from "lucide-preact";

import { Icon } from "../../../shared/icons/Icon";
import { SettingsControl } from "../../components/SettingsControl";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => (
  <SettingsControl class="tile addapps" focusKey="add" role="button" onClick={onSelect}>
    <Icon icon={CirclePlus} class="logo" />
    <div class="name">
      Add apps<div class="sub">Samsung app store</div>
    </div>
  </SettingsControl>
);
