# AI 轨迹 v0.7.0 设计稿：日历档案视图 + 模型辅助总结

日期：2026-10-07　状态：已与用户对齐，进入实现
仓库：`liixnglinb/AI-Chronicle`（本项目的公开仓库，工作区即本仓库根目录）

## 0. 用户已拍板的四个口径

| #   | 决策                                                                                                    | 落点 |
| --- | ------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 发给模型的内容 = 统计 + 当天**用户自己发出去的消息**摘录，不发模型回复、不发工具输出                    | §3.3 |
| 2   | 模型通道**单独开**，允许本机/内网地址（ollama、LM Studio、内网网关），不复用更新检查的公网 https 白名单 | §3.2 |
| 3   | 日历入口放在**会话档案页内加页签**，不做新的一级导航                                                    | §2.1 |
| 4   | 页签 / 年月 / 选中日期**跨重启保留**（现有 `useViewState` 是 sessionStorage，不满足）                   | §2.4 |

一句话边界：这个软件目前是**零内容外发**（`electron/main.cjs` 里只有更新检查的 GET，侧栏底部明写「只读本机日志，不上传任何会话内容」）。本稿第一次开出口，所以隐私口径、脱敏、密钥存储都按不可信网络对待，文案也要跟着改口径（§4）。

## 1. 现状事实（实现前已核对）

- 会话档案 `src/pages/HistoryPage.tsx`：已经按 `dayKeyOf(s.start)` 分日、算 `sessions.length / Σturns / ΣsessionDurationMinutes`、按工具色点标注 —— 日历只是同一份数据换呈现，**不动解析层、不升 `CACHE_VERSION`、不新增缓存**。
- 视图状态 `src/lib/useViewState.ts`：写 `sessionStorage['voyra-view-*']`，重启即丢。
- IPC 面 `src/global.d.ts` + `electron/preload.cjs` + `electron/main.cjs`（19 个 `ipcMain.handle`）：三处必须逐条对齐，preload 是手写白名单。
- 密钥先例：`safeStorage` 已用于采集缓存 `chronicle-ingest-cache.json`；`guardPublicHttps()` 走 DNS 预解析 + 保留地址拒绝，**这条规则对模型通道不适用**（决策 2）。

## 2. 功能一：日历页签

### 2.1 结构

会话档案页顶部加一组页签「清单 / 日历」，插在 `.desk-filter-bar` 之上。日历模式下：

- **时间范围过滤条禁用**（近 7/30 天与"按月看"语义冲突），置灰 + `title` 说明；
- **数据源 chips 与搜索框继续生效** —— 日历格子里的点数就是过滤后的点数，避免"筛了却没变"的假反馈。

### 2.2 数据（纯函数，可单测）

`src/lib/calendar.ts`（新增）：

```ts
buildCalendarIndex(filteredSessions) → Map<dayKey, DayCell>
// DayCell = { count, turns, minutes, tools: string[] /* toolColor 去重 */ }
buildMonthMatrix(year, month) → Array<{ dayKey: string | null; inMonth: boolean }>  // 6×7，周一为首列
```

- 过滤（搜索词 / 数据源 chips）在调用方完成，日历只负责分组，避免同一份过滤逻辑两处实现漂移。

- 日期口径沿用 `dayKeyOf`（本地时区 `YYYY-MM-DD`），跨天会话只算 `start` 那天，与清单视图一致，不出现两个视图数字不同。
- 月份边界 = 有记录的最早月 ~ 最晚月，不允许翻到没有数据的未来月份（不给空壳交互）。

### 2.3 交互

- 点某天 → 下方「当天面板」：当天小结（会话数 / 轮次 / 时长 / 用过的软件）+ 会话行（复用 `.desk-session-row` 结构）+（功能二就绪后）模型总结位。
- 键盘：网格是 `role="grid"`，焦点用 roving tabindex；`←/→` 移动一天、`↑/↓` 移动一周、`PgUp/PgDn` 切月、`Enter/Space` 选中、`Esc` 取消选中。焦点不出当月。
- 空态：整月无记录 → 「本月没有会话记录」+ 一个可点的「跳到最近有记录的月份」（不是死路）。
- 今天有记录时格子加 `is-today` 描边，选中日实心。

### 2.4 持久化

`src/lib/usePersistedViewState.ts`（新增）：与 `useViewState` 同签名，但写 `localStorage['ai-chronicle-view-v1']`（一个对象，含 `history-tab` / `history-month` / `history-day`）。

- 只存 UI 偏好，**不存任何会话内容**；写入 try/catch 吞配额异常（与现有实现一致）。
- 读到脏值（校验失败）回落默认，不报错。
- 清单页签的既有 sessionStorage 键不动，避免这次改动顺带把别人的状态搬走。

## 3. 功能二：模型 API 与辅助总结

### 3.1 配置形状（照 Cherry Studio / OpenCode 的通行填法，不发明新东西）

```ts
interface AiChannel {
  id: string
  name: string // 用户自定义，界面显示用
  protocol: 'openai' | 'anthropic' // 决定请求体与鉴权头
  baseUrl: string // https://api.openai.com/v1、http://127.0.0.1:11434/v1 …
  model: string
  keyEnc: string | null // safeStorage 加密后的 base64；界面永不回传明文
}
```

