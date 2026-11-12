import { render } from "preact";

import type { InputPlaybackViewProps } from "./InputPlaybackView";
import { InputPlaybackView } from "./InputPlaybackView";

export const mountInputPlayback = (host: HTMLElement, props: Omit<InputPlaybackViewProps, "document">) => {
  render(<InputPlaybackView {...props} document={host.ownerDocument} />, host);
  return () => render(null, host);
};
