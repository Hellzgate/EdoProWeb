"""EDOPro 웹 배포용 서버 (정적 + WebSocket 브리지 + Git 저장소 동기화).

- 정적: edopro-full.*  (COOP/COEP)
- WS  : /ws?host=..&port=..   → TCP 중계
- Git : /api/repos, /api/repos/sync, /api/repos.tar
        클론한 저장소는 /app/repos/<owner>_<name> 에 두고,
        tar 로 묶어 게임 시작 시 MEMFS 의 repositories/ 에 풀린다.

환경변수
  PORT           8080
  ROOT           /app/web
  BRIDGE_TARGET  192.168.0.4:7911
  REPO_ROOT      /app/repos
  REPOS          기본으로 받아둘 저장소 (owner/name , 쉼표 구분)
"""

import asyncio
import base64
import hashlib
import io
import json
import os
import posixpath
import re
import subprocess
import tarfile
import urllib.parse

WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.environ.get("ROOT", "/app/web")
BRIDGE_TARGET = os.environ.get("BRIDGE_TARGET", "").strip()
REPO_ROOT = os.environ.get("REPO_ROOT", "/app/repos")
DEFAULT_REPOS = [r.strip() for r in os.environ.get("REPOS", "ProjectIgnis/BabelCDB").split(",") if r.strip()]
LOBBY_UPSTREAM = os.environ.get("LOBBY_UPSTREAM", "http://192.168.0.4:7922").rstrip("/")
# 1 이면 클라이언트가 요청한 host:port 로 접속한다(여러 서버 지원).
# BRIDGE_FORCE=1 이면 BRIDGE_TARGET 으로 고정(기존 동작).
BRIDGE_ALLOW_ANY = os.environ.get("BRIDGE_ALLOW_ANY", "1") == "1"
BRIDGE_FORCE = os.environ.get("BRIDGE_FORCE", "0") == "1"
LOBBY_ALLOW_ANY = os.environ.get("LOBBY_ALLOW_ANY", "1") == "1"

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "application/javascript",
    ".wasm": "application/wasm", ".data": "application/octet-stream",
    ".png": "image/png", ".ico": "image/x-icon", ".css": "text/css",
    ".json": "application/json", ".md": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8", ".tar": "application/x-tar",
}



PIC_CACHE = os.environ.get("PIC_CACHE", "/app/piccache")
PIC_UPSTREAM = [
    "https://images.ygoprodeck.com/images/cards/{}",
    "https://images.ygoprodeck.com/images/cards_small/{}",
    "https://images.ygoprodeck.com/images/cards_cropped/{}",
]


def _safe_pic(rel):
    keep = []
    for ch in rel:
        if ch.isalnum() or ch in "_.-":
            keep.append(ch)
    name = "".join(keep)
    return name if name.lower().endswith((".jpg", ".png", ".jpeg")) else None


def fetch_image(rel):
    name = _safe_pic(rel)
    if not name:
        return None
    os.makedirs(PIC_CACHE, exist_ok=True)
    cached = os.path.join(PIC_CACHE, name)
    if os.path.isfile(cached) and os.path.getsize(cached) > 500:
        with open(cached, "rb") as f:
            return f.read()
    import urllib.request
    for tpl in PIC_UPSTREAM:
        url = tpl.format(name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "edopro-web"})
            with urllib.request.urlopen(req, timeout=12) as r:
                data = r.read()
            if len(data) > 500:
                with open(cached, "wb") as f:
                    f.write(data)
                log(f"img {name} {len(data)}B")
                return data
        except Exception:
            continue
    return None


def _valid_host(host):
    """간단한 호스트 검증(SSRF/오타 방지): 영숫자 . - : 만 허용"""
    if not host or len(host) > 253:
        return False
    return re.match(r"^[A-Za-z0-9._:\-]+$", host) is not None


def log(*a):
    print("[web]", *a, flush=True)


def fetch_lobby_rooms(host=None, port=None, proto="http"):
    """멀티롤(또는 호환 서버)의 방 목록 JSON 을 그대로 가져온다.

    EDOPro 는 `<roomlistprotocol>://<roomaddress>:<roomlistport>/api/getrooms` 를 호출하고
    응답 `{"rooms":[...]}` 를 그대로 파싱한다.
    브라우저는 CORS 로 이것을 직접 못 부르므로 이 프록시가 대신 가져온다.
    """
    import urllib.request
    if host:
        url = f"{proto}://{host}:{port}/api/getrooms"
    else:
        url = LOBBY_UPSTREAM + "/api/getrooms"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "edopro-web"})
        with urllib.request.urlopen(req, timeout=12) as r:
            data = r.read()
        if data:
            log(f"lobby {url} -> {len(data)}B")
            return data
    except Exception as e:
        log("lobby fetch failed:", url, e)
    return None
