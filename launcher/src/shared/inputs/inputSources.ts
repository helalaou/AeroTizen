import type { InputSource } from "../../contracts/launcher";

const PLACEHOLDER =
  /^(?:hdmi(?: \d+)?|ingresso(?: hdmi)?(?: \d+)?|source(?: hdmi)?(?: \d+)?|input(?: hdmi)?(?: \d+)?|sorgente(?: hdmi)?(?: \d+)?|unknown(?: device)?|unrecognized(?: device)?|unrecognised(?: device)?|dispositivo sconosciuto|sconosciuto|non riconosciuto|nessun dispositivo|no device|not connected|non collegato|disconnected)$/i;

export const sourceKey = (source: InputSource) => source.type + ":" + source.number;

export const hasRecognizedDevice = (source: InputSource) => {
  if (source.type !== "HDMI" || typeof source.editName !== "string") {
    return false;
  }
  const name = source.editName.replace(/\s+/g, " ").trim();
  const ordinary = name
    .toLowerCase()
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !!name && !PLACEHOLDER.test(ordinary);
};

// Native records stay in the adapter. Only view data enters a service snapshot.
export const inputRecord = (source: InputSource): InputSource => ({
  type: source.type,
  number: source.number,
  editName: source.editName,
  connected: source.connected,
  active: source.active,
});
