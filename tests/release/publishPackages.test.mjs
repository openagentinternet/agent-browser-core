import assert from "node:assert/strict";
import test from "node:test";

import { publishPackages } from "../../scripts/publish-packages.mjs";

test("dry run logs Browser packages in publish order", async () => {
  const logs = [];

  await publishPackages({
    dryRun: true,
    log: (message) => logs.push(message),
  });

  assert.deepEqual(logs, [
    "DRY RUN publish @openagentinternet/agent-browser-host-contract@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-core@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-renderers@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-name-resolvers@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-ui@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-host-standalone@0.4.4",
    "DRY RUN publish @openagentinternet/agent-browser-test-harness@0.4.4",
  ]);
});