def ws_frame(payload, opcode=0x2):
    n = len(payload)
    if n < 126:
        hdr = bytes([0x80 | opcode, n])
    elif n < 65536:
        hdr = bytes([0x80 | opcode, 126]) + n.to_bytes(2, "big")
    else:
        hdr = bytes([0x80 | opcode, 127]) + n.to_bytes(8, "big")
    return hdr + payload


async def read_ws_frame(reader):
    hdr = await reader.readexactly(2)
    opcode = hdr[0] & 0x0F
    masked = hdr[1] & 0x80
    ln = hdr[1] & 0x7F
    if ln == 126:
        ln = int.from_bytes(await reader.readexactly(2), "big")
    elif ln == 127:
        ln = int.from_bytes(await reader.readexactly(8), "big")
    mask = await reader.readexactly(4) if masked else b""
    payload = await reader.readexactly(ln) if ln else b""
    if masked and payload:
        payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
    return opcode, payload


async def ws_bridge(reader, writer, target_host, target_port):
    try:
        tcp_r, tcp_w = await asyncio.wait_for(asyncio.open_connection(target_host, target_port), timeout=6)
    except Exception as e:
        log(f"tcp connect fail {target_host}:{target_port} {e!r}")
        writer.write(ws_frame(b"", 0x8))
        await writer.drain()
        return
    log(f"bridge ws -> tcp {target_host}:{target_port}")
    dbg = os.environ.get("BRIDGE_DEBUG", "0") == "1"
    stats = {"tx": 0, "rx": 0}

    async def ws_to_tcp():
        while True:
            op, payload = await read_ws_frame(reader)
            if op == 0x8:
                if dbg:
                    log(f"  client closed ws (tx={stats['tx']} rx={stats['rx']})")
                tcp_w.close()
                return
            if op == 0x9:
                writer.write(ws_frame(payload, 0xA))
                await writer.drain()
                continue
            if payload:
                if dbg:
                    stats["tx"] += len(payload)
                    log(f"  c->s {len(payload)}B {payload[:48].hex()}")
                tcp_w.write(payload)
                await tcp_w.drain()

    async def tcp_to_ws():
        while True:
            data = await tcp_r.read(65536)
            if dbg and data:
                stats["rx"] += len(data)
                log(f"  s->c {len(data)}B {data[:48].hex()}")
            if not data:
                if dbg:
                    log(f"  tcp closed (tx={stats['tx']} rx={stats['rx']})")
                writer.write(ws_frame(b"", 0x8))
                await writer.drain()
                return
            writer.write(ws_frame(data, 0x2))
            await writer.drain()

    await asyncio.gather(ws_to_tcp(), tcp_to_ws(), return_exceptions=True)
    try:
        writer.close()
    except Exception:
        pass
    log("bridge closed")


# ---------------- Git 저장소 ----------------
def repo_dir_name(spec):
    s = spec.strip()
    if s.startswith("http") and s.endswith(".git"):
        s = s[:-4]
    s = s.rstrip("/").split("/")[-2:]
    return "_".join(s) or "repo"


