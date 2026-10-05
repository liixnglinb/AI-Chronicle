# AI 轨迹 · 前端 UI 规范

本文件是前端 UI 的唯一规范来源。改样式或加组件前先读这里，改完请同步更新本文件。

- 样式唯一入口：`src/App.css`（按「令牌 → 基础 → 外壳 → 原语 → 组件库 → 页面 → 浮层 → 响应式」分层）
- 组件目录：`src/components/`；纯逻辑：`src/lib/`
- 约定：**新样式必须复用令牌**，不允许出现一次性字号、间距、层级数字

---

## ① 布局

### 整体结构

```
┌─ titlebar-strip（窗口拖拽区，随主题变色） ────────────────┐
├────────────┬────────────────────────────────────────────┤
│  sidebar   │  topbar（状态胶囊 + 搜索 + 主题 + 信息）      │
│  品牌       ├────────────────────────────────────────────┤
│  主导航     │  content（page 容器，居中，最大 1560px）      │
│  底部状态   │                                            │
└────────────┴────────────────────────────────────────────┘
              mobile-nav（≤780px 时替换侧栏，固定底部）
```

### 栅格与对齐

- 内容区 `width: min(100%, var(--content-max))` + `margin: 0 auto`，`--content-max` 默认 1560px，≤1280px 时放宽为 100%
- 页面内部统一**左对齐**（设置页曾有整页居中，已废弃）
- 页头、区块标题、列表行共用同一条左基线：`.content` 的 `padding-inline`

### 间距刻度

| 令牌        | 值   | 典型用途                         |
| ----------- | ---- | -------------------------------- |
| `--space-1` | 4px  | 图标与文字间的微调               |
| `--space-2` | 6px  | 标签内边距、行内元素间距         |
| `--space-3` | 8px  | 按钮内 gap、列表项间距           |
| `--space-4` | 10px | 紧凑卡片内边距                   |
| `--space-5` | 12px | 列表行内边距、区块内间距         |
| `--space-6` | 16px | 卡片内边距、区块间距             |
| `--space-7` | 20px | 卡片内边距（宽松）、页面横向留白 |
| `--space-8` | 24px | 内容区外边距、大区块间距         |
| `--space-9` | 32px | 空状态、弹窗内边距               |

### 自适应

四档断点，语义固定：

| 断点    | 变化                                                                                   |
| ------- | -------------------------------------------------------------------------------------- |
| ≤1280px | 内容区放宽到 100%；分析页双栏改单栏；指标数字降一档字号                                |
| ≤1080px | 侧栏收成 72px 图标栏；设置页分区导航收窄                                               |
| ≤900px  | 设置页分区导航改为横向滚动；成果集行隐藏项目名                                         |
| ≤780px  | 侧栏改为抽屉（遮罩 + 滑入）；顶栏出现菜单按钮；底部出现 mobile-nav；弹窗按钮改纵向排列 |
| ≤520px  | 指标条改单列                                                                           |

- 最小窗口尺寸 `960×680`（`electron/main.cjs`）
- 界面缩放：90% / 100% / 110% / 125%，走 `webContents.setZoomFactor`（**不要用 CSS `zoom`**，会破坏 `100vh` 语义）

### 溢出处理

- 单行文本：`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`，并用 `title` 属性兜底完整内容
- 多行文本：`-webkit-line-clamp`（工作摘要、任务结果）
- 长路径：`shortenPath()` 去掉项目根前缀，只保留末尾两段
- 列表：容器滚动，滚动条统一 10px 细样式（`.primary-nav` 隐藏滚动条）

### 层级（z-index）

全部走令牌，**不允许写数字**：

| 令牌             | 值  | 用途                |
| ---------------- | --- | ------------------- |
| `--z-topbar`     | 20  | 顶栏                |
| `--z-sidebar`    | 30  | 侧栏                |
| `--z-titlebar`   | 40  | 窗口拖拽条          |
| `--z-mobile-nav` | 45  | 底部导航            |
| `--z-popover`    | 60  | 顶栏浮层            |
| `--z-backdrop`   | 70  | 抽屉遮罩            |
| `--z-drawer`     | 80  | 移动端侧栏          |
| `--z-floating`   | 95  | 常驻更新框          |
| `--z-overlay`    | 100 | 命令面板 / 弹窗遮罩 |
| `--z-toast`      | 120 | 通知                |

