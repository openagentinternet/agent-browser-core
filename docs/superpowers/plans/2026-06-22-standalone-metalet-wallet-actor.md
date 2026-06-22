# Standalone Metalet Wallet Actor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect standalone Browser's top-right wallet actor chip to the user's Metalet extension account.

**Architecture:** Keep wallet behavior standalone-only by gating UI logic on `runtime.host.kind === "standalone"` and `runtime.features.walletLogin === true`. The standalone host advertises wallet login support; the shared UI performs browser-extension detection, connect, profile lookup, chip rendering, and install-modal handling. Core resource parsing/resolution remains unchanged and wallet-free.

**Tech Stack:** TypeScript workspace, Node 20.20.0, `node:test`, shared Browser UI inline client script, standalone host contract, Metalet browser extension API exposed as `window.metaidwallet`.

---

## File Structure

- Modify `packages/host-standalone/src/adapter.ts`
  - Set standalone runtime `features.walletLogin` to `true`.
  - Keep the compatibility placeholder actor id `standalone-wallet`.
- Modify `packages/host-standalone/src/memoryHost.ts`
  - Mirror the runtime flag for in-memory host tests.
- Modify `packages/ui/src/browser/app.ts`
  - Add standalone wallet runtime detection.
  - Render disconnected standalone chip as a wallet connect affordance.
  - Add Metalet install modal and Install button handler.
  - Add Metalet connect flow using `window.metaidwallet`.
  - Add profile fetch fallback through `metafileContentBaseUrl + "/api/v1/users/address/{address}"`.
  - Update chip click routing so standalone never opens the multi-actor selector.
- Modify `tests/host-standalone/standaloneServer.test.mjs`
  - Assert standalone runtime advertises `walletLogin: true`.
- Modify `tests/browser/browserStandaloneServer.test.mjs`
  - Assert public standalone runtime also reports `walletLogin: true`.
- Modify `tests/ui/browserPageState.test.mjs`
  - Add disconnected standalone install-modal tests.
  - Add connected standalone chip inertness test.
  - Keep existing OAC-style multi-actor selector behavior covered.
- Modify `tests/ui/browserPageActions.test.mjs`
  - Add mocked Metalet connect happy-path test if the existing state harness is not enough.

---

### Task 1: Advertise Wallet Login In Standalone Runtime

**Files:**
- Modify: `packages/host-standalone/src/adapter.ts`
- Modify: `packages/host-standalone/src/memoryHost.ts`
- Test: `tests/host-standalone/standaloneServer.test.mjs`
- Test: `tests/browser/browserStandaloneServer.test.mjs`

- [ ] **Step 1: Write the failing runtime assertions**

Update standalone runtime tests so they expect the wallet feature flag:

```js
assert.equal(runtime.data.features.walletLogin, true);
```

Add this assertion next to the existing `runtime.data.host.kind` and `runtime.data.defaultActor`
checks in both standalone server test files.

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/host-standalone/standaloneServer.test.mjs tests/browser/browserStandaloneServer.test.mjs
```

Expected: the new assertions fail because the standalone host still returns `walletLogin: false`.

- [ ] **Step 3: Change standalone runtime flags**

In both standalone runtime builders, change:

```ts
walletLogin: false,
```

to:

```ts
walletLogin: true,
```

Keep all other feature flags unchanged.

- [ ] **Step 4: Re-run targeted tests and verify they pass**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/host-standalone/standaloneServer.test.mjs tests/browser/browserStandaloneServer.test.mjs
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add packages/host-standalone/src/adapter.ts packages/host-standalone/src/memoryHost.ts tests/host-standalone/standaloneServer.test.mjs tests/browser/browserStandaloneServer.test.mjs
git commit -m "feat: advertise standalone wallet login"
```

---

### Task 2: Add Standalone Wallet Chip And Install Modal

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Test: `tests/ui/browserPageState.test.mjs`

- [ ] **Step 1: Add failing UI tests for missing Metalet**

Add a standalone runtime fixture with:

```js
host: { kind: 'standalone', name: 'Agent Internet Browser', localMode: false },
features: {
  privateChat: false,
  serviceCall: false,
  cacheManagement: true,
  templateSettings: true,
  walletLogin: true,
},
labels: {
  actorChip: 'Wallet',
  noActorTitle: 'No Wallet',
  noActorBody: 'Connect Metalet to use standalone Browser.',
},
```

Add a test that clicks `[data-browser-using-selector]` without `window.metaidwallet` and asserts:

