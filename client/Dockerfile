# EDOPro Web 클라이언트 — 정적 서빙 이미지
# 빌드는 호스트에서 `npm run build` 로 끝낸 뒤 dist 만 담는다(이미지 최소화·빌드 재현성).
FROM nginx:alpine

LABEL org.opencontainers.image.title="edopro-client" \
      org.opencontainers.image.description="EDOPro Web — new client (DESIGN-V2 P0/P1)" \
      org.opencontainers.image.version="0.1.0"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

EXPOSE 80
