# -*- coding: utf-8 -*-
"""EDOPro 데이터 레포 동기화 → 클라이언트 자산.

원본 규칙(configs.json / user_configs.json)을 그대로 따른다:
  · repos[].url / repo_path / data_path / script_path / lflist_path
    / is_language / language / should_update / should_read
  · 캐시: D:\\rea-out\\_cache\\repos\\<repo_path 정규화>
  · 산출: public/data/{cards.json, script/<tag>/*.lua, lflists/*.conf,
                        puzzles/*.lua, servers.json, urls.json, data-meta.json}
  · `enabled:false` 는 건너뛴다(대용량 레포 기본 off).

  python tools/sync-data.py [--no-net]
"""

import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ARGS = sys.argv[1:]
NO_NET = "--no-net" in ARGS
CFG = os.path.join(ROOT, "repos.json")
OUT = os.path.join(ROOT, "public", "data")
CACHE = r"D:\rea-out\_cache\repos"

BASE_CDBS = [
    r"D:\edopro\expansions\cards.cdb",
    r"D:\edopro\expansions\cards-unofficial.cdb",
]
OVERLAYS = [
    r"D:\edopro\expansions\cards-en.cdb",
    r"D:\edopro\expansions\cards-unofficial-en.cdb",
    r"D:\edopro\repositories\languages\한국어-3\korean_temp.cdb",
]


def git(args, cwd=None):
    p = subprocess.run(
        ["git"] + args,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=dict(os.environ, GIT_TERMINAL_PROMPT="0"),
    )
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def slug(s):
    return re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", s).strip("_") or "repo"


def repo_dir(entry):
    tag = slug(entry.get("repo_path") or entry["url"].split("/")[-1])
    return tag, os.path.join(CACHE, tag)


def sync_repo(entry):
    tag, path = repo_dir(entry)
    url = entry["url"].rstrip("/")
    has = os.path.isdir(os.path.join(path, ".git"))
    if NO_NET:
        return tag, path, None
    need_fetch = entry.get("should_update", True) or not has
    if need_fetch:
        if has:
            git(["fetch", "--depth", "1", "origin"], cwd=path)
            git(["reset", "--hard", "FETCH_HEAD"], cwd=path)
        else:
            os.makedirs(CACHE, exist_ok=True)
            rc, out = git(["clone", "--depth", "1", url, path])
            if rc != 0:
                print("  !! clone 실패", url, out.strip()[:120])
                return tag, path, None
    rc, head = git(["rev-parse", "HEAD"], cwd=path) if os.path.isdir(path) else (1, "")
    return tag, path, (head.strip() if rc == 0 else None)


def read_cdb(path, texts_only=False):
    con = sqlite3.connect("file:%s?mode=ro" % path.replace("\\", "/"), uri=True)
    cur = con.cursor()
    datas, texts = {}, {}
    try:
        if not texts_only:
            for r in cur.execute(
                "SELECT id,type,atk,def,level,race,attribute FROM datas"
            ):
                datas[int(r[0])] = tuple(int(x or 0) for x in r[1:])
        for r in cur.execute("SELECT id,name,COALESCE(desc,'') FROM texts"):
            texts[int(r[0])] = (r[1] or "", r[2] or "")
    except sqlite3.Error:
        pass
    con.close()
    return datas, texts


def walk(root, sub=""):
    base = os.path.join(root, sub) if sub else root
    out = []
    if not os.path.isdir(base):
        return out
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d != ".git"]
        for f in fn:
            out.append(os.path.join(dp, f))
    return out


