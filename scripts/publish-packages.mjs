import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { BROWSER_WORKSPACES } from "./browser-workspaces.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(scriptPath), "..");

export async function publishPackages(input = {}) {
  const dryRun = input.dryRun ?? false;
  const log = input.log ?? console.log;

  for (const workspace of BROWSER_WORKSPACES) {
    const manifest = await readJson(path.join(REPO_ROOT, workspace.path, "package.json"));
    const label = `${manifest.name}@${manifest.version}`;

    if (dryRun) {
      log(`DRY RUN publish ${label}`);
      continue;
    }

    if (await isPublished(label)) {
      log(`${label} is already published; skipping.`);
      continue;
    }

    log(`Publishing ${label}`);
    await execFileAsync("npm", ["publish", "--workspace", workspace.name, "--access", "public"], {
      cwd: REPO_ROOT,
    });
  }
}

function parseArgs(args) {
  return {
    dryRun: args.includes("--dry-run"),
  };
}

async function isPublished(label) {
  try {
    await execFileAsync("npm", ["view", label, "version"], {
      cwd: REPO_ROOT,
    });
    return true;
  } catch (error) {
    if (String(error.stderr).includes("E404") || String(error.message).includes("E404")) {
      return false;
    }
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1] === scriptPath) {
  try {
    await publishPackages(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
