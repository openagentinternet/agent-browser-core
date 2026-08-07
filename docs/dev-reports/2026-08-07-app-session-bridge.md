# Agent Browser Core：`browser.app.session.*` 开发报告（宿主常驻应用会话桥能力）

- **分支**：`feat/app-session-bridge`（worktree：`/Users/tusm/Documents/MetaID_Projects/app-session-bridge`）
- **基线**：`main` @ `9a54997`
- **状态**：实现完成，自测全绿，**未提 PR，等待合并**
- **日期**：2026-08-07
- **需求来源**：`docs/13-abc-app-session-prompt.md`；权威契约：`llm-play-chinese-chess` 仓库 `docs/09-abc-app-session-requirements.md`

## 1. 本次交付内容

为 Agent Internet 通用「宿主常驻应用会话」能力（首个使用者：LLM 联机游戏 Agent-Game-v2）新增六个桥方法：

```text
browser.app.session.start
browser.app.session.list
browser.app.session.status
browser.app.session.pause
browser.app.session.resume
browser.app.session.stop
```

### 核心定位

ABC **只做桥转发 + 同意卡 + 状态透传**：把六个方法按现有 trusted-action 通道转发给宿主，`start` 弹任务授权卡，其余直通；错误码原样透传。ABC **不**解析游戏规则、**不**执行 adapter、**不**持久化授权——授权与 Session 运行时状态全部由宿主（IDBots / OAC / standalone）持有。页面关闭、刷新均不影响 Session。

### 能力一：`browser.app.session.start`（两阶段授权 + 启动）

- 复用现有 `permissions-request` 的 manual-action 两阶段机制（无新发明）。
- **Phase 1**：ABC 校验参数 → 转发 → 宿主返回 `manual_action_required` + `{confirmation, confirmRequest}`。
- **授权卡**：展示当前 actor、MetaApp resource、groupId、gameId、规则哈希、Adapter 哈希、请求的协议路径、有效期、LLM/写链预算；拒绝→`consent_denied`。
- **Phase 2**：同意后 ABC 原样回传宿主签发的 `confirmRequest`（token 不透明，不解析），宿主校验 token/资源/actor 后创建或复用 Session。
- **幂等**：相同 `(groupId, seat, agentId, rulesHash)` 的既有运行/暂停 Session 直接复用，不产生重复任务。

### 能力二：`browser.app.session.list / status / pause / resume / stop`（直通转发）

- 参数校验（`list` 外均需 `sessionId`，缺失→`invalid_params`）→ 转发 → 透传宿主结果/错误码。
- `pause`/`resume`/`stop` 幂等由宿主保证，ABC 不额外处理。
- 这些方法**不**弹卡（只有 `start` 需要授权）。

### 能力三：Browser chrome 持续指示 + 一键撤销

- 当前 actor 有 running Session 时，Browser chrome 显示持续闪电图标指示器。
- 点击打开管理面板，列出活动 Session，每条提供 Stop 入口（转发 `app-session-stop`）。
- 授权状态完全由宿主持有；ABC 只保留 UI-only 镜像（`state.activeAppSessions`），刷新即失效。

## 2. 代码与文档落点

| 文件 | 改动 | 说明 |
|---|---|---|
| `packages/host-contract/src/index.ts` | +120 | 6 个 `BrowserTrustedActionKind`（`app-session-start/list/status/pause/resume/stop`）+ AppSession 类型：Session 对象、start/list/status/control payloads、budget、两阶段确认三元组（Confirmation / ConfirmRequest / ManualActionData）|
| `packages/test-harness/src/index.ts` | +6 | conformance 白名单 `TRUSTED_ACTION_KINDS` 同步 |
| `packages/host-standalone/src/adapter.ts` | +191 | 可注入 `StandaloneAppSessionHandler`；6 个 kind 分支；`start` 两阶段卡（confirmation id+token+TTL，phase-2 资源/actor 绑定）；无 handler 时 `start`→`unsupported_method`、其余→`session_not_found` |
| `packages/host-standalone/src/memoryHost.ts` | +12 | 内存 dev host 镜像同样的能力错误 |
| `packages/ui/src/browser/app.ts` | +413 | postMessage 调度 6 分支 + `start` 两阶段授权卡 + 直通转发 + chrome 持续指示器 + 一键撤销管理面板 + UI-only 镜像 + pending 守卫 |
| `tests/ui/browserBridgeAppSession.test.mjs`（新） | +593 | 9 个客户端测试 |
| `tests/host-standalone/standaloneAppSession.test.mjs`（新） | +348 | 10 个宿主测试 |
| `docs/metaapp-host-bridge-v1-host-requirements.md` | +149 | V1.2「App Session」章节 + Error Requirements 补全 |

