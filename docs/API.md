# 서버 API

`server.py` 는 **정적 서빙 + WebSocket 브리지 + Git 저장소 동기화**를 한 포트에서 처리합니다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 컨테이너 내부 포트(호스트는 `-p 7556:8080`) |
| `ROOT` | `/app/web` | 정적 파일 루트 |
| `BRIDGE_TARGET` | `` (비움) | `host:port` — 지정하면 게임이 요청한 대상 대신 이쪽으로 TCP 연결 |
| `REPO_ROOT` | `/app/repos` | git clone 저장 위치 |
| `REPOS` | `ProjectIgnis/BabelCDB` | 기동 시 자동으로 받을 저장소(쉼표 구분) |
| `PIC_CACHE` | `/app/piccache` | 카드 이미지 캐시(볼륨 권장) |
| `LOBBY_UPSTREAM` | `http://192.168.0.4:7922` | 서버 대전 방 목록을 가져올 서버(멀티롤 roomlist) |

## 엔드포인트

### `GET /`
게임 페이지(`edopro-full.html`)를 반환. `Cache-Control: no-cache`, COOP/COEP 헤더 포함.

### `GET /repos.html`
저장소 관리 UI(목록 + 받기/갱신).

### `GET /ws?host=<ip>&port=<port>`
**WebSocket 업그레이드**. 성공 시 TCP 로 중계.
- 클라이언트→서버 프레임: unmasked/masked 모두 처리
- 서버→클라이언트: binary 프레임
- `BRIDGE_TARGET` 이 있으면 `host/port` 를 그 값으로 덮어씀

### `GET /img/<code>.jpg` (및 `/img/field/<code>.png`)
카드 이미지 프록시. 업스트림 순서:
1. `https://images.ygoprodeck.com/images/cards/<name>`
2. `.../cards_small/<name>`
3. `.../cards_cropped/<name>`

`/app/piccache/<name>` 에 캐시(볼륨). 404 면 빈 응답.

### `GET /api/repos`
```json
{"repos":[{"name":"ProjectIgnis_BabelCDB","head":"53e9b3b","remote":"https://github.com/...","files":29}],
 "defaults":["ProjectIgnis/BabelCDB"]}
```

### `POST /api/repos/sync`
본문(선택): `{"repos":["owner/name", ...]}` — 없으면 `REPOS` 기본값.
`git clone --depth 1` 또는 `fetch + reset --hard origin/HEAD` 수행 후 목록 반환.

### `GET /api/repos.tar`
`/app/repos` 아래 저장소들을 `repositories/<name>/...` 경로로 묶은 tar.
(과거에는 게임 부팅 시 MEMFS 에 마운트했으나, 현재는 사용하지 않음 — KNOWN-ISSUES 참고)

### `GET /api/getrooms` (v1.3.0)
서버 대전(온라인) 방 목록. `LOBBY_UPSTREAM`(기본 `http://192.168.0.4:7922`)의 `/api/getrooms` 를 그대로 중계한다.
브라우저는 CORS 때문에 멀티롤 API 를 직접 부를 수 없어 **같은 오리진**으로 우회한다.
게임(`ServerLobby`)은 이 응답 `{"rooms":[...]}` 를 그대로 파싱한다.

### `GET|POST /api/userdata` (v1.5.0)
덱(`deck/`)·리플레이(`replay/`) 파일 보관.
- GET: `{"files": {"deck/foo.ydk": "<base64>", ...}}`
- POST: 같은 형식 본문 → `{"saved": N}`
- 저장 위치 `USERDATA_DIR`(기본 `/app/userdata`, 볼륨 권장), 경로·길이 검증(최대 32MB)

### `GET|POST|DELETE /api/userdata/file?path=<rel>` (v1.6.0)
보관 파일 단건 처리.
- GET: 파일 내용(다운로드, `Content-Disposition: attachment`)
- POST: 본문(raw) 그대로 저장 (최대 8MB)
- DELETE: 삭제

### `GET /files.html` (v1.6.0)
보관함 UI — 덱/리플레이/퍼즐/설정 목록, 다운로드 링크, 업로드, 삭제.

### `GET /api/repos/bundle` (v1.7.0)
저장소 파일을 게임 경로로 매핑한 번들: `{"files": {"expansions/<repo>__x.cdb": "<base64>", ...}, "count": N, "bytes": B}`
`ETag` 를 주며 `If-None-Match` 가 맞으면 `304`. 게임은 부팅 시 이 번들을 MEMFS 에 넣는다.

## 참고

- 정적 응답에는 `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Embedder-Policy: require-corp` 를 붙입니다(SharedArrayBuffer 대비).
- 포트 8080 은 컨테이너 내부 고정이며, 호스트 노출은 `-p 7556:8080` 로 합니다.
