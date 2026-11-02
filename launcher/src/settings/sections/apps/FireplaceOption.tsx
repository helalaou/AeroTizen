import { FlameIcon } from "../../../shared/icons/FlameIcon";
import { SettingsControl } from "../../components/SettingsControl";

export const FireplaceOption = ({ id, selected, onSelect }: { id: string; selected: boolean; onSelect(): void }) => (
  <SettingsControl
    class={"tile fire" + (selected ? " on" : "")}
    focusKey={"app:" + id}
    role="button"
    aria-label="Fireplace"
    aria-pressed={selected}
    onClick={onSelect}
  >
    <FlameIcon />
    <div class="name">Fireplace</div>
  </SettingsControl>
);
