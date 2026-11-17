# EDOPro Web 클라이언트 — 정적 + 데이터 갱신 API
# 데이터(cards.json·script/…)는 **이미지에 넣지 않고 볼륨**으로 마운트한다(/data).
FROM nginx:alpine

LABEL org.opencontainers.image.title="edopro-client" \
      org.opencontainers.image.description="EDOPro Web — new client (DESIGN-V2)" \
      org.opencontainers.image.version="0.7.0"

# 갱신 API + 스크립트 실행용 (git/python/bash)
RUN apk add --no-cache python3 bash git coreutils

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/
COPY server/api.py /app/api.py
COPY tools/sync-data.py tools/refresh.sh /app/tools/
COPY repos.json /app/repos.json
# 기본 카드DB(원본 EDOPro 배포물) — git 에는 넣지 않고 이미지에만 넣는다
COPY basecdb/ /app/basecdb/
ENV BASE_CDB_DIR=/app/basecdb
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /app/tools/refresh.sh && mkdir -p /data

EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
