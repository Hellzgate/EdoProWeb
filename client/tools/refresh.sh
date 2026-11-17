#!/usr/bin/env bash
# 데이터 레포 정기 갱신 (미니PC/NAS 용)
#
#   bash tools/refresh.sh [출력폴더]
#
# 하는 일
#   1) repos.json 의 레포들을 git fetch/reset (shallow)
#   2) cdb 병합 → cards.json, script/lflists/puzzles 복사, data-meta.json
#   3) **원자적 교체** (tmp 에 만들고 mv) — 갱신 중에도 클라이언트가 깨지지 않는다
#
# 컨테이너는 이 폴더를 읽기 전용으로 마운트한다:
#   docker run ... -v ~/edopro-data:/usr/share/nginx/html/data:ro
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="${1:-$HOME/edopro-data}"
TMP="${OUT}.tmp"
LOG="${OUT}.log"

PY=$(command -v python3 || command -v python)
if [ -z "$PY" ]; then echo "python3 가 필요합니다"; exit 1; fi

echo "[$(date '+%F %T')] refresh 시작 → $OUT" | tee -a "$LOG"

rm -rf "$TMP"
mkdir -p "$TMP"

# sync-data.py 는 D:\edopro 같은 로컬 경로가 없으면 **레포만으로** 만든다.
if ! "$PY" "$HERE/sync-data.py" --out "$TMP" >>"$LOG" 2>&1; then
  echo "[$(date '+%F %T')] 실패 — 기존 데이터 유지" | tee -a "$LOG"
  rm -rf "$TMP"
  exit 1
fi

# 교체: 이전 것을 .old 로 밀고 새 것을 올린다(짧은 순간만 비어 있음)
if [ -d "$OUT" ]; then mv "$OUT" "$OUT.old"; fi
mv "$TMP" "$OUT"
rm -rf "$OUT.old"

COUNT=$("$PY" - "$OUT/data-meta.json" <<'PY'
import json,sys
try:
    m=json.load(open(sys.argv[1],encoding='utf-8'))
    c=m.get("counts",{})
    print("cards=%s script=%s lflist=%s puzzle=%s" % (c.get("cards"),c.get("script"),c.get("lflist"),c.get("puzzle")))
except Exception as e:
    print("meta error:", e)
PY
)
echo "[$(date '+%F %T')] 완료 $COUNT" | tee -a "$LOG"
