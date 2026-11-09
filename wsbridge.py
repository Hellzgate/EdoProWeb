"""WebSocket <-> TCP 브리지 (표준 라이브러리만 사용).

브라우저(wasm EDOPro)는 TCP 를 못 열기 때문에, WS 프레임을 TCP 바이트열로 변환한다.

  ws://127.0.0.1:9001/ws?host=192.168.0.4&port=7914

- 쿼리로 대상 host/port 를 받아 TCP 연결을 만들고 양방향으로 중계한다.
- WS 서버->클라 프레임은 unmasked, 클라->서버 프레임은 masked(RFC6455).
"""

import asyncio
import os
import base64
import hashlib
import sys
import urllib.parse

WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 9100

# 환경변수 BRIDGE_TARGET=host:port 가 있으면 요청 host/port 대신 그쪽으로 붙는다
# (게임 UI 에 IP 를 입력하지 않고 실제 서버로 붙일 때 사용)
OVERRIDE = os.environ.get("BRIDGE_TARGET", "").strip()


async def read_http_request(reader):
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
    method, target, _ = (lines[0].split(" ") + ["", "", ""])[:3]
    headers = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip().lower()] = v.strip()
    return (method, target, headers), rest, lines[0]


def ws_frame(payload, opcode=0x2):
    """서버->클라이언트 프레임 (unmasked)"""
    n = len(payload)
    if n < 126:
        hdr = bytes([0x80 | opcode, n])
    elif n < 65536:
        hdr = bytes([0x80 | opcode, 126]) + n.to_bytes(2, "big")
    else:
        hdr = bytes([0x80 | opcode, 127]) + n.to_bytes(8, "big")
    return hdr + payload


async def read_ws_frame(reader):
    """클라이언트->서버 프레임 (masked). (opcode, payload) 반환, 실패 시 None"""
    hdr = await reader.readexactly(2)
    b1, b2 = hdr[0], hdr[1]
    opcode = b1 & 0x0F
    masked = b2 & 0x80
    ln = b2 & 0x7F
    if ln == 126:
        ln = int.from_bytes(await reader.readexactly(2), "big")
    elif ln == 127:
        ln = int.from_bytes(await reader.readexactly(8), "big")
    mask = b""
    if masked:
        mask = await reader.readexactly(4)
    payload = await reader.readexactly(ln) if ln else b""
    if masked and payload:
        payload = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
    return opcode, payload


async def handle(reader, writer):
    try:
        req, rest, first = await read_http_request(reader)
        if not req:
            writer.close()
            return
        method, target, headers = req
        parsed = urllib.parse.urlparse(target)
        qs = urllib.parse.parse_qs(parsed.query)
        host = qs.get("host", [DEFAULT_HOST])[0]
        try:
            port = int(qs.get("port", [str(DEFAULT_PORT)])[0])
        except ValueError:
            port = DEFAULT_PORT
        if OVERRIDE:
            oh, _, op = OVERRIDE.partition(":")
            host = oh
            if op.isdigit():
                port = int(op)

        key = headers.get("sec-websocket-key")
        if not key:
            writer.write(b"HTTP/1.1 400 Bad Request\r\n\r\n")
            await writer.drain()
            writer.close()
            return
        accept = base64.b64encode(hashlib.sha1(key.encode() + WS_GUID).digest()).decode()
        proto = headers.get("sec-websocket-protocol")
        extra = b""
        if proto:
            extra = b"Sec-WebSocket-Protocol: " + proto.split(",")[0].strip().encode() + b"\r\n"
        writer.write(
            b"HTTP/1.1 101 Switching Protocols\r\n"
            b"Upgrade: websocket\r\n"
            b"Connection: Upgrade\r\n"
            b"Sec-WebSocket-Accept: " + accept.encode() + b"\r\n" + extra + b"\r\n"
        )
        await writer.drain()
        print(f"[bridge] ws open -> tcp {host}:{port}", flush=True)

        try:
            tcp_r, tcp_w = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=5)
        except Exception as e:
            print(f"[bridge] tcp connect fail {host}:{port} {e}", flush=True)
            writer.write(ws_frame(b"", 0x8))
            await writer.drain()
            writer.close()
            return

        if rest:
            tcp_w.write(rest)

        async def ws_to_tcp():
            while True:
                op, payload = await read_ws_frame(reader)
                if op == 0x8:  # close
                    tcp_w.close()
                    return
                if op == 0x9:  # ping
                    writer.write(ws_frame(payload, 0xA))
                    await writer.drain()
                    continue
                if op in (0x1, 0x2, 0x0):
                    if payload:
                        tcp_w.write(payload)
                        await tcp_w.drain()

        async def tcp_to_ws():
            while True:
                data = await tcp_r.read(65536)
                if not data:
                    writer.write(ws_frame(b"", 0x8))
                    await writer.drain()
                    return
                writer.write(ws_frame(data, 0x2))
                await writer.drain()

        await asyncio.gather(ws_to_tcp(), tcp_to_ws(), return_exceptions=True)
    except Exception as e:
        print(f"[bridge] error {e!r}", flush=True)
    finally:
        try:
            writer.close()
        except Exception:
            pass
        print("[bridge] closed", flush=True)


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9001
    server = await asyncio.start_server(handle, "0.0.0.0", port)
    print(f"[bridge] listening on ws://0.0.0.0:{port}/ws?host=..&port=..", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
