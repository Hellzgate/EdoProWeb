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
import email.utils
import hashlib
import io
import json
import os
import posixpath
import re
import subprocess
import tarfile
import time
import urllib.parse

def _email_date(ts):
    """Last-Modified 헤더용 RFC1123 문자열(실패해도 예외 없이)."""
    try:
        return email.utils.formatdate(int(ts), usegmt=True)
    except Exception:
        return "Thu, 01 Jan 1970 00:00:00 GMT"

WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

PORT = int(os.environ.get("PORT", "8080"))
ROOT = os.environ.get("ROOT", "/app/web")
BRIDGE_TARGET = os.environ.get("BRIDGE_TARGET", "").strip()
REPO_ROOT = os.environ.get("REPO_ROOT", "/app/repos")
DEFAULT_REPOS = [r.strip() for r in os.environ.get("REPOS", "ProjectIgnis/BabelCDB").split(",") if r.strip()]
GAME_CONFIG_DIR = os.environ.get("GAME_CONFIG_DIR", "/app/config")


def _load_game_config():
    """EDOPro 의 config/configs.json + user_configs.json 을 읽어
       (repos, url_templates) 를 돌려준다. (원본과 같은 '설정된 주소' 동작)"""
    repos, urls = [], []
    for name in ("configs.json", "user_configs.json"):
        path = os.path.join(GAME_CONFIG_DIR, name)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, encoding="utf-8") as f:
                j = json.load(f)
        except Exception as e:
            print(f"[web] config {name} parse fail: {e}", flush=True)
            continue
        for r in (j.get("repos") or []):
            if not isinstance(r, dict):
                continue
            if r.get("should_read") is False and r.get("should_update") is False:
                continue
            if r.get("is_language"):
                continue   # 언어팩은 .data 에 내장되어 있음(중복 다운로드 방지)
            m = re.search(r"github\.com/([^/]+)/([^/#?]+)", (r.get("url") or ""))
            if m:
                spec = f"{m.group(1)}/{m.group(2)}"
                spec = spec[:-4] if spec.endswith(".git") else spec
                if spec not in repos:
                    repos.append(spec)
        for u in (j.get("urls") or []):
            if isinstance(u, dict) and u.get("url") and "{}" in u["url"]:
                urls.append({"type": (u.get("type") or "pic").lower(), "url": u["url"]})
    return repos, urls


_cfg_repos, CFG_URLS = _load_game_config()
for _r in _cfg_repos:
    if _r not in DEFAULT_REPOS:
        DEFAULT_REPOS.append(_r)
if _cfg_repos:
    print(f"[web] config repos: {', '.join(_cfg_repos)}", flush=True)
LOBBY_UPSTREAM = os.environ.get("LOBBY_UPSTREAM", "http://192.168.0.4:7922").rstrip("/")
# 1 이면 클라이언트가 요청한 host:port 로 접속한다(여러 서버 지원).
# BRIDGE_FORCE=1 이면 BRIDGE_TARGET 으로 고정(기존 동작).
BRIDGE_ALLOW_ANY = os.environ.get("BRIDGE_ALLOW_ANY", "1") == "1"
BRIDGE_FORCE = os.environ.get("BRIDGE_FORCE", "0") == "1"
# WS 브리지 화이트리스트(비우면 제한 없음). 예: BRIDGE_ALLOW_HOSTS=192.168.0.4,127.0.0.1
#                                         BRIDGE_ALLOW_PORTS=7911-7914,7922
BRIDGE_ALLOW_HOSTS = [h.strip() for h in os.environ.get("BRIDGE_ALLOW_HOSTS", "").split(",") if h.strip()]
BRIDGE_ALLOW_PORTS = []
for _tok in os.environ.get("BRIDGE_ALLOW_PORTS", "").split(","):
    _tok = _tok.strip()
    if not _tok:
        continue
    if "-" in _tok:
        _a, _b = _tok.split("-", 1)
        if _a.isdigit() and _b.isdigit():
            BRIDGE_ALLOW_PORTS.extend(range(int(_a), int(_b) + 1))
    elif _tok.isdigit():
        BRIDGE_ALLOW_PORTS.append(int(_tok))
