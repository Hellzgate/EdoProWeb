#!/bin/sh
# 컨테이너 엔트리 — nginx(정적) + data api(127.0.0.1:8081) 를 함께 띄운다.
set -e
python3 /app/api.py &
echo "[entry] data api started (pid $!)"
exec nginx -g 'daemon off;'
