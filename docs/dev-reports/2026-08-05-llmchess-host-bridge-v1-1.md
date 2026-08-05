# Agent Browser Core：MetaApp Host Bridge v1.1 开发报告（LLM 联机象棋 MetaApp 桥能力）

- 日期：2026-08-05
- 需求来源：`llm-play-chinese-chess/docs/01-abc-requirements.md`（锚文档 `00-overview-and-game-protocol.md`）
- 开发分支：`feat/metaapp-host-bridge-v1-1`（独立 worktree：`metaapp-host-bridge-v1-1`）
- 状态：**已完成并全部验证通过**（`npm run verify`：502 项测试全部通过）

---

## 1. 本次交付内容

按需求文档第 1、2 章，为 MetaApp Host Bridge 新增两项能力，供象棋 MetaApp 的下棋循环（读局面 → 调用宿主本机 LLM → 写 `simplegroupchat` pin）使用：

### 能力一：`browser.llm.complete`（宿主本机 LLM 调用）

MetaApp 以 `{ messages, options?, purpose? }` 请求宿主用本机 LLM 完成一次文本补全，返回 `{ text, model?, finishReason? }`。

- 以新 trusted action kind `llm-complete` 走既有 `POST {apiBasePath}/actions` 通道；
- ABC 侧完成输入校验（messages 非空、role 合法、单次输入 ≤ 64KB、options 数值范围）；
- 同意模型与 v1 身份披露同级：按资源（resourceUri）首次调用弹出同意卡（含 MetaApp 标识、身份、用途标签），批准/拒绝仅保存在内存，页面刷新即重置；拒绝返回 `consent_denied`；
- 错误码：`consent_denied` / `llm_unavailable` / `llm_timeout` / `rate_limited` / `invalid_params` / `unsupported_method`。收到 `unsupported_method` 时 MetaApp 应降级为观战/沙盒模式。

### 能力二：`browser.permissions.request`（协议白名单免确认写入）

MetaApp 一次性申请对精确 `/protocols/` 路径的 `metaid.pin.write`（仅 `create`）免确认写入，返回 `{ granted }`。

- 采用与 v1 共享 PIN 确认一致的**两阶段流程**：ABC 转发 → 宿主返回 `manual_action_required`（含卡片数据 + 宿主签发的 confirmRequest）→ ABC 渲染授权卡片 → 用户批准后原样回传 confirmRequest → 宿主机内登记 grant；
- **授权卡片**（ABC 渲染，复用共享确认模态视觉体系）：当前 actor、MetaApp resourceUri、协议路径 + 操作列表、MetaApp 提供的 reason（作为不受信文案）、风险提示「批准后该应用可以此身份自动写入以上协议，无需逐条确认」；
- **宿主策略**：仅 `create`；路径必须为 `/protocols/` 前缀精确路径、不支持通配符；宿主维护可免确认协议白名单（初始：`simplegroupcreate` / `simplegroupjoin` / `simplegroupchat`），名单外返回 `consent_denied`；
- **grant 语义**：绑定四元组（resourceUri、actorId、operation、精确 path）**+ 页面会话 id**（ABC 每次页面加载生成新 id 随每个 trusted action 请求发送）。命中 grant 的写入跳过两阶段确认，直接走宿主校验 → 签名 → 广播路径并返回标准写入结果；未命中回落 v1 流程；
- **生命周期**：内存级、会话级——页面刷新（新会话 id）、切换 actor、导航离开（ABC 在资源切换时主动触发 revoke）全部失效；
- **写入限流**（宿主策略，建议默认）：命中 grant 的写入每分钟 ≤ 12 笔、单笔 payload ≤ 16KB，超限返回 `rate_limited` / `invalid_params`；
- **可见性与撤销**：grant 生效期间 Browser 顶栏显示常驻锁形指示（`data-browser-auto-write`），点击弹出撤销确认，撤销立即生效并通知宿主。

---

## 2. 代码与文档落点

| 包 | 文件 | 内容 |
|---|---|---|
| host-contract | `packages/host-contract/src/index.ts` | 新 kind（`llm-complete`、`permissions-request`）、v1.1 类型、`sessionId` |
| test-harness | `packages/test-harness/src/index.ts` | trusted action kind 清单扩展 |
| ui | `packages/ui/src/browser/app.ts` | 两个桥方法、LLM 同意门控、授权卡片、chrome 指示与撤销、会话 id |
| host-standalone | `src/adapter.ts` | 参考宿主：LLM 注入处理器 + 限流/超时、协议白名单、会话级 grant 存储、写入绕过与限流、撤销 |
| host-standalone | `src/memoryHost.ts` / `src/http.ts` | 开发宿主同语义支持；`/api/browser/actions` 透传 `sessionId` |
| docs | `docs/superpowers/specs/2026-08-05-metaapp-host-bridge-v1-1-design.md` | 设计规格 |
| docs | `docs/superpowers/plans/2026-08-05-metaapp-host-bridge-v1-1.md` | 实施计划 |
| docs | `docs/metaapp-host-bridge-v1-host-requirements.md` | 宿主对接要求（新增 v1.1 章节） |
| docs | `docs/custom-bot-homepage-metaapp-guide.md` | MetaApp 作者指南（两个新方法的使用示例） |

