#!/bin/sh
# EDOPro Web 헬스체크 — 서비스/번들/캐시/이미지 한 번에 확인
#   사용: sh health.sh [http://127.0.0.1:7556]
set -u
BASE="${1:-http://127.0.0.1:7556}"
ok=0; fail=0
chk() { # chk <이름> <기대> <실제>
  if [ "$2" = "$3" ]; then printf "  OK   %-28s %s\n" "$1" "$3"; ok=$((ok+1));
  else printf "  FAIL %-28s %s (기대 %s)\n" "$1" "$3" "$2"; fail=$((fail+1)); fi
}

echo "[health] $BASE"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/")
chk "page /" 200 "$code"

repos=$(curl -s --max-time 20 "$BASE/api/repos" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('repos',[])))" 2>/dev/null || echo 0)
chk "repos count" 5 "$repos"

# 번들(한국어/영어) 크기 — 한국어가 더 커야 한다(언어팩 cdb 포함)
ko=$(curl -s --max-time 240 "$BASE/api/repos/bundle?lang=Korean" | wc -c)
en=$(curl -s --max-time 240 "$BASE/api/repos/bundle?lang=English" | wc -c)
printf "  INFO bundle ko=%s en=%s bytes\n" "$ko" "$en"
if [ "$ko" -gt "$en" ]; then chk "korean cdb included" yes yes; else chk "korean cdb included" yes no; fi

# ETag 304
et=$(curl -sI --max-time 20 "$BASE/edopro-full.wasm" | grep -i '^etag' | tr -d '\r' | cut -d' ' -f2)
c2=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 -H "If-None-Match: $et" "$BASE/edopro-full.wasm")
chk "wasm 304" 304 "$c2"

# 이미지: 로컬 오버레이(프릴) + 원격
c3=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/img/101402001.jpg")
chk "img local(pre) 200" 200 "$c3"
c4=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/img/89631139.jpg")
chk "img remote 200" 200 "$c4"
c5=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/img/101999999.jpg")
chk "img custom 404" 404 "$c5"

# 진단 페이지/기능
for p in /last.html /view.html /repos.html /files.html /manifest.json; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE$p")
  chk "$p" 200 "$c"
done

echo "[health] OK=$ok FAIL=$fail"
[ "$fail" -eq 0 ]
