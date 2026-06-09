import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

const PACKAGES = [
  {
    name: '@openagentinternet/agent-browser-host-contract',
    exports: {
      browserSuccess: 'function',
      browserFailure: 'function',
    },
  },
  {
    name: '@openagentinternet/agent-browser-core',
    exports: {
      BOT_HOMEPAGE_TEMPLATES: 'object',
      parseBrowserUri: 'function',
      normalizeResourceSections: 'function',
    },
  },
  {
    name: '@openagentinternet/agent-browser-ui',
    exports: {
      BROWSER_MENU_SECTIONS: 'object',
      buildBrowserPageDefinition: 'function',
      renderBrowserPageHtml: 'function',
    },
  },
  {
    name: '@openagentinternet/agent-browser-host-standalone',
    exports: {
      createMemoryStandaloneBrowserHost: 'function',
      createStandaloneBrowserServer: 'function',
      handleStandaloneBrowserApiRoute: 'function',
    },
  },
  {
    name: '@openagentinternet/agent-browser-test-harness',
    exports: {
      assertBrowserHostConformance: 'function',
    },
  },
];

function assertPackageExports(actual, expectedExports, label) {
  for (const [exportName, expectedType] of Object.entries(expectedExports)) {
    assert.equal(typeof actual[exportName], expectedType, `${label} exports ${exportName}`);
  }
  if ('BOT_HOMEPAGE_TEMPLATES' in actual) {
    assert.equal(typeof actual.BOT_HOMEPAGE_TEMPLATES.length, 'number', `${label} exports BOT_HOMEPAGE_TEMPLATES.length`);
  }
}

test('Browser packages expose planned ESM entrypoints', async () => {
  for (const browserPackage of PACKAGES) {
    const imported = await import(browserPackage.name);
    assertPackageExports(imported, browserPackage.exports, `${browserPackage.name} import`);
  }
});

test('Browser packages expose planned CommonJS entrypoints', () => {
  for (const browserPackage of PACKAGES) {
    const required = require(browserPackage.name);
    assertPackageExports(required, browserPackage.exports, `${browserPackage.name} require`);
  }
});
