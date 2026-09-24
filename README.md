# AI 轨迹

本地优先的 AI 工作观测台前端原型。它把一天中的 AI 会话、项目、时间线和产出文件组织成可追溯的日报，而不是只统计软件开了多久。

仓库：<https://github.com/liixnglinb/AI-Chronicle>

## 已实现页面

- 今天：日报概览、关键指标、活动时间线、工作线程、成果和证据检查器
- 今日任务：任务状态、优先级、进度、工具、时长和完成结果
- 历史：月历热度、每日摘要、任务档案、最近十八个工作日回看
- 活动时间线：24 小时多轨时间画布、软件筛选、缩放、回放和会话详情
- 项目：跨 Codex、Qoder、Cursor 等软件的长期工作线程和历史任务账本
- 成果库：文档、代码、图片、视频和数据成果，以及对应来源可信度
- 洞察：投入结构、Token 趋势、软件贡献和年度活跃热力图
- 数据源：适配器健康状态、启用开关、同步时间和解析路径
- 设置：采集自动化、隐私、摘要模型、存储、备份和主题

## 主要交互

- `Ctrl/Cmd + K` 打开命令面板，支持方向键与回车
- 侧边栏可收起，移动端使用抽屉导航和底部导航
- 支持浅色与深色主题，偏好保存在本机
- 点击工作线程查看来源会话和关联产出
- 在历史页点击日期查看当天概览和任务，并按状态筛选
- 任务可在今天、历史和项目视图中更新状态
- 时间线支持缩放、活动选择和播放进度
- 数据源支持本地暂停和恢复

## 运行

```bash
npm install
npm run dev
```

默认开发地址：`http://127.0.0.1:5173`

生产和检查：

```bash
npm run lint
npm run build
npm run preview
```

## Windows 桌面版

开发模式：

```bash
npm run dev:desktop
```

生成桌面资源但不制作安装程序：

```bash
npm run pack
```

生成 Windows x64 安装版和便携版：

```bash
npm run dist
```

产物位于 `release/`：

- `AI-Chronicle-0.1.0-x64.exe`：NSIS 安装程序
- `AI-Chronicle-Portable-0.1.0-x64.exe`：免安装便携版
- `win-unpacked/AI轨迹.exe`：用于本地调试和解包运行

Electron 桌面层目前已经支持：

- 打开本地文件和目录
- 通过系统保存对话框导出日报、CSV 和备份
- 扫描 Codex、Claude、Qoder、CatPaw、TRAE、豆包和 Kimi Code 的数据目录
- 单实例运行和外部链接安全跳转
- 从 GitHub Releases 检查新版本、后台下载并在设置页安装重启

当前构建尚未配置商业代码签名证书，Windows SmartScreen 可能提示未知发布者。

更新清单发布后位于：

```text
https://github.com/liixnglinb/AI-Chronicle/releases/latest/download/latest.yml
```

## 技术栈

- React 19
- TypeScript
- Vite 8
- Lucide Icons
- Recharts
- 原生 CSS 设计令牌、容器响应式与深浅主题

## 当前数据状态

界面当前主要使用本机 AI 工作场景的模拟数据，覆盖 Codex、Claude、Qoder、CatPaw、Cursor、TRAE、Pi Desktop、豆包、千问和 Kimi Code。

真实接入时，后端适配器只需要向页面提供标准化数据：应用、项目、会话、事件、成果、日报和适配器状态。前端不需要知道每个软件的具体日志格式。

当前桌面版已经能检查部分数据目录和统计当天修改文件，但还没有把所有软件日志解析成真实会话、任务和日报。这是下一阶段的数据采集后端工作。
