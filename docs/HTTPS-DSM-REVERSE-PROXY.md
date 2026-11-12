# EDOPro Web 에 HTTPS 인증서 붙이기 (DSM 역방향 프록시)

- 대상: 미니PC `http://192.168.0.53:7556/` (이미지 `edopro-web:1.16.2`)
- NAS: **DSM 7.4.1** `192.168.0.4` · 기존 인증서 `sw20103.synology.me` (Let's Encrypt, 멀티롤 패널 8443 에 사용 중)
- 게임은 `location.protocol === 'https:'` 이면 **자동으로 `wss://`** 를 사용한다(`patch_shell_post.py` 291줄) → HTTPS 로 열면 WS 도 자동 전환됨

---

## A안 — DSM 역방향 프록시 (5분, UI만)

### A-1. 프록시 생성

DSM → **제어판 → 로그인 포털 → 고급 → 역방향 프록시 → [생성]**

| 항목 | 값 |
|---|---|
| 설명 | `EDOPro Web` |
| 소스 프로토콜 | **HTTPS** |
| 소스 호스트 이름 | `sw20103.synology.me` |
| 소스 포트 | **8451** (비어 있음 — 8443 은 멀티롤용) |
| 대상 프로토콜 | **HTTP** |
| 대상 호스트 이름 | **192.168.0.53** |
| 대상 포트 | **7556** |

### A-2. 사용자 지정 헤더 (권장)

같은 창의 **사용자 지정 헤더** 탭 → [생성]:

| 헤더 이름 | 값 |
|---|---|
| `X-Forwarded-Proto` | `https` |
| `X-Forwarded-Port` | `8451` |

### A-3. 인증서 지정

**제어판 → 보안 → 인증서 → `sw20303.synology.me`(실제: `sw20103.synology.me`) 선택 → [설정] → 역방향 프록시 탭 → `EDOPro Web` 체크 → 확인**

> 기존 Let's Encrypt 인증서를 그대로 재사용한다(SAN 에 `sw20103.synology.me` 포함).

### A-4. 공유기 포트 포워딩

| 외부 | 내부 |
|---|---|
| TCP **8451** | `192.168.0.4:8451` |

### A-5. 접속

```
https://sw20103.synology.me:8451/
```

### A-6. 검증 명령 (PC에서)

```powershell
curl.exe -sI https://sw20103.synology.me:8451/                     # 200 + Strict-Transport-Security
curl.exe -s -o NUL -w "%{http_code} %{size_download}`n" --compressed https://sw20103.synology.me:8451/edopro-full.data
```
- 두 번째가 **200 + 약 49.8MB** 면 정적 서빙 정상.

### ⚠ A안의 한계 — WebSocket

DSM 이 생성하는 nginx 설정(`/usr/local/etc/nginx/sites-enabled/server.ReverseProxy.conf`)의 `location /` 에는
**`Upgrade`/`Connection` 헤더 전달이 없다**(확인함, DSM 7.4.1):

```nginx
location / {
    proxy_connect_timeout 60;
    proxy_read_timeout 60;
    proxy_send_timeout 60;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://127.0.0.1:8090;
}
```

→ 페이지·카드 이미지·덱 편집·리플레이·**단독 플레이는 정상**이지만,
   대전 시 쓰는 **`/ws`(TCP 브리지)가 101 로 승격되지 않아 실패**할 수 있다.
   (생성 설정은 DSM 이 다시 쓰기 때문에 파일을 직접 고쳐도 되돌아간다)

**판정 방법**: 프록시 생성 후 아래를 실행해 `101` 이 나오면 정상, `400/502/기타`면 B안 필요.

```powershell
python - <<'PY'
import ssl, socket, base64, os
host, port = "sw20103.synology.me", 8451
key = base64.b64encode(os.urandom(16)).decode()
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
s = ctx.wrap_socket(socket.create_connection((host, port), 10), server_hostname=host)
req = ("GET /ws?host=192.168.0.4&port=7911 HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
       "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n") % (host, port, key)
s.sendall(req.encode()); print(s.recv(200).decode("latin1").splitlines()[0])
PY
```

---

## B안 — 미니PC에서 TLS 종단 (WebSocket·타임아웃 완전 제어) ← 권장

DSM 은 **인증서만 제공**하고, 실제 TLS 종단은 미니PC(우리가 제어 가능)에서 한다.

### B-1. DSM 인증서 내보내기 (UI 1분)

**제어판 → 보안 → 인증서 → `sw20103.synology.me` 선택 → [내보내기]**
→ ZIP 안의 `cert.pem`(서버 인증서+체인), `privkey.pem`(개인키)을 PC로 저장

### B-2. 미니PC에 올리기

```powershell
scp cert.pem privkey.pem mini:/home/hellzsub/edopro-tls/
```

### B-3. nginx 컨테이너 (host 네트워크, 8451)

`/home/hellzsub/edopro-tls/nginx.conf`:

```nginx
events {}
http {
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }

  server {
    listen 8451 ssl;
    http2 on;
    server_name sw20103.synology.me;

    ssl_certificate     /certs/cert.pem;
    ssl_certificate_key /certs/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 0;
    proxy_buffering off;          # 49MB .data 스트리밍
    proxy_read_timeout 3600s;     # 긴 WebSocket
    proxy_send_timeout 3600s;

    location / {
      proxy_pass http://192.168.0.53:7556;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $http_host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
    }
  }
}
```

```bash
docker run -d --name edopro-tls --restart unless-stopped --network host \
  -v /home/hellzsub/edopro-tls:/certs:ro \
  -v /home/hellzsub/edopro-tls/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