---

## ② 视觉规范

### 配色

| 类别 | 令牌                                                                      | 浅色                                          | 深色                                          |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| 背景 | `--bg` / `--bg-soft`                                                      | `#f5f6f7` / `#eef0f2`                         | `#121315` / `#17191b`                         |
| 表面 | `--surface` / `--surface-raised` / `--surface-hover` / `--surface-strong` | `#ffffff` / `#ffffff` / `#f2f4f5` / `#e6e9eb` | `#1b1d20` / `#212427` / `#26292d` / `#303439` |
| 文字 | `--text` / `--text-soft` / `--text-faint`                                 | `#15181a` / `#51585d` / `#6c7378`             | `#f1f3f4` / `#a9afb5` / `#8b9299`             |
| 边框 | `--border` / `--border-subtle`                                            | `#e1e4e6` / `#ebedef`                         | `#2c3035` / `#24272b`                         |
| 品牌 | `--primary` / `--primary-strong` / `--primary-soft`                       | `#0e9a86` / `#0a7a6a` / `#e0f3ef`             | `#2fc7a8` / `#5cdcc2` / `#10352e`             |
| 语义 | `--green` / `--amber` / `--coral` / `--blue` / `--violet`                 | 见 `App.css`                                  | 见 `App.css`                                  |

**对比度要求**：正文 ≥ 4.5:1（WCAG AA）。`--text-faint` 对白底为 5.1:1，已达标准；**不允许再调浅**。

### 字体

- 字体族：系统字体栈（离线优先，不请求外部 CDN）
- 字号阶：`--text-2xs: 11px` / `xs: 12` / `sm: 13` / `base: 13.5` / `md: 15` / `lg: 17` / `xl: 21` / `2xl: 25` / `display: 30`
- **正文最小 11px**，不允许出现 9px / 10px
- 字重阶：**只允许四档** `--fw-regular: 400` / `--fw-medium: 500` / `--fw-semibold: 600` / `--fw-bold: 700`
  （曾出现 620/640/660/680，系统字体无法精确匹配，会被合成加粗导致渲染不一致）
- 行高：`--leading-tight: 1.2`（标题）/ `snug: 1.45`（正文）/ `normal: 1.65`（长段落）

### 图标

- 统一使用 `lucide-react`（线性风格，`strokeWidth={2}`）
- 尺寸**只允许四档**，取自 `src/lib/ui.ts` 的 `ICON_SIZE`：

| 令牌           | 值  | 用途                   |
| -------------- | --- | ---------------------- |
| `ICON_SIZE.xs` | 14  | 标签、计数、快捷键提示 |
| `ICON_SIZE.sm` | 16  | 按钮、导航、行内操作   |
| `ICON_SIZE.md` | 18  | 侧栏导航、卡片操作     |
| `ICON_SIZE.lg` | 20  | 空状态、页面级动作     |

### 圆角 / 边框 / 阴影

> **v0.6.8 起重建后令牌统一带 `--vr-` 前缀，唯一来源是 `src/styles/voyra-tokens.css`**；
> 下表的历史名（`--radius-*`）与 `src/App.css` 入口已不存在，只作档位语义参考。

| 令牌                   | 值     | 用途                           |
| ---------------------- | ------ | ------------------------------ |
| `--vr-radius-xs`       | 4px    | 徽标、小色块、分段控件内部按钮 |
| `--vr-radius-sm`       | 6px    | 图标按钮、输入框、导航行       |
| `--vr-radius-md`       | 8px    | 卡片（`.desk-panel`）          |
| `--vr-radius-lg`       | 12px   | 弹窗、区块                     |
| `--vr-radius-junction` | 10px   | **区域接缝的内圆弧**（见 ⑦）   |
| `--vr-radius-full`     | 9999px | 胶囊（chip、badge、开关）      |

阴影：`--shadow-xs`（贴边）→ `--shadow-sm`（卡片）→ `--shadow-md`（浮层）→ `--shadow-lg`（弹窗）。
边框：结构分隔用 `--border-subtle`，可交互边界用 `--border`。

### 品牌一致性

