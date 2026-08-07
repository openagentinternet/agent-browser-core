# MetaApp 深链传参（Launch Context）验收报告

日期：2026-08-07 ｜ 分支：`feat/metaapp-launch-context` ｜ commit：`79a687e`

需求来源：`metaapp_buzz` 仓库 `docs/ABC-metaapp-launch-context-requirements.md`
（应用侧契约：`app/APP.md`，应用侧已实现，本报告仅涉及宿主层 agent-browser-core）。

## 目标

宿主层支持带参数深链：

```text
metaapp://<appPinId>?view=buzz&pin=<buzzPinId>
```

宿主只用 `<appPinId>`（纯 64hex + i0）解析 MetaApp 包，并把 `view` / `pin` 参数
追加到应用入口 URL（`index.html?view=buzz&pin=<buzzPinId>`），使 metaapp_buzz 打开
应用后直接渲染 Buzz 详情页。

## 实现方式（方案 A）

- **URI 解析**：`metaapp://<appPinId>?<query>` 按标准 URL 编码解析（`+` 为空格、
  `%XX` 解码），产出纯 `appPinId` + `launchContext { view, pin, originalUri }`。
  query/path/hash 任何部分都不会拼进 appPinId；裸 `metaapp://<appPinId>` 行为不变。
- **参数转发**：打开 MetaApp iframe 时把序列化 query 追加到入口文件 URL。参数值
  `encodeURIComponent`；iframe 保持 `sandbox="allow-scripts"`，无顶层导航。
- **错误与降级**：appPinId 非 64hex+i0 走现有 `invalid_browser_uri` 解析错误，
  不降级；无 view / view=buzz 但无 pin / query 无法解析 → 打开默认信息流。
- **非目标**：path / hash 形态深链不做宿主解析；不改变 MetaApp 包结构与 resolver
  pin 校验。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/core/src/browser/metaAppLaunchContext.ts` (新) | `MetaAppLaunchContext` 类型、`parseMetaAppLaunchUri`（解析深链 query）、`serializeMetaAppLaunchQuery`（仅转发 view/pin，encodeURIComponent） |
| `packages/core/src/uri/browserUri.ts` | metaapp 深链解析：id 只含纯 appPinId，`normalizedUri` 保留可转发参数，`launchContext` 挂到 `ParsedBrowserUri` |
| `packages/core/src/browser/metaAppResolver.ts` | `buildMetaAppResolveResult` 接受 `launchContext`，追加序列化 query 到入口 URL（已有 query 用 `&`，fragment 先剥离） |
| `packages/core/src/browser/browserResolver.ts` | `parsed.launchContext` 透传到 resolver |
| `packages/core/src/browser/uri.ts`、`packages/core/src/index.ts` | 导出新 API |
| `packages/host-standalone/src/memoryHost.ts` | fixture 的 `proof.pinId` 改用纯 id |
| `packages/ui/src/browser/app.ts` | `browserUriFromPath` 对 metaapp 保留 `location.search`（刷新/新开 tab 重放参数保持） |
| `tests/browser/metaAppLaunchContext.test.mjs` (新) | 13 个单测：解析、降级、编码、URL 拼接、端到端 resolve、非法 pin 错误路径、preview-metaapp 不受影响 |
| `tests/browser/browserStandaloneServer.test.mjs` | 宿主级验收：HTTP resolve 深链 → manapi 只收到纯 pinId，iframe URL 带 `?view=buzz&pin=…` |
| `tests/ui/browserPageState.test.mjs` | UI 级验收：路径深链刷新后参数保持 |
| `docs/custom-bot-homepage-metaapp-guide.md` | 新增 "MetaApp Deep Links (Launch Parameters)" 一节 |

## 关键设计决策（需求歧义处理）

需求 3.3「pin 缺失时打开默认信息流」与应用契约「view=buzz 但 pin 缺失 → 无效链接」
存在表面冲突。按宿主侧需求文档优先：

- `view=buzz` 且 `pin` 缺失 → 宿主**不转发参数**（打开默认信息流）；
- `view` 为其他值 → **原样转发**（应用显示「不支持的页面视图」）；
- `pin` 只要存在即原样转发（格式校验归应用侧，非法 pin → 应用显示无效链接错误）。

## 测试命令与结果

```text
npm run build                 ✓ 0 错误
npm run verify                ✓ 519 pass / 0 fail（基线 504 + 新增 15）
npm run verify:packages       ✓
git diff --check              ✓
```

（`verify:release-version` 需要 release tag 参数，仅发布流程使用。）

## 验收场景对照

| # | 场景 | 覆盖 |
|---|---|---|
| 1 | `metaapp://<appPinId>` 打开应用，信息流正常 | 单测 `parseBrowserUri keeps bare metaapp://<appPinId> behavior unchanged` |
| 2 | `?view=buzz&pin=<合法pinId>` 打开应用并渲染详情页 | 单测 + standalone HTTP 端点测试（renderer URL 带 `?view=buzz&pin=…`） |
| 3 | 详情页刷新 / 新开 tab 重放同一 URI，参数保持 | UI 测试 `Browser MetaApp deep link path preserves launch parameters on refresh` |
| 4 | `?view=buzz&pin=<非法pinId>` 应用显示无效链接错误 | `pin` 原样转发（格式校验在应用侧） |
| 5 | `?view=other` 应用显示不支持的页面视图 | 单测：未知 view 原样转发 |
| 6 | `?foo=bar`（无 view/pin）打开默认信息流 | 单测：无可转发参数，URL 不变 |
| 7 | 现有 `preview-metaapp://` 预览流程不受影响 | 单测 `preview-metaapp parsing is unaffected` + 全量回归 |
| 8 | query 含特殊字符时正确解码、正常渲染 | 单测：`+` 空格、`%XX` 解码后正确编码转发 |

## OAC 联调验证路径

OAC 侧**无需改源码**（提升 agent-browser-core 依赖版本后即生效）：

1. 发布 agent-browser-core 新版本（如 0.5.1）；
2. OAC 执行 `npm run bump:agent-browser-core` 并 `npm install`（当前 OAC 锁定 0.5.0）；
3. OAC 的 `resolveLocalBrowserPath` 对带 query 的 URI 会落到 `/browser?uri=<full-encoded>`，
   ABC UI 从 `?uri=` 读取完整 URI 并解析，参数自然流转；`isBrowserPagePath` 的
   `/browser` 分支已覆盖该路径；
4. 浏览器打开 `http://127.0.0.1:<port>/browser?uri=metaapp%3A%2F%2F<appPinId>%3Fview%3Dbuzz%26pin%3D<buzzPinId>`
   逐条验证验收场景 1–8（刷新验 #3，换非法 pin 验 #4/#5，`?foo=bar` 验 #6，
   preview-metaapp 验 #7）；
5. 可选增强（非必须）：OAC `resolveLocalBrowserPath` 后续可直接生成路径型深链
   `/browser/metaapp/{pinId}?view=…`（ABC 的 `browserUriFromPath` 已支持保留 query），
   让链接在会改写 `?uri=` 的聊天界面中也能存活。

## 链上开发日志

已用 Bob 身份发布 buzz：pinId
`ea9b1d12a1b19adaed63108562927607efd8eb4273c8d5a27123522517bc02bdi0`（mvc 网络）。
