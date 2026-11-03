import { Check } from "lucide-preact";

import { Icon } from "../../shared/icons/Icon";

export const SelectionIndicator = () => (
  <div class="selection-indicator" aria-hidden="true">
    <Icon icon={Check} />
  </div>
);
