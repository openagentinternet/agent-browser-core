import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { BROWSER_WORKSPACES } from "../../scripts/browser-workspaces.mjs";
import { verifyReleaseVersion } from "../../scripts/verify-release-version.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

async function copyFixtureRepo() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "agent-browser-release-"));

  await Promise.all([
    copyFile("package.json", fixtureRoot),
    copyFile("release/compatibility.json", fixtureRoot),
    ...BROWSER_WORKSPACES.map((workspace) => copyFile(path.join(workspace.path, "package.json"), fixtureRoot)),
  ]);

  return fixtureRoot;
}

async function copyFile(relativePath, fixtureRoot) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(fixtureRoot, relativePath);
  const contents = await readFile(sourcePath, "utf8");
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents, "utf8");
}

async function mutateJson(filePath, mutate) {
  const contents = JSON.parse(await readFile(filePath, "utf8"));
  mutate(contents);
  await writeFile(filePath, `${JSON.stringify(contents, null, 2)}\n`, "utf8");
}

test("accepts repo tag v0.4.0", async () => {
  const result = await verifyReleaseVersion({ tag: "v0.4.0", repoRoot });

  assert.deepEqual(result, { version: "0.4.0" });
});

test("rejects repo tag v0.2.0", async () => {
  await assert.rejects(
    () => verifyReleaseVersion({ tag: "v0.2.0", repoRoot }),
    /Tag version 0\.2\.0 does not match root package version 0\.4\.0/,
  );
});

test("rejects mismatched internal dependency pin", async () => {
  const fixtureRoot = await copyFixtureRepo();

  try {
    await mutateJson(path.join(fixtureRoot, "packages/core/package.json"), (manifest) => {
      manifest.dependencies["@openagentinternet/agent-browser-host-contract"] = "0.2.0";
    });

    await assert.rejects(
      () => verifyReleaseVersion({ tag: "v0.4.0", repoRoot: fixtureRoot }),
      /@openagentinternet\/agent-browser-core depends on @openagentinternet\/agent-browser-host-contract@0\.2\.0, expected 0\.4\.0/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