def git(args, cwd=None, timeout=300):
    return subprocess.run(["git"] + args, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def sync_repo(spec):
    name = repo_dir_name(spec)
    path = os.path.join(REPO_ROOT, name)
    url = spec if spec.startswith("http") else f"https://github.com/{spec}.git"
    os.makedirs(REPO_ROOT, exist_ok=True)
    try:
        if os.path.isdir(os.path.join(path, ".git")):
            r1 = git(["fetch", "--depth", "1", "origin"], cwd=path)
            r2 = git(["reset", "--hard", "origin/HEAD"], cwd=path)
            ok = r1.returncode == 0 and r2.returncode == 0
            detail = (r2.stderr or r1.stderr or "").strip()[-300:]
        else:
            r = git(["clone", "--depth", "1", url, path])
            ok = r.returncode == 0
            detail = (r.stderr or "").strip()[-300:]
        head = ""
        if ok:
            h = git(["rev-parse", "--short", "HEAD"], cwd=path)
            head = h.stdout.strip()
        log(f"sync {spec} -> {name} ok={ok} {head} {detail[:120]}")
        return {"spec": spec, "name": name, "ok": ok, "head": head, "detail": detail}
    except Exception as e:
        log(f"sync {spec} error {e!r}")
        return {"spec": spec, "name": name, "ok": False, "head": "", "detail": repr(e)}


def list_repos():
    out = []
    if not os.path.isdir(REPO_ROOT):
        return out
    for name in sorted(os.listdir(REPO_ROOT)):
        p = os.path.join(REPO_ROOT, name)
        if not os.path.isdir(os.path.join(p, ".git")):
            continue
        head = git(["rev-parse", "--short", "HEAD"], cwd=p).stdout.strip()
        remote = git(["config", "--get", "remote.origin.url"], cwd=p).stdout.strip()
        files = 0
        for _root, _dirs, fs in os.walk(p):
            if ".git" in _root.split(os.sep):
                continue
            files += len(fs)
        out.append({"name": name, "head": head, "remote": remote, "files": files})
    return out


def make_tar():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tf:
        if os.path.isdir(REPO_ROOT):
            for name in sorted(os.listdir(REPO_ROOT)):
                p = os.path.join(REPO_ROOT, name)
                if not os.path.isdir(p):
                    continue
                for root, dirs, files in os.walk(p):
                    dirs[:] = [d for d in dirs if d != ".git"]
                    for f in files:
                        full = os.path.join(root, f)
                        rel = os.path.relpath(full, p)
                        arc = f"repositories/{name}/{rel}"
                        try:
                            tf.add(full, arcname=arc, recursive=False)
                        except Exception:
                            pass
    return buf.getvalue()


# ---------------- HTTP ----------------
async def read_head(reader):
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = await reader.read(4096)
        if not chunk:
            return None, None, None
        data += chunk
        if len(data) > 64 * 1024:
            return None, None, None
    head, _, rest = data.partition(b"\r\n\r\n")
    lines = head.decode("latin-1").split("\r\n")
    parts = lines[0].split(" ")
    if len(parts) < 2:
        return None, None, None
    headers = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return (parts[0], parts[1], headers), rest, lines[0]


def resp(code, reason, body=b"", ctype="text/plain; charset=utf-8", extra=""):
    hdr = (f"HTTP/1.1 {code} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
           "Cross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\n"
           f"{extra}\r\n")
    return hdr.encode() + body


async def handle(reader, writer):
    try:
        req, rest, line = await read_head(reader)
        if not req:
            writer.close()
            return
        method, target, headers = req
        parsed = urllib.parse.urlparse(target)
        path = urllib.parse.unquote(parsed.path)

        # ---- WS ----
        if path == "/ws":
            key = headers.get("sec-websocket-key")
            if not key:
                writer.write(resp(400, "Bad Request"))
                await writer.drain()
                writer.close()
                return
            qs = urllib.parse.parse_qs(parsed.query)
            host = qs.get("host", ["127.0.0.1"])[0]
            try:
                port = int(qs.get("port", ["7911"])[0])
            except ValueError:
                port = 7911
            if BRIDGE_FORCE and BRIDGE_TARGET:
                h, _, p = BRIDGE_TARGET.partition(":")
                host = h
                if p.isdigit():
                    port = int(p)
            elif BRIDGE_TARGET and (not BRIDGE_ALLOW_ANY or host in ("127.0.0.1", "localhost")):
                # 예전 기본값(127.0.0.1)으로 온 요청은 BRIDGE_TARGET 으로 보낸다(호환)
                h, _, p = BRIDGE_TARGET.partition(":")
                host = h
                if p.isdigit():
                    port = int(p)
            if not _valid_host(host) or not (1 <= port <= 65535):
                log(f"ws reject host={host!r} port={port}")
                writer.write(resp(400, "Bad Request"))
                await writer.drain()
                writer.close()
                return
            log(f"ws -> {host}:{port}")
            accept = base64.b64encode(hashlib.sha1(key.encode() + WS_GUID).digest()).decode()
            proto = headers.get("sec-websocket-protocol")
            extra = f"Sec-WebSocket-Protocol: {proto.split(',')[0].strip()}\r\n" if proto else ""
            writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          f"Sec-WebSocket-Accept: {accept}\r\n{extra}\r\n").encode())
            await writer.drain()
            await ws_bridge(reader, writer, host, port)
            return

        # ---- API ----
        if path == "/api/repos":
            body = json.dumps({"repos": list_repos(), "defaults": DEFAULT_REPOS}, ensure_ascii=False).encode()
            writer.write(resp(200, "OK", body, "application/json; charset=utf-8"))
            await writer.drain()
            writer.close()
            return

        if path == "/api/repos/sync":
            length = int(headers.get("content-length", "0") or 0)
            raw = rest or b""
            while len(raw) < length:
                chunk = await reader.read(length - len(raw))
                if not chunk:
                    break
                raw += chunk
            try:
                payload = json.loads(raw.decode() or "{}")
            except Exception:
                payload = {}
            specs = payload.get("repos") or DEFAULT_REPOS
            results = [sync_repo(s) for s in specs]
            body = json.dumps({"results": results, "repos": list_repos()}, ensure_ascii=False).encode()
            writer.write(resp(200, "OK", body, "application/json; charset=utf-8"))
            await writer.drain()
            writer.close()
            return

        if path == "/api/repos.tar":
            data = make_tar()
            log(f"repos.tar {len(data)/1048576:.1f}MB")
            writer.write(resp(200, "OK", data, "application/x-tar", "Cache-Control: no-store\r\n"))
            await writer.drain()
            writer.close()
            return

        if path.startswith("/img/"):
            data = await asyncio.get_event_loop().run_in_executor(None, fetch_image, path[5:])
            if data:
                ctype = "image/png" if path.lower().endswith(".png") else "image/jpeg"
                writer.write(resp(200, "OK", data, ctype, "Cache-Control: max-age=604800\r\n"))
            else:
                writer.write(resp(404, "Not Found", b""))
            await writer.drain()
            writer.close()
            return

        # ---- 서버 대전(온라인) 방 목록 프록시 : <LOBBY_UPSTREAM>/api/getrooms ----
        # 브라우저는 CORS 때문에 멀티롤 API 를 직접 못 부르므로 같은 오리진에서 중계한다.
        if path == "/api/getrooms":
            qs = urllib.parse.parse_qs(parsed.query)
            srv = (qs.get("srv") or [""])[0]
            proto = (qs.get("proto") or ["http"])[0].lower()
            try:
                rport = int((qs.get("port") or ["0"])[0])
            except ValueError:
                rport = 0
            if srv and LOBBY_ALLOW_ANY and _valid_host(srv) and 1 <= rport <= 65535 and proto in ("http", "https"):
                data = await asyncio.get_event_loop().run_in_executor(None, fetch_lobby_rooms, srv, rport, proto)
            else:
                data = await asyncio.get_event_loop().run_in_executor(None, fetch_lobby_rooms)
            if data is None:
                writer.write(resp(502, "Bad Gateway", b'{"rooms":[]}', "application/json; charset=utf-8"))
            else:
                writer.write(resp(200, "OK", data, "application/json; charset=utf-8", "Cache-Control: no-store\r\n"))
            await writer.drain()
            writer.close()
            return

        # ---- static ----
        if method not in ("GET", "HEAD"):
            writer.write(resp(405, "Method Not Allowed"))
            await writer.drain()
            writer.close()
            return

        if path == "/":
            path = "/edopro-full.html"
        safe = posixpath.normpath(path).lstrip("/")
        if safe.startswith(".."):
            safe = "edopro-full.html"
        full = os.path.join(ROOT, safe)
        if not os.path.isfile(full):
            writer.write(resp(404, "Not Found", b"404"))
            await writer.drain()
            writer.close()
            return

        ext = os.path.splitext(full)[1].lower()
        size = os.path.getsize(full)
        writer.write((f"HTTP/1.1 200 OK\r\nContent-Type: {MIME.get(ext, 'application/octet-stream')}\r\n"
                      f"Content-Length: {size}\r\nCross-Origin-Opener-Policy: same-origin\r\n"
                      "Cross-Origin-Embedder-Policy: require-corp\r\nCache-Control: no-cache\r\n\r\n").encode())
        if method == "GET":
            with open(full, "rb") as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    writer.write(chunk)
                    await writer.drain()
        await writer.drain()
        writer.close()
    except Exception as e:
        try:
            writer.close()
        except Exception:
            pass
        if not isinstance(e, (asyncio.IncompleteReadError, ConnectionResetError)):
            log(f"handler error {e!r}")


async def main():
    os.makedirs(REPO_ROOT, exist_ok=True)
    log(f"serving {ROOT} on :{PORT}  BRIDGE_TARGET={BRIDGE_TARGET or '(passthrough)'}  REPOS={DEFAULT_REPOS}")
    if DEFAULT_REPOS:
        asyncio.get_event_loop().run_in_executor(None, lambda: [sync_repo(s) for s in DEFAULT_REPOS])
    server = await asyncio.start_server(handle, "0.0.0.0", PORT, backlog=128)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