LOBBY_ALLOW_ANY = os.environ.get("LOBBY_ALLOW_ANY", "1") == "1"
# 봇 투입(멀티롤 웹 패널 API) — 없으면 봇 기능 비활성
BOT_PANEL_URL = os.environ.get("BOT_PANEL_URL", "").rstrip("/")
BOT_PANEL_TOKEN = os.environ.get("BOT_PANEL_TOKEN", "")
# 덱/리플레이 등 사용자 데이터 보관 폴더(볼륨 권장)
USERDATA_DIR = os.environ.get("USERDATA_DIR", "/app/userdata")
USERDATA_PREFIXES = ("deck/", "replay/", "puzzles/")
USERDATA_FILES = ("config/system.conf",)
USERDATA_MAX_BYTES = 32 * 1024 * 1024

MIME = {
    ".html": "text/html; charset=utf-8", ".js": "application/javascript",
    ".wasm": "application/wasm", ".data": "application/octet-stream",
    ".png": "image/png", ".ico": "image/x-icon", ".css": "text/css",
    ".json": "application/json", ".md": "text/plain; charset=utf-8",
    ".txt": "text/plain; charset=utf-8", ".tar": "application/x-tar",
}



PIC_CACHE = os.environ.get("PIC_CACHE", "/app/piccache")
KOREAN_CDB = os.environ.get("KOREAN_CDB", "/app/lang/korean/cards.cdb")
ENG_STRINGS = os.environ.get("ENG_STRINGS", "/app/lang/english/strings.conf")
MISS_TTL = int(os.environ.get("PIC_MISS_TTL", str(24 * 3600)))   # 이미지 404 캐시(초)
LOCAL_PICS = os.environ.get("LOCAL_PICS", "/app/localpics")   # 사용자 EDOPro pics 오버레이(ro)

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

    # ---- 로컬 오버레이: 사용자의 EDOPro pics(프리릴리즈/커스텀)를 먼저 사용 ----
    #   프리릴리즈 카드는 ygoprodeck 에 없어 원본 EDOPro 도 이미지가 없다.
    #   사용자가 가진 pics 를 그대로 서빙해 "원본과 동일한 화면"을 만든다.
    if LOCAL_PICS and os.path.isdir(LOCAL_PICS):
        local = os.path.join(LOCAL_PICS, name)
        if os.path.isfile(local) and os.path.getsize(local) > 500:
            try:
                with open(local, "rb") as f:
                    data = f.read()
                with open(cached, "wb") as f:
                    f.write(data)
                return data
            except Exception:
                pass

    # ---- 실패(404) 캐시: 없는 카드(커스텀/프리릴리즈)를 매번 원격에 묻지 않는다 ----
    #   예전에는 매 렌더마다 404 왕복이 발생해 카드 목록이 수천 장이면 게임이 멈출 정도로 느려졌다.
    miss_marker = os.path.join(PIC_CACHE, ".miss", name.replace("/", "_") + ".miss")
    if os.path.isfile(miss_marker):
        try:
            if time.time() - os.path.getmtime(miss_marker) < MISS_TTL:
                return None
        except OSError:
            pass

    import urllib.request
    # field/cover 는 게임 config 의 urls 템플릿을 우선 사용(원본과 동일)
    tpls = list(PIC_UPSTREAM)
    try:
        kind = "field" if name.startswith("field/") else ("cover" if name.startswith("cover/") else "pic")
        for u in CFG_URLS:
            if u.get("type") == kind:
                tpls.insert(0, u["url"])
        if kind != "pic":
            tpls = [t for t in tpls if "images/cards" not in t]
    except Exception:
        pass

    # 커스텀 카드(9자리 이상 ID)는 원격에 없을 가능성이 높다 → 1회만, 짧은 타임아웃
    _base = name.split("/")[-1]
    _id = _base.split(".")[0]
    is_custom = _id.isdigit() and len(_id) >= 9
    # 주의: 프리릴리즈/커스텀 카드(1014xxxx 등)도 ygoprodeck 에 **실제 이미지가 있다**(실측 200).
    #   "커스텀은 원격에 없다"고 가정해 즉시 404 를 반환하면 프릴 이미지가 전부 사라진다.
    #   → 원격 조회는 그대로 하고, **실패만** .miss 로 캐시한다.

    for tpl in tpls:
        url = tpl.format(name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "edopro-web"})
            with urllib.request.urlopen(req, timeout=(8 if is_custom else 12)) as r:
                data = r.read()
            if len(data) > 500:
                with open(cached, "wb") as f:
                    f.write(data)
                log(f"img {name} {len(data)}B")
                return data
        except Exception:
            continue

    # 실패 기록 → 다음 요청부터 즉시 404
    try:
        os.makedirs(os.path.dirname(miss_marker), exist_ok=True)
        with open(miss_marker, "wb") as f:
            f.write(b"1")
    except Exception:
        pass
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

