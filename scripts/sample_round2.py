# -*- coding: utf-8 -*-
"""结构采样第二轮：补齐解析器设计所需的关键细节（只读）。"""
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


def open_ro(db_path):
    tmp = tempfile.mkdtemp(prefix="chronicle_r2_")
    base = os.path.basename(db_path)
    for suf in ("", "-wal", "-shm"):
        s = db_path + suf
        if os.path.exists(s):
            shutil.copy2(s, os.path.join(tmp, base + suf))
    return sqlite3.connect(os.path.join(tmp, base)), tmp


def trunc(v, n=500):
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return s[:n]


# 1. Codex：跨多个 rollout 找用户消息行的真实形态
codex_dirs = [os.path.join(HOME, ".codex", "sessions"),
              os.path.join(HOME, ".codex", "archived_sessions")]
found_user = None
found_role = None
checked = 0
for d in codex_dirs:
    if found_user and found_role:
        break
    for dp, dirs, names in os.walk(d):
        for fn in names:
            if not fn.endswith(".jsonl"):
                continue
            checked += 1
            if checked > 8:
                break
            p = os.path.join(dp, fn)
            try:
                with open(p, "r", encoding="utf-8", errors="replace") as fh:
                    for i, line in enumerate(fh):
                        if i > 400:
                            break
                        if found_user is None and '"user_message"' in line:
                            found_user = trunc(line)
                        if found_role is None and '"role"' in line and '"user"' in line:
                            found_role = trunc(line)
                        if found_user and found_role:
                            break
            except OSError:
                continue
        if checked > 8:
            break
emit("codex.user_message_line", found_user or "未找到(前8文件前400行)")
emit("codex.role_user_line", found_role or "未找到")

# 2. TRAE：排除 ModularData 后找 usage/session 文件
trae = os.path.join(APPDATA, "TRAE SOLO CN")
hits = []
for dp, dirs, names in os.walk(trae):
    rel = os.path.relpath(dp, trae)
    top = rel.split(os.sep)[0] if rel != "." else ""
    if top.lower() in ("modulardata", "cache", "gpucache", "code cache"):
        dirs[:] = []
        continue
    dirs[:] = [d for d in dirs if d.lower() not in
               ("cache", "gpucache", "code cache", "crashpad", "node_modules")]
    for fn in names:
        low = fn.lower()
        if low.endswith((".jsonl", ".ndjson")) or ("usage" in low and low.endswith(".json")):
            p = os.path.join(dp, fn)
            try:
                hits.append((os.path.getsize(p), os.path.relpath(p, trae)))
            except OSError:
                pass
hits.sort()
emit("trae.usage_hits", [[s, p] for s, p in hits[:15]])
if hits:
    p = os.path.join(trae, hits[0][1])
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as fh:
            emit("trae.sample", fh.read(900))
    except OSError as e:
        emit("trae.sample", str(e))

# 3. OpenCode：message/part 数据样例 + project 表
p = os.path.join(HOME, ".local", "share", "opencode", "opencode.db")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute(
            "SELECT data FROM message WHERE data LIKE '%\"role\"%' LIMIT 1").fetchall()
        if rows:
            emit("opencode.message_data", trunc(rows[0][0], 600))
        rows = con.execute(
            "SELECT data FROM part WHERE data LIKE '%text%' LIMIT 1").fetchall()
        if rows:
            emit("opencode.part_data", trunc(rows[0][0], 400))
        rows = con.execute(
            "SELECT id, directory, title, time_created, time_updated,"
            " summary_files FROM session ORDER BY time_updated DESC LIMIT 2").fetchall()
        emit("opencode.session_rows", [trunc(list(r), 300) for r in rows])
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 4. ZCode：message/part + input_history + session 样例
p = os.path.join(HOME, ".zcode", "cli", "db", "db.sqlite")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute(
            "SELECT data FROM message WHERE data LIKE '%\"role\"%' LIMIT 1").fetchall()
        if rows:
            emit("zcode.message_data", trunc(rows[0][0], 600))
        rows = con.execute(
            "SELECT data FROM part WHERE data LIKE '%text%' LIMIT 1").fetchall()
        if rows:
            emit("zcode.part_data", trunc(rows[0][0], 400))
        rows = con.execute(
            "SELECT id, directory, title, time_created, time_updated,"
            " summary_files FROM session ORDER BY time_updated DESC LIMIT 2").fetchall()
        emit("zcode.session_rows", [trunc(list(r), 300) for r in rows])
        rows = con.execute(
            "SELECT text, time_created FROM input_history ORDER BY time_created DESC LIMIT 2").fetchall()
        emit("zcode.input_history", [trunc(list(r), 260) for r in rows])
        rows = con.execute(
            "SELECT session_id, model_id, started_at, input_tokens, output_tokens,"
            " reasoning_tokens, cache_read_input_tokens FROM model_usage"
            " ORDER BY started_at DESC LIMIT 2").fetchall()
        emit("zcode.model_usage_rows", [trunc(list(r), 260) for r in rows])
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 5. Hermes：session 行（看 started_at 格式）+ 用户消息
p = os.path.join(HOME, ".hermes", "state.db")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute(
            "SELECT id, source, display_name, model, started_at, ended_at"
            " FROM sessions ORDER BY started_at DESC LIMIT 2").fetchall()
        emit("hermes.session_rows", [trunc(list(r), 300) for r in rows])
        rows = con.execute(
            "SELECT role, content, timestamp FROM messages"
            " WHERE role='user' ORDER BY timestamp DESC LIMIT 2").fetchall()
        emit("hermes.user_msgs", [trunc(list(r), 260) for r in rows])
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 6. Qoder ai-stats 的 jsonl 文件
qdir = os.path.join(HOME, ".qoder-cli", "ai-stats")
jl = None
if os.path.isdir(qdir):
    for fn in sorted(os.listdir(qdir)):
        if fn.endswith(".jsonl"):
            jl = os.path.join(qdir, fn)
            break