```js
assert.match(elements['[data-browser-using-selector]'].innerHTML, /Connect Wallet/);
assert.match(elements['[data-browser-modal-root]'].innerHTML, /Install Metalet/);
assert.match(elements['[data-browser-modal-root]'].innerHTML, /data-browser-wallet-install/);
assert.doesNotMatch(elements['[data-browser-modal-root]'].innerHTML, /data-browser-actor-id/);
```

Add a second test that clicks the install button through modal delegation and asserts:

```js
assert.deepEqual(context.openCalls, [
  ['https://metalet.space', '_blank', 'noopener'],
]);
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/ui/browserPageState.test.mjs
```

Expected: missing helper functions and modal markup make the new tests fail.

- [ ] **Step 3: Add standalone wallet runtime helpers**

In `packages/ui/src/browser/app.ts`, add helpers near the runtime actor helpers:

```js
function runtimeFeatures() {
  return state.runtime && state.runtime.features && typeof state.runtime.features === 'object'
    ? state.runtime.features
    : {};
}

function isStandaloneWalletRuntime() {
  return !!(state.runtime &&
    state.runtime.host &&
    state.runtime.host.kind === 'standalone' &&
    runtimeFeatures().walletLogin === true);
}

function isMetaletActor(actor) {
  return textValue(actor && actor.id).indexOf('metalet:') === 0;
}

function selectedStandaloneWalletActor() {
  var actor = selectedActor();
  return isStandaloneWalletRuntime() && isMetaletActor(actor) ? actor : null;
}
```

- [ ] **Step 4: Render disconnected standalone chip as Connect Wallet**

In `renderUsingIdentity()`, branch before the normal actor rendering:

```js
if (isStandaloneWalletRuntime() && !selectedStandaloneWalletActor()) {
  var connectLabel = browserText('wallet.connect', 'Connect Wallet');
  elements.usingChip.innerHTML = avatarHtml('', connectLabel, 'browser-chip-avatar') +
    '<span class="browser-chip-copy"><span class="browser-chip-title">' +
    escapeHtml(runtimeLabel('actorChip', 'Wallet')) + ': ' + escapeHtml(connectLabel) +
    '</span></span>';
  elements.usingChip.disabled = false;
  if (typeof elements.usingChip.setAttribute === 'function') {
    elements.usingChip.setAttribute('aria-expanded', 'false');
  }
  return;
}
```

Keep the existing normal branch for OAC/IDBots and non-wallet runtimes.

- [ ] **Step 5: Add install modal and click handler**

Add these UI helpers:

```js
function openMetaletInstallModal() {
  if (!elements.modalRoot) return;
  elements.modalRoot.hidden = false;
  elements.modalRoot.innerHTML = '<section class="browser-modal-panel" role="dialog" aria-modal="true">' +
    '<header><h2>' + escapeHtml(browserText('wallet.installTitle', 'Install Metalet')) + '</h2>' +
    '<button type="button" data-browser-modal-close aria-label="' + escapeHtml(browserText('modal.close', 'Close')) + '">' +
    escapeHtml(browserText('modal.close', 'Close')) + '</button></header>' +
    '<div class="browser-modal-body"><p>' + escapeHtml(browserText('wallet.installBody', 'Please install Metalet before connecting a wallet.')) + '</p></div>' +
    '<footer><button type="button" data-browser-modal-close>' + escapeHtml(browserText('modal.close', 'Close')) + '</button>' +
    '<button type="button" data-browser-wallet-install>' + escapeHtml(browserText('wallet.installAction', 'Install')) + '</button></footer>' +
    '</section>';
}

function installMetaletWallet() {
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open('https://metalet.space', '_blank', 'noopener');
  }
}
```

In modal click delegation, add:

```js
if (closestWithAttribute(event && event.target, 'data-browser-wallet-install')) {
  installMetaletWallet();
  return;
}
```

- [ ] **Step 6: Route chip click through standalone wallet mode**

Replace the direct click binding:

```js
if (elements.usingChip) elements.usingChip.addEventListener('click', openUsingIdentitySelector);
```

with:

```js
if (elements.usingChip) elements.usingChip.addEventListener('click', handleUsingIdentityClick);
```

Add:

```js
function handleUsingIdentityClick() {
  if (isStandaloneWalletRuntime()) {
    connectStandaloneWalletActor();
    return;
  }
  openUsingIdentitySelector();
}
```

For this task, `connectStandaloneWalletActor()` should only check for the extension:

```js
async function connectStandaloneWalletActor() {
  if (typeof window === 'undefined' || !window.metaidwallet) {
    openMetaletInstallModal();
    return null;
  }
  return null;
}
```

