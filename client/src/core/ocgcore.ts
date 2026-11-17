/**
 * ocgcore(WASM) 바인딩 — DESIGN-V2 P2.
 *
 * 책임: C 심(webapi.cpp) 호출만. 상태/렌더/UI 는 전혀 모른다.
 *  - 메시지는 **배치**로 온다: `get_message` 는 다음 `process` 전까지 같은 버퍼를 돌려준다.
 *  - 배치 원소 = `[u32 size][type u8][payload (size-1)]`, 4바이트 정렬 보장 없음 → DataView 로 읽는다.
 */

/** OCG_CardData 로 채울 최소 정보 */
export interface CardInfo {
  type: number;
  level: number;
  attr: number;
  race: number;
  atk: number;
  def: number;
  alias?: number;
  /** IsSetCard 판정용 (최대 4개, 0 종료) */
  setcodes?: number[];
  lscale?: number;
  rscale?: number;
  linkMarker?: number;
}

export type CardSource = (code: number) => CardInfo | undefined;
export type ScriptSource = (name: string) => string | null | undefined;

export interface DuelPacket {
  type: number;
  /** type 바이트를 제외한 payload (state.ts applyPacket 의 data 와 동일 규약) */
  data: Uint8Array;
}

export const OCG_STATUS = { END: 0, AWAITING: 1, CONTINUE: 2 } as const;

export interface OcgDuelOptions {
  cards: CardSource;
  scripts: ScriptSource;
  seed?: [number, number];
  lp?: number;
  hand?: number;
  drawPerTurn?: number;
  onLog?: (message: string, type: number) => void;
  /** 기본 '/wasm/ocgcore.js' */
  moduleUrl?: string;
}

interface Module {
  _malloc(n: number): number;
  _free(p: number): void;
  _web_create_duel(
    s0: number, s1: number, lp: number, hand: number, draw: number, flags: bigint,
    cardReader: number, scriptReader: number, logHandler: number, readerDone: number, unsafe: number,
  ): number;
  _web_last_create_status(): number;
  _web_start_duel(d: number): void;
  _web_process(d: number): number;
  _web_get_message(d: number): number;
  _web_msg_length(): number;
  _web_set_response_int(d: number, v: number): void;
  _web_set_response_buf(d: number, p: number, len: number): void;
  _web_destroy_duel(d: number): void;
  _web_new_card(
    d: number, team: number, duelist: number, code: number,
    con: number, loc: number, seq: number, pos: number,
  ): void;
  _web_load_script(d: number, buf: number, len: number, name: number): number;
  _web_get_version(major: number, minor: number): void;
  addFunction(fn: (...args: number[]) => number | void, sig: string): number;
  removeFunction(idx: number): void;
  lengthBytesUTF8(s: string): number;
  stringToUTF8(s: string, p: number, max: number): void;
  UTF8ToString(p: number): string;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  HEAPU32: Uint32Array;
}

export class OcgDuel {
  private readonly M: Module;
  private readonly duel: number;
  private readonly fnIds: number[] = [];
  private readonly setcodeBuf: number;
  private readonly scripts: ScriptSource;
  private destroyed = false;

  private constructor(M: Module, duel: number, setcodeBuf: number, scripts: ScriptSource) {
    this.M = M;
    this.duel = duel;
    this.setcodeBuf = setcodeBuf;
    this.scripts = scripts;
  }

