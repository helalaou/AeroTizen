import type { InputSource } from "../contracts/launcher";

export const previewInputs: readonly InputSource[] = Object.freeze([
  Object.freeze({ type: "HDMI", number: 1, editName: "Xbox", connected: true }),
  Object.freeze({ type: "HDMI", number: 2, connected: false }),
  Object.freeze({ type: "HDMI", number: 3, editName: "PC", connected: false }),
  Object.freeze({ type: "TV", number: 1, connected: true }),
]);
