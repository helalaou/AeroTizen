import { Button, Stack, Text } from "@mantine/core";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { SavedTv } from "../contracts";
import { githubIssueUrl } from "../tvDetails";

export function GithubReportButton({ profile, backendVersion }: { profile: SavedTv; backendVersion?: string }) {
  const [failed, setFailed] = useState(false);
  const href = githubIssueUrl(profile, backendVersion);

  return (
    <Stack align="flex-start" gap="xs">
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
          setFailed(false);
          void openUrl(href).catch(() => setFailed(true));
        }}
      >
        Report issue
      </Button>
      {failed && (
        <Text role="alert" c="red" size="sm">
          Could not open your browser. Try again.
        </Text>
      )}
    </Stack>
  );
}
