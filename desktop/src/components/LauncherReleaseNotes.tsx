import { Anchor, List, Stack, Text, Title } from "@mantine/core";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import type { LauncherRelease } from "../contracts";
import styles from "../styles.module.css";

export function LauncherReleaseNotes({ release }: { release: LauncherRelease }) {
  const [linkFailed, setLinkFailed] = useState(false);
  const url = `https://github.com/helalaou/AeroTizen/releases/tag/launcher-v${encodeURIComponent(release.version)}`;

  return (
    <details open className={styles.releaseNotes}>
      <summary>What’s new</summary>
      <Stack gap="sm" mt="xs">
        {release.sections.length === 0 && (
          <Text c="dimmed" size="sm">
            No changes listed. See the release on GitHub for details.
          </Text>
        )}
        {release.sections.map(({ heading, changes }, sectionIndex) => (
          <Stack key={sectionIndex} gap={4}>
            {heading && (
              <Title order={4} size="sm">
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
        <Anchor
          size="sm"
          c="blue.7"
          underline="always"
          className={styles.releaseLink}
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
          <ExternalLink size={14} aria-hidden="true" />
        </Anchor>
        {linkFailed && (
          <Text role="alert" c="red" size="sm">
            Could not open your browser. Try again.
          </Text>
        )}
      </Stack>
    </details>
  );
}
