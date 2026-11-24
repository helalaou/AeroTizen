import { invoke, isTauri } from "@tauri-apps/api/core";
import { formatDesktopLog, type DesktopLogEntry } from "./desktopLogs";

const URL_RELEASE_DELAY_MS = 1000;

interface ExportOptions {
  simulator: boolean;
  tvId: string | null;
  includeTv: boolean;
  includeHome: boolean;
}

interface ExportResult {
  saved: boolean;
  unavailable?: string[];
}

export async function exportLogs(entries: readonly DesktopLogEntry[], options: ExportOptions): Promise<ExportResult> {
  if (isTauri()) return invoke<ExportResult>("save_desktop_logs", { contents: JSON.stringify(entries), options });

  const date = new Date().toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-");
  const contents = formatDesktopLog(entries, options.simulator);
  const url = URL.createObjectURL(new Blob([contents], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `aerotizen-desktop-${date}.log`;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), URL_RELEASE_DELAY_MS);
  }
  return { saved: true };
}
