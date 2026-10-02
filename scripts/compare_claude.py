# -*- coding: utf-8 -*-
"""逐文件对账：Token Monitor 口径 vs AI 轨迹解析器（找分歧文件）"""
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude", "projects")


def tm_style_total(path):
    """Token Monitor _claude_file 口径：assistant+usage，按 message.id 保留末条"""
    seen = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            if obj.get("type") != "assistant":
                continue
            m = obj.get("message") or {}
            u = m.get("usage")
            if not isinstance(u, dict):
                continue
            k = m.get("id") or obj.get("uuid")
            if not k:
                continue
            seen[str(k)] = (
                (u.get("input_tokens") or 0)
                + (u.get("cache_creation_input_tokens") or 0)
                + (u.get("cache_read_input_tokens") or 0)
                + (u.get("output_tokens") or 0)
            )
    return sum(seen.values())


def main():
    files = []
    for dp, _dirs, names in os.walk(ROOT):
        for fn in names:
            if fn.endswith(".jsonl"):
                files.append(os.path.join(dp, fn))
    if os.environ.get("TOP8"):
        files.sort(key=lambda p: -os.path.getsize(p))
        files = files[:8]
    files.sort(key=lambda p: -os.path.getsize(p))

    node_out = subprocess.run(
        ["node", os.path.join(os.path.dirname(__file__), "compare_claude_node.cjs"),
         json.dumps(files)],
        capture_output=True, text=True, encoding="utf-8", timeout=600,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    if node_out.returncode != 0:
        print("node 执行失败:", node_out.stderr[:300])
        return
    mine = {}
    for line in node_out.stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            o = json.loads(line)
            mine[o["f"]] = o["tok"]

    print(f"{'文件':<44}{'TM口径':>16}{'AI轨迹':>16}{'差':>14}")
    tm_all = my_all = 0
    for p in files:
        fn = os.path.basename(p)
        tm = tm_style_total(p)
        my = mine.get(fn, -1)
        tm_all += tm
        my_all += max(my, 0)
        diff = my - tm
        mark = "" if abs(diff) < 1000 else "  ← 分歧"
        if abs(diff) >= 1000 or os.environ.get("TOP8"):
            print(f"{fn[:42]:<44}{tm:>16,}{my:>16,}{diff:>14,}{mark}")
    print(f"\n合计 {len(files)} 文件: TM {tm_all:,}  AI轨迹 {my_all:,}  差 {my_all - tm_all:,}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
