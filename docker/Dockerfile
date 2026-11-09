FROM python:3.12-alpine

RUN apk add --no-cache git

WORKDIR /app
COPY server.py /app/server.py
COPY web/edopro-full.html /app/web/edopro-full.html
COPY web/edopro-full.js /app/web/edopro-full.js
COPY web/edopro-full.wasm /app/web/edopro-full.wasm
COPY web/edopro-full.data /app/web/edopro-full.data

ENV PORT=8080 \
    ROOT=/app/web \
    BRIDGE_TARGET=192.168.0.4:7911 \
    REPO_ROOT=/app/repos \
    REPOS=ProjectIgnis/BabelCDB

EXPOSE 8080
CMD ["python3", "-u", "/app/server.py"]