分支含 5 个提交：host-contract → UI 桥 → standalone 宿主 → 测试 → 文档，每个提交均已按仓库约定以 Bob 身份在链上发布开发日志。

---

## 3. 对接情况（给象棋 MetaApp 与宿主）

### 3.1 象棋 MetaApp 侧

- 进入对弈前一次性申请三项 grant（建房/入群/发言三个协议），并处理 `consent_denied`（用户拒绝或宿主白名单策略）与 `unsupported_method` 降级；
- 每步棋用 `browser.llm.complete`（`purpose: 'llmchess-move'`）请求走法，`text` 视为不受信输出，仍需按 00 号文档 4.7 节做 JSON 解析 + `legalMoves` 规则引擎校验（非法则带错误重试，至多 3 次）；
- 写入直接复用 v1 `metaid.pin.write`，无需感知 grant 细节：命中 grant 时宿主不再返回两阶段确认，直接返回写入结果。

### 3.2 宿主侧（IDBots / OAC / standalone）

- 各宿主需为 `llm-complete`、`permissions-request` 两个新 kind 实现 host adapter（见宿主要求文档 v1.1 章节）：
  - `llm-complete` 接到各自本机 LLM 栈（IDBots：MetaBot LLM 会话层；OAC：agent LLM 配置），实现限流/配额与响应脱敏；
  - `permissions-request` 按两阶段流程签发确认、维护协议白名单、按（sessionId、resourceUri、actorId、operation、path）宿主机内存储 grant，命中 grant 的 `metaid-pin-write` 绕过的是「确认」而非「校验」；
  - 建议在宿主本地审计日志（trace）记录授权与写入事件。
- standalone 参考宿主已完整实现上述语义（LLM 需注入处理器，默认返回 `llm_unavailable`；因无签名器，命中 grant 的写入返回 `pin_write_failed` 而非伪造结果，以证明确认环节被跳过）。

### 3.3 验收对照（需求 3.1 清单）

| 验收项 | 状态 |
|---|---|
| 未同意时 `browser.llm.complete` 返回 `consent_denied`；同意后返回 `{ text }` 且不含宿主内部信息 | ✅（测试覆盖） |
| `llm_unavailable` / `llm_timeout` / `rate_limited` 分别返回 | ✅（standalone 参考实现 + 测试） |
| `browser.permissions.request` 弹出授权卡片；拒绝后写入仍走两阶段确认 | ✅（测试覆盖） |
| 批准后白名单内 `create` 写入不再弹窗、直接返回结果；名单外/`modify`/`revoke`/其他 MetaApp/切换 actor 全部回落两阶段 | ✅（测试覆盖） |
| 页面刷新后 grant 失效 | ✅（会话 id 机制，standalone + HTTP 测试覆盖） |
| 免确认生效期间 chrome 有可见指示与撤销入口 | ✅（锁形指示 + 撤销确认，测试覆盖） |
| 写入限流触发返回 `rate_limited` | ✅（standalone 测试覆盖） |

---

## 4. 设计取舍与说明

1. **授权状态宿主持有**：ABC 不保存授权 token，仅保留「当前资源持有 grant」的 UI 镜像用于指示/撤销；撤销与导航离开均主动通知宿主。
2. **会话失效的实现**：宿主以页面会话 id 为 grant 键的一部分，页面刷新即产生新 id，天然失效；导航离开由 ABC 主动 revoke；切换 actor 由 actorId 绑定覆盖。宿主也可自行实现其他失效策略（如 TTL `expiresAt`）。
3. **standalone 的"成功"语义**：standalone 无签名能力，命中 grant 的写入以 `failed`/`pin_write_failed` 结束（证明确认被跳过）而非伪造 pinId；真实宿主（OAC/IDBots）在此处返回正常写入结果。
4. **合并同意卡片**（需求 3.2 的建议项）暂未实现，三项同意仍独立弹卡；各卡打开期间其他同意请求返回 `consent_pending`。已列入后续可做项。
5. **长打/长将、步数上限等棋规问题**属于象棋 MetaApp 与规则引擎范畴，不属于本次 ABC 交付范围。

## 5. 验证情况

- `npm run verify`：502 项测试全部通过（含新增 UI 桥测试 12 项、standalone 适配器测试 14 项、HTTP 层端到端 grant 流程、conformance 与结果形状测试）；
- 测试环境补充安装了 Playwright chromium（此前环境缺失）；
- 所有文档改动通过 `git diff --check`。

## 6. 后续建议

1. 各宿主（IDBots/OAC）按宿主要求文档实现新 adapter 后，可与象棋 MetaApp 联调走通「LLM 出子 → 校验 → 免确认写群聊」全链路；
2. 如需，可把三项同意合并为一张能力请求卡（需求 3.2）；
3. 象棋 MetaApp 如需"房间列表/对局状态"API，由群聊聚合后端团队按 02 号文档交付。
