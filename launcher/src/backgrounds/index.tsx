import { render } from "preact";

import type { WaveBackgroundRenderer } from "../contracts/backgrounds";

import { WaveBackground } from "./WaveBackground";

export const mountWaveBackground: WaveBackgroundRenderer = (mount, speed) => {
  render(<WaveBackground speed={speed} />, mount);
  return () => render(null, mount);
};
