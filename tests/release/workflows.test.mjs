import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");

async function readWorkflow(name) {
  return readFile(path.join(repoRoot, ".github/workflows", name), "utf8");
}

test("release workflow delegates verified package publishing to script", async () => {
  const workflow = await readWorkflow("release.yml");

  assert.match(workflow, /tags:\s*\n\s*- 'v\*\.\*\.\*'/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /fetch-depth:\s*0/);
  assert.match(workflow, /git fetch origin main/);
  assert.match(workflow, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(workflow, /node-version:\s*22\.14\.0/);
  assert.match(workflow, /npm install -g npm@11\.5\.1/);
  assert.match(workflow, /npm --version/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /node scripts\/verify-release-version\.mjs "\$\{\{ github\.ref_name \}\}"/);
  assert.match(workflow, /node scripts\/publish-packages\.mjs/);
  assert.doesNotMatch(workflow, /npm publish --workspace/);
});

test("CI workflow verifies pushes and pull requests", async () => {
  const workflow = await readWorkflow("ci.yml");

  for (const expected of [
    "on:",
    "pull_request:",
    "push:",
    "npm ci",
    "npm run verify",
    "npm run verify:packages",
  ]) {
    assert.equal(workflow.includes(expected), true, `ci.yml contains ${expected}`);
  }
});
