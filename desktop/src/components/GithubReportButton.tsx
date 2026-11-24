import { Button } from "@mantine/core";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import type { SavedTv } from "../contracts";
import { showToast } from "../Toasts";
import { githubIssueUrl } from "../tvDetails";

export function GithubReportButton({ profile, backendVersion }: { profile: SavedTv; backendVersion?: string }) {
  const href = githubIssueUrl(profile, backendVersion);

  return (
    <Button
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant="default"
      rightSection={<ExternalLink size={16} />}
      onClick={(event) => {
        if (!isTauri()) return;
        event.preventDefault();
        void openUrl(href).catch(() => showToast("Could not open GitHub. Try again.", "error"));
      }}
    >
      Report issue
    </Button>
  );
}