- 应用图标为青绿「观测环」（`public/favicon.svg`），与 `--primary` 同色系
- 同一语义在不同页面必须用同一形态：计数用 `Badge`、筛选用 `filter-chip`、分段选择用 `segmented-control`

---

## ③ 组件体系

| 组件                                     | 文件                            | 说明                                                                                         |
| ---------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `Button`                                 | `components/Button.tsx`         | `variant` = primary / secondary / ghost / danger；`size` = sm / md / lg；`loading`；`square` |
| `IconButton`                             | `components/Button.tsx`         | `label` 必填（同时作为 `aria-label` 与 `title`）；`size` = sm / md                           |
| `Badge`                                  | `components/Badge.tsx`          | `tone` = neutral / primary / success / warning / danger                                      |
| `Field` / `Input` / `Select`             | `components/Field.tsx`          | 表单项容器（label / hint / error）+ 输入框 + 下拉                                            |
| `Switch`                                 | `components/Switch.tsx`         | 布尔设置项，`role="switch"`                                                                  |
| `Modal` / `ConfirmDialog`                | `components/Modal.tsx`          | 通用弹窗 + 危险操作二次确认                                                                  |
| `EmptyState` / `DesktopOnlyPage`         | `components/EmptyState.tsx`     | 空状态与浏览器预览占位                                                                       |
| `Skeleton*`                              | `components/Skeleton.tsx`       | 骨架屏（`Skeleton` / `SkeletonSummary` / `SkeletonList` / `SkeletonPage`）                   |
| `Progress` / `LoadMore`                  | `components/Progress.tsx`       | 进度条 / 长列表分页                                                                          |
| `Toast`                                  | `components/ToastStack.tsx`     | 轻提示，成功 / 信息 / 警告三态                                                               |
| `CommandPalette`                         | `components/CommandPalette.tsx` | 命令面板（`⌘/Ctrl + K`）                                                                     |
| `ErrorBoundary`                          | `components/ErrorBoundary.tsx`  | 渲染异常兜底                                                                                 |
| `PageHeader`                             | `components/PageHeader.tsx`     | 页头（kicker + 标题 + 操作区）                                                               |
| `SummaryStrip`                           | `components/SummaryStrip.tsx`   | 指标条                                                                                       |
| `ChartTooltip`                           | `components/ChartTooltip.tsx`   | Recharts 主题化提示框                                                                        |
| `SessionRow` / `ToolDot` / `UpdateBadge` | 同名文件                        | 会话行 / 软件色点 / 常驻更新框                                                               |

### 不适用项（本软件无对应场景，故不提供）

| 组件                   | 原因                                             |
| ---------------------- | ------------------------------------------------ |
| 复选框 / 单选框 / 滑块 | 无多选、无二选一表单、无区间调节场景             |
| 标签页 Tabs / 面包屑   | 导航只有一层（侧栏 + 页面），无嵌套层级          |
| 表格 Table             | 数据以列表与卡片呈现，无需列对齐与排序表头       |
| 404 页                 | 视图 id 由 `navItems` 白名单校验，不存在非法路由 |
| 通知中心               | 用 Toast + 系统通知覆盖，无需站内消息列表        |

---

## ④ 组件状态

### 状态令牌

| 令牌                                  | 用途                           |
| ------------------------------------- | ------------------------------ |
| `--state-hover`                       | 悬停底色（`text` 5% 叠加）     |
| `--state-active`                      | 按下底色（`text` 10% 叠加）    |
| `--state-selected`                    | 选中底色（`primary` 12% 叠加） |
| `--state-disabled-opacity`            | 禁用透明度 0.5                 |
| `--focus-ring` / `--focus-ring-inset` | 焦点环（备用，主用 `outline`） |

### 状态矩阵

