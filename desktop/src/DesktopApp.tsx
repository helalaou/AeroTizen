import { AppShell, Container, Stack, Text, Title } from "@mantine/core";
import { App } from "./App";
import { DESKTOP_HEADER, Header } from "./components/Header";
import type { DesktopService } from "./contracts";

export function DesktopApp({ nativeService }: { nativeService?: DesktopService }) {
  if (nativeService) return <App service={nativeService} />;
  return (
    <AppShell header={DESKTOP_HEADER}>
      <Header />
      <AppShell.Main>
        <Container size="sm" py="xl">
          <Stack gap="sm">
            <Title>AeroTizen Desktop</Title>
            <Text>Open the desktop app to connect to your TV.</Text>
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