# ---------------- 사용자 데이터(덱/리플레이) ----------------
def _ud_path(rel):
    """USERDATA_DIR 안의 안전한 상대 경로만 허용."""
    if not rel or rel.startswith("/") or ".." in rel.split("/"):
        return None
    if not (rel.startswith(USERDATA_PREFIXES) or rel in USERDATA_FILES):
        return None
    # 파일시스템 이름 길이 제한(255B) — 일부 프리로드 덱 이름이 깨져 길어진다
    if len(rel.encode("utf-8", "surrogatepass")) > 200:
        return None
    return os.path.join(USERDATA_DIR, rel.replace("/", os.sep))


def load_userdata():
    out = {}
    total = 0
    if not os.path.isdir(USERDATA_DIR):
        return out
    for root, _dirs, files in os.walk(USERDATA_DIR):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, USERDATA_DIR).replace(os.sep, "/")
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            if size > 4 * 1024 * 1024 or total + size > USERDATA_MAX_BYTES:
                continue
            try:
                with open(full, "rb") as f:
                    out[rel] = base64.b64encode(f.read()).decode()
                total += size
            except OSError:
                continue
    return out


def save_userdata(payload):
    files = (payload or {}).get("files") or {}
    saved = 0
    total = 0
    for rel, b64 in files.items():
        path = _ud_path(str(rel))
        if not path or not isinstance(b64, str):
            continue
        try:
            data = base64.b64decode(b64, validate=False)
        except Exception:
            continue
        if total + len(data) > USERDATA_MAX_BYTES:
            break
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, path)
            saved += 1
            total += len(data)
        except OSError as e:
            log(f"userdata skip {rel!r} (len={len(path)}) {e!r}")
    log(f"userdata saved {saved} files ({total}B)")
    return saved




def _ud_read_file(rel):
    path = _ud_path(rel)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


def _ud_write_file(rel, data):
    path = _ud_path(rel)
    if not path or not isinstance(data, (bytes, bytearray)):
        return False
    if len(data) > 8 * 1024 * 1024:
        return False
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
        return True
    except OSError as e:
        log("userdata file write fail", rel, e)
        return False


def _file_kind(rel):
    if rel.startswith("deck/"):
        return "덱"
    if rel.startswith("replay/"):
        return "리플레이"
    if rel.startswith("puzzles/"):
        return "퍼즐"
    if rel in USERDATA_FILES:
        return "설정"
    return "기타"


def render_files_page():
    files = sorted(load_userdata().keys())
    rows = []
    for rel in files:
        import html as _html
        name = _html.escape(rel.split("/")[-1])
        link = "/api/userdata/file?path=" + urllib.parse.quote(rel)
        rows.append(
            "<tr><td>" + _file_kind(rel) + "</td>"
            "<td><a href=\"" + link + "\" download>" + name + "</a></td>"
            "<td class=\"k\">" + _html.escape(rel) + "</td>"
            "<td><a class=\"del\" href=\"#\" data-path=\"" + _html.escape(rel) + "\">삭제</a></td></tr>")
    body = "".join(rows) or "<tr><td colspan=4 class=\"empty\">보관된 파일이 없습니다</td></tr>"
    return """<!doctype html><meta charset="utf-8"><title>덱 / 리플레이 보관함</title>
<style>
body{font:14px 'Malgun Gothic',sans-serif;background:#16181d;color:#e6e8ee;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 6px}p{color:#9aa1ad;margin:0 0 16px}
table{border-collapse:collapse;width:100%;max-width:1100px}
th,td{padding:7px 10px;border-bottom:1px solid #2b2f38;text-align:left}
th{background:#1e222a;color:#aeb6c2;font-weight:600;font-size:12px}
a{color:#7fb4ff;text-decoration:none}a:hover{text-decoration:underline}
.k{color:#7c8593;font-size:12px}.empty{color:#7c8593;text-align:center;padding:24px}
.del{color:#ff8b8b}
.box{margin:22px 0;max-width:1100px;background:#1b1f26;border:1px solid #2b2f38;border-radius:8px;padding:14px}
input[type=file]{color:#cfd5df}
button{background:#2b6cb0;color:#fff;border:0;border-radius:6px;padding:7px 14px;font:13px 'Malgun Gothic';cursor:pointer}
button:hover{background:#3479c2}
code{background:#11141a;padding:2px 6px;border-radius:4px;color:#9fd0ff}
</style>
<h1>덱 / 리플레이 / 퍼즐 보관함</h1>
<p>게임에서 만든 파일이 여기 저장됩니다. 링크를 누르면 내려받고, 아래에서 올릴 수도 있습니다.
게임 화면에 <b>끌어다 놓아도</b> 바로 추가됩니다.</p>
<table><thead><tr><th>종류</th><th>이름</th><th>경로</th><th></th></tr></thead><tbody>""" + body + """</tbody></table>
<div class="box">
  <b>파일 올리기</b> — <code>.ydk</code> → deck, <code>.yrpX</code> → replay, <code>.lua</code> → puzzles<br><br>
  <input type="file" id="f" multiple>
  <button id="up">올리기</button> <span id="st"></span>
</div>
<script>
function kind(n){ if(/[.]ydk$/i.test(n)) return 'deck/'; if(/[.](yrpx|yrp3d|yrp)$/i.test(n)) return 'replay/'; if(/[.]lua$/i.test(n)) return 'puzzles/'; return null; }
document.getElementById('up').onclick = async function(){
  var files = document.getElementById('f').files, st = document.getElementById('st');
  if(!files.length){ st.textContent = '파일을 선택하세요'; return; }
  var ok = 0;
  for (var i=0;i<files.length;i++){
    var f = files[i], dir = kind(f.name);
    if(!dir){ st.textContent = f.name + ' 은(는) 지원하지 않는 형식'; continue; }
    var r = await fetch('/api/userdata/file?path=' + encodeURIComponent(dir + f.name), { method:'POST', body: f });
    if(r.ok) ok++;
  }
  st.textContent = ok + '개 올렸습니다';
  setTimeout(function(){ location.reload(); }, 600);
};
document.querySelectorAll('a.del').forEach(function(a){
  a.onclick = async function(ev){
    ev.preventDefault();
    if(!confirm('삭제할까요?\n' + a.dataset.path)) return;
    await fetch('/api/userdata/file?path=' + encodeURIComponent(a.dataset.path), { method:'DELETE' });
    location.reload();
  };
});
</script>"""