合计 **8 个文件，+1831 / -1 行**。

### 两层命名（沿用现有约定）

| 桥方法（postMessage 层） | trusted-action kind（HTTP 层） |
|---|---|
| `browser.app.session.start` | `app-session-start` |
| `browser.app.session.list` | `app-session-list` |
| `browser.app.session.status` | `app-session-status` |
| `browser.app.session.pause` | `app-session-pause` |
| `browser.app.session.resume` | `app-session-resume` |
| `browser.app.session.stop` | `app-session-stop` |

## 3. 对接情况（给需求方与宿主）

### 3.1 ABC 侧（本仓库）

- 六个方法按现有 trusted-action 通道（`POST /api/browser/actions`，body `{resourceUri, kind, payload, sessionId}`）转发。
- `start` 用两阶段 manual-action；同意卡字段完整覆盖需求；拒绝→`consent_denied`；pending 守卫已并入现有 `pendingActorConsent || pendingLlmConsent || pendingPermissionsConfirmation` 链，新增 `pendingAppSessionConfirmation`。
- chrome 指示器（`data-browser-app-session`）+ 管理面板（Stop 入口）。

### 3.2 宿主侧（IDBots / OAC / standalone）

- 宿主需提供 `StandaloneAppSessionHandler`（standalone 已留注入点 `createStandaloneBrowserHostAdapter({ appSession })`）；缺省时能力错误可预测。
- 宿主负责：群/座位/manifest/adapter 校验、规则哈希一致性、lease/防双 Runner、Session 持久化、严格 adapter 沙箱、复用既有 LLM / 群聊 socket / `metaid.pin.write` 路径（不经 web iframe）。
- 宿主错误码原样透传，ABC 不吞掉。

### 3.3 验收对照（需求清单逐条）

| 需求方验收清单 | 状态 | 验证（测试用例） |
|---|---|---|
| `start` 参数合法时正确转发返回宿主 Session；缺失→`invalid_params` | ✅ | client「validates required fields」+ host「validates required fields before invoking the handler」|
| 重复 `start` 同一 Session 幂等返回既有对象，不产生重复任务 | ✅ | host「reuses the existing session for an identical tuple (idempotency)」|
| 用户拒绝授权卡→`consent_denied` | ✅ | client「returns consent_denied when the user cancels the card」|
| `list`/`status` 只暴露当前 actor 可见 Session | ✅ | host list 过滤 `agentId`；client 转发测试 |
| `pause`/`resume`/`stop` 幂等 | ✅ | host「list/status/...forward straight through and pass errors through」|
| 宿主返回的 `session_conflict`/`adapter_invalid`/`rules_hash_mismatch` 等原样透传 | ✅ | client「host failures pass the exact error code」+ host「host error codes pass through unchanged」|
| 旧版 `browser.llm.complete`/`browser.permissions.request`/`metaid.pin.write` 行为无回归 | ✅ | 全套 523 测试含原 504 基线全过 |
| 撤销入口授权生效期间可见，撤销后状态随宿主更新 | ✅ | client「the chrome session indicator opens the revoke modal and can stop a running session」|

## 4. 设计取舍与说明

- **为何复用两阶段 manual-action 而非新机制**：仓库已有成熟的 `permissions-request` 两阶段卡片模式（confirmationId/token + TTL + 资源/actor 绑定 + 原样回传 confirmRequest）。`start` 授权卡需求与之高度同构，复用可避免新发明、降低宿主适配成本、保证安全语义一致。
- **错误码不建集中注册表**：仓库现状是裸字符串（无 enum/union）。本次仅透传宿主错误码 + 文档补充，保持与现有风格一致；未引入集中表以免无关回归。
- **chrome 指示器镜像**：`state.activeAppSessions` 是 UI-only 镜像，仅驱动指示器/管理面板；刷新即失效，授权真相在宿主。`list`/`status`/`stop` 返回会同步刷新镜像。
- **占位符注入安全**：严守 `AGENTS.md`，`packages/ui/src/browser/page.ts` 占位符注入仍用 `split(placeholder).join(value)`；本次未碰 legacy `browserClientScript.ts` parity 栈。

