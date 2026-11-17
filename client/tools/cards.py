# -*- coding: utf-8 -*-
"""cards.cdb + 한국어 오버레이 → 클라이언트용 카드 인덱스(JSON 1개).

  python tools/cards.py [출력폴더] [기본cdb ...] [--overlay cdb ...]

기본 cdb 에서 카드 데이터(datas)를, 오버레이 cdb 에서 이름/설명(texts)을 덮어쓴다.
출력: public/data/cards.json
"""

import json
import os
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[1:]

OUT = os.path.join(HERE, "..", "public", "data")
if ARGS and not ARGS[0].startswith("--"):
    OUT = ARGS.pop(0)

overlays = []
if "--overlay" in ARGS:
    i = ARGS.index("--overlay")
    overlays = ARGS[i + 1 :]
    ARGS = ARGS[:i]

base = ARGS or [
    r"D:\edopro\expansions\cards.cdb",
    r"D:\edopro\expansions\cards-unofficial.cdb",
]
if not overlays:
    en = r"D:\edopro\expansions\cards-en.cdb"
    kr = r"D:\edopro\repositories\languages\한국어-3\korean_temp.cdb"
    un = r"D:\edopro\expansions\cards-unofficial-en.cdb"
    overlays = [p for p in (en, un, kr) if os.path.isfile(p)]


def connect(path):
    return sqlite3.connect("file:%s?mode=ro" % path.replace("\\", "/"), uri=True)


datas = {}
for path in base:
    if not os.path.isfile(path):
        print("  건너뜀(없음):", path)
        continue
    con = connect(path)
    for r in con.execute(
        "SELECT id, type, atk, def, level, race, attribute, setcode, lscale, rscale, link_marker FROM datas"
    ):
        sc = int(r[7] or 0) & 0xFFFFFFFFFFFFFFFF
        sets = [(sc >> (16 * i)) & 0xFFFF for i in range(4)]
        while sets and sets[-1] == 0:
            sets.pop()
        datas[int(r[0])] = (
            int(r[1]),
            int(r[2]),
            int(r[3]),
            int(r[4]),
            int(r[5]),
            int(r[6]),
            sets,
            int(r[8] or 0),
            int(r[9] or 0),
            int(r[10] or 0),
        )
    con.close()

texts = {}
for path in overlays:
    if not os.path.isfile(path):
        print("  건너뜀(없음):", path)
        continue
    con = connect(path)
    for r in con.execute("SELECT id, name, COALESCE(desc,'') FROM texts"):
        texts[int(r[0])] = (r[1] or "", r[2] or "")
    con.close()

cards = []
missing_name = 0
for cid, d in datas.items():
    name, desc = texts.get(cid, ("", ""))
    if not name:
        missing_name += 1
    cards.append(
        [
            cid,
            name or ("#%d" % cid),
            *d[:6],
            desc,
            "",
            desc,
            1,
            list(d[6]),
            d[7],
            d[8],
            d[9],
        ]
    )
cards.sort(key=lambda x: x[0])

os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):
    if old.startswith("cards"):
        os.remove(os.path.join(OUT, old))

dst = os.path.join(OUT, "cards.json")
with open(dst, "w", encoding="utf-8") as f:
    json.dump(
        {"built": time.strftime("%Y-%m-%d %H:%M:%S"), "cards": cards},
        f,
        ensure_ascii=False,
        separators=(",", ":"),
    )

print(
    "카드 %d장 · %.1f KB · 이름없음 %d · %s"
    % (len(cards), os.path.getsize(dst) / 1024, missing_name, dst)
)