  static async create(opts: OcgDuelOptions): Promise<OcgDuel> {
    const url = opts.moduleUrl ?? '/wasm/ocgcore.js';
    // public/ 자산이라 번들러가 해석하지 않게 한다
    const mod = (await import(/* @vite-ignore */ url)) as { default: () => Promise<Module> };
    const M = await mod.default();
    const ids: number[] = [];

    const cards = opts.cards;
    const setcodeBuf = M._malloc(16); // setcodes 저장용 (duel 수명 동안 유지)
    const cardReader = M.addFunction((payload: number, code: number, ptr: number) => {
      const c = cards(code);
      // OCG_CardData(wasm32): code0 alias4 setcodes8 type12 level16 attr20 race24(u64) atk32 def36 ls40 rs44 link48
      M.HEAPU32[ptr >> 2] = code;
      M.HEAPU32[(ptr + 4) >> 2] = c?.alias ?? 0;
      M.HEAPU32[(ptr + 8) >> 2] = setcodeBuf;
      M.HEAPU32[(ptr + 12) >> 2] = c?.type ?? 0;
      M.HEAPU32[(ptr + 16) >> 2] = c?.level ?? 0;
      M.HEAPU32[(ptr + 20) >> 2] = c?.attr ?? 0;
      M.HEAPU32[(ptr + 24) >> 2] = (c?.race ?? 0) >>> 0;
      M.HEAPU32[(ptr + 28) >> 2] = 0;
      M.HEAP32[(ptr + 32) >> 2] = c?.atk ?? 0;
      M.HEAP32[(ptr + 36) >> 2] = c?.def ?? 0;
      M.HEAPU32[(ptr + 40) >> 2] = c?.lscale ?? 0;
      M.HEAPU32[(ptr + 44) >> 2] = c?.rscale ?? 0;
      M.HEAPU32[(ptr + 48) >> 2] = c?.linkMarker ?? 0;
      // setcodes (u16, 최대 4개)
      const sets = c?.setcodes ?? [];
      for (let i = 0; i < 4; i++) {
        const v = sets[i] ?? 0;
        M.HEAPU32[(setcodeBuf + i * 2) >> 2] = v & 0xffff;
      }
    }, 'viip');
    ids.push(cardReader);

    const scripts = opts.scripts;
    const scriptReader = M.addFunction((payload: number, duelPtr: number, namePtr: number) => {
      const name = M.UTF8ToString(namePtr);
      const src = scripts(name);
      if (!src) return 0;
      const len = M.lengthBytesUTF8(src);
      const buf = M._malloc(len + 1);
      M.stringToUTF8(src, buf, len + 1);
      M._web_load_script(duelPtr, buf, len, namePtr);
      M._free(buf);
      return 1;
    }, 'iiip');
    ids.push(scriptReader);

    const onLog = opts.onLog;
    const logHandler = M.addFunction((payload: number, strPtr: number, type: number) => {
      onLog?.(M.UTF8ToString(strPtr), type);
    }, 'viip');
    ids.push(logHandler);

    const readerDone = M.addFunction(() => {}, 'vip');
    ids.push(readerDone);

    const seed = opts.seed ?? [Date.now() & 0xffffffff, (Math.random() * 0xffffffff) | 0];
    const ptr = M._web_create_duel(
      seed[0] >>> 0, seed[1] >>> 0,
      opts.lp ?? 8000, opts.hand ?? 5, opts.drawPerTurn ?? 1, 0n,
      cardReader, scriptReader, logHandler, readerDone, 0,
    );

    const inst = new OcgDuel(M, ptr, setcodeBuf, scripts);
    inst.fnIds.push(...ids);
    if (!ptr) {
      const st = M._web_last_create_status();
      inst.destroy();
      throw new Error(`OCG_CreateDuel 실패 (status ${st})`);
    }
    return inst;
  }

  get createStatus(): number {
    return this.M._web_last_create_status();
  }

  /** 덱 배치 (start 전에 카드마다 1회) */
  addCard(team: number, duelist: number, code: number, con: number, loc: number, seq: number, pos: number): void {
    this.M._web_new_card(this.duel, team, duelist, code, con, loc, seq, pos);
  }

  /** 시스템 스크립트 선행 로드 (constant/utility/proc_* 등) */
  preloadScript(name: string): boolean {
    const src = this.scripts(name);
    if (!src) return false;
    return this.loadScriptNow(name, src);
  }

  private loadScriptNow(name: string, src: string): boolean {
    const M = this.M;
    const len = M.lengthBytesUTF8(src);
    const buf = M._malloc(len + 1);
    const namePtr = M._malloc(M.lengthBytesUTF8(name) + 1);
    M.stringToUTF8(src, buf, len + 1);
    M.stringToUTF8(name, namePtr, M.lengthBytesUTF8(name) + 1);
    M._web_load_script(this.duel, buf, len, namePtr);
    M._free(namePtr);
    M._free(buf);
    return true;
  }

  start(): void {
    this.M._web_start_duel(this.duel);
  }

  /** process 1회 + 배치 파싱 */
  step(): { status: number; packets: DuelPacket[] } {
    const M = this.M;
    const status = M._web_process(this.duel);
    const ptr = M._web_get_message(this.duel);
    const len = M._web_msg_length();
    const packets: DuelPacket[] = [];
    if (!ptr || !len) return { status, packets };
    // HEAPU8 은 메모리 성장 시 교체되므로 이 시점 버퍼로 읽는다
    const view = new DataView(M.HEAPU8.buffer, ptr, len);
    let off = 0;
    while (off + 5 <= len) {
      const size = view.getUint32(off, true);
      if (!size || off + 4 + size > len) break;
      const type = view.getUint8(off + 4);
      packets.push({ type, data: M.HEAPU8.slice(ptr + off + 5, ptr + off + 4 + size) });
      off += 4 + size;
    }
    return { status, packets };
  }

  /** 응답 (`u32 1개` / `u8 1개` / 임의 바이트열) */
  respond(bytes: Uint8Array): void {
    const ptr = this.M._malloc(bytes.length);
    this.M.HEAPU8.set(bytes, ptr);
    this.M._web_set_response_buf(this.duel, ptr, bytes.length);
    this.M._free(ptr);
  }

  respondInt(value: number): void {
    this.M._web_set_response_int(this.duel, value | 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.duel) this.M._web_destroy_duel(this.duel);
    for (const id of this.fnIds) {
      try {
        this.M.removeFunction(id);
      } catch {
        /* 이미 해제됨 */
      }
    }
    this.fnIds.length = 0;
    if (this.setcodeBuf) this.M._free(this.setcodeBuf);
  }
}
