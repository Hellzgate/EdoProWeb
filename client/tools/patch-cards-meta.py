# -*- coding: utf-8 -*-
"""cards.json 에 ocgcore 용 메타(setcodes/lscale/rscale/link_marker)를 **제자리에서** 채운다.

  python tools/patch-cards-meta.py [cards.json] [cdb ...]

sync-data.py 는 스크립트 폴더까지 다시 만들기 때문에, 이미 받아둔 데이터를 건드리지 않고
카드 메타만 보강할 때 쓴다(멱등 — 여러 번 실행해도 안전).
"""

import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

args = sys.argv[1:]
dst = (
    args.pop(0)
    if args and args[0].endswith(".json")
    else os.path.join(ROOT, "public", "data", "cards.json")
)
cdbs = args or [
    os.path.join(ROOT, "basecdb", "cards.cdb"),
    os.path.join(ROOT, "basecdb", "cards-unofficial.cdb"),
]


def read_extra(path):
    con = sqlite3.connect("file:%s?mode=ro" % path.replace("\\", "/"), uri=True)
    cur = con.cursor()
    cols = {r[1] for r in cur.execute("PRAGMA table_info(datas)")}
    extra = [c for c in ("setcode", "lscale", "rscale", "link_marker") if c in cols]
    out = {}
    sel = "SELECT id" + "".join(", " + c for c in extra) + " FROM datas"
    for r in cur.execute(sel):
        ex = {c: int(r[1 + i] or 0) for i, c in enumerate(extra)}
        sc = ex.get("setcode", 0) & 0xFFFFFFFFFFFFFFFF
        sets = [(sc >> (16 * i)) & 0xFFFF for i in range(4)]
        while sets and sets[-1] == 0:
            sets.pop()
        out[int(r[0])] = (
            sets,
            ex.get("lscale", 0),
            ex.get("rscale", 0),
            ex.get("link_marker", 0),
        )
    con.close()
    return out


meta = {}
for p in cdbs:
    if not os.path.isfile(p):
        print("  건너뜀(없음):", p)
        continue
    m = read_extra(p)
    for k, v in m.items():
        meta.setdefault(k, v)

raw = json.load(open(dst, encoding="utf-8"))
rows = raw["cards"]
filled = 0
setcodes = 0
for row in rows:
    m = meta.get(row[0])
    extra = m if m else ([], 0, 0, 0)
    while len(row) < 12:
        row.append(0)
    row[12:] = [extra[0], extra[1], extra[2], extra[3]]
    if m:
        filled += 1
    if extra[0]:
        setcodes += 1

with open(dst, "w", encoding="utf-8") as f:
    json.dump(raw, f, ensure_ascii=False, separators=(",", ":"))

print(
    "카드 %d장 · 메타 %d장 · setcode 있음 %d장 · %.1f MB"
    % (len(rows), filled, setcodes, os.path.getsize(dst) / 1048576)
)
