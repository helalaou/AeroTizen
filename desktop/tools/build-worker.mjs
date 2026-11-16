import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const pythonPath = resolve("..", ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const python = process.env.AEROTIZEN_PYTHON || pythonPath;
if (!process.env.AEROTIZEN_PYTHON && !existsSync(python)) {
  throw new Error("Create the repository .venv and install its development dependencies and PyInstaller first.");
}
const result = spawnSync(python, ["../cli/tools/build_desktop_worker.py", "--output", "src-tauri/binaries"], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
