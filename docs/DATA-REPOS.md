# 데이터 레포 구조 — 원본 분석과 우리 적용 (2026-11-17)

> 대상: `D:\edopro\config\configs.json` · `user_configs.json` (사용자 제공)
> 결론: **카드 DB·스크립트·금제·퍼즐은 전부 이 레포들에서 온다.** 클라이언트는 "데이터를 갖고 있지 않고 받아온다"가 기본값이다.

---

## 1. 원본 동작 (소스 확인)

`gframe/repo_manager.cpp`:

```
repos[].url            →  ./repositories/<repo_path 또는 url 파일명>   (git clone/pull)
data_path   (기본 "")   →  그 폴더의 *.cdb 를 카드DB 로 읽는다
script_path (기본 "script") → *.lua 를 카드 스크립트로 읽는다
lflist_path (기본 "lflists") → *.conf 를 금제로 읽는다
pics_path               →  카드 이미지(있으면)
should_update           →  실행 시 git fetch 여부
should_read             →  로드 대상 포함 여부
is_language / language  →  언어 패치(이름/설명만 덮어씀)
```

즉 **경로만 설정하면 그 폴더가 곧 게임 데이터**가 된다. 클라이언트 코드는 어느 레포인지 모른다.

---

## 2. 두 파일의 실제 내용

### `configs.json` (배포 기본값)

| url | repo_path | 역할 | 주요 필드 |
|---|---|---|---|
| `ProjectIgnis/DeltaBagooska` | `./repositories/delta-bagooska` | **메인 카드DB + 스크립트** | `data_path:""`, `script_path:"script"`, `has_core`, `core_path:"bin"` |
| `ProjectIgnis/LFLists` | `./repositories/lflists` | 금제 목록 | `lflist_path:"."` ← **루트** |
| `ProjectIgnis/Puzzles` | `./puzzles/Canon collection` | 퍼즐 | 루트의 `*.lua` |

`urls`: `pic` · `field` · `cover` = `"default"` (기본 이미지 소스)
`servers`(6): Hellzmain(7914/7922) · EU 캐주얼(7912/7923) · EU 경쟁(7911/7922) · US 캐주얼(7911/7922) · US 경쟁(7912/7923) · 중국(44444 / HTTPS 443)
`posixPathExtension`: macOS/Linux 실행 경로 보정

### `user_configs.json` (사용자 추가분)

| url | repo_path | 역할 | 주요 필드 |
|---|---|---|---|
| `Team-AllYGOPro/edopro-korean` | `./repositories/languages/한국어` | 한국어 패치 | `is_language:true`, `language:"한국어"` |
| `Team-AllYGOPro/edopro-korean-delta` | `./repositories/languages/한국어-1` | 한국어(델타 대응) | 〃 |
| `CCC-Server/EMP-TY` | `./repositories/languages/한국어-2` | 커스텀 한국어 | 〃, **`should_update:false`** |
| `Hellzgate/EdoKroCDB` | `./repositories/languages/한국어-3` | 한국어(Hellz) | 〃 |
| `CCC-Server/EMP-TY` | `./expansions-2` | **커스텀 확장팩** | `data_path:""`, `pics_path:"pics"`, `script_path:"script"`, `should_update:false` |

`urls`: `field` → `raw.githubusercontent.com/CCC-Server/EMP-TY/main/pics/field/{}.png` (필드 이미지 오버라이드)
`servers`: 빈 배열(기본값 사용)

### 중요한 관찰 3가지

1. **같은 레포(EMP-TY)가 두 번** 쓰인다 — 하나는 언어 패치, 하나는 확장팩. **repo_path 가 다르므로 캐시도 분리**해야 한다.
2. **언어 패치는 cdb 의 `texts`만** 의미가 있다(카드 데이터 `datas` 는 메인 레포가 공급).
3. **`should_update:false`** 인 항목도 `should_read:true` 면 **캐시에 있으면 로드**해야 한다(처음엔 받아야 함).

---

## 3. 우리 구현 (client)

`client/repos.json` — 위 두 파일의 `repos/urls/servers` 를 **그대로** 옮기고 `enabled` 만 추가(전부 true).
`client/tools/sync-data.py`:

| 원본 필드 | 우리 처리 |
|---|---|
| `url` | `git clone --depth 1` (캐시 `D:\rea-out\_cache\repos\<repo_path>`) |
| `repo_path` | 캐시 태그 + 산출물 태그(중복 EMP-TY 분리) |
| `data_path` | 그 하위의 `*.cdb` 를 `datas`(카드) 로 |
| `is_language` | 그 cdb 는 **`texts`(이름/설명)만**, **최우선 순위** |
| `script_path` | `*.lua` → `public/data/script/<tag>/` (평탄화) |
| `lflist_path` | `*.conf` → `public/data/lflists/<tag>__<파일>` |
| `should_update` | false 면 fetch 생략(캐시 없으면 1회 클론) |
| `should_read` | false 면 로드 제외 |
| `urls` | `public/data/urls.json` (이미지 소스) |
| `servers` | `public/data/servers.json` (P3 온라인용) |

**우선순위(원본과 동일)**
```
카드 데이터(datas):  레포 cdb  →  로컬 expansions/cards.cdb (setdefault, 먼저 온 것이 이김)
이름/설명(texts):   영문 → 비공식 → 한국어 언어 패치(최종 우선)
```

---

## 4. 실측 (우리 환경)

| 항목 | 값 |
|---|---|
| 레포 수 | 8개(중복 EMP-TY 포함) · 전부 enabled |
| 카드 | 19,595장 (한국어 이름 19,386 / 이름없음 209) |
| 금제 | 8개 파일 |
| 퍼즐 | 459개 |
| 스크립트 | DeltaBagooska `script/` + EMP-TY `script/` 전량 |
| 산출 위치 | `client/public/data/{cards.json,script/,lflists/,puzzles/,servers.json,urls.json,data-meta.json}` |

---

## 5. 남은 격차 / 주의

| 항목 | 상태 | 비고 |
|---|---|---|
| 카드 **이미지** | 미구현 | `urls.json` 의 `pic`(default) + 서버 프록시 필요. 필드는 EMP-TY URL 사용 가능 |
| 필드 **이미지 스킨** | 미구현 | `field/{}.png` 템플릿 |
| 코어(`has_core`, `bin/`) | 미사용 | 웹은 ocgcore WASM 사용(P2) |
| `strings.conf` | 미적용 | 우리는 cdb texts 를 쓰므로 UI 문자열은 별도(i18n) |
| 자동 갱신 주기 | 수동 | `npm run sync` (원본은 실행 시/6시간) |
| 대용량 | 주의 | DeltaBagooska 전체는 수백 MB → **컨테이너 이미지에 넣지 말고 볼륨/서버 서빙** 권장 |
