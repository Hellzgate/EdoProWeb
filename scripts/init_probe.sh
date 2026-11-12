#!/usr/bin/env bash
# Game::Initialize() 를 단계별로 조기 반환시켜 어느 구간에서 죽는지 이분탐색하는 빌드 도우미
#   사용: bash init_probe.sh <N>
#   N = 1..Nmax 단계까지만 실행하고 return (그 뒤는 건너뜀)
#   결과는 항상 edopro-web:init<N> 태그로 빌드되고 7559 포트에 올라간다.
set -uo pipefail

N="${1:?usage: init_probe.sh <N>}"
SRC="$HOME/edo-src/edopro/gframe/game.cpp"
BAK="$SRC.probe.bak"

if [ ! -f "$BAK" ]; then
  cp "$SRC" "$BAK"
fi
cp "$BAK" "$SRC"

python3 - "$SRC" "$N" <<'PY'
import io, sys, re

path = sys.argv[1]
limit = int(sys.argv[2])
s = io.open(path, encoding="utf-8").read()

# Initialize 함수 본문에서 WEBSTEP 위치를 단계로 삼아, limit 단계 이후 첫 WEBSTEP 앞에 return 삽입
start = s.index("void Game::Initialize() {")
end = s.index("\n}\n", start)
body = s[start:end]

marks = [m.start() for m in re.finditer(r'\n\t(WEBSTEP|std::puts)\(', body)]
if not marks:
    print("!! 마커 없음"); sys.exit(1)

if limit >= len(marks):
    print("단계 한계 초과 (마커 %d개)" % len(marks)); sys.exit(0)

cut = start + marks[limit]
s2 = s[:cut] + "\n\treturn;  /* [probe] step %d */" % limit + s[cut:]
io.open(path, "w", encoding="utf-8").write(s2)
print("return 삽입: step %d (전체 마커 %d)" % (limit, len(marks)))
PY

cd "$HOME/edo-src/ocgwasm"
bash rebuild-one.sh game.cpp 2>&1 | tail -1
bash link-default.sh 2>&1 | tail -1

cd "$HOME/edopro-docker"
docker build -q -t "edopro-web:init$N" . >/dev/null 2>&1 && echo "build OK init$N"
docker rm -f edopro-web2 >/dev/null 2>&1
docker run -d --name edopro-web2 --restart no -p 7559:8080 -p 8444:8443 \
  -v edopro_pics:/app/piccache -v edopro_userdata:/app/userdata \
  -e BRIDGE_ALLOW_ANY=1 -e REPOS=ProjectIgnis/BabelCDB,ProjectIgnis/LFLists \
  "edopro-web:init$N" >/dev/null
sleep 6
curl -s -o /dev/null -w "  7559 -> %{http_code}\n" http://127.0.0.1:7559/

# 원본 복원
cp "$BAK" "$SRC"
bash rebuild-one.sh game.cpp >/dev/null 2>&1
echo "game.cpp 원복 + 재컴파일(recompile-clean)"
