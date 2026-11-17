"""데이터 갱신 API (stdlib only) — nginx 뒤에서 /api/ 로 프록시된다.

  GET  /api/data/status   → 상태 + data-meta.json 요약
  POST /api/data/refresh  → refresh.sh 실행(토큰 필요, 동시 1회, 쿨다운)

환경변수
  DATA_DIR       볼륨 경로 (기본 /data)
  REFRESH_SH     갱신 스크립트 (기본 /app/tools/refresh.sh)
  REFRESH_TOKEN  비우면 갱신 비활성(상태 조회만)
  REFRESH_COOLDOWN_SEC 기본 300
"""

import json
import os
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATA = os.environ.get("DATA_DIR", "/data")
SCRIPT = os.environ.get("REFRESH_SH", "/app/tools/refresh.sh")
TOKEN = os.environ.get("REFRESH_TOKEN", "")
COOLDOWN = int(os.environ.get("REFRESH_COOLDOWN_SEC", "30"))
PORT = int(os.environ.get("API_PORT", "8081"))

_lock = threading.Lock()
_state = {"state": "idle", "started": None, "finished": None, "code": None, "log": []}


def meta():
    try:
        with open(os.path.join(DATA, "data-meta.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def worker():
    _state.update(
        state="running", started=time.time(), finished=None, code=None, log=["start"]
    )
    try:
        p = subprocess.run(
            ["bash", SCRIPT, DATA], capture_output=True, text=True, timeout=3600
        )
        out = (p.stdout or "") + (p.stderr or "")
        _state["log"] = out.strip().splitlines()[-40:]
        _state["code"] = p.returncode
        _state["state"] = "done" if p.returncode == 0 else "failed"
    except Exception as e:  # noqa: BLE001
        _state["log"] = [str(e)]
        _state["code"] = -1
        _state["state"] = "failed"
    _state["finished"] = time.time()


class H(BaseHTTPRequestHandler):
    server_version = "edopro-data/1"

    def log_message(self, fmt, *args):  # 조용히
        pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/data/status"):
            now = time.time()
            running = _state["state"] == "running"
            cooldown = 0
            if _state["finished"] and now - _state["finished"] < COOLDOWN:
                cooldown = int(COOLDOWN - (now - _state["finished"]))
            self._json(
                200,
                {
                    "enabled": bool(TOKEN),
                    "state": _state["state"],
                    "started": _state["started"],
                    "finished": _state["finished"],
                    "code": _state["code"],
                    "cooldown": cooldown,
                    "running": running,
                    "log": _state["log"],
                    "meta": meta(),
                },
            )
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/api/data/refresh"):
            self._json(404, {"error": "not found"})
            return
        # 토큰은 **선택**. 비어 있으면 누구나 누를 수 있고, 대신 30초 쿨다운으로 보호한다.
        if TOKEN:
            given = (self.headers.get("X-Token") or "").strip()
            if given != TOKEN:
                self._json(401, {"error": "unauthorized"})
                return
        if _state["state"] == "running":
            self._json(409, {"error": "already running"})
            return
        if _state["finished"] and time.time() - _state["finished"] < COOLDOWN:
            self._json(
                429,
                {
                    "error": "cooldown",
                    "retryIn": int(COOLDOWN - (time.time() - _state["finished"])),
                },
            )
            return
        threading.Thread(target=worker, daemon=True).start()
        self._json(202, {"ok": True, "state": "running"})


if __name__ == "__main__":
    print(
        "[api] listening on", PORT, "data=", DATA, "enabled=", bool(TOKEN), flush=True
    )
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