- [ ] **Step 7: Re-run UI tests and verify they pass**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/ui/browserPageState.test.mjs
```

Expected: new install-modal tests pass and existing actor selector tests continue to pass.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageState.test.mjs
git commit -m "feat: add standalone wallet chip install flow"
```

---

### Task 3: Connect Metalet And Update The Single Wallet Actor

**Files:**
- Modify: `packages/ui/src/browser/app.ts`
- Test: `tests/ui/browserPageState.test.mjs`

- [ ] **Step 1: Add failing connect success test**

Extend the UI test harness with:

```js
const openCalls = [];
const context = {
  ...,
  window: {
    location: { pathname: options.pathname || '/ui/browser', search: options.search || '' },
    history: { replaceState() {} },
    open: (...args) => openCalls.push(args),
    metaidwallet: options.metaidwallet,
  },
  openCalls,
};
context.globalThis = context;
```

Add a mocked Metalet object:

```js
const metaidwallet = {
  isConnected: async () => ({ status: 'connected' }),
  connect: async () => ({}),
  getNetwork: async () => ({ network: 'livenet' }),
  getAddress: async () => 'mvc-address-1234567890',
  getPublicKey: async () => 'mvc-public-key',
  btc: {
    getAddress: async () => 'btc-address-1234567890',
    getPublicKey: async () => 'btc-public-key',
  },
};
```

Mock profile fetch in `createBrowserContext`:

```js
if (String(url).includes('/api/v1/users/address/mvc-address-1234567890')) {
  return {
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        name: 'Sunny Fung',
        globalMetaId: 'idq1walletuser',
        avatar: '/avatar.png',
      },
    }),
  };
}
```

Assert after chip click:

```js
assert.equal(context.state.runtime.defaultActor.id, 'metalet:mvc-address-1234567890');
assert.equal(context.state.actorId, 'metalet:mvc-address-1234567890');
assert.match(elements['[data-browser-using-selector]'].innerHTML, /Wallet: Sunny Fung/);
assert.match(elements['[data-browser-using-selector]'].innerHTML, /idq1walletuser/);
assert.equal(elements['[data-browser-modal-root]'].innerHTML.includes('data-browser-actor-id'), false);
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/ui/browserPageState.test.mjs
```

Expected: connect success assertions fail because the connect helper still returns `null`.

- [ ] **Step 3: Add wallet profile normalization helpers**

Add helpers in `packages/ui/src/browser/app.ts`:

```js
function shortAddress(address) {
  var value = textValue(address);
  return value.length > 14 ? value.slice(0, 8) + '...' + value.slice(-6) : value;
}

function normalizeProfileAvatar(value) {
  var raw = textValue(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  var base = browserEffectiveSettings().metafileContentBaseUrl || '';
  return base ? base.replace(/\/+$/, '') + raw : raw;
}

function normalizeWalletProfile(raw) {
  var data = objectValue(raw && raw.data ? raw.data : raw);
  return {
    name: textValue(data.name || data.displayName || data.nickname),
    globalMetaId: textValue(data.globalMetaId || data.globalMetaID || data.metaId || data.metaid),
    avatar: normalizeProfileAvatar(data.avatar || data.avatarUrl || data.avatarUri || data.avatar_uri || data.avatarPinId)
  };
}
```

If `browserEffectiveSettings()` does not exist yet, add:

```js
function browserEffectiveSettings() {
  var settings = state.settingsData || {};
  return objectValue(settings.effectiveBrowser || settings.browser || {});
}
```

- [ ] **Step 4: Add profile fetch helper**

Add:

```js
async function resolveMetaletWalletProfile(address) {
  var settings = state.settingsData || await api(browserSettingsEndpoint());
  state.settingsData = settings;
  var effective = objectValue(settings.effectiveBrowser || settings.browser);
  var base = textValue(effective.metafileContentBaseUrl).replace(/\/+$/, '');
  if (!base || !address) return {};
  try {
    var response = await fetch(base + '/api/v1/users/address/' + encodeURIComponent(address));
    if (!response || !response.ok) return {};
    var payload = await response.json();
    return normalizeWalletProfile(payload);
  } catch (error) {
    return {};
  }
}
```

- [ ] **Step 5: Implement Metalet connect actor update**

Replace the temporary `connectStandaloneWalletActor()` with:

