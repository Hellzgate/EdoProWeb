#!/bin/sh
# 표준 배포: 이미지 빌드 → 컨테이너 교체
#   사용: sh deploy.sh 1.21.1 [extra docker run 옵션...]
#   전제: ~/edopro-docker 에 Dockerfile/server.py/web/lang, ~/edopro-pics-local(프릴 이미지)
set -eu
VER="${1:-}"
[ -n "$VER" ] || { echo "usage: deploy.sh <version> [extra opts]"; exit 2; }
shift || true
EXTRA="$*"

cd "$HOME/edopro-docker"
echo "[deploy] build edopro-web:$VER"
docker build -q -t "edopro-web:$VER" . >/dev/null

echo "[deploy] restart container"
docker rm -f edopro-web >/dev/null 2>&1 || true
docker run -d --name edopro-web --restart unless-stopped \
  -p 7556:8080 -p 8443:8443 \
  -v edopro_pics:/app/piccache \
  -v edopro_userdata:/app/userdata \
  -v "$HOME/edopro-pics-local:/app/localpics:ro" \
  -e BRIDGE_ALLOW_ANY=1 \
  -e BRIDGE_ALLOW_HOSTS=192.168.0.4,127.0.0.1 \
  -e BRIDGE_ALLOW_PORTS=7911-7914,7922,7923 \
  -e REPOS=ProjectIgnis/BabelCDB,ProjectIgnis/LFLists,ProjectIgnis/DeltaBagooska,ProjectIgnis/Puzzles,CCC-Server/EMP-TY \
  -e REPOS_AUTO_HOURS=6 \
  -e BOT_PANEL_URL=http://192.168.0.4:8090 \
  -e BOT_PANEL_TOKEN=mr-fd6dbfa63746 \
  $EXTRA \
  "edopro-web:$VER" >/dev/null

sleep 8
docker ps --format '{{.Names}} {{.Image}}' | head -3
curl -s -o /dev/null -w "[deploy] page=%{http_code}\n" --max-time 10 http://127.0.0.1:7556/
