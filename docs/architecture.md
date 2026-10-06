# 架构说明

面向接手维护的人。所有数字与路径都在 2026-10-06 对本机仓库与真实构建产物核过，不是设计愿望。

## 1. 进程模型

```
主进程 electron/main.cjs
  ├─ preload.cjs ── contextBridge ──> window.desktopAPI（21 个成员）
  ├─ 采集 electron/ingest.cjs（collectAll）
  ├─ 加密备份 electron/backup-crypto.cjs
  └─ 渲染层 src/（React 19 + Vite 8，file:// 加载 dist/index.html）
```

- 两个窗口都开 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`；全仓库没有 `webSecurity: false`。
- 出站面：`setWindowOpenHandler` 与 `will-navigate` 都只把 **http(s)** 交给 `shell.openExternal`，其余拒绝并记日志。
- 生产构建由 `vite.config.ts` 的插件在 `dist/index.html` 注入严格 CSP（`script-src 'self' file:`，无 inline script；
  `style-src` 保留 `'unsafe-inline'` 是因为界面大量使用 React 内联样式）。CI 有一步专门验证 CSP 已注入。
- IPC 契约三处必须一致：`src/global.d.ts` 声明、`electron/preload.cjs` 暴露（19 个 `invoke` + 2 条 `on` 事件）、
  `electron/main.cjs` 的 `ipcMain.handle`（19 个）。当前逐条对上，无死接口。
  两条事件通道名（`desktop:update-status`、`desktop:ingest-progress`）在 main 侧没有常量表，改名会静默失联 —— 动它们时三处一起改。

## 2. 数据流

```
各软件本机日志/数据库
  → ingest.cjs::collectAll（逐源解析，阶段事件 desktop:ingest-progress）
  → { generatedAt, sessions[], sources[], cacheStats }
  → main.cjs ipcMain.handle('desktop:ingest')（并发去重：同一时刻只跑一次）
  → store.tsx ChronicleProvider（60s 看门狗 + 冷启动退避重试 + focus 补采）
  → useChronicle() 的 8 个页面
