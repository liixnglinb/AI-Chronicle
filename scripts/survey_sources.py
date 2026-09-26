# -*- coding: utf-8 -*-
"""核对截图中各 AI 软件在本机的日志存在性与结构（只读，不修改任何数据）"""
import json
import os
import sys

HOME = os.path.expanduser("~")
APPDATA = os.environ.get("APPDATA", "")
LOCALAPPDATA = os.environ.get("LOCALAPPDATA", "")

TARGETS = [
    # (标签, [候选路径])
    ("Codex CLI", ["~/.codex/sessions", "~/.codex/archived_sessions", "%APPDATA%/Codex++"]),
    ("Claude Code", ["~/.claude/projects"]),
    ("ZCode", ["~/.zcode/cli/db/db.sqlite", "~/.zcode/projects"]),
    ("OpenCode", ["~/.local/share/opencode/opencode.db",
                  "~/.local/share/opencode/opencode-stable.db",
                  "%LOCALAPPDATA%/ai.opencode.desktop"]),
    ("TRAE SOLO CN", ["%APPDATA%/TRAE SOLO CN", "~/.trae-cn"]),
    ("千问 Qwen", ["~/.qwen/projects", "%APPDATA%/Qianwen"]),
    ("WorkBuddy", ["~/.workbuddy/projects", "~/.workbuddy-ai/projects", "~/.workbuddy_legacy"]),
    ("CatPaw", ["~/.catpaw", "%APPDATA%/catpaw-moon", "~/.meituan-catpaw"]),
    ("豆包 Doubao", ["%APPDATA%/Doubao"]),
    ("Hermes", ["~/.hermes/state.db", "%APPDATA%/Hermes"]),
    ("Cline", ["~/.cline/data/sessions", "~/.cline",
               "%APPDATA%/Code/User/globalStorage/saoudrizwan.claude-dev/tasks"]),
    ("Cursor", ["~/.cursor", "%APPDATA%/Cursor"]),
    ("Grok Bot", ["~/.grok/sessions", "%APPDATA%/Grok Bot", "%APPDATA%/grok"]),
    ("Qoder CN", ["~/.qoder-cli/ai-stats", "~/.qoder", "~/.qoderwork", "%APPDATA%/QoderCN"]),
    ("DSH", ["~/.dsh/sessions", "%APPDATA%/DSH Desktop"]),
    ("Kimi Code", ["~/.kimi/sessions", "~/.kimi-code/sessions", "~/.kimi-work",
                   "%APPDATA%/kimi-desktop", "%APPDATA%/kimi-code-app"]),
    ("Pi Desktop", ["~/.pi/agent/sessions", "~/.omp/agent/sessions"]),
    ("其他已知源", ["~/.minimax", "%APPDATA%/ModexData", "~/.agnes", "~/.mavis",
                  "~/.box-agent", "D:/AI-Tools-Data/.box-agent", "~/.openclaw-autoclaw",
                  "~/.openviking", "~/.cc-switch", "%APPDATA%/MHAgent"]),
]

SKIP = {"cache", "gpucache", "node_modules", "backups", "tmp", "blob_storage",
        "serviceworker", "crashpad", "logs", "code cache", "cacheddata"}


def expand(p):
    p = p.replace("~", HOME, 1)
    p = p.replace("%APPDATA%", APPDATA).replace("%LOCALAPPDATA%", LOCALAPPDATA)
    return os.path.normpath(p)


def probe(path, max_files=4000):
    """返回 (文件数, 总字节, 按后缀分布, 样例文件列表)"""
    if os.path.isfile(path):
        try:
            st = os.stat(path)
            return 1, st.st_size, {os.path.splitext(path)[1].lower(): 1}, [path]
        except OSError:
            return 0, 0, {}, []
    n, total, exts, samples = 0, 0, {}, []
    for dp, dirs, names in os.walk(path):
        dirs[:] = [d for d in dirs if d.lower() not in SKIP]
        for fn in names:
            n += 1
            if n > max_files:
                return n, total, exts, samples
            p = os.path.join(dp, fn)
            try:
                sz = os.path.getsize(p)
            except OSError:
                continue
            total += sz
            ext = os.path.splitext(fn)[1].lower() or "(无后缀)"
            exts[ext] = exts.get(ext, 0) + 1
            if len(samples) < 4 and ext in (".jsonl", ".json", ".db", ".sqlite", ".sqlite3", ".zstd"):
                samples.append((os.path.relpath(p, path), sz))
    return n, total, exts, samples


def main():
    out = []
    for label, paths in TARGETS:
        entries = []
        for raw in paths:
            p = expand(raw)
            exists = os.path.exists(p)
            e = {"path": raw, "exists": exists}
            if exists:
                n, total, exts, samples = probe(p)
                e.update({"files": n, "mb": round(total / 1048576, 1),
                          "exts": dict(sorted(exts.items(), key=lambda x: -x[1])[:5]),
                          "samples": samples})
            entries.append(e)
        out.append({"label": label, "paths": entries})
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
