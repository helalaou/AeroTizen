import { Anchor, Group, List, Stack, Text, Title } from "@mantine/core";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import type { LauncherRelease } from "../contracts";

export function LauncherReleaseNotes({ release }: { release: LauncherRelease }) {
  const [linkFailed, setLinkFailed] = useState(false);
  const url = `https://github.com/helalaou/AeroTizen/releases/tag/launcher-v${encodeURIComponent(release.version)}`;

  return (
    <Stack component="section" aria-labelledby="launcher-release-notes" gap="sm" style={{ overflowWrap: "anywhere" }}>
      <Group justify="space-between" gap="xs">
        <Title id="launcher-release-notes" order={2} size="h4">
          Changes in {release.version}
        </Title>
        <Anchor
          size="sm"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            if (!isTauri()) return;
            event.preventDefault();
            setLinkFailed(false);
            void openUrl(url).catch(() => setLinkFailed(true));
          }}
        >
          View release on GitHub
        </Anchor>
      </Group>
      {linkFailed && (
        <Text role="alert" c="red" size="sm">
          Could not open your browser. Try again.
        </Text>
      )}
      {release.sections.length === 0 && (
        <Text c="dimmed" size="sm">
          No changes listed. See the release on GitHub for details.
        </Text>
      )}
      {release.sections.map(({ heading, changes }, sectionIndex) => (
        <Stack key={sectionIndex} gap={4}>
          {heading && (
            <Title order={3} size="sm">
              {heading}
            </Title>
          )}
          <List size="sm" spacing={4}>
            {changes.map((change, changeIndex) => (
              <List.Item key={changeIndex}>{change}</List.Item>
            ))}
          </List>
        </Stack>
      ))}
    </Stack>
  );
}