```

### B-4. 공유기 포워딩

| 외부 | 내부 |
|---|---|
| TCP **8451** | `192.168.0.53:8451` |

### B-5. 인증서 갱신

Let's Encrypt 는 90일. DSM 이 자동 갱신하므로, 갱신 후 **B-1 내보내기를 다시** 하거나
DSM 작업 스케줄러에서 내보내기 파일을 미니PC로 복사하도록 만들면 자동화된다(추후).

---

## 공통 — 붙인 뒤 좋아지는 것

| 항목 | 효과 |
|---|---|
| PWA 설치 | **신뢰 인증서 HTTPS** 에서만 설치 배너/standalone 동작 → 홈 화면 아이콘으로 **전체화면·가로 고정** 실행 |
| 알림/클립보드 등 | 보안 컨텍스트 전용 API 사용 가능 |
| 주소창 | 전체화면 오버레이(1탭) 또는 PWA 실행으로 제거 |

## 체크리스트

- [ ] 8451 이 NAS/미니PC 어느 쪽에서 열릴지 결정 (A=NAS, B=미니PC)
- [ ] 공유기 8451 TCP 포워딩
- [ ] `https://sw20103.synology.me:8451/` 200
- [ ] `/edopro-full.data` 200 + 49.8MB
- [ ] `/ws` 핸드셰이크 101 (A안이면 실패 가능)
- [ ] 폰에서 HTTPS 접속 → 전체화면 오버레이 → 대전 1판


---

## 실행 기록 (2026-11-12, 에이전트가 실제로 한 것)

### 1) 미니PC 자체서명 인증서 재발행 — SAN 정리

기존: `CN=192.168.0.53` (SAN: IP 192.168.0.53, localhost)
변경: **`CN=sw20103.synology.me`** (SAN 4개) · 10년 · 백업 `cert.pem.bak-*`, `key.pem.bak-*`

```
subject=CN=sw20103.synology.me
X509v3 Subject Alternative Name:
    DNS:sw20103.synology.me, DNS:localhost, IP:192.168.0.53, IP:127.0.0.1
```

