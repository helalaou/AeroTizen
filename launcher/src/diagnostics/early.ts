import { createStartupTracing } from "./createStartupTracing";
import { installUiDiagnostics } from "./installUiDiagnostics";

// This classic bundle runs in the head before the main UI bundle can fail.
window.AeroDiagnostics = installUiDiagnostics(window);
window.AeroStartup = createStartupTracing(window);