def main():
    cfg = (
        json.load(open(CFG, encoding="utf-8")) if os.path.isfile(CFG) else {"repos": []}
    )
    os.makedirs(OUT, exist_ok=True)
    for sub in ("script", "lflists", "puzzles"):
        d = os.path.join(OUT, sub)
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d)

    datas, texts, lang_texts = {}, {}, {}
    meta, counts = [], {"script": 0, "lflist": 0, "puzzle": 0, "cdb": 0, "skipped": 0}

    for entry in cfg.get("repos", []):
        if entry.get("enabled") is False or entry.get("should_read") is False:
            counts["skipped"] += 1
            continue
        tag, root, head = sync_repo(entry)
        if not os.path.isdir(root):
            meta.append(
                {
                    "url": entry["url"],
                    "repo_path": entry.get("repo_path"),
                    "error": "없음",
                }
            )
            continue

        # ---- cdb
        for p in walk(root, entry.get("data_path", "")):
            if not p.lower().endswith(".cdb"):
                continue
            d, t = read_cdb(p, texts_only=bool(entry.get("is_language")))
            for k, v in d.items():
                datas.setdefault(k, v)
            if entry.get("is_language"):
                for k, v in t.items():
                    lang_texts[k] = v  # 언어 패치는 최우선
            else:
                for k, v in t.items():
                    texts.setdefault(k, v)
            counts["cdb"] += 1

        # ---- script
        for p in walk(root, entry.get("script_path", "script")):
            if not p.lower().endswith(".lua"):
                continue
            dst = os.path.join(OUT, "script", tag)
            os.makedirs(dst, exist_ok=True)
            shutil.copy2(p, os.path.join(dst, os.path.basename(p)))
            counts["script"] += 1

        # ---- lflist (기본 '.', 즉 레포 루트의 *.conf)
        for p in walk(root, entry.get("lflist_path", "lflists")):
            if not p.lower().endswith(".conf"):
                continue
            shutil.copy2(
                p, os.path.join(OUT, "lflists", tag + "__" + os.path.basename(p))
            )
            counts["lflist"] += 1

        # ---- puzzles (퍼즐 레포는 루트의 *.lua)
        if "puzzle" in tag.lower() or "puzzles" in (entry.get("repo_path") or ""):
            for p in walk(root, ""):
                if p.lower().endswith(".lua"):
                    shutil.copy2(p, os.path.join(OUT, "puzzles", os.path.basename(p)))
                    counts["puzzle"] += 1

        meta.append(
            {
                "url": entry["url"],
                "repo_name": entry.get("repo_name"),
                "repo_path": entry.get("repo_path"),
                "head": head,
                "tag": tag,
            }
        )

    # 기준 cdb + 오버레이
    for p in BASE_CDBS:
        if os.path.isfile(p):
            d, _t = read_cdb(p)
            for k, v in d.items():
                datas.setdefault(k, v)
    for p in OVERLAYS:
        if os.path.isfile(p):
            _d, t = read_cdb(p, texts_only=True)
            for k, v in t.items():
                texts[k] = v

    # 언어 패치가 가장 우선
    for k, v in lang_texts.items():
        texts[k] = v

    cards = [
        [
            cid,
            (texts.get(cid, ("", ""))[0] or "#%d" % cid),
            *datas[cid],
            texts.get(cid, ("", ""))[1],
        ]
        for cid in datas
    ]
    cards.sort(key=lambda x: x[0])

    with open(os.path.join(OUT, "cards.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"built": time.strftime("%Y-%m-%d %H:%M:%S"), "cards": cards},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # 서버/이미지 URL (원본 configs.json 그대로)
    with open(os.path.join(OUT, "servers.json"), "w", encoding="utf-8") as f:
        json.dump(cfg.get("servers", []), f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "urls.json"), "w", encoding="utf-8") as f:
        json.dump(cfg.get("urls", []), f, ensure_ascii=False, indent=1)

    meta_obj = {
        "built": time.strftime("%Y-%m-%d %H:%M:%S"),
        "repos": meta,
        "counts": {
            "cards": len(cards),
            "unnamed": sum(1 for c in cards if c[1].startswith("#")),
            **counts,
        },
    }
    with open(os.path.join(OUT, "data-meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta_obj, f, ensure_ascii=False, indent=1)

    print(
        "카드 %d장 · 스크립트 %d · 금제 %d · 퍼즐 %d · 건너뜀 %d"
        % (
            len(cards),
            counts["script"],
            counts["lflist"],
            counts["puzzle"],
            counts["skipped"],
        )
    )
    for m in meta:
        print(
            "  %-52s %s"
            % (
                m.get("repo_path") or m["url"],
                (m.get("head") or m.get("error") or "")[:12],
            )
        )


if __name__ == "__main__":
    main()
