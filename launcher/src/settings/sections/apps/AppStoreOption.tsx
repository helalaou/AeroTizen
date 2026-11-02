import { AddIcon } from "../../../shared/icons/AddIcon";
import { SettingsControl } from "../../components/SettingsControl";

export const AppStoreOption = ({ onSelect }: { onSelect(): void }) => (
  <SettingsControl class="tile addapps" focusKey="add" role="button" onClick={onSelect}>
    <AddIcon />
    <div class="name">
      Add apps<div class="sub">Samsung app store</div>
    </div>
  </SettingsControl>
);
