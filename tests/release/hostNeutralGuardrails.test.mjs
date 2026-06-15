import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "../..");
const forbidden = [
  "open-agent-connect",
  "src/daemon",
  ".metabot/hot",
  "IDBots",
  "SQLite",
  "sqlite",
  "Metalet",
];
const documentationExtensions = new Set([".md", ".mdx", ".txt", ".adoc"]);

function isDocumentationFile(filePath) {
  return documentationExtensions.has(path.extname(filePath));
}

test("package source stays free of host internals", async () => {
  const { stdout } = await execFileAsync("git", ["ls-files", "packages"]);
  const packageFiles = stdout.split("\n").filter(Boolean);
  const violations = [];

  for (const filePath of packageFiles) {
    if (isDocumentationFile(filePath)) continue;

    const contents = await readFile(path.join(repoRoot, filePath), "utf8");
    for (const value of forbidden) {
      if (contents.includes(value)) {
        violations.push(`${filePath} contains ${value}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('core and ui do not import standalone host packages', async () => {
  const { stdout } = await execFileAsync('git', ['ls-files', 'packages/core/src', 'packages/ui/src']);
  const sourceFiles = stdout.split('\n').filter((file) => file.endsWith('.ts'));
  const violations = [];

  for (const filePath of sourceFiles) {
    const contents = await readFile(path.join(repoRoot, filePath), 'utf8');
    if (contents.includes('agent-browser-host-standalone') || contents.includes('host-standalone')) {
      violations.push(`${filePath} imports standalone host code`);
    }
  }

  assert.deepEqual(violations, []);
});
