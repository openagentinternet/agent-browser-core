import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_PACKAGE_NAMES, BROWSER_WORKSPACES } from "./browser-workspaces.mjs";

const INTERNAL_DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "devDependencies"];
const TAG_PATTERN = /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/;
const scriptPath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(scriptPath), "..");

export async function verifyReleaseVersion(input = {}) {
  const options = typeof input === "string" ? { tag: input } : input;
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const tag = options.tag;
  const tagVersion = parseTagVersion(tag);

  const rootManifest = await readJson(path.join(repoRoot, "package.json"));
  const releaseVersion = rootManifest.version;

  if (tagVersion !== releaseVersion) {
    throw new Error(`Tag version ${tagVersion} does not match root package version ${releaseVersion}`);
  }

  const compatibility = await readJson(path.join(repoRoot, "release/compatibility.json"));
  if (compatibility.version !== releaseVersion) {
    throw new Error(
      `Compatibility version ${compatibility.version} does not match root package version ${releaseVersion}`,
    );
  }

  for (const packageName of BROWSER_PACKAGE_NAMES) {
    const packageVersion = compatibility.packages?.[packageName];
    if (packageVersion !== releaseVersion) {
      throw new Error(
        `Compatibility package ${packageName} is ${packageVersion}, expected ${releaseVersion}`,
      );
    }
  }

  for (const workspace of BROWSER_WORKSPACES) {
    const manifest = await readJson(path.join(repoRoot, workspace.path, "package.json"));

    if (manifest.name !== workspace.name) {
      throw new Error(`${workspace.path}/package.json name is ${manifest.name}, expected ${workspace.name}`);
    }

    if (manifest.version !== releaseVersion) {
      throw new Error(`${workspace.name} version ${manifest.version} does not match release version ${releaseVersion}`);
    }

    validateInternalDependencyPins(manifest, releaseVersion);
  }

  return { version: releaseVersion };
}

function parseTagVersion(tag) {
  if (typeof tag !== "string") {
    throw new Error("Release tag is required");
  }

  const match = tag.match(TAG_PATTERN);
  if (!match) {
    throw new Error(`Release tag ${tag} must match vX.Y.Z`);
  }

  return match[1];
}

function validateInternalDependencyPins(manifest, releaseVersion) {
  for (const field of INTERNAL_DEPENDENCY_FIELDS) {
    const dependencies = manifest[field] ?? {};

    for (const packageName of BROWSER_PACKAGE_NAMES) {
      const dependencyVersion = dependencies[packageName];
      if (dependencyVersion !== undefined && dependencyVersion !== releaseVersion) {
        throw new Error(
          `${manifest.name} depends on ${packageName}@${dependencyVersion}, expected ${releaseVersion}`,
        );
      }
    }
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

if (process.argv[1] === scriptPath) {
  try {
    const result = await verifyReleaseVersion({ tag: process.argv[2] });
    console.log(`Agent Browser Core release version verified: ${result.version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