```js
async function connectStandaloneWalletActor() {
  if (typeof window === 'undefined' || !window.metaidwallet) {
    openMetaletInstallModal();
    return null;
  }
  var wallet = window.metaidwallet;
  try {
    var connected = typeof wallet.isConnected === 'function' ? await wallet.isConnected() : null;
    var status = textValue(connected && connected.status);
    if (status === 'locked') throw new Error('Please unlock Metalet first.');
    if (status === 'no-wallets') throw new Error('Please initialize Metalet first.');
    if (!connected || status === 'not-connected') {
      var result = typeof wallet.connect === 'function' ? await wallet.connect() : null;
      if (textValue(result && result.status) === 'canceled') {
        setStatus('wallet canceled', '');
        return null;
      }
    }

    var mvcAddress = typeof wallet.getAddress === 'function' ? await wallet.getAddress() : '';
    var mvcPublicKey = typeof wallet.getPublicKey === 'function' ? await wallet.getPublicKey() : '';
    var btcAddress = wallet.btc && typeof wallet.btc.getAddress === 'function' ? await wallet.btc.getAddress() : '';
    var btcPublicKey = wallet.btc && typeof wallet.btc.getPublicKey === 'function' ? await wallet.btc.getPublicKey() : '';
    var address = textValue(mvcAddress) || textValue(btcAddress);
    if (!address) throw new Error('Metalet did not return a wallet address.');

    var profile = await resolveMetaletWalletProfile(address);
    var label = textValue(profile.name) || shortAddress(address) || 'Metalet Wallet';
    var actor = {
      id: 'metalet:' + address,
      label: label,
      kind: 'wallet',
      isDefault: true,
      address: address,
      globalMetaId: textValue(profile.globalMetaId),
      avatar: textValue(profile.avatar),
      capabilities: ['template-settings'],
      wallet: {
        provider: 'metalet',
        mvcAddress: textValue(mvcAddress),
        mvcPublicKey: textValue(mvcPublicKey),
        btcAddress: textValue(btcAddress),
        btcPublicKey: textValue(btcPublicKey)
      }
    };
    state.runtime.actors = [actor];
    state.runtime.defaultActor = actor;
    state.actorId = actor.id;
    renderUsingIdentity();
    setStatus('wallet connected', '');
    return actor;
  } catch (error) {
    setStatus('error', error && error.message ? error.message : 'Wallet connection failed.');
    return null;
  }
}
```

- [ ] **Step 6: Render connected wallet subtitle**

In `renderUsingIdentity()`, when `selectedStandaloneWalletActor()` returns an actor, render the
Global MetaID line:

```js
var walletActor = selectedStandaloneWalletActor();
if (walletActor) {
  var walletName = textValue(walletActor.label) || shortAddress(walletActor.address) || 'Metalet Wallet';
  var walletMetaId = textValue(walletActor.globalMetaId);
  elements.usingChip.innerHTML = avatarHtml(walletActor.avatar, walletName, 'browser-chip-avatar') +
    '<span class="browser-chip-copy"><span class="browser-chip-title">' +
    escapeHtml(runtimeLabel('actorChip', 'Wallet')) + ': ' + escapeHtml(walletName) + '</span>' +
    (walletMetaId ? '<span class="browser-chip-subtitle">' + escapeHtml(walletMetaId) + '</span>' : '') +
    '</span>';
  elements.usingChip.disabled = false;
  if (typeof elements.usingChip.setAttribute === 'function') {
    elements.usingChip.setAttribute('aria-expanded', 'false');
  }
  return;
}
```

- [ ] **Step 7: Ensure connected standalone chip remains inert**

Update `handleUsingIdentityClick()`:

```js
function handleUsingIdentityClick() {
  if (isStandaloneWalletRuntime()) {
    if (selectedStandaloneWalletActor()) return;
    connectStandaloneWalletActor();
    return;
  }
  openUsingIdentitySelector();
}
```

- [ ] **Step 8: Run UI tests and verify they pass**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run build
node --test tests/ui/browserPageState.test.mjs
```

Expected: standalone wallet tests pass, and existing multi-actor tests still pass.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/browser/app.ts tests/ui/browserPageState.test.mjs
git commit -m "feat: connect standalone metalet wallet actor"
```

---

### Task 4: Full Verification And Closeout

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 2: Run full test suite**

Run:

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Post development journal buzz**

Use:

```bash
$HOME/.metabot/bin/metabot buzz post --from bob --request-file /tmp/<request>.json
```

The content must summarize the runtime flag, install modal, standalone-only chip routing, mocked
Metalet connection, profile fallback, and verification result.

- [ ] **Step 4: Final status check**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: branch is clean after all commits; latest commits describe the standalone wallet feature.