## 5. 验证情况

### 5.1 自测结果

```text
npm run verify
→ build（esm + cjs）全绿
→ node --test tests/**/*.test.mjs
   tests 523 | pass 523 | fail 0 | skipped 0
```

基线 504 测试 + 新增 19（client 9 + host 10）= 523，全过。

### 5.2 新增测试覆盖

**客户端（`tests/ui/browserBridgeAppSession.test.mjs`，9 例）**
1. `start` 校验必填字段（appId/sessionType/groupId/gameId/manifestUri/rulesHash/seat/agentId/ttlMs）→`invalid_params`
2. `start` 两阶段授权卡：渲染卡（actor/game/rules hash/protocol paths/note）→ 同意 → 透传 Session → 确认 confirmRequest 原样回传 → chrome 指示器可见 + 镜像记录
3. `start` 拒绝卡 → `consent_denied`
4. `start` 宿主错误（`rules_hash_mismatch`）直通、不弹卡
5. `list`/`status`/`pause`/`resume`/`stop` 直通 + 镜像同步
6. `status`/`pause`/`resume`/`stop` 缺 `sessionId` → `invalid_params`
7. 宿主失败错误码精确透传（`session_not_found`/`session_conflict`）
8. chrome 指示器 → 管理面板 → Stop（转发 `app-session-stop` + 镜像更新）
9. 未知方法 → `unsupported_method`

**宿主侧（`tests/host-standalone/standaloneAppSession.test.mjs`，10 例）**
1. 无 handler：`start`→`unsupported_method`
2. `start` 校验必填字段，不触发 handler
3. 两阶段卡 + phase-2 启动 + 卡字段完整
4. 相同 tuple 幂等复用
5. phase-2 资源/actor 不匹配 → `consent_denied`
6. phase-2 token 篡改 → `consent_denied`
7. list/status/pause/resume/stop 全生命周期 + pause/stop 幂等 + `session_not_found` 透传
8. 无 handler：list/status/control → `session_not_found`
9. 宿主错误码（`rules_hash_mismatch` 等）原样透传
10. 内存宿主能力错误

## 6. 提交与链上日志

5 个独立提交（feat/test/docs），每次配套一条链上开发日志（bob 身份，mvc）：

| 提交 | 说明 | Buzz pinId |
|---|---|---|
| `9de3214` | feat(host-contract)：6 个 kind + AppSession 类型 + test-harness 白名单 | `992ab8033ff85e3439d0f7a176ecc64867740a1615820eb8673ea01d5b6c3d60i0` |
| `96c01ee` | feat(host-standalone)：adapter + memoryHost 处理 + 可注入 handler | `156f9accc73fcdac82642946255f1423e4429a61962d16429628897e95bf833bi0` |
| `ebecee8` | feat(ui)：app.ts 调度 + 授权卡 + chrome 指示器 | `1d28eb5bc1453716026e9f672f1375de5c414bbb8725255a99706ba97e79ba1di0` |
| `71c7d57` | test(app-session)：客户端 + 宿主 conformance 测试 | `9125d82dc086136c80ba40ca469632dc293ae40941ee45a0b024a2b2e05208e0i0` |
| `c6eca9b` | docs(bridge)：V1.2 App Session 章节 + 错误码补充 | `16100c2f99f72320f33d48e9c82cda873f351d2c4fc028dc26a5393d0ba3953fi0` |

## 7. 边界遵守（明确不做）

- ✅ 未解析 `agent-game/1` 事件 payload
- ✅ 未加载、未执行 `game-adapter.js`
- ✅ 未实现游戏规则
- ✅ 未修改群聊协议 / IDChat
- ✅ 未实现任务级授权持久化（宿主负责）
- ✅ 未触碰 legacy `browserClientScript.ts` parity 栈

## 8. 后续 / 合并建议

- 分支 `feat/app-session-bridge` 已就绪，**等待合并**（未提 PR）。
- 合并到 `main` 时建议 `git merge --no-ff feat/app-session-bridge` 保留 feature 合并点。
- 下游宿主（IDBots / OAC）需消费含本桥能力的 ABC 版本，并实现各自的 `appSession` handler（运行 App Runtime、action loop、lease/防双 Runner、adapter 沙箱、Session 持久化）。
