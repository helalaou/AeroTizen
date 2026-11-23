import "@mantine/core/styles.css";
import { MantineProvider, createTheme } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { DesktopApp } from "./DesktopApp";
import { nativeService } from "./services/native";
import "./global.css";

const theme = createTheme({
  primaryColor: "blue",
  primaryShade: 6,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: '"Bricolage Grotesque", var(--mantine-font-family)',
    fontWeight: "700",
    sizes: { h1: { fontSize: "2rem", lineHeight: "1.2" } },
  },
  defaultRadius: "md",
  colors: {
    blue: [
      "#eff6ff",
      "#dbeafe",
      "#bfdbfe",
      "#93c5fd",
      "#60a5fa",
      "#3b82f6",
      "#2563eb",
      "#1d4ed8",
      "#1e40af",
      "#1e3a8a",
    ],
  },
  components: { Button: { defaultProps: { size: "sm", fw: 500 } }, NavLink: { styles: { root: { borderRadius: 8 } } } },
});

const desktopService = "__TAURI_INTERNALS__" in window ? nativeService : undefined;
const root = document.getElementById("root");
if (!root) throw new Error("The app root is missing");
createRoot(root).render(
  <MantineProvider theme={theme} forceColorScheme="light">
    <DesktopApp nativeService={desktopService} />
  </MantineProvider>,
);