```

- **`nowRef`**：界面上所有"现在"都取 `data.generatedAt`，不在 render 里读系统时钟。
  这样同一屏的"今日"和"近 7 天"用同一个基准，且应用通宵开着时最迟一个刷新周期内自动跨天。
- **搜索口径**：`src/lib/search.ts::matchSession` 是唯一的会话过滤函数（标题/项目/完整路径/模型/软件名/产出文件名）。
  以前各页手写，时间轴与命令面板漏了后两个字段。
- **主进程调用收口**：`src/lib/main-call.ts::callDesktop` 包住所有 IPC 调用，超时与异常一律变成一条 toast，
  返回 `null` 表示"已提示过"。目的是消灭"点了没反应"的按钮。

## 3. 采集来源与协议

`electron/ingest.cjs` 的 `TOOLS` 表（12 个软件）是软件 id → 名称/颜色的唯一来源，渲染层直接吃 `s.toolName` / `s.toolColor`，
**没有第二份清单**。协议分三种：`jsonl`（Claude Code / Codex / WorkBuddy / DSH…）、`sqlite`（ZCode / OpenCode / Hermes / Agnes / CatPaw，
用 Node 内置 `node:sqlite` 只读直连，零原生模块）、`zstd`（压缩 JSONL）。

另有两份"未接入源"清单，靠字符串前缀在渲染层对齐，改名要两边一起改：
`main.cjs` 的 `SOURCE_DEFINITIONS`（id 形如 `source-qoder`）与 `ingest.cjs` 的 `OBSERVING_SOURCES`（id 形如 `qoder`）。

品牌图标是第三份清单：`src/data/tools.ts` 的 `TOOL_ICON`（`public/tools/` 下提取的官方图，256px 归一）。
新增软件若不在这里，`ToolMark` 退回品牌色字母徽标；`TOOL_NEEDS_NAME` 决定哪些软件在图标旁仍要显示名字。

## 4. 本机存储

| 位置                                     | 内容                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| `<userData>/chronicle-ingest-cache.json` | 解析缓存，`safeStorage` 加密；含各会话的 mtime/size 与标题、路径 |
| `<userData>/window-state.json`           | 窗口位置尺寸 + 缩放                                              |
| `<userData>/desktop-prefs.json`          | 托盘 / 自启 / 采集通知                                           |
| `<userData>/update-prefs.json`           | 是否自动下载更新、跳过的版本                                     |
| `<userData>/logs/*.log`                  | `appendLog` 结构化日志（含 `renderer.log`）                      |
| localStorage `ai-chronicle-theme`        | 主题                                                             |
| localStorage `ai-chronicle-settings-v1`  | 界面偏好（轮询间隔、是否显示目录路径）                           |
| localStorage `voyra-view-*`              | 各页视图态（时间范围、折叠、工具过滤）                           |

`safeStorage` 不可用时缓存退化为明文（仍只在本机），当前不额外提示 —— 见「已知限制」。

## 5. 更新链路

1. 启动 7 秒后自检一次，之后每 6 小时补检（常驻托盘的应用不会自己重启）。
2. `pickUpdateFeed()` 并发测速 3 个源（GitHub 直连 / gh-proxy / ghfast），每个 6 秒上限，取最快可用；
   出站前经 `guardPublicHttps` 做 DNS 解析 + 私网/保留地址拦截（SSRF）。
3. 默认**不自动下载**（安装包约 110 MB），由设置中心或右下角胶囊点「下载更新包」；下载/校验失败按测速顺序换源，
   换源只续传不重跑检查。
4. 安装走 `quitAndInstall(true, true)` —— `oneClick: false` 的向导包**必须静默**，否则会弹出「下一步」向导，
   用户点了等于没升级（这是 v0.6.9 修掉的根因）。
5. 开发模式验证要 `CHRONICLE_DEV_UPDATE=1` + 未入库的 `dev-app-update.yml`；`desktop:install-update` 在
   `!app.isPackaged` 时直接拒绝，避免开发时把包真装进本机。

## 6. 验证工具与门禁

| 手段                               | 用途                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run verify`                   | format:check → lint → test → build（本地与 CI 同一口径）                                                   |
| `npx vitest run`                   | 143 项单测：格式化/路径/摘要/搜索口径/加密备份/解析夹具/坏数据降级/异步工具/构建资产                       |
| `CHRONICLE_SHOT=<目录> electron .` | 逐页截图（Electron 里 `capturePage` 可用，CDP `captureScreenshot` 在窗口被遮挡时会挂死）                   |
| `CHRONICLE_DEBUG=1 electron .`     | 打印采集汇总与启动耗时后退出                                                                               |
| `scripts/e2e-cdp.cjs`              | 对运行中的实例（`--remote-debugging-port=9222`）截图 / 执行 JS / 派发真实鼠标事件                          |
| `scripts/test-ingest.cjs`          | 用系统 Node 直接跑采集层，输出耗时、缓存命中与逐软件汇总                                                   |
| CI                                 | `windows-latest`：format / lint / test / `npm audit --omit=dev`（显式官方 registry）/ build / CSP 注入检查 |
| release.yml                        | 打 NSIS + portable + blockmap + latest.yml，上传 4 个资产                                                  |

## 7. 已知限制（不粉饰）

**数据口径**

- "时长"用会话首尾时间跨度，**不是精确活跃时间**；并行会话与通宵挂机会重复计入。分析页图表说明里已写明这一点。
- 89 条 Claude Code 子代理转录仍作为独立会话计入（合计 826 分钟），标题标为 `(子代理任务)`、轮次为 0。
  是否并入父会话是产品决定。
- 9 条会话"有标题但 0 轮"经逐条回数据库核对为**真实情况**（hermes 2 条库里 0 条消息；catpaw/dsh 3 条同类；
  opencode 4 条是 branch 会话，标题就是 branch 名）。不是解析 bug，未强行"修数字"。
- Codex 的轮次口径是"能识别的人类输入条数"：`event_msg/user_message` 优先，只有 `response_item` 的 rollout 走兜底计数。

**界面与平台**

- 浅色主题下侧栏导航静止态对比度 3.51:1，低于 WCAG AA 的 4.5:1（悬停/选中态已达标）。
- 窗口 `minWidth 960 / minHeight 680`，布局断点只有 1180px 一档；**没有窄屏/移动形态**，
  CSS 里也没有 `pointer: coarse` 规则。触屏只在代码层面确认"不存在只有 hover 才出现的内容"，无真机验证。
- 长列表用 `useIncrementalList`（每页 40 条）而非虚拟滚动，也没用 `content-visibility`。
  实测最重的视图 1213 个 DOM 节点、切换 3–7 ms，暂无必要。

**交付与运维**

- 卸载保留 `<userData>`（`deleteAppDataOnUninstall: false`，设计如此：缓存与偏好属于用户）。
- 明文备份/日报导出包含完整路径与用户首条指令摘录（90 字内）。它们只写本机磁盘、不上传，
  但"导出前应当说明里面带了什么"仍未做。
- 仓库是公开的，**git 历史里仍留有两条私人路径**（一个真实绝对路径、一个含第三方账号数字的目录名）。
  工作区文件已删除；要抹掉历史需要重写并 force-push，未做。
- 自动更新的"静默安装成功"这一端到端结果，只有当你真的用安装包升一次级才能最终确认；
  开发模式只能验到"下载完成"为止。
- 另一个仓库（学习通）的 `electron/main.js:594` 有与本项目相同的 `quitAndInstall(false, …)` 缺陷，未修。

**依赖**

- `package-lock.json` 的 499 条 `resolved` 全指向 `registry.npmmirror.com`（第三方镜像）。每条都带 `integrity`，
  包内容与官方哈希一致；CI 的 audit 显式走官方 registry。要换源需重写 lockfile 并影响国内安装速度，未擅自动。
- `react` / `react-dom` / `lucide-react` 留在 `dependencies`（虽然运行时不需要它们 —— 已打进 `dist`）：
  这是为了让 `npm audit --omit=dev` 继续覆盖实际 shipped 的代码。它们通过 `build.files` 的负向模式排除出安装包。
