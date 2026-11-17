# -*- coding: utf-8 -*-
"""EDOPro 데이터 레포 동기화 → 클라이언트 자산 (한/영 병기).

원본 규칙(configs.json / user_configs.json) 그대로:
  repos[].url / repo_path / data_path / script_path / lflist_path
          / is_language / should_update / should_read

출력 cards.json 행:
  [id, name_ko|name_en, type, atk, def, level, race, attr, desc_ko|desc_en,
       name_en, desc_en, has_ko(0/1)]

  python tools/sync-data.py [--out DIR] [--no-net]
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
OUT = (
    ARGS[ARGS.index("--out") + 1]
    if "--out" in ARGS
    else ARGS[ARGS.index("--out=") + 1].split("=", 1)[1]
    if "--out=" in ARGS
    else os.path.join(ROOT, "public", "data")
)
CFG = os.path.join(ROOT, "repos.json")
CACHE = os.environ.get("REPO_CACHE") or (
    r"D:\rea-out\_cache\repos"
    if os.name == "nt"
    else os.path.expanduser("~/.cache/edopro-repos")
)

BASE_DIRS = [
    os.environ.get("BASE_CDB_DIR") or os.path.join(ROOT, "basecdb"),
    r"D:\edopro\expansions",
    r"D:\edopro\repositories\languages\한국어",
]


def base_files():
    """기본 카드DB(데이터) + 언어 오버레이(texts).
    분류: 경로에 한국어/korean → ko · 파일명 ...-en.cdb → en · cards*.cdb → 카드 데이터."""
    out = []
    for d in BASE_DIRS:
        if not d or not os.path.isdir(d):
            continue
        found = []
        for dp, dn, fn in os.walk(d):
            dn[:] = [x for x in dn if x != ".git"]
            for f in fn:
                if not f.lower().endswith(".cdb"):
                    continue
                p = os.path.join(dp, f)
                low = (dp + "/" + f).lower()
                if "한국어" in dp or "korean" in low:
                    found.append((p, "ko"))
                elif re.search(r"en\.cdb$", f.lower()):
                    found.append((p, "en"))
                elif f.lower().startswith("cards"):
                    found.append((p, "base"))
        if found:
            out = found
            break
    return out


KO_OVERLAYS = [r"D:\edopro\repositories\languages\한국어-3\korean_temp.cdb"]


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


def sync_repo(entry):
    tag = slug(entry.get("repo_path") or entry["url"].split("/")[-1])
    path = os.path.join(CACHE, tag)
    has = os.path.isdir(os.path.join(path, ".git"))
    if NO_NET:
        return tag, path, None
    if entry.get("should_update", True) or not has:
        if has:
            git(["fetch", "--depth", "1", "origin"], cwd=path)
            git(["reset", "--hard", "FETCH_HEAD"], cwd=path)
        else:
            os.makedirs(CACHE, exist_ok=True)
            rc, out = git(["clone", "--depth", "1", entry["url"].rstrip("/"), path])
            if rc != 0:
                print("  !! clone 실패", entry["url"], out.strip()[:120])
                return tag, path, None
    rc, head = git(["rev-parse", "HEAD"], cwd=path) if os.path.isdir(path) else (1, "")
    return tag, path, (head.strip() if rc == 0 else None)


def read_cdb(path, texts_only=False):
    con = sqlite3.connect("file:%s?mode=ro" % path.replace("\\", "/"), uri=True)
    cur = con.cursor()
    datas, texts = {}, {}
    try:
        if not texts_only:
            cols = {r[1] for r in cur.execute("PRAGMA table_info(datas)")}
            extra = [
                c for c in ("setcode", "lscale", "rscale", "link_marker") if c in cols
            ]
            sel = (
                "SELECT id,type,atk,def,level,race,attribute"
                + "".join(", " + c for c in extra)
                + " FROM datas"
            )
            for r in cur.execute(sel):
                base = tuple(int(x or 0) for x in r[1:7])
                ex = {c: int(r[7 + i] or 0) for i, c in enumerate(extra)}
                sc = ex.get("setcode", 0) & 0xFFFFFFFFFFFFFFFF
                sets = [(sc >> (16 * i)) & 0xFFFF for i in range(4)]
                while sets and sets[-1] == 0:
                    sets.pop()
                datas[int(r[0])] = (
                    base,
                    sets,
                    ex.get("lscale", 0),
                    ex.get("rscale", 0),
                    ex.get("link_marker", 0),
                )
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

    datas, ko, en = {}, {}, {}
    meta, counts = [], {"script": 0, "lflist": 0, "puzzle": 0, "cdb": 0, "skipped": 0}

    def add_texts(dst, src):
        for k, v in src.items():
            if v[0]:
                dst.setdefault(k, v)

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

        for p in walk(root, entry.get("data_path", "")):
            if not p.lower().endswith(".cdb"):
                continue
            d, t = read_cdb(p, texts_only=bool(entry.get("is_language")))
            for k, v in d.items():
                datas.setdefault(k, v)
            add_texts(ko if entry.get("is_language") else en, t)
            counts["cdb"] += 1

        for p in walk(root, entry.get("script_path", "script")):
            if p.lower().endswith(".lua"):
                dst = os.path.join(OUT, "script", tag)
                os.makedirs(dst, exist_ok=True)
                shutil.copy2(p, os.path.join(dst, os.path.basename(p)))
                counts["script"] += 1

        for p in walk(root, entry.get("lflist_path", "lflists")):
            if p.lower().endswith(".conf"):
                shutil.copy2(
                    p, os.path.join(OUT, "lflists", tag + "__" + os.path.basename(p))
                )
                counts["lflist"] += 1

        if "puzzle" in tag.lower():
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

    for p, kind in base_files():
        if kind == "base":
            for k, v in read_cdb(p)[0].items():
                datas.setdefault(k, v)
            for k, v in read_cdb(p, texts_only=True)[1].items():
                en.setdefault(k, v)
        elif kind == "en":
            for k, v in read_cdb(p, texts_only=True)[1].items():
                en.setdefault(k, v)
        else:
            for k, v in read_cdb(p, texts_only=True)[1].items():
                ko.setdefault(k, v)

    cards = []
    for cid, d in datas.items():
        nk, dk = ko.get(cid, ("", ""))
        ne, de = en.get(cid, ("", ""))
        name = nk or ne or ("#%d" % cid)
        desc = dk or de
        base6, sets, ls, rs, lm = d
        cards.append(
            [
                cid,
                name,
                *base6,
                desc,
                ne or name,
                de or desc,
                1 if nk else 0,
                sets,
                ls,
                rs,
                lm,
            ]
        )
    cards.sort(key=lambda x: x[0])

    with open(os.path.join(OUT, "cards.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"built": time.strftime("%Y-%m-%d %H:%M:%S"), "cards": cards},
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    # 스크립트 인덱스(파일명 → 저장소) — ocgcore scriptReader 가 이름으로 찾는다
    script_root = os.path.join(OUT, "script")
    index = {}
    if os.path.isdir(script_root):
        repos = [
            d
            for d in os.listdir(script_root)
            if os.path.isdir(os.path.join(script_root, d))
        ]
        repos.sort(key=lambda d: (d != "delta-bagooska", d))
        for repo in repos:
            for f in os.listdir(os.path.join(script_root, repo)):
                if f.endswith(".lua") and f not in index:
                    index[f] = repo
    with open(os.path.join(script_root, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(OUT, "servers.json"), "w", encoding="utf-8") as f:
        json.dump(cfg.get("servers", []), f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "urls.json"), "w", encoding="utf-8") as f:
        json.dump(cfg.get("urls", []), f, ensure_ascii=False, indent=1)

    ko_count = sum(1 for c in cards if c[11])
    with open(os.path.join(OUT, "data-meta.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "built": time.strftime("%Y-%m-%d %H:%M:%S"),
                "repos": meta,
                "counts": {
                    "cards": len(cards),
                    "ko": ko_count,
                    "en": len(cards) - ko_count,
                    "unnamed": sum(1 for c in cards if c[1].startswith("#")),
                    **counts,
                },
            },
            f,
            ensure_ascii=False,
            indent=1,
        )

    print(
        "카드 %d (한국어 %d / 영문 %d) · 스크립트 %d · 금제 %d · 퍼즐 %d"
        % (
            len(cards),
            ko_count,
            len(cards) - ko_count,
            counts["script"],
            counts["lflist"],
            counts["puzzle"],
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