| 组件                                | default | hover           | active   | focus-visible         | disabled                   | selected              | loading            |
| ----------------------------------- | ------- | --------------- | -------- | --------------------- | -------------------------- | --------------------- | ------------------ |
| `.btn`                              | ✓       | ✓               | 下移 1px | 全局 outline          | 透明度 0.5 + `not-allowed` | —                     | `aria-busy` + 转圈 |
| `.icon-button`                      | ✓       | 边框 + 底色     | 加深     | 全局 outline          | ✓                          | —                     | —                  |
| `.filter-chip`                      | ✓       | 边框转主色      | 加深     | 全局 outline          | ✓                          | `.filter-chip-active` | —                  |
| `.segmented-control button`         | ✓       | 底色            | 加深     | 全局 outline          | ✓                          | `.segmented-active`   | —                  |
| `.switch`                           | ✓       | 底色 + 外环     | —        | outline 内缩 3px      | ✓                          | `.switch-on`          | —                  |
| `.input` / `.select`                | ✓       | 边框加深        | —        | 主色边框 + 3px 光晕   | 灰底 + 禁用光标            | —                     | —                  |
| `.nav-item`                         | ✓       | 底色 + 文字变深 | —        | 内缩 outline          | —                          | `.nav-item-active`    | —                  |
| 列表行（会话 / 成果 / 项目 / 日卡） | ✓       | 边框转主色      | —        | 内缩 outline          | —                          | `.open` / `-selected` | —                  |
| `.settings-row`                     | ✓       | 底色            | 下移 1px | 全局 outline          | ✓                          | —                     | —                  |
| `.modal` / `.confirm`               | ✓       | —               | —        | 焦点陷阱 + 首元素聚焦 | —                          | —                     | 确认按钮 loading   |

### 焦点环的两个坑（已修）

1. **外扩 outline 会被 `overflow: hidden` 容器裁掉**。`.nav-item`、`.project-card-main`、`.history-day-head`、`.command-result`、`.artifact-row`、`.session-row`、`.mobile-nav button` 改用 `outline-offset: -2px`（内缩），焦点永远可见。
2. **全局 `:focus-visible` 曾设置 `border-radius`**，会把胶囊形按钮的圆角改方。已移除，只保留 `outline`。

---

## ⑤ 交互反馈

### 反馈层级

| 场景            | 反馈方式                                                           |
| --------------- | ------------------------------------------------------------------ |
| 按钮点击        | 按下位移 1px + 底色变化；耗时操作显示 `loading` 转圈并 `aria-busy` |
| 操作成功 / 失败 | Toast（成功 / 信息 / 警告），4.2 秒自动消失，最多同时 3 条         |
| 危险操作        | `ConfirmDialog` 二次确认，默认焦点落在「取消」，逐条列出影响       |
| 页面切换        | `pageIn` 淡入上移 240ms                                            |
| 列表新增        | `listItemIn` 淡入上移 160ms，前 5 项错峰 24ms                      |
| 弹层出现        | `popoverIn` / `fadeIn` 160–240ms                                   |
| 长任务进度      | `Progress` 进度条；下载类用 `UpdateBadge` 的圆形进度环             |
| 首屏加载        | `SkeletonPage` 骨架屏（与真实布局同栅格，不跳版）                  |

### 动效时长

| 令牌         | 值                                  | 用途                 |
| ------------ | ----------------------------------- | -------------------- |
| `--dur-fast` | 120ms                               | 按压位移             |
| `--dur`      | 160ms                               | 绝大多数状态切换     |
| `--dur-slow` | 240ms                               | 页面切换、抽屉、弹窗 |
| `--ease`     | `cubic-bezier(0.22, 0.61, 0.36, 1)` | 统一缓动             |

`prefers-reduced-motion: reduce` 时全部降为 0.01ms。

### 不允许出现的状态

- **点了没反应**：所有异步操作必须有 loading 或结果提示
- **无确认的破坏性操作**：清缓存、删除、退出前必须二次确认
- **只有颜色变化的选中态**：需同时有形状或图标变化（无障碍要求）

---

## ⑥ 适配与可用性

### 多分辨率与高分屏

- 四档断点（见 ①）+ 最小窗口 960×680
- 界面缩放四档，持久化到 `window-state.json`，在页面加载前后各应用一次避免闪动
- 窗口位置恢复前校验是否仍落在某个显示器工作区内

### 主题

- 深浅双主题，令牌驱动；首次启动跟随 `prefers-color-scheme`
- Windows 标题栏覆盖层颜色由主进程同步（`desktop:set-window-theme`）
- **每个组件都必须在两套主题下检查**，禁止硬编码颜色（除图标内部固定色）

### 点击区域

