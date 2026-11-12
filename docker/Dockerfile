FROM python:3.12-alpine

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY server.py /app/server.py
COPY cert/ /app/cert/
COPY web/edopro-full.html /app/web/edopro-full.html
COPY web/edopro-full.js /app/web/edopro-full.js
COPY web/edopro-full.wasm /app/web/edopro-full.wasm
COPY web/edopro-full.data /app/web/edopro-full.data
COPY web/repos.html /app/web/repos.html
COPY web/bot.html /app/web/bot.html
COPY web/webgltest.html /app/web/webgltest.html
COPY web/probe.html /app/web/probe.html
COPY web/probe2.html /app/web/probe2.html
COPY web/view.html /app/web/view.html
COPY web/last.html /app/web/last.html
COPY web/manifest.json /app/web/manifest.json
COPY web/icon-192.png /app/web/icon-192.png
COPY web/icon-512.png /app/web/icon-512.png

ENV PORT=8080 \
    ROOT=/app/web \
    BRIDGE_TARGET=192.168.0.4:7911 \
    REPO_ROOT=/app/repos \
    REPOS=ProjectIgnis/BabelCDB

EXPOSE 8080 8443
CMD ["python3", "-u", "/app/server.py"]

# 초기 전송량 감축: 큰 정적 파일을 미리 압축해 둔다(서버가 Accept-Encoding: gzip 일 때 .gz 를 보낸다)
RUN cd /app/web && for f in edopro-full.js edopro-full.wasm edopro-full.data; do \
      gzip -6 -k -f "$f"; done && ls -l /app/web/*.gz
