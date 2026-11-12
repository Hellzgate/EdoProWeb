# 웹에서 "패 테스트"(단일모드) 돌리기 — 연구 노트

- 기준: **v1.23.3** (2026-11-13), emsdk **7.0.0**, emscripten wasm (pthread 없음)
- 현재 상태: 웹에서는 **버튼 숨김+핸들러 차단**으로 먹통만 방지(`HAND_TEST_WEB_UNSUPPORTED`)

---

## 1. 왜 안 되는가 (실측)

```
[fatal] uncaught: thread constructor failed: Not supported
```

`single_mode.cpp`:
```cpp
bool SingleMode::StartPlay(DuelOptions&& o) {
    single_mode_thread = epro::thread(SinglePlayThread, std::move(o));  // ← 여기서 throw
}
```
`SinglePlayThread` 는 듀얼 코어를 **별도 스레드에서 계속 돌리며** UI 입력을 기다린다.

| 위치 | 대기 |
|---|---|
| `single_mode.cpp:245` | 듀얼 메시지 루프(`do … while`) |
| `:351` | `MSG_RETRY` → `actionSignal.Wait(lock)` |
| `:406` | `MSG_SHOW_HINT` → `actionSignal.Wait(lock)` |
| `:415`, `:446` | 선택 프롬프트 → `singleSignal.Wait()` |

`Signal` 은 `condition_variable` 기반(`mysignal.h`) → **다른 스레드가 Set 해야** 풀린다.
즉 단일 스레드에서는 "코어 진행"과 "UI 렌더/입력"이 서로를 기다려 **교착**한다.

`-sEMULATE_FUNCTION_POINTER_CASTS=1` 시도 → `table index is out of bounds` (다른 실패) → 되돌림.
pthread 빌드는 **ASYNCIFY 와 동시 사용 불가**(emsdk 문서/실측) — 우리 게임 루프가 `emscripten_sleep` 에 의존한다.

---

## 2. 접근 후보

| 안 | 방법 | 난이도 | 위험 | 비고 |
|---|---|---|---|---|
| **A. pthreads** | 전 오브젝트 `-pthread` + `-sUSE_PTHREADS` + SharedArrayBuffer(COOP/COEP 이미 있음) | 높음 | 높음 | **ASYNCIFY 제거 필수** → 메인 루프를 `emscripten_set_main_loop` 로 전환해야 함 |
| **B. 메인루프 전환 + ASYNCIFY 코루틴** | `while(true){…sleep}` → `emscripten_set_main_loop(Frame)` 로 바꾸고, `Wait()` 를 `while(!sig) emscripten_sleep(0)` 로 | 중~높음 | 중간 | 프레임 본문(약 350줄)을 함수로 추출해야 함. 성공 시 **가장 자연스러운 구조** |
| **C. fiber 스레드 계층** | `epro::thread/mutex/condition_variable` 을 **emscripten_fiber** 기반 협조적 스케줄러로 구현 | 중간 | 중간 | 게임 코드 무변경. `Wait` 에서 메인 fiber 로 전환, 프레임 끝에서 복귀 |
| **D. 중첩 렌더 펌프** | `Wait()` 대신 `device->run()+렌더` 를 직접 돌리는 루프 | 낮음~중간 | 높음 | 프레임 본문이 `MainLoop` 안에 인라인이라 **재현 코드 중복**·재진입 위험 |
| **E. 현행 유지** | 버튼 숨김 | — | — | 이미 적용 |

---

## 3. 권장: **C안(fiber 협조 스케줄러)** — 게임 코드를 건드리지 않는다

### 구조
```
[메인 fiber A]  Game::MainLoop  ── 프레임 끝에서 ──▶  scheduler.yield_to_worker()
      ▲                                                    │
      └──────────── worker 가 Wait 하면 A 로 복귀 ◀────────┘
[worker fiber B] SinglePlayThread  (기존 코드 그대로)
```

