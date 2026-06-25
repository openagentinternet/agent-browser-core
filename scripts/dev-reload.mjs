#!/usr/bin/env node
// Rebuild the TypeScript workspace and restart the standalone launchd service
// so http://127.0.0.1:<port>/browser serves the latest code.
//
// Run via: npm run dev:reload
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PLIST_NAME = "com.openagentinternet.agent-browser-core-8787";
const plistPath = path.join(homedir(), "Library", "LaunchAgents", `${PLIST_NAME}.plist`);

function run(file, args, label) {
  process.stdout.write(`▶ ${label}\n`);
  execFileSync(file, args, { stdio: "inherit" });
}

function main() {
  // 1. Build all packages into dist/.
  run("npm", ["run", "build"], "Building packages (npm run build)");

  // 2. Restart the launchd-managed standalone service.
  if (!existsSync(plistPath)) {
    process.stderr.write(
      `✗ LaunchAgent not found: ${plistPath}\n` +
        "  Start it manually with: npm run dev:standalone -- --port 8787\n",
    );
    process.exitCode = 1;
    return;
  }

  run("launchctl", ["unload", plistPath], `Unloading ${PLIST_NAME}`);
  run("launchctl", ["load", plistPath], `Loading ${PLIST_NAME}`);

  process.stdout.write("\n✅ Reload complete. Hard-refresh the browser (Cmd+Shift+R):\n");
  process.stdout.write("   http://127.0.0.1:8787/browser\n");
}

main();
