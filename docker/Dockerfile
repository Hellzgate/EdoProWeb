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
COPY config/ /app/config/
COPY lang/ /app/lang/
COPY sound-bgm/ /app/sound-bgm/
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

# 저장소 번들(50MB JSON)을 brotli 로 압축해 보내기 위한 모듈(11.3MB gzip → 6.1MB br)
RUN pip install --no-cache-dir brotli

# 초기 전송량 감축: 큰 정적 파일을 미리 압축해 둔다.
#   서버는 Accept-Encoding 에 따라 .br → .gz 순으로 고른다(부팅 81.3MB → 54.2MB).
#   .br 은 scripts/precompress.py 가 미리 만들어 두며(빌드 시간 절약), 없으면 .gz 만 쓴다.
COPY web/edopro-full.js.gz   /app/web/edopro-full.js.gz
COPY web/edopro-full.wasm.gz /app/web/edopro-full.wasm.gz
COPY web/edopro-full.data.gz /app/web/edopro-full.data.gz
COPY web/edopro-full.js.br   /app/web/edopro-full.js.br
COPY web/edopro-full.wasm.br /app/web/edopro-full.wasm.br
COPY web/edopro-full.data.br /app/web/edopro-full.data.br
RUN ls -l /app/web/*.gz /app/web/*.br