# ---------------- 저장소(repository) → 게임 데이터 매핑 ----------------
_bundle_cache = {"key": None, "json": None, "etag": None}
# brotli 로 압축한 번들 본문(언어별 etag 키) — 50MB JSON 압축은 4초라 매 요청 재계산 금지
_bundle_enc_cache = {"key": None, "body": None}


def _repo_state_key():
    parts = []
    if os.path.isdir(REPO_ROOT):
        for name in sorted(os.listdir(REPO_ROOT)):
            full = os.path.join(REPO_ROOT, name)
            if not os.path.isdir(full):
                continue
            try:
                st = os.stat(full)
                parts.append(f"{name}:{int(st.st_mtime)}")
            except OSError:
                pass
    return "|".join(parts)


def build_repo_bundle(lang=""):
    """저장소 파일을 게임이 읽는 경로로 매핑해 {대상경로: base64} 로 만든다.

    - *.cdb                -> expansions/<repo>__<이름>.cdb
    - *.lua (script 등)    -> script/<repo>/<파일명>.lua   (한 단계 폴더만 스캔되므로 평탄화)
    - strings.conf         -> config/strings.conf (한국어 UI)
    - *.conf (그 외)        -> lflists/<repo>__<이름>.conf
    - 퍼즐 리포의 *.lua     -> puzzles/<이름>.lua
    - pics/ 의 jpg,png      -> pics/[field|cover/]<이름>
    """
    key = _repo_state_key() + "|lang=" + (lang or "")
    if _bundle_cache["key"] == key and _bundle_cache["json"] is not None:
        return _bundle_cache["json"], _bundle_cache["etag"]

    files = {}
    total = 0
    skipped_cdb = []
    if os.path.isdir(REPO_ROOT):
        for repo in sorted(os.listdir(REPO_ROOT)):
            repo_dir = os.path.join(REPO_ROOT, repo)
            if not os.path.isdir(repo_dir) or repo.startswith("."):
                continue
            safe_repo = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in repo)
            for root, dirs, names in os.walk(repo_dir):
                dirs[:] = [d for d in dirs if d != ".git"]
                for name in names:
                    low = name.lower()
                    full = os.path.join(root, name)
                    rel = os.path.relpath(full, repo_dir).replace(os.sep, "/")
                    if rel.startswith(".git/") or "/.git/" in rel:
                        continue
                    rel_l = rel.lower()
                    repo_l = repo.lower()
                    is_puzzle = ("puzzle" in repo_l) or rel_l.startswith("puzzles/") or "/puzzle" in rel_l
                    is_pic = ("pics/" in rel_l) or rel_l.startswith("pics") or ("pics" in repo_l)
                    if low.endswith(".cdb"):
                        # 언어 선택은 번들 요청의 ?lang= 으로 처리한다
                        # (한국어면 언어팩 cdb 를 z 순으로 마지막에 넣어 덮어쓴다)
                        dest = f"expansions/{safe_repo}__{name}"
                    elif low == "strings.conf":
                        # 기본 자산(.data)에 이미 한국어 UTF-8 strings.conf 를 넣어 두었으므로
                        # 저장소의 (부분/다른 인코딩) strings.conf 로 덮어쓰지 않는다.
                        continue
                    elif low.endswith(".conf"):
                        dest = f"lflists/{safe_repo}__{name}"
                    elif low.endswith(".lua") and is_puzzle:
                        # 퍼즐 리포(ProjectIgnis/Puzzles 등)는 puzzles/ 로
                        dest = f"puzzles/{name}"
                    elif low.endswith(".lua"):
                        dest = f"script/{safe_repo}/{name}"
                    elif low.endswith((".jpg", ".jpeg", ".png")) and is_pic:
                        if "pics/field/" in rel_l:
                            dest = f"pics/field/{name}"
                        elif "pics/cover/" in rel_l:
                            dest = f"pics/cover/{name}"
                        else:
                            dest = f"pics/{name}"
                    else:
                        continue
                    try:
                        if os.path.getsize(full) > 32 * 1024 * 1024:
                            continue
                        with open(full, "rb") as f:
                            data = f.read()
                    except OSError:
                        continue
                    files[dest] = base64.b64encode(data).decode()
                    total += len(data)

    # ---- 언어 선택: 한국어면 언어팩 cdb 를 마지막(z 순)에 넣어 카드 이름/효과를 덮어쓴다 ----
    _lang = (lang or "").strip()
    _korean = ("한" in _lang) or _lang.lower() in ("korean", "ko", "ko-kr")
    if _korean and os.path.isfile(KOREAN_CDB):
        try:
            with open(KOREAN_CDB, "rb") as _f:
                _kdata = _f.read()
            files["expansions/zzz-korean-cards.cdb"] = base64.b64encode(_kdata).decode()
            total += len(_kdata)
            log(f"bundle lang=korean (+{len(_kdata)/1048576:.1f}MB cdb)")
        except Exception as _e:
            log(f"bundle korean cdb fail: {_e}")
    elif (not _korean) and os.path.isfile(ENG_STRINGS):
        # 영어 선택 시 UI 문자열도 영어로 (기본 .data 는 한국어 strings.conf)
        try:
            with open(ENG_STRINGS, "rb") as _f:
                _sdata = _f.read()
            files["config/strings.conf"] = base64.b64encode(_sdata).decode()
            total += len(_sdata)
            log(f"bundle lang=english (strings {len(_sdata)}B)")
        except Exception as _e:
            log(f"bundle english strings fail: {_e}")

    body = json.dumps({"files": files, "count": len(files), "bytes": total}, ensure_ascii=False).encode()
    etag = '"' + hashlib.sha1(body).hexdigest() + '"'
    _bundle_cache.update(key=key, json=body, etag=etag)
    log(f"repo bundle {len(files)} files ({total/1048576:.1f}MB)"
        + (f"  [skip cdb {len(skipped_cdb)}: {', '.join(skipped_cdb[:4])}]" if skipped_cdb else ""))
    return body, etag


