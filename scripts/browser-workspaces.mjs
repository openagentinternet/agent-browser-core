export const BROWSER_WORKSPACES = [
  {
    name: "@openagentinternet/agent-browser-host-contract",
    path: "packages/host-contract",
  },
  {
    name: "@openagentinternet/agent-browser-core",
    path: "packages/core",
  },
  {
    name: "@openagentinternet/agent-browser-ui",
    path: "packages/ui",
  },
  {
    name: "@openagentinternet/agent-browser-host-standalone",
    path: "packages/host-standalone",
  },
  {
    name: "@openagentinternet/agent-browser-test-harness",
    path: "packages/test-harness",
  },
];

export const BROWSER_PACKAGE_NAMES = BROWSER_WORKSPACES.map((workspace) => workspace.name);
