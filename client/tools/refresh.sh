#!/usr/bin/env bash
# 데이터 레포 정기 갱신 (미니PC/NAS/컨테이너 용)
#
#   bash tools/refresh.sh [출력폴더]
#
# ⚠ 출력폴더가 **바인드 마운트 지점**이면 폴더 자체를 rename 할 수 없다(mv: Resource busy).
#    → 같은 볼륨 안의 하위 폴더($OUT/.tmp)에 만들고 **항목별로 교체**한다.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="${1:-$HOME/edopro-data}"
TMP="$OUT/.tmp"
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

# 항목별 교체 (마운트 루트는 건드리지 않는다)
for item in cards.json data-meta.json servers.json urls.json script lflists puzzles; do
  [ -e "$TMP/$item" ] || continue
  rm -rf "$OUT/$item.old"
  [ -e "$OUT/$item" ] && mv "$OUT/$item" "$OUT/$item.old"
  mv "$TMP/$item" "$OUT/$item"
  rm -rf "$OUT/$item.old"
done
rm -rf "$TMP"

COUNT=$("$PY" - "$OUT/data-meta.json" <<'PY'
import json,sys
try:
    m=json.load(open(sys.argv[1],encoding='utf-8'))
    c=m.get("counts",{})
    print("cards=%s ko=%s en=%s script=%s lflist=%s puzzle=%s" % (
        c.get("cards"), c.get("ko"), c.get("en"), c.get("script"), c.get("lflist"), c.get("puzzle")))
except Exception as e:
    print("meta error:", e)
PY
)
echo "[$(date '+%F %T')] 완료 $COUNT" | tee -a "$LOG"