def repo_bundle_summary():
    body, etag = build_repo_bundle()
    try:
        j = json.loads(body)
    except Exception:
        j = {"count": 0, "bytes": 0}
    return {"etag": etag, "count": j.get("count", 0), "bytes": j.get("bytes", 0)}


async def auto_sync_repos():
    """REPOS_AUTO_HOURS 마다 저장소를 자동 갱신한다(유저 입장의 '자동 업데이트')."""
    try:
        hours = float(os.environ.get("REPOS_AUTO_HOURS", "6"))
    except ValueError:
        hours = 6.0
    if hours <= 0:
        log("repo auto-update disabled")
        return
    loop = asyncio.get_event_loop()
    while True:
        await asyncio.sleep(hours * 3600)
        try:
            log("repo auto-update start")
            for spec in DEFAULT_REPOS:
                await loop.run_in_executor(None, sync_repo, spec)
            _bundle_cache["key"] = None
            log("repo auto-update done")
        except Exception as e:
            log("repo auto-update failed:", e)



# ---------------- 봇 패널 프록시 ----------------
def _bot_request(method, path, payload=None):
    import urllib.request
    if not BOT_PANEL_URL:
        return None, "BOT_PANEL_URL 이 설정되지 않았습니다"
    url = BOT_PANEL_URL + path
    data = None
    headers = {"User-Agent": "edopro-web"}
    if BOT_PANEL_TOKEN:
        headers["X-MR-Token"] = BOT_PANEL_TOKEN
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.read(), None
    except Exception as e:
        return None, str(e)

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
    # Connection: close — keep-alive 로 남은 소켓을 브라우저가 재사용하려다 멈추는 사례가 있어(모바일)
    # 모든 응답을 단일 요청/단일 연결로 처리한다.
    hdr = (f"HTTP/1.1 {code} {reason}\r\nContent-Type: {ctype}\r\nContent-Length: {len(body)}\r\n"
           "Connection: close\r\n"
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
            if BRIDGE_ALLOW_HOSTS and host not in BRIDGE_ALLOW_HOSTS:
                log(f"ws deny host={host}")
                writer.write(resp(403, "Forbidden"))
                await writer.drain()
                writer.close()
                return
            if BRIDGE_ALLOW_PORTS and port not in BRIDGE_ALLOW_PORTS:
                log(f"ws deny port={port}")
                writer.write(resp(403, "Forbidden"))
                await writer.drain()
                writer.close()
                return
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
        if path == "/api/beacon":
            # 클라이언트가 자기 빌드/IME 상태를 알려준다(진단용)
            log("beacon " + (parsed.query or "?"))
            writer.write(resp(204, "No Content", b"", "text/plain", "Cache-Control: no-store\r\n"))
            await writer.drain()
            writer.close()
            return
        if path == "/api/repos":
            body = json.dumps({"repos": list_repos(), "defaults": DEFAULT_REPOS,
                               "bundle": repo_bundle_summary(),
                               "autoHours": os.environ.get("REPOS_AUTO_HOURS", "6")}, ensure_ascii=False).encode()
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


        # ---- 사용자 데이터(덱/리플레이) 보관 ----
        if path == "/api/userdata":
            if method == "POST":
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
                n = save_userdata(payload)
                body = json.dumps({"saved": n}, ensure_ascii=False).encode()
            else:
                body = json.dumps({"files": load_userdata()}, ensure_ascii=False).encode()
            writer.write(resp(200, "OK", body, "application/json; charset=utf-8", "Cache-Control: no-store\r\n"))
            await writer.drain()
            writer.close()
            return


        # ---- 덱/리플레이 보관함 페이지 ----
        if path in ("/files.html", "/decks.html"):
            body = render_files_page().encode()
            writer.write(resp(200, "OK", body, "text/html; charset=utf-8"))
            await writer.drain()
            writer.close()
            return

        # ---- 파일 단건 (다운로드 / 업로드 / 삭제) ----
        if path == "/api/userdata/file":
            qs = urllib.parse.parse_qs(parsed.query)
            rel = (qs.get("path") or [""])[0]
            if method == "POST":
                length = int(headers.get("content-length", "0") or 0)
                raw = rest or b""
                while len(raw) < length:
                    chunk = await reader.read(length - len(raw))
                    if not chunk:
                        break
                    raw += chunk
                ok = _ud_write_file(rel, raw)
                writer.write(resp(200 if ok else 400, "OK" if ok else "Bad Request",
                                  json.dumps({"ok": ok}).encode(), "application/json"))
            elif method == "DELETE":
                pth = _ud_path(rel)
                try:
                    if pth and os.path.isfile(pth):
                        os.remove(pth)
                    ok = True
                except OSError:
                    ok = False
                writer.write(resp(200 if ok else 400, "OK" if ok else "Bad Request",
                                  json.dumps({"ok": ok}).encode(), "application/json"))
            else:
                data = _ud_read_file(rel)
                if data is None:
                    writer.write(resp(404, "Not Found", b"404"))
                else:
                    name = rel.split("/")[-1]
                    writer.write(resp(200, "OK", data, "application/octet-stream",
                                      "Content-Disposition: attachment; filename*=UTF-8''" + urllib.parse.quote(name) + "\r\n"))
            await writer.drain()
            writer.close()
            return


        # ---- 저장소 번들(자동 업데이트 반영) ----
        if path == "/api/repos/bundle":
            _lang = (urllib.parse.parse_qs(parsed.query).get("lang") or [""])[0]
            body, etag = await asyncio.get_event_loop().run_in_executor(None, build_repo_bundle, _lang)
            inm = headers.get("if-none-match")
            if inm and inm.strip() == etag:
                writer.write(resp(304, "Not Modified", b"", "application/json", f"ETag: {etag}\r\nCache-Control: no-cache\r\n"))
                await writer.drain()
                writer.close()
                return
            # 부팅 시 50MB JSON → 압축해 보낸다(브라우저 XHR 이 자동 해제).
            #   brotli(q9) 실측 11.3MB(gzip) → 6.1MB. 언어별로 한 번만 계산해 캐시한다.
            _ae = (headers.get("accept-encoding") or "").lower()
            if "br" in _ae and len(body) > 65536:
                try:
                    import brotli as _br
                    _ck = ("br", etag)
                    if _bundle_enc_cache.get("key") != _ck:
                        _bundle_enc_cache["body"] = _br.compress(body, quality=9, lgwin=24)
                        _bundle_enc_cache["key"] = _ck
                    body = _bundle_enc_cache["body"]
                    writer.write(resp(200, "OK", body, "application/json; charset=utf-8",
                                      f"ETag: {etag}\r\nContent-Encoding: br\r\nVary: Accept-Encoding\r\nCache-Control: no-cache\r\n"))
                    await writer.drain()
                    writer.close()
                    return
                except Exception as _e:
                    log("bundle brotli fail: %s" % _e)
            if "gzip" in _ae and len(body) > 65536:
                try:
                    import gzip as _gzip
                    body = _gzip.compress(body, 6)
                    writer.write(resp(200, "OK", body, "application/json; charset=utf-8",
                                      f"ETag: {etag}\r\nContent-Encoding: gzip\r\nCache-Control: no-cache\r\n"))
                    await writer.drain()
                    writer.close()
                    return
                except Exception:
                    pass
            writer.write(resp(200, "OK", body, "application/json; charset=utf-8",
                              f"ETag: {etag}\r\nCache-Control: no-cache\r\n"))
            await writer.drain()
            writer.close()
            return


        # ---- 봇 투입 (멀티롤 패널 프록시) ----
        if path in ("/api/bot/rooms", "/api/bot/decks", "/api/bot/start", "/api/bot/stopall", "/api/bot/stop"):
            if path == "/api/bot/rooms":
                data, err = await asyncio.get_event_loop().run_in_executor(None, _bot_request, "GET", "/api/rooms")
            elif path == "/api/bot/decks":
                data, err = await asyncio.get_event_loop().run_in_executor(None, _bot_request, "GET", "/api/bots")
            else:
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
                sub = {"start": "/api/bot/start", "stop": "/api/bot/stop", "stopall": "/api/bot/stopall"}[path.split("/")[-1]]
                data, err = await asyncio.get_event_loop().run_in_executor(None, _bot_request, "POST", sub, payload)
            if err:
                body = json.dumps({"error": err}, ensure_ascii=False).encode()
                writer.write(resp(502, "Bad Gateway", body, "application/json; charset=utf-8"))
            else:
                writer.write(resp(200, "OK", data or b"{}", "application/json; charset=utf-8", "Cache-Control: no-store\r\n"))
            await writer.drain()
            writer.close()
            return

        if path == "/api/jlog":
            qs = urllib.parse.parse_qs(parsed.query)
            msg = (qs.get("m") or [""])[0]
            if msg:
                log("JS " + msg.replace("\n", " | ")[:400])
            writer.write(resp(204, "No Content", b"", "text/plain; charset=utf-8"))
            await writer.drain()
            writer.close()
            return

        # ---- static ----
        _ua = headers.get("user-agent", "-")[:40]
        if method not in ("GET", "HEAD"):
            writer.write(resp(405, "Method Not Allowed"))
            await writer.drain()
            writer.close()
            return

        if path == "/":
            path = "/edopro-full.html"
        if path == "/bot":
            path = "/bot.html"
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

        # ---- 사전 압축본 서빙 (brotli > gzip, 초기 전송량 1/3) ----
        # Range 요청(청크 로더)에는 원본을 그대로 보낸다(부분 압축은 불가).
        _ae = (headers.get("accept-encoding") or "").lower()
        _range = headers.get("range") or ""
        _enc = ""
        if not _range:
            # brotli 가 있으면 우선(같은 파일의 .br). wasm 13.4→8.9MB, data 52.6→45.0MB 실측
            if "br" in _ae and os.path.isfile(full + ".br"):
                _enc = "br"
            elif "gzip" in _ae and os.path.isfile(full + ".gz"):
                _enc = "gzip"
        if _enc:
            full = full + "." + ("br" if _enc == "br" else "gz")
            size = os.path.getsize(full)
        use_gz = _enc == "gzip"
        use_br = _enc == "br"

        # ---- Range 지원 (모바일 청크 로더가 조각으로 받아간다) ----
        start, end = 0, size - 1
        partial = False
        rng = headers.get("range", "") or ""
        if rng.startswith("bytes=") and size > 0:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    if m.group(2):
                        end = min(int(m.group(2)), size - 1)
                else:
                    start = max(0, size - int(m.group(2)))
                if start >= size:
                    writer.write(resp(416, "Range Not Satisfiable", b"416",
                                      "text/plain; charset=utf-8",
                                      "Content-Range: bytes */%d\r\n" % size))
                    await writer.drain()
                    writer.close()
                    return
                partial = True
        length = end - start + 1
        if partial or size > (1 << 20):
            log("static %s %d-%d/%d ua=%s" % (path, start, end, size, _ua))

        # ---- ETag / Last-Modified (no-cache 재검증용) ----
        #   검증자가 없으면 no-cache 가 매번 65MB 재다운로드가 된다.
        try:
            _mt = int(os.path.getmtime(full))
        except OSError:
            _mt = 0
        _etag = 'W/"%x-%x%s"' % (size, _mt, ("g" if use_gz else ("b" if use_br else "")))
        _inm = (headers.get("if-none-match") or "").strip()
        _ims = (headers.get("if-modified-since") or "").strip()
        if not partial and method in ("GET", "HEAD") and (
                (_inm and _inm == _etag) or
                (not _inm and _ims and _ims == _email_date(_mt))):
            writer.write(("HTTP/1.1 304 Not Modified\r\n"
                          + "ETag: " + _etag + "\r\n"
                          + "Last-Modified: " + _email_date(_mt) + "\r\n"
                          + "Cache-Control: no-cache\r\n"
                          + "Connection: close\r\n\r\n").encode())
            await writer.drain()
            writer.close()
            return

        hdr = ("HTTP/1.1 " + ("206 Partial Content" if partial else "200 OK") + "\r\n"
               + "Content-Type: " + MIME.get(ext, "application/octet-stream") + "\r\n"
               + "Content-Length: " + str(length) + "\r\n"
               + "Accept-Ranges: bytes\r\n"
               + "Connection: close\r\n"
               + ("Content-Encoding: " + _enc + "\r\n" if _enc else "")
               + "Vary: Accept-Encoding\r\n"
               + "ETag: " + _etag + "\r\n"
               + "Last-Modified: " + _email_date(_mt) + "\r\n"
               + "Cache-Control: no-cache\r\n")
        if partial:
            hdr += "Content-Range: bytes %d-%d/%d\r\n" % (start, end, size)
        writer.write((hdr + "\r\n").encode())

        if method == "GET":
            with open(full, "rb") as f:
                if start:
                    f.seek(start)
                remain = length
                while remain > 0:
                    chunk = f.read(min(1 << 20, remain))
                    if not chunk:
                        break
                    remain -= len(chunk)
                    writer.write(chunk)
                    await writer.drain()
                    if remain > 0:
                        await asyncio.sleep(0)
                if length > (1 << 20):
                    log("done %s sent=%d/%d" % (path, length - remain, length))
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
    asyncio.ensure_future(auto_sync_repos())
    server = await asyncio.start_server(handle, "0.0.0.0", PORT, backlog=128)

    # ---- HTTPS 리스너(선택) ----
    # Chrome(안드로이드)은 사설망 평문 HTTP 를 ERR_TOO_MANY_RETRIES 로 막는 경우가 있어,
    # 자체 서명 인증서로 HTTPS 를 함께 제공한다. (인증서는 이미지에 /app/cert 에 둔다)
    https_port = int(os.environ.get("HTTPS_PORT", "8443"))
    cert_dir = os.environ.get("CERT_DIR", "/app/cert")
    certfile = os.path.join(cert_dir, "cert.pem")
    keyfile = os.path.join(cert_dir, "key.pem")
    https_server = None
    if https_port and os.path.isfile(certfile) and os.path.isfile(keyfile):
        import ssl
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_ctx.load_cert_chain(certfile, keyfile)
        https_server = await asyncio.start_server(handle, "0.0.0.0", https_port, ssl=ssl_ctx, backlog=128)
        log(f"serving https on :{https_port} (self-signed)")

    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
