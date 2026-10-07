// 各 AI 软件的品牌图。
//
// 来源（2026-10-05 落实，逐条可核）：
//   - 8 张从本机已安装程序的 exe 里提取（PrivateExtractIcons 取 256px 后缩到 64px）：
//     ZCode / OpenCode / Hermes / WorkBuddy / WorkBuddy AI / Modex-MH-Agent / DSH(DeepSeek Harness)
//   - 织流 Loom 用其项目自带的 assets/logo-64.png（不是从 exe 提的，避免提错）
//   - Claude Code、Codex 是命令行工具、本机没有程序图标，用 simple-icons 的官方标识，
//     按各自品牌色着色（纯黑版在暗色档几乎看不见）
//
// 为什么界面一律「图标 + 名字」而不是只显图标：
//   - WorkBuddy 与 WorkBuddy AI 的官方图**是同一张**（两文件 md5 相同），只显图标分不开
//   - Agnes、CatPaw 本机没有可用图标资产（安装目录已空），只能退回首字母色块
export const TOOL_ICON: Record<string, string> = {
  'claude-code': 'tools/claude-code.svg',
  codex: 'tools/codex.svg',
  zcode: 'tools/zcode.png',
  opencode: 'tools/opencode.png',
  hermes: 'tools/hermes.png',
  workbuddy: 'tools/workbuddy.png',
  'workbuddy-ai': 'tools/workbuddy-ai.png',
  mhagent: 'tools/mhagent.png',
  modex: 'tools/modex.png',
  dsh: 'tools/dsh.png',
}

export function toolIconUrl(tool: string): string | null {
  const file = TOOL_ICON[tool]
  return file ? import.meta.env.BASE_URL + file : null
}