if jl:
    with open(jl, "r", encoding="utf-8", errors="replace") as fh:
        emit("qoder.jsonl", [fh.readline().strip()[:600]])
else:
    emit("qoder.jsonl", "无 jsonl 文件")

# 7. Kimi context.jsonl 原始头部
kroot = os.path.join(HOME, ".kimi", "sessions")
for dp, dirs, names in os.walk(kroot):
    for fn in names:
        if fn.endswith(".jsonl"):
            p = os.path.join(dp, fn)
            if os.path.getsize(p) > 0:
                with open(p, "rb") as fh:
                    emit("kimi.raw_head", fh.read(400).decode("utf-8", "replace"))
                break
    break

# 8. Cline messages json 顶层键
sdir = os.path.join(HOME, ".cline", "data", "sessions")
for fn in os.listdir(sdir) if os.path.isdir(sdir) else []:
    if fn.endswith(".messages.json"):
        with open(os.path.join(sdir, fn), "r", encoding="utf-8", errors="replace") as fh:
            data = json.load(fh)
        emit("cline.top_keys", list(data.keys())[:20] if isinstance(data, dict) else "list")
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list) and v:
                    emit("cline.list_key." + k, trunc(v[0], 500))
                    break
        break

# 9. MiniMax sessions 行
p = os.path.join(HOME, ".minimax", "sqlite.db")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute("SELECT * FROM sessions LIMIT 1").fetchall()
        cols = [d[0] for d in con.execute("SELECT * FROM sessions LIMIT 1").description]
        emit("minimax.session_cols", cols)
        if rows:
            emit("minimax.session_row", trunc(list(rows[0]), 400))
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 10. Agnes sessions 行 + message 内容样例
p = os.path.join(HOME, ".agnes", "data", "sessions", "sessions.db")
if os.path.exists(p):
    con, tmp = open_ro(p)
    try:
        rows = con.execute(
            "SELECT name, working_dir, created_at, updated_at, total_tokens,"
            " input_tokens, output_tokens FROM sessions"
            " ORDER BY updated_at DESC LIMIT 2").fetchall()
        emit("agnes.session_rows", [trunc(list(r), 300) for r in rows])
        rows = con.execute(
            "SELECT role, content_json, timestamp FROM messages"
            " WHERE role='user' ORDER BY timestamp DESC LIMIT 1").fetchall()
        emit("agnes.user_msg", [trunc(list(r), 300) for r in rows])
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)

# 11. Claude Code user 行完整结构（含 cwd）
croot = os.path.join(HOME, ".claude", "projects")
shown = 0
for dp, dirs, names in os.walk(croot):
    for fn in names:
        if not fn.endswith(".jsonl"):
            continue
        p = os.path.join(dp, fn)
        try:
            with open(p, "r", encoding="utf-8", errors="replace") as fh:
                for i, line in enumerate(fh):
                    if i > 60:
                        break
                    if '"type": "user"' in line or '"type":"user"' in line:
                        emit("claude.user_line", trunc(line))
                        shown += 1
                        break
        except OSError:
            continue
        if shown >= 1:
            break
    if shown >= 1:
        break

sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(OUT, ensure_ascii=False, indent=1))
