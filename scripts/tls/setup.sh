#!/usr/bin/env bash
# 미니PC TLS 종단(8451) 설정 — DSM 에서 내보낸 인증서를 쓰는 B안.
#   준비:  scp 로 cert.pem / privkey.pem 을 ~/edopro-tls/ 에 둔다
#   실행:  bash ~/edopro-tls/setup.sh
set -uo pipefail
DIR="$HOME/edopro-tls"

if [ ! -f "$DIR/cert.pem" ] || [ ! -f "$DIR/privkey.pem" ]; then
  echo "!! 인증서가 없습니다."
  echo "   DSM → 제어판 → 보안 → 인증서 → sw20103.synology.me → [내보내기] 후"
  echo "   cert.pem 과 privkey.pem 을 아래에 두세요:"
  echo "     $DIR/cert.pem"
  echo "     $DIR/privkey.pem"
  echo
  echo "   (지금은 자체서명 인증서로 임시 기동할 수 있습니다: bash setup.sh --selfsigned)"
  if [ "${1:-}" != "--selfsigned" ]; then exit 1; fi
  cp "$HOME/edopro-docker/cert/cert.pem" "$DIR/cert.pem"
  cp "$HOME/edopro-docker/cert/key.pem"  "$DIR/privkey.pem"
  echo "   → 미니PC 자체서명 인증서로 대체했습니다(브라우저 경고 1회)."
fi

docker rm -f edopro-tls >/dev/null 2>&1
docker run -d --name edopro-tls --restart unless-stopped --network host \
  -v "$DIR":/certs:ro \
  -v "$DIR/nginx.conf":/etc/nginx/nginx.conf:ro \
  nginx:alpine >/dev/null && echo "  edopro-tls 기동"

sleep 4
curl -s -k -o /dev/null -w "  https://127.0.0.1:8451/ -> %{http_code}\n" https://127.0.0.1:8451/
curl -s -k -o /dev/null -w "  .data -> %{http_code} %{size_download}B\n" --compressed https://127.0.0.1:8451/edopro-full.data
echo
echo "  접속: https://sw20103.synology.me:8451/   (공유기에서 8451 → 192.168.0.53 포워딩 필요)"
echo "  로그: docker logs --tail 20 edopro-tls"
