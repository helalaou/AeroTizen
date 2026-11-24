import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const virtualPython = fileURLToPath(
  new URL(process.platform === "win32" ? "../../.venv/Scripts/python.exe" : "../../.venv/bin/python", import.meta.url),
);
const systemPython = process.platform === "win32" ? "python" : "python3";
const python = process.env.AEROTIZEN_PYTHON || (existsSync(virtualPython) ? virtualPython : systemPython);
const builder = fileURLToPath(new URL("../../cli/tools/build_desktop_helpers.py", import.meta.url));
const result = spawnSync(python, [builder], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
