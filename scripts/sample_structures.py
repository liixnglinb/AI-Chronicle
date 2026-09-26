# -*- coding: utf-8 -*-
"""采样各源日志结构（只读）。输出精简：键名 + 截断值。
SQLite 一律先复制到临时目录再打开副本，绝不写原库；SQL 全部为内联字面量。"""
import json
import os
import shutil
import sqlite3
import sys
import tempfile

HOME = os.path.expanduser("~")
APPDATA = os.environ["APPDATA"]
OUT = []


def emit(title, obj):
    OUT.append({title: obj})


def first_lines(path, n=3, max_len=700):
    rows = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for i, line in enumerate(f):
            if i >= n:
                break
            line = line.strip()
            if not line:
                continue
            try:
                o = json.loads(line)
                rows.append(json.dumps(o, ensure_ascii=False)[:max_len])
            except ValueError:
                rows.append("NOT_JSON: " + line[:120])
    return rows


def pick(paths, pred=None):
    """按大小升序挑最小的符合条件文件（小文件好采样）"""
    cands = []
    for root in paths:
        root = root.replace("~", HOME).replace("%APPDATA%", APPDATA)
        if os.path.isfile(root):
            cands.append(root)
        elif os.path.isdir(root):
            for dp, dirs, names in os.walk(root):
                dirs[:] = [d for d in dirs if d.lower() not in
                           ("cache", "gpucache", "node_modules", "subagents")]
                for fn in names:
                    if pred and not pred(fn):
                        continue
                    p = os.path.join(dp, fn)
                    try:
                        cands.append((os.path.getsize(p), p))
                    except OSError:
                        pass
    if not cands:
        return None
    if isinstance(cands[0], tuple):
        cands.sort()
        return cands[0][1]
    return cands[0]


def open_ro(db_path):
    """复制 db 与 wal/shm 到临时目录后打开副本，绝不写原库。"""
    tmp = tempfile.mkdtemp(prefix="chronicle_sample_")
    base = os.path.basename(db_path)
    for suf in ("", "-wal", "-shm"):
        s = db_path + suf
        if os.path.exists(s):
            shutil.copy2(s, os.path.join(tmp, base + suf))
    return sqlite3.connect(os.path.join(tmp, base)), tmp


def cols_from_create(create_sql):
    """从 CREATE TABLE 文本粗提列名（只用于结构采样）。"""
    if not create_sql:
        return []
    body = create_sql[create_sql.find("(") + 1:]
    depth, cur, parts = 1, "", []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                break
        if ch == "," and depth == 1:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    if cur:
        parts.append(cur)
    cols = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        first = part.split()[0].strip('"`[]').lower()
        if first in ("primary", "unique", "foreign", "check", "constraint"):
            continue
        cols.append(first)
    return cols[:18]


def schema_via_master(db_path):
    """读建表语句文本提取表名列名；不做行数统计。"""
    con, tmp = open_ro(db_path)
    try:
        info = {}
        rows = con.execute("SELECT name, sql FROM sqlite_master WHERE type='table'").fetchall()
        for name, create in rows:
            info[str(name)] = {"cols": cols_from_create(create)}
        return info
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)


# 1. Codex rollout —— 找 session_meta / user / turn_context 的样例行
f = pick(["~/.codex/sessions", "~/.codex/archived_sessions"],
         pred=lambda n: n.endswith(".jsonl"))