→ `https://192.168.0.53:8443/`, `https://sw20103.synology.me:8443/` 둘 다 이름이 맞는다(경고 1회 후 사용 가능).
이미지 `edopro-web:1.16.3` 으로 반영 · `http 200` · `https 200` 확인.

### 2) B안(미니PC nginx 8451) 실측 검증 — 파일은 `~/edopro-tls/` 에 준비됨

| 항목 | 결과 |
|---|---|
| `https://127.0.0.1:8451/` | **200** |
| `/edopro-full.data` (gzip) | **200 / 49,827,746B** |
| `/ws` WebSocket 업그레이드 | **101 Switching Protocols** |

**⚠ 실측 함정**: `http2 on;` 을 켜면 ALPN 이 `h2` 로 협상돼 **WS 업그레이드가 실패**했다
(HTTP/1.1 로 강제하면 101). → nginx 설정에서 **http2 를 끄고** HTTP/1.1 로 서비스한다.

검증 후 `edopro-tls` 컨테이너는 **제거**했다(8451 을 A안용으로 비워둠).
B안을 쓰려면: 인증서를 `~/edopro-tls/{cert.pem,privkey.pem}` 에 두고

```bash
bash ~/edopro-tls/setup.sh                  # DSM 내보내기 인증서 사용
bash ~/edopro-tls/setup.sh --selfsigned     # 자체서명으로 임시 기동
```

### 3) 남은 일 (사용자 2클릭)

- **A안**: DSM 에서 역방향 프록시 1개 생성 + 인증서 지정 (A-1~A-3)
- **B안**: 제어판 → 보안 → 인증서 → [내보내기] → ZIP 을 `C:\Users\Main PC\Downloads` 에 두면
  에이전트가 `~/edopro-tls/` 로 옮겨 `setup.sh` 까지 실행할 수 있다.

### 4) 현재 상태

| 항목 | 값 |
|---|---|
| 서비스 | `http://192.168.0.53:7556/` · `https://192.168.0.53:8443/` (자체서명, SAN 정리됨) |
| 이미지 | `edopro-web:1.16.3` |
| 8451 | **비어 있음** (A안 프록시 또는 B안 nginx 가 사용) |
| 준비물 | `~/edopro-tls/{nginx.conf,setup.sh}`, `D:\rea-out\edopro-web\scripts\tls\` |

---

## A안 최종 검증 (2026-11-12 20:52, **성공**)

| 항목 | 결과 |
|---|---|
| `https://sw20103.synology.me:8451/` | **200 / 53,482B · 인증서 신뢰됨(경고 없음)** |
| `/edopro-full.data` | **200 / 104,734,390B** (전송 49.8MB gzip, 클라이언트가 해제) · **2,055ms** |
| `/ws` WebSocket | **101 Switching Protocols** ✅ |
| `/manifest.json` (PWA) | 200 |

**WebSocket 확인**: `curl --http1.1` + Upgrade 헤더로 **101** 확인 →
**DSM 7.4.1 역방향 프록시는 WebSocket 을 정상 통과**시킨다(앞선 "Upgrade 헤더가 없다"는 우려는 이 항목에서는 문제되지 않음).

**함정(실측)**: .NET `ClientWebSocket` 으로 테스트하면 **HTTP/2(ALPN h2) 협상** 때문에 실패한다
(`Unable to connect to the remote server`). 브라우저 WebSocket 은 HTTP/1.1 로 붙으므로 정상이며,
검증 스크립트는 **`curl --http1.1`** 를 써야 한다.

### 접속 URL

```
https://sw20103.synology.me:8451/
```

- 폰: 같은 Wi-Fi 에서도 **헤어핀 NAT** 로 접속된다(외부 LTE 에서도 동일).
- 신뢰 인증서이므로 **PWA 설치**(홈 화면에 추가 → 전체화면·가로) 가능.
- 8451 은 DSM 프록시가 사용하고, 미니PC의 `edopro-tls`(nginx)는 **사용하지 않는다**(B안 보관).
