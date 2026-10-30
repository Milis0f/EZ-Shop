// `npm run search:setup` and `npm run search:start`: on Windows the scripts run inside WSL.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = { setup: "searxng-setup.sh", start: "searxng-run.sh" };
const script = SCRIPTS[process.argv[2]];
if (!script) {
  console.error("Usage: node scripts/searxng.mjs setup|start");
  process.exit(2);
}
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), script);
/** WSL's view of a Windows path. `wsl --exec` runs no shell, so spaces and "&" in the path are safe. */
const wslPath = (windowsPath) => `/mnt/${windowsPath[0].toLowerCase()}/${windowsPath.slice(3).replaceAll("\\", "/")}`;
const [command, args] = process.platform === "win32" ? ["wsl", ["--exec", "bash", wslPath(file)]] : ["bash", [file]];
const child = spawn(command, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(`Could not start ${command}: ${error.message}`);
  process.exit(1);
});