- 交互控件最小高度 `--control-sm: 32px`；按钮默认 `--control-md: 36px`
- 开关视觉高度 22px，用 `margin: 5px 0` + hover 外环把点击区撑到 32px
- 图标按钮 34×34（`.icon-button-sm` 28×28 仅用于行内次要操作）

### 键盘操作

| 快捷键       | 行为                               |
| ------------ | ---------------------------------- |
| `⌘/Ctrl + K` | 打开 / 关闭命令面板                |
| `/`          | 聚焦顶栏搜索框（正在输入时不拦截） |
| `↑` `↓`      | 命令面板内移动选择                 |
| `Enter`      | 执行当前项                         |
| `Esc`        | 关闭命令面板 / 弹窗 / 顶栏浮层     |

- Tab 顺序跟随 DOM 顺序，弹层打开时用**焦点陷阱**限制在容器内，关闭后焦点归还给触发元素
- 所有可聚焦元素都有可见焦点环（含被 `overflow: hidden` 容器包裹的，用内缩 outline）

### 文字不溢出

- 长标题 / 长路径 / 长模型名统一 ellipsis + `title`
- 指标数值用 `font-variant-numeric: tabular-nums` 防止跳动
- 长数值（时间区间、体积）用 `SummaryStrip` 的 `compact` 变体降一档字号

### 一致性

同一功能在不同页面必须一致：页头用 `PageHeader`、指标用 `SummaryStrip`、空状态用 `EmptyState`、计数用 `Badge`、异步操作按钮用 `Button loading`。

---

## ⑦ 区域接缝与目录信息显示（2026-10-05）

### 接缝内圆弧

标题栏 / 侧栏 / 舞台条 / 视口四块是**满铺相接**的，直接给某块加 `border-radius` 只会咬出一个方缺口
（露出的是同色的 `.desk-app` 背景）。所以转角用 `radial-gradient` 把**相邻区域的底色画进缺口**，
两侧看起来就各自收出了圆角：

- `.desk-stage::before`：标题栏 + 侧栏（同为 `--vr-bg-subtle`）→ 舞台条的左上转角
- `.desk-stage-bar { border-bottom-left-radius }`：舞台条 → 视口 / 侧栏的左下转角

半径统一取 `--vr-radius-junction`。验收方式是**逐行取色**看分界列号是否连续变化（直角则恒定），
不是看截图顺不顺眼。

### 导航行的对比度

图标必须**跟随按钮文字色一起提亮**：`.desk-nav-icon` 若自带一档 `--vr-text-faint`，
hover 换底色时它不会跟着变，暗档实测只有 2.30:1（背景一亮图标就糊）。
现约定静止 `--vr-text-muted`、hover / 选中 `--vr-text-main`；
暗档选中底色另提到 `--vr-surface-active`，保证 **选中 > 悬停 > 静止** 的层级不被反转。

2026-10-05 实测（图标与所在底色）：暗档 静止 6.83 / 悬停 13.52 / 选中 11.79；
浅档 静止 3.51 / 悬停 16.60 / 选中 18.47。浅档静止态 3.51 只达非文本对比度 3:1，
**未达正文 AA 4.5:1**（标签文字同值，属既有问题，尚未处理）。

### 目录信息显示开关

`ChronicleSettings.showProjectPaths`（localStorage `ai-chronicle-settings-v1`，**默认 false**）：

- 关闭时：目录名 / 面包屑 / 相对路径 / `title` 里的完整路径一律不渲染，「项目集」入口从侧栏消失
  （深链 `?view=projects` 落到带出路的空状态，不留白页）
- 归组主键随之从工作目录换成 AI 软件：`buildWorkSummary(sessions, 'tool')`、
  `buildDailyReport(sessions, now, 'tool')`、分析页透视同步；**日报导出跟随界面口径**
- 搜索仍能命中目录名与路径（隐藏显示不等于削弱可检索性）
- 接入中心的探测路径**不受开关影响**：那一页的职责就是交代读了哪些目录，藏掉即失效
- 成果集表格关闭时少一列，靠 `.desk-artifact-table-card.is-no-proj` 同步收窄
  `grid-template-columns`，否则整表错位（验收：表头与行的分界列号逐个相等）