if f:
    meta = user = tc = None
    with open(f, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            if line.strip() and '"session_meta"' in line and meta is None:
                meta = line.strip()[:700]
            if '"user_message"' in line and user is None:
                user = line.strip()[:700]
            if '"turn_context"' in line and tc is None:
                tc = line.strip()[:500]
            if meta and user and tc:
                break
    emit("codex.file", os.path.basename(f))
    emit("codex.session_meta", meta)
    emit("codex.user_message", user)
    emit("codex.turn_context", tc)

# 2. Claude Code —— 前两行
f = pick(["~/.claude/projects"], pred=lambda n: n.endswith(".jsonl"))
if f:
    emit("claude.file", os.path.relpath(f, os.path.dirname(f)))
    emit("claude.lines", first_lines(f, 2))

# 3. WorkBuddy / CatPaw 是否同为 claude-like
for label, root in [("workbuddy", "~/.workbuddy/projects"),
                    ("catpaw", "~/.catpaw/projects")]:
    f = pick([root], pred=lambda n: n.endswith(".jsonl"))
    if f:
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            line = fh.readline().strip()
        emit(label + ".first", line[:400])

# 4. ZCode sqlite
p = os.path.join(HOME, ".zcode", "cli", "db", "db.sqlite")
if os.path.exists(p):
    emit("zcode.schema", schema_via_master(p))

# 5. OpenCode sqlite
p = os.path.join(HOME, ".local", "share", "opencode", "opencode.db")
if os.path.exists(p):
    emit("opencode.schema", schema_via_master(p))

# 6. Hermes state.db
p = os.path.join(HOME, ".hermes", "state.db")
if os.path.exists(p):
    emit("hermes.schema", schema_via_master(p))

# 7. Qoder ai-stats verified json
f = pick(["~/.qoder-cli/ai-stats"], pred=lambda n: n.endswith(".json"))
if f:
    with open(f, "r", encoding="utf-8", errors="replace") as fh:
        emit("qoder.sample", fh.read()[:700])

# 8. Kimi context.jsonl
f = pick(["~/.kimi/sessions"], pred=lambda n: n.endswith(".jsonl"))
if f:
    emit("kimi.lines", first_lines(f, 2, 400))

# 9. Cline messages json
f = pick(["~/.cline/data/sessions"], pred=lambda n: n.endswith(".messages.json"))
if f:
    with open(f, "r", encoding="utf-8", errors="replace") as fh:
        try:
            arr = json.load(fh)
            emit("cline.type", type(arr).__name__)
            item = arr[0] if isinstance(arr, list) else list(arr.items())[0]
            emit("cline.first", json.dumps(item, ensure_ascii=False)[:600])
        except ValueError as e:
            emit("cline.error", str(e))

# 10. Agnes sessions.db
p = os.path.join(HOME, ".agnes", "data", "sessions", "sessions.db")
if os.path.exists(p):
    emit("agnes.schema", schema_via_master(p))

# 11. MiniMax sqlite
p = os.path.join(HOME, ".minimax", "sqlite.db")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        names = [str(r[0]) for r in rows]
        emit("minimax.tables", names[:10])
        if "token_usage" in names:
            fr = con.execute("SELECT framework_type, COUNT(*) FROM token_usage GROUP BY 1").fetchall()
            emit("minimax.framework", dict(fr))
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 12. DSH zstd 解压采样
try:
    import zstandard
    f = pick(["~/.dsh/sessions"], pred=lambda n: n.endswith(".zstd"))
    if f:
        with open(f, "rb") as fh:
            raw = zstandard.ZstdDecompressor().stream_reader(fh).read(4000)
        lines = [x for x in raw.decode("utf-8", "replace").split("\n") if x.strip()][:2]
        emit("dsh.lines", [x[:400] for x in lines])
except ImportError:
    emit("dsh", "no zstandard lib")

# 13. TRAE SOLO usage 文件深找
trae = os.path.join(APPDATA, "TRAE SOLO CN")
found = []
if os.path.isdir(trae):
    for dp, dirs, names in os.walk(trae):
        dirs[:] = [d for d in dirs if d.lower() not in
                   ("cache", "gpucache", "code cache", "crashpad", "dawncache",
                    "node_modules", "serviceworker", "blob_storage")]
        for fn in names:
            low = fn.lower()
            if low.endswith((".jsonl", ".ndjson")) or "usage" in low or "session" in low:
                p = os.path.join(dp, fn)
                try:
                    found.append((os.path.getsize(p), os.path.relpath(p, trae)))
                except OSError:
                    pass
                if len(found) > 40:
                    break
        if len(found) > 40:
            break
found.sort()
emit("trae.candidates", [[s, p] for s, p in found[:12]])

# 14. Codex++ 自有目录
for extra in ("~/.codex-plus", "%APPDATA%/codex-plus"):
    p = extra.replace("~", HOME).replace("%APPDATA%", APPDATA)
    emit("codexplus." + extra, os.path.exists(p))

sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(OUT, ensure_ascii=False, indent=1))