### 구현 포인트
1. `epro::thread` → **fiber 생성 + 즉시 실행 예약**(`StartPlay` 는 바로 반환).
2. `epro::mutex`/`condition_variable` → **fiber-aware**: `wait()` 는 `scheduler.switch_to_main()`,
   `notify_all()` 은 대기 fiber 를 runnable 로.
3. 메인 루프의 **프레임 끝**(`emscripten_sleep` 직전)에 `scheduler.tick()`:
   - worker 가 runnable 이면 전환, 아니면 그대로.
4. `emscripten_sleep` 은 ASYNCIFY 로 그대로 사용(브라우저 양보).
5. `is_closing`/`join` 경로는 fiber 종료 플래그로 대체.

### 검증 계획
- 하네스: `StartPlay` → 3프레임 뒤 worker 가 `Wait` 에서 멈추고 A 가 계속 렌더되는지 카운터로 확인.
- 실기기: 패 테스트 진입 → 드로우/선택/공격 → 종료까지, FPS 60 유지.
- 회귀: 일반 대전(서버/봇)·리플레이·덱 편집 영향 없음(스케줄러는 worker 없으면 no-op).

### 예상 작업량
- 스케줄러/동기화 구현: 250~400줄
- 메인 루프 훅 2줄, `StartPlay`/`StopPlay` 분기
- 디버깅(교착/재진입) 포함 **반나절~1일**

---

## 4. 차선: **B안(메인루프 set_main_loop + ASYNCIFY)**

- `Game::MainLoop` 의 `while(true)` 본문을 `Game::Frame()` 으로 추출(지역 변수 → 멤버/구조체).
- `main()` 에서 `emscripten_set_main_loop_arg(FrameThunk, game, 0, 1)`.
- `emscripten_sleep(delta)` 제거(프레임 제한은 rAF 가 담당).
- `Wait()` → `while(!sig) emscripten_sleep(0)`.
- 장점: 구조가 표준적이고 이후 **pthreads(A안)** 로도 확장 가능.
- 단점: 프레임 본문 추출 리팩터가 크고, 렌더 타이밍/입력 처리가 바뀌어 **전체 회귀 테스트** 필요.

---

## 5. 결론

- **지금 당장**은 E안(차단)이 안전하다(먹통 방지).
- 다음 사이클에서 **C안**을 먼저 시도할 것: 게임 코드 변경이 없고, 실패해도 `epro_*` 계층만 되돌리면 된다.
- C안이 막히면(재진입/교착) **B안**으로 메인 루프를 표준화하고, 그 위에서 다시 시도한다.
- A안(pthreads)은 ASYNCIFY 제거가 선행돼야 하므로 **최후 수단**.

---

## 6. PoC 결과 — **fiber 스위칭은 웹에서 동작한다** (2026-11-13)

`emscripten_fiber` + `-sASYNCIFY` 로 **메인 fiber(프레임 루프) ↔ 워커 fiber** 를 번갈아 실행하는
최소 예제를 빌드해 실제 브라우저에서 확인했다(소스: `scripts/fibertest.c`).

```
[worker] start
[worker] step 0
[main] frame 1
[worker] step 1
[main] frame 2
[worker] step 2
[main] frame 3
[worker] step 3
[worker] step 4
[worker] done
```

- 워커는 `emscripten_fiber_swap(&worker, &main)` 으로 **대기**하고,
- 메인은 `emscripten_set_main_loop` 프레임마다 **렌더/입력을 계속**하며,
- 준비되면 다시 워커로 스왑해 이어서 실행한다.

→ **C안(fiber 협조 스케줄러)의 핵심 메커니즘이 검증됨.**

남은 배선:
1. `epro::thread` → fiber 시작/join 대체
2. `Signal`(singleSignal/actionSignal) → flag + `FiberYield()` (대기 시 메인으로 스왑)
3. `Game::MainLoop` 프레임 끝에 `SingleMode::PumpFiber()` 1줄
4. `StopPlay` 시 fiber 종료 경로 정리

주의: 스왑 지점은 **메인이 gMutex 를 잡지 않은 곳**(프레임 끝)이어야 한다.
