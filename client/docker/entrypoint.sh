#!/bin/sh
# 컨테이너 엔트리 — nginx(정적) + data api(로컬 8081) 를 함께 띄운다.
set -e

if [ -n "$REFRESH_TOKEN" ]; then
  python3 /app/api.py &
  echo "[entry] data api started (pid $!)"
else
  echo "[entry] REFRESH_TOKEN 없음 → 갱신 API 비활성(상태 조회만 불가)"
fi

exec nginx -g 'daemon off;'
