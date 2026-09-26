# AI 轨迹

本地优先的 AI 工作观测台。它读取本机各 AI 软件的真实会话日志，回答一个问题：**今天（以及过去每一天）我用各个 agent 软件做了什么**。

仓库：<https://github.com/liixnglinb/AI-Chronicle>

## v0.2 —— 真实数据接入（当前版本）

界面上的每一条记录都来自本机日志解析，没有任何模拟数据：

- **已接入 12 个数据源**（自动扫描本机，无需配置）：
  Claude Code、Codex（含归档会话，按会话去重）、ZCode、OpenCode、WorkBuddy（新旧目录去重）、CatPaw、MHAgent、织流 Loom（ModexData）、Hermes、Agnes、DSH（zstd 解压）
- 每条会话包含：时间范围、软件、工作目录（项目）、做了什么（首条真实用户输入）、对话轮次、token 用量、模型
- **观察中数据源诚实标注原因**：Qoder（用量在 IDE 内部库）、TRAE（SQLCipher 加密）、Cursor（仅官方 API）、千问/豆包/Grok Bot（无本地日志）、Kimi/Cline（待适配）、Codex++（并入 Codex）
- 系统注入文本（`<system-reminder>` / `<sandbox_context>` / AGENTS.md 等）会被剥离后再取标题，轮次统计不受影响
- 文件级缓存（mtime+size 未变直接复用），首次全量约 10–20 秒，之后亚秒级

## 页面

- **今天**：今日 KPI（会话/软件/轮次/tokens/活跃时段）+ 按时间倒序的真实会话清单 + 一键导出 Markdown 日报
- **历史**：最近 14 个有记录的日期，按天展开会话
- **时间线**：今日 24 小时活跃分布 + 时间顺序会话
- **项目**：按工作目录聚合，看每个项目花了多少会话/轮次/tokens
- **洞察**：各软件 token 消耗、近 14 天趋势、贡献排行
- **数据源**：接入状态、会话数、观察原因；支持强制重新采集
- **设置**：主题、重新采集、JSON 全量备份、运行环境

主要交互：`Ctrl/Cmd + K` 命令面板（可搜全部会话）、侧边栏可收起、深浅主题。

## 运行

```bash
npm install
npm run dev          # 浏览器预览（无文件权限，仅看界面结构）
npm run dev:desktop  # Electron 开发模式（真实数据）
```

## Windows 打包

```bash
npm run dist   # release/ 下产出 Setup 安装版 + Portable 便携版 + latest.yml
```

- 技术栈：Electron 44（Node 24 内置 `node:sqlite` 只读直连各软件数据库，零原生模块）+ React 19 + TypeScript + Vite 8 + Recharts + fzstd（纯 JS zstd）
- 自动更新：electron-updater，更新清单 `releases/latest/download/latest.yml`
- 采集层实现见 `electron/ingest.cjs`；自检：`CHRONICLE_DEBUG=1 electron .` 输出采集汇总后退出
- 诊断脚本：`scripts/survey_sources.py`（数据源普查）、`scripts/test-ingest.cjs`（采集层独立验证）

当前构建未配置商业代码签名，Windows SmartScreen 可能提示未知发布者。

## 隐私

全部数据在本机解析与保存，不联网上传任何会话内容。日志读取为只读操作。