设置中心新增「模型辅助」区：通道列表 + 新增/编辑表单（名称、协议、Base URL、模型、API 密钥）+ 预置供应商下拉（OpenAI / Anthropic / DeepSeek / 月之暗面 / 智谱 / Ollama / LM Studio，只填 Base URL 与默认模型，用户可改）+「测试连接」+「设为默认」+ 删除。密钥框**留空 = 保留原密钥**，保存后只显示「已配置密钥」，绝不回显。

### 3.2 通道规则（`electron/ai-client.cjs`，新增）

- 只允许 `http:` / `https:`；host 允许回环与内网（决策 2），其余协议/`file:`/自定义 scheme 一律拒。
- `normalizeBaseUrl()`：补协议、去尾斜杠、拒绝含 `?`/`#`/用户凭据。端点拼接：OpenAI 用 `${base}/chat/completions`；Anthropic 用 `${base}/v1/messages`，但 base 已以 `/v1` 结尾时不再重复前缀（用户从供应商文档里抄来的地址两种形态都有）。
- 超时 30 秒（可被取消打断）；响应体上限 2 MB，超出即断；**不自动跟随跨源重定向**（同源重定向最多跟一次，跨源直接报错给用户看）。
- 鉴权头按协议：OpenAI `Authorization: Bearer`，Anthropic `x-api-key` + `anthropic-version`。
- 错误如实上抛（HTTP 状态 + 供应商 message 前 200 字），不粉饰成"请稍后重试"。

### 3.3 发出去什么（决策 1 的硬边界）

`collectDayPrompts(dayKey)`（主进程）：

1. 取当天会话（同日历口径）；
2. 每条会话只取**用户消息**，按时间顺序，**每条截 200 字**；
3. 日预算 24000 字，超出按时间顺序保留并在提示里如实写「另有 N 条未纳入」；
4. 逐条 `redactSecrets()`：`sk-…`、`ghp_…`、`github_pat_…`、JWT `eyJ…`、`Bearer …`、PEM 头、内网 IP 段；
5. 附本地统计（会话数 / 轮次 / 时长 / 软件 / 产出文件数），提示语要求"只依据给定材料总结，不得编造"。

**payload 只在主进程构造**，渲染层只传 `dayKey` 与通道 id —— 这样密钥不进渲染进程，也不存在"渲染层被 XSS 后拿 key"的路径。测试里有一条断言：构造结果不得包含任何助手消息正文（§5）。

### 3.4 结果与展示

- 落盘 `userData/ai-summaries.json`：`{ [dayKey]: { text, model, provider, generatedAt } }`。
- 展示在当天面板**本地事实小结的下方**，标注「由 <模型名> 生成于 HH:MM」，带「重新生成」和复制；**永不替换或覆盖本地小结**（用户明确要求：不要把已做好的细节做没了）。
- 未配置通道时该位置显示一句说明 + 跳转设置中心的按钮（不留空白、不留死按钮）。

### 3.5 异步四件套

超时 30 秒即失败并提示；失败给「重试」（不自动重投，避免重复计费）；切日期/切页签即 `abort` 在途请求；请求带序号，只采纳最新一次的响应（防竞态回写旧日期）；「生成总结」按钮在途时禁用并显示 `busyHint`，右上角心跳同步变成「正在生成当日总结…」（复用批一的共享活动信号）。

## 4. 文案与隐私口径同步

- 侧栏底部 `只读本机日志，不上传任何会话内容` → 改为如实两句话：日志只读本机；**只有你在「模型辅助」里配置并主动点生成时，才会把当天统计与你本人发出的消息摘录发送到你填写的地址**。
- README / `docs/architecture.md` 增「模型辅助」一节：出口清单、密钥存储方式、落盘文件、不发送的内容。
- 设置中心该区块顶部放一条「发送内容预览」—— 点一下能看到本次真正会发出去的完整文本（脱敏后），让口径可核对而不是嘴上说说。

## 5. 测试与验收

单测（`tests/calendar.test.ts`、`tests/ai-payload.test.ts`、`tests/ai-channel.test.ts`）：

- `buildCalendarIndex` 数字与清单视图逐日一致；跨天会话不重复计；
- `buildMonthMatrix` 6×7、周一首列、闰年/月初落在周六等边界；
- `normalizeBaseUrl` 的 12 种输入（含 `file:///`、带凭据、带 query、内网 host、无协议）；
- `redactSecrets` 逐类命中 + 不误伤普通中文；
- 摘录预算：200 字/条、24000 字/天、省略计数如实；
- **payload 不得含助手消息正文 / 不得含密钥**（构造器直接喂含敏数据断言）。

真机（Electron + CDP，9222）：日历页签点选/键盘/月份切换、刷新后状态保留、空月跳转、模型区表单校验、测试连接的失败提示、生成总结的在途态与落盘回显；按软件自身的断点复查几何（1180px 与 900px 两档，含日历网格不被压扁）。

## 6. 明确不做

- 不做流式输出（模型返回完整文本再渲染）；不做多通道并发；不做自动定时总结。
- 不动解析层与缓存版本（`CACHE_VERSION` 保持 4，升级不触发重扫）。
- 不把总结写进导出日报（先只在本机界面展示，避免导出物混入模型生成内容）。
