/**
 * 로컬 듀얼 화면 — ocgcore(WASM) 로 실제 듀얼을 돌린다.
 *
 * - 보드: render/field.ts 좌표 + BoardRenderer(WebGL2) + 2D 오버레이
 * - 진행: LocalCore(ICore) → 상태는 ReplayCore 와 동일
 * - 입력: 프롬프트(duel/prompts.ts) → 버튼/목록 → 응답 인코딩
 * - 상대(P2): autoChoice 로 자동 응답(막히지 않게 하는 최소 정책)
 */
import { phaseName, type DuelState } from '../engine/state.ts';
import { LocalCore, SYSTEM_SCRIPTS, type LocalDeck } from '../core/LocalCore.ts';
import { BoardRenderer } from '../render/BoardRenderer.ts';
import { layoutField } from '../render/field.ts';
import { drawBoard } from '../render/board.ts';
import { handRects } from '../render/cards.ts';
import { onAssetLoad, setFieldMat } from '../render/assets.ts';
import { cardById, loadCards, toCardInfo, type Card } from '../data/carddb.ts';
import { ScriptCache } from '../data/scripts.ts';
import {
  autoChoice,
  decodePrompt,
  freeZones,
  encodeAck,
  encodeAttrib,
  encodeBattle,
  encodeCards,
  encodeCounters,
  encodeIdle,
  encodeIndex,
  encodePlaces,
  encodePosition,
  encodeRace,
  encodeSort,
  encodeUnselect,
  encodeYesNo,
  type CardEntry,
  type Prompt,
} from '../duel/prompts.ts';

const LOC_M = 0x04;
const LOC_S = 0x08;

/** 프롬프트가 가리키는 존 키 목록(강조 표시용) */
function promptZones(p: Prompt): string[] {
  const out: string[] = [];
  const add = (e: { ctrl: number; loc: number; seq: number }) => {
    if (e.loc & LOC_M) out.push(`m${e.ctrl & 1}-${e.seq}`);
    else if (e.loc & LOC_S) out.push(`s${e.ctrl & 1}-${e.seq}`);
  };
  switch (p.kind) {
    case 'card':
    case 'tribute':
      p.cards.forEach(add);
      break;
    case 'sum':
      p.must.forEach(add);
      p.cards.forEach(add);
      break;
    case 'unselect':
      p.select.forEach(add);
      p.unselect.forEach(add);
      break;
    case 'chain':
      p.chains.forEach(add);
      break;
    case 'effectyn':
      add(p.card);
      break;
    case 'place':
      // 배치 프롬프트는 **가능한 모든 존**을 강조한다(1개만 고르는 UI 라도 후보는 전부)
      for (const z of freeZones(p.flag, 99, p.player)) {
        out.push(`${z.loc & LOC_M ? 'm' : 's'}${z.ctrl}-${z.seq}`);
      }
      break;
  }
  return out;
}

/** 종족/속성 이름 (ocgapi_constants.h 비트) */
const RACE_NAMES: Record<number, string> = {
  0x1: '전사', 0x2: '마법사', 0x4: '천사', 0x8: '악마', 0x10: '좀비', 0x20: '기계',
  0x40: '물', 0x80: '화염', 0x100: '암석', 0x200: '비행야수', 0x400: '식물',
  0x800: '곤충', 0x1000: '번개', 0x2000: '드래곤', 0x4000: '야수', 0x8000: '야수전사',
  0x10000: '공룡', 0x20000: '어류', 0x40000: '해룡', 0x80000: '파충류',
  0x100000: '사이킥', 0x200000: '신', 0x400000: '창조주', 0x800000: '환룡',
  0x1000000: '사이버스', 0x2000000: '환상',
};
const ATTR_NAMES: Record<number, string> = {
  0x1: '땅', 0x2: '물', 0x4: '화염', 0x8: '바람', 0x10: '빛', 0x20: '어둠', 0x40: '신',
};

export class DuelScreen {
  private core: LocalCore | null = null;
  private state: DuelState | null = null;
  private readonly scripts = new ScriptCache();
  private readonly cards = new Map<number, Card>();
  private gl?: BoardRenderer;
  private fx?: CanvasRenderingContext2D;
  private log: string[] = [];
  private prompt: Prompt | null = null;
  private sel = new Set<number>();
  private sortOrder: number[] = [];
  private layout: ReturnType<typeof layoutField> | null = null;
  private highlight: string[] = [];
  /** 체인 모드 — on: 항상 묻기 / off: 자동 패스 / pause: 이번 턴만 자동 패스 */
  private chainMode: 'on' | 'off' | 'pause' = 'on';
  private pauseTurn = -1;
  private auto = false;
  private started = false;
  private busy = false;
  private missing = new Set<string>();

  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="duel-wrap">
        <div>
          <div class="row">
            <button id="d-start" class="primary">기본 덱으로 시작</button>
            <input id="d-ydk" type="file" accept=".ydk" />
            <label class="tag"><input id="d-auto" type="checkbox" /> 내 턴도 자동</label>
            <button id="d-stop">중지</button>
            <button id="d-save" disabled>리플레이 저장</button>
            <button id="d-surrender" disabled>항복</button>
            <span class="d-seg" id="d-chain">
              <button data-chain="on" class="on">체인 ON</button>
              <button data-chain="pause">일시 정지</button>
              <button data-chain="off">OFF</button>
            </span>
            <select id="d-mat" title="필드 매트">
              <option value="field3">매트 3</option>
              <option value="field">매트 1</option>
              <option value="field2">매트 2</option>
              <option value="field4">매트 4</option>
            </select>
            <span class="tag" id="d-hint">카드 DB·스크립트 준비 중…</span>
          </div>
          <div id="d-stage">
            <canvas id="d-gl"></canvas>
            <canvas id="d-fx"></canvas>
            <img id="d-zoom" alt="" />
          </div>
          <div class="panel" id="d-status" style="margin-top:12px"></div>
        </div>
        <aside class="duel-side">
          <div class="panel"><b>선택</b><div id="d-prompt" class="d-prompt"><span class="tag">아직 시작하지 않았습니다</span></div></div>
          <div class="panel"><b>로그</b><div id="d-log" class="d-log"></div></div>
        </aside>
      </div>`;
    this.bind();
    this.setupCanvas();
    onAssetLoad(() => this.render());
    requestAnimationFrame(() => this.resize());
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    stage.addEventListener('mousemove', (e) => this.hover(e));
    stage.addEventListener('mouseleave', () => this.showZoom(0));
    stage.addEventListener('click', (e) => this.onClick(e));
  }

  /* ---------------- 보드 클릭 (실제 듀얼처럼) ---------------- */
  private onClick(e: MouseEvent): void {
    if (!this.layout || !this.state || !this.prompt) return;
    if (this.prompt.player !== 0) return;
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const p = this.prompt;
    const zoneAt = (): string | null => {
      for (const [key, r] of Object.entries(this.layout!.zones)) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return key;
      }
      return null;
    };
    const zoneKey = zoneAt();
    const handIdx = (): number | null => {
      const rects = handRects(this.layout!, this.layout!.hand.p0, this.state!.hand[0].length);
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i]!;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return null;
    };

    /* 1) 메인 페이즈: 패 클릭 → 소환/세트 */
    if (p.kind === 'idle') {
      const hi = handIdx();
      if (hi === null) return;
      const summon = p.summon.findIndex((c) => c.loc & 0x02 && c.seq === hi);
      if (summon >= 0) return this.respond(encodeIdle(0, summon));
      const set = p.mset.findIndex((c) => c.loc & 0x02 && c.seq === hi);
      if (set >= 0) return this.respond(encodeIdle(3, set));
      return;
    }

    /* 2) 존 선택: 클릭으로 토글 */
    if (p.kind === 'place') {
      if (!zoneKey) return;
      const cands = freeZones(p.flag, 99, p.player).map(
        (z) => `${z.loc & LOC_M ? 'm' : 's'}${z.ctrl}-${z.seq}`,
      );
      const i = cands.indexOf(zoneKey);
      if (i < 0) return;
      if (this.sel.has(i)) this.sel.delete(i);
      else if (this.sel.size < p.count) this.sel.add(i);
      this.renderPrompt();
      if (this.sel.size === p.count) {
        const picked = [...this.sel].map((k) => cands[k]!);
        const places = picked.map((k) => {
          const [s, rest] = [k[0] === 'm' ? LOC_M : LOC_S, k.slice(1).split('-')];
          return { ctrl: Number(rest[0]), loc: s, seq: Number(rest[1]) };
        });
        this.respond(encodePlaces(places));
      }
      return;
    }

    /* 3) 카드/제물/소재: 존 클릭으로 선택 */
    if (p.kind === 'card' || p.kind === 'tribute') {
      if (!zoneKey) return;
      const idx = p.cards.findIndex((c) => {
        const key = c.loc & LOC_M ? `m${c.ctrl & 1}-${c.seq}` : c.loc & LOC_S ? `s${c.ctrl & 1}-${c.seq}` : '';
        return key === zoneKey;
      });
      if (idx < 0) return;
      if (this.sel.has(idx)) this.sel.delete(idx);
      else if (this.sel.size < p.max) this.sel.add(idx);
      this.renderPrompt();
      return;
    }
  }

  /* ---------------- 카드 확대(호버) ---------------- */
  private hover(e: MouseEvent): void {
    if (!this.layout || !this.state) return;
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let side = 0; side <= 1; side++) {
      for (let i = 0; i < 7; i++) {
        const r = this.layout.zones[`m${side}-${i}`];
        if (!r || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        const code = this.state.mzone[side][i];
        if (code !== null) return this.showZoom(code, e);
      }
      for (let i = 0; i < 6; i++) {
        const r = this.layout.zones[`s${side}-${i}`];
        if (!r || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        const code = this.state.szone[side][i];
        if (code !== null) return this.showZoom(code, e);
      }
    }
    this.showZoom(0);
  }

  /** code=0 이면 숨김. 마우스 반대편에 띄운다. */
  private showZoom(code: number, e?: MouseEvent): void {
    const img = this.root.querySelector('#d-zoom') as HTMLImageElement;
    if (!img) return;
    if (!code) {
      img.classList.remove('on');
      return;
    }
    img.src = `/data/pics/${code}.jpg`;
    img.classList.add('on');
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const x = (e?.clientX ?? rect.left + rect.width / 2) - rect.left;
    const left = x > rect.width / 2;
    img.style.left = left ? '12px' : `${Math.max(12, rect.width - 208)}px`;
    img.style.top = '50%';
    img.style.transform = 'translateY(-50%)';
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector(`#${id}`) as T;
  }

  private bind(): void {
    this.$('d-start').addEventListener('click', () => void this.start(null));
    this.$<HTMLInputElement>('d-auto').addEventListener('change', (e) => {
      this.auto = (e.target as HTMLInputElement).checked;
      // 이미 떠 있는 프롬프트도 자동으로 처리 (토글 시점)
      if (this.auto && this.prompt) {
        const p = this.prompt;
        window.setTimeout(() => this.respond(autoChoice(p)), 50);
      }
    });
    this.$('d-stop').addEventListener('click', () => this.stop());
    this.$('d-save').addEventListener('click', () => this.saveReplay());
    this.$('d-surrender').addEventListener('click', () => {
      if (!this.core) return;
      this.core.surrender();
      this.pushLog('항복 — 상대 승');
      this.hint('항복했습니다');
    });
    this.root.querySelectorAll<HTMLButtonElement>('#d-chain button').forEach((b) => {
      b.addEventListener('click', () => {
        this.chainMode = (b.dataset.chain as 'on' | 'off' | 'pause') ?? 'on';
        this.pauseTurn = this.chainMode === 'pause' ? (this.state?.turn ?? -1) : -1;
        this.root.querySelectorAll('#d-chain button').forEach((x) => x.classList.toggle('on', x === b));
        this.pushLog(`체인 모드: ${b.textContent}`);
        // 이미 떠 있는 체인 프롬프트도 즉시 처리
        if (this.prompt?.kind === 'chain' && this.chainMode !== 'on') this.maybeAutoPass();
      });
    });
    const mat = this.$<HTMLSelectElement>('d-mat');
    const saved = localStorage.getItem('edopro.mat') ?? 'field3';
    mat.value = saved;
    setFieldMat(saved);
    mat.addEventListener('change', () => {
      setFieldMat(mat.value);
      localStorage.setItem('edopro.mat', mat.value);
      this.render();
    });
    this.$<HTMLInputElement>('d-ydk').addEventListener('change', async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const txt = await f.text();
      void this.start(parseYdk(txt));
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.prompt) return;
      const p = this.prompt;
      if (p.kind === 'chain' && !p.forced) this.respond(encodeIndex(-1));
      else if ((p.kind === 'card' || p.kind === 'tribute') && p.cancelable && p.min === 0) this.respond(encodeCards([], true));
      else if (p.kind === 'unselect' && (p.finishable || p.cancelable)) this.respond(encodeUnselect(-1, 0));
    });
  }

  /* ---------------- 준비 ---------------- */
  private async ensureData(): Promise<void> {
    if (this.cards.size) return;
    this.hint('카드 DB 로드 중…');
    for (const c of await loadCards()) this.cards.set(c.id, c);
    this.hint('스크립트 인덱스 로드 중…');
    const n = await this.scripts.loadIndex();
    this.hint(`카드 ${this.cards.size.toLocaleString()} · 스크립트 ${n.toLocaleString()}`);
  }

  private cardSource = (code: number) => {
    const c = this.cards.get(code);
    return c ? toCardInfo(c) : undefined;
  };

  private scriptSource = (name: string): string | null => {
    const src = this.scripts.get(name);
    if (!src && !this.missing.has(name)) {
      this.missing.add(name);
      if (this.missing.size <= 6) this.pushLog(`스크립트 없음: ${name}`);
    }
    return src;
  };

  /* ---------------- 시작 ---------------- */
  async start(deck: LocalDeck[] | null): Promise<void> {
    if (this.started) this.stop();
    await this.ensureData();
    this.busy = true;

    const saved = deck ?? savedDeckPair();
    const decks: [LocalDeck, LocalDeck] = saved
      ? [saved[0]!, saved[1] ?? saved[0]!]
      : [defaultDeck(this.cards), defaultDeck(this.cards)];
    if (saved) {
      this.$('d-start').textContent = `내 덱으로 시작 (${decks[0].main.length}장)`;
      if (decks[0].main.length < 40) this.pushLog(`경고: 메인 덱 ${decks[0].main.length}장 (40장 권장)`);
    }

    const codes = [...decks[0].main, ...(decks[0].extra ?? []), ...decks[1].main, ...(decks[1].extra ?? [])];
    this.hint('스크립트 내려받는 중…');
    await this.scripts.preload(SYSTEM_SCRIPTS as unknown as string[]);
    await this.scripts.preloadCards(codes);

    this.hint(`듀얼 생성 중… (스크립트 ${this.scripts.size})`);
    try {
      this.core = await LocalCore.create({
        decks,
        cards: this.cardSource,
        scripts: this.scriptSource,
        onLog: (msg, type) => {
          if (type === 0) this.pushLog(`[core] ${msg}`);
        },
      });
    } catch (e) {
      this.hint(`실패: ${(e as Error).message}`);
      this.busy = false;
      return;
    }

    this.started = true;
    this.busy = false;
    (this.$('d-save') as HTMLButtonElement).disabled = false;
    (this.$('d-surrender') as HTMLButtonElement).disabled = false;
    this.log = [];
    this.state = this.core.snapshot;
    this.setupCanvas();
    this.wire();
    this.resize();
    this.renderPrompt();
    this.pushLog(`듀얼 시작 · 시스템 스크립트 ${this.core.scriptReport.loaded}/${SYSTEM_SCRIPTS.length}`);
    if (this.core.scriptReport.missing.length) {
      this.pushLog(`시스템 스크립트 누락: ${this.core.scriptReport.missing.join(', ')}`);
    }
    const req = this.core.pendingRequest;
    if (req) this.onNeed(req.type, req.payload);
    this.hint(`진행 중 · 스크립트 ${this.scripts.size} · RETRY ${this.core.retries}`);
    this.render();
  }

  private wire(): void {
    const core = this.core!;
    core.on('state', (st) => {
      this.state = st;
      this.render();
    });
    core.on('need', (n) => this.onNeed(n.type, n.payload));
    core.on('end', ({ winner }) => {
      this.pushLog(winner === null ? '듀얼 종료' : `승자 P${winner + 1}`);
      this.render();
    });
    core.on('error', (e) => this.pushLog(`오류: ${e.message}`));
  }

  private stop(): void {
    this.core?.dispose();
    this.core = null;
    this.started = false;
    this.prompt = null;
    this.sel.clear();
    this.state = null;
    (this.$('d-save') as HTMLButtonElement).disabled = true;
    (this.$('d-surrender') as HTMLButtonElement).disabled = true;
    this.render();
    this.hint('중지됨');
  }

  /** 현재까지의 패킷을 리플레이 뷰어 형식(.json)으로 저장 */
  private saveReplay(): void {
    if (!this.core) return;
    const packets = this.core.recorded();
    if (!packets.length) {
      this.pushLog('저장할 패킷이 없습니다');
      return;
    }
    const b64 = (u8: Uint8Array): string => {
      let s = '';
      for (let i = 0; i < u8.length; i += 4096) {
        s += String.fromCharCode(...u8.subarray(i, i + 4096));
      }
      return btoa(s);
    };
    const name = `local-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.json`;
    const json = {
      file: name,
      names: ['나', '상대'],
      turns: this.state?.turn ?? 0,
      packets: packets.map((p) => [p.message, b64(p.data)]),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(json)], { type: 'application/json' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    this.pushLog(`리플레이 저장: ${name} (${packets.length}패킷)`);
  }

  /* ---------------- 입력 ---------------- */
  private onNeed(type: number, payload: Uint8Array): void {
    const p = decodePrompt(type, payload);
    if (!p) return;
    this.prompt = p;
    this.highlight = promptZones(p);
    this.sel.clear();
    this.sortOrder = [];
    this.pushLog(`${p.kind}${'player' in p ? ` (P${p.player + 1})` : ''}`);
    this.renderPrompt();

    // 체인 모드: off / pause(이번 턴) 이면 내 체인 요청을 자동 패스
    if (p.kind === 'chain' && p.player === 0 && !p.forced && this.shouldAutoPass()) {
      window.setTimeout(() => this.respond(encodeIndex(-1)), 40);
      return;
    }

    // 상대(또는 자동 모드) → 즉시 응답
    const autoNow = p.player === 1 || this.auto;
    if (autoNow) {
      this.busy = true;
      window.setTimeout(() => {
        this.busy = false;
        this.respond(autoChoice(p));
      }, p.player === 1 ? 180 : 60);
    }
  }

  private shouldAutoPass(): boolean {
    if (this.chainMode === 'off') return true;
    if (this.chainMode === 'pause') return this.state?.turn === this.pauseTurn;
    return false;
  }

  /** 모드 변경 직후, 이미 떠 있는 체인 프롬프트를 처리 */
  private maybeAutoPass(): void {
    const p = this.prompt;
    if (!p || p.kind !== 'chain' || p.player !== 0 || p.forced) return;
    if (this.shouldAutoPass()) this.respond(encodeIndex(-1));
  }

  private respond(bytes: Uint8Array): void {
    if (!this.core || !this.prompt) return;
    const core = this.core;
    const prompt = this.prompt;
    void prompt;
    // ⚠ 순서 중요: core.respond() 가 즉시 다음 need 를 emit 하므로,
    //    먼저 현재 프롬프트를 비우고 나서 응답해야 새 프롬프트가 지워지지 않는다.
    this.prompt = null;
    this.sel.clear();
    this.highlight = [];
    this.renderPrompt();
    core.respond(bytes);
    this.render();
  }

  /* ---------------- 프롬프트 UI ---------------- */
  private renderPrompt(): void {
    const box = this.$('d-prompt');
    box.innerHTML = '';
    const p = this.prompt;
    if (!p) {
      box.innerHTML = `<span class="tag">${this.started ? '대기 중…' : '아직 시작하지 않았습니다'}</span>`;
      return;
    }
    if (this.busy && (p.player === 1 || this.auto)) {
      box.innerHTML = `<span class="tag">자동 처리 중…</span>`;
      return;
    }

    const add = (label: string, fn: () => void, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', fn);
      box.appendChild(b);
      return b;
    };
    const title = (t: string) => {
      const d = document.createElement('div');
      d.className = 'tag';
      d.style.marginBottom = '6px';
      d.textContent = t;
      box.appendChild(d);
    };
    const name = (code: number) => cardById(code)?.name ?? String(code);

    switch (p.kind) {
      case 'idle': {
        title(`P${p.player + 1} · 메인 페이즈`);
        p.summon.forEach((c, i) => add(`소환 ${name(c.code)}`, () => this.respond(encodeIdle(0, i))));
        p.spsummon.forEach((c, i) => add(`특수소환 ${name(c.code)}`, () => this.respond(encodeIdle(1, i))));
        p.mset.forEach((c, i) => add(`세트 ${name(c.code)}`, () => this.respond(encodeIdle(3, i))));
        p.sset.forEach((c, i) => add(`마함세트 ${name(c.code)}`, () => this.respond(encodeIdle(4, i))));
        p.poschange.forEach((c, i) => add(`표시변경 ${name(c.code)}`, () => this.respond(encodeIdle(2, i))));
        p.activate.forEach((c, i) => add(`▶ 발동 ${name(c.code)}`, () => this.respond(encodeIdle(5, i)), 'primary'));
        if (p.toBp) add('배틀 페이즈 →', () => this.respond(encodeIdle(6, 0)));
        if (p.canShuffle) add('패 셔플', () => this.respond(encodeIdle(8, 0)));
        add('턴 종료', () => this.respond(encodeIdle(7, 0)), p.toEp ? '' : 'hidden');
        break;
      }
      case 'battle': {
        title(`P${p.player + 1} · 배틀 페이즈`);
        p.activate.forEach((c, i) => add(`▶ 발동 ${name(c.code)}`, () => this.respond(encodeBattle(0, i)), 'primary'));
        p.attack.forEach((c, i) =>
          add(`공격 ${name(c.code)}${p.direct[i] ? ' (직접)' : ''}`, () => this.respond(encodeBattle(1, i))),
        );
        if (p.toM2) add('메인2 →', () => this.respond(encodeBattle(2, 0)));
        add('턴 종료', () => this.respond(encodeBattle(3, 0)));
        break;
      }
      case 'card':
      case 'tribute':
      case 'sum': {
        const items: CardEntry[] = p.kind === 'sum' ? [...p.must, ...p.cards] : p.cards;
        const locked = p.kind === 'sum' ? p.must.length : 0;
        const min = p.kind === 'card' ? p.min : p.kind === 'tribute' ? p.min : p.min;
        const max = p.kind === 'card' ? p.max : p.kind === 'tribute' ? p.max : p.max;
        title(`${p.kind === 'tribute' ? '제물' : p.kind === 'sum' ? '소재' : '카드'} 선택 · ${min}~${max}장`);
        items.forEach((c, i) => {
          const isLocked = i < locked;
          const b = add(`${this.sel.has(i) ? '✓ ' : ''}${name(c.code)}`, () => {
            if (isLocked) return;
            if (this.sel.has(i)) this.sel.delete(i);
            else if (this.sel.size < max) this.sel.add(i);
            this.renderPrompt();
          });
          if (isLocked) b.className = 'sel-locked';
        });
        const ok = add(`선택 완료 (${this.sel.size})`, () => {
          const idx = [...this.sel].filter((i) => i >= locked).map((i) => i - locked);
          this.respond(encodeCards(idx));
        }, 'primary');
        ok.toggleAttribute('disabled', this.sel.size < min);
        if (p.cancelable && min === 0) add('취소', () => this.respond(encodeCards([], true)));
        break;
      }
      case 'unselect': {
        title('카드 선택/해제');
        p.select.forEach((c, i) => add(`${name(c.code)}`, () => this.respond(encodeUnselect(0, i))));
        p.unselect.forEach((c, i) =>
          add(`${name(c.code)} (해제)`, () => this.respond(encodeUnselect(1, p.select.length + i))),
        );
        if (p.finishable || p.cancelable) add('완료', () => this.respond(encodeUnselect(-1, 0)), 'primary');
        break;
      }
      case 'chain': {
        title(`P${p.player + 1} · 체인 ${p.forced ? '(강제)' : ''}`);
        p.chains.forEach((c, i) => add(`${name(c.code)}`, () => this.respond(encodeIndex(i)), 'primary'));
        if (!p.forced) add('체인 없음', () => this.respond(encodeIndex(-1)));
        break;
      }
      case 'effectyn':
        title(`${name(p.code)} 효과${p.desc ? ` (${p.desc})` : ''}`);
        add('발동', () => this.respond(encodeYesNo(true)), 'primary');
        add('하지 않음', () => this.respond(encodeYesNo(false)));
        break;
      case 'yesno':
        title('예 / 아니오');
        add('예', () => this.respond(encodeYesNo(true)), 'primary');
        add('아니오', () => this.respond(encodeYesNo(false)));
        break;
      case 'option':
      case 'number':
      case 'cardcode':
        title(p.kind === 'cardcode' ? '카드 선언' : p.kind === 'number' ? '숫자 선언' : '옵션 선택');
        p.options.forEach((opt, i) => {
          const label = p.kind === 'cardcode' ? name(Number(opt)) : p.kind === 'number' ? String(opt) : `옵션 ${i + 1}`;
          add(label, () => this.respond(encodeIndex(i)), 'primary');
        });
        break;
      case 'position':
        title(`${name(p.code)} · 표시 형식`);
        if (p.positions & 0x1) add('앞면 공격', () => this.respond(encodePosition(0x1)), 'primary');
        if (p.positions & 0x2) add('앞면 수비', () => this.respond(encodePosition(0x2)));
        if (p.positions & 0x4) add('뒷면 수비', () => this.respond(encodePosition(0x4)));
        break;
      case 'place': {
        title(`${p.disfield ? '존 지정(금지)' : '존 선택'} · ${p.count}개`);
        const zones: Array<{ ctrl: number; loc: number; seq: number }> = [];
        for (let ctrl = 0; ctrl <= 1; ctrl++) {
          for (let seq = 0; seq < 7; seq++) {
            const bit = (1 << (seq + (ctrl ? 16 : 0))) >>> 0;
            if (p.disfield ? (p.flag & bit) !== 0 : (p.flag & bit) === 0) zones.push({ ctrl, loc: LOC_M, seq });
          }
          for (let seq = 0; seq < 8; seq++) {
            const bit = (1 << (8 + seq + (ctrl ? 16 : 0))) >>> 0;
            if (p.disfield ? (p.flag & bit) !== 0 : (p.flag & bit) === 0) zones.push({ ctrl, loc: LOC_S, seq });
          }
        }
        zones.forEach((z, i) => {
          const label = `${z.ctrl ? 'P2' : 'P1'} ${z.loc === LOC_M ? '몬스터' : '마함'} ${z.seq + 1}`;
          add(`${this.sel.has(i) ? '✓ ' : ''}${label}`, () => {
            if (this.sel.has(i)) this.sel.delete(i);
            else if (this.sel.size < p.count) this.sel.add(i);
            this.renderPrompt();
          });
        });
        const ok = add('확정', () => this.respond(encodePlaces([...this.sel].map((i) => zones[i]!))), 'primary');
        ok.toggleAttribute('disabled', this.sel.size !== p.count);
        break;
      }
      case 'sort': {
        if (this.sortOrder.length !== p.cards.length) this.sortOrder = p.cards.map((_, k) => k);
        title('순서 지정 — ▲▼ 로 변경');
        this.sortOrder.forEach((cardIdx, pos) => {
          const row = document.createElement('div');
          row.className = 'sort-row';
          const label = document.createElement('span');
          label.textContent = `${pos + 1}. ${name(p.cards[cardIdx]!.code)}`;
          const up = document.createElement('button');
          up.textContent = '▲';
          up.addEventListener('click', () => this.moveSort(pos, -1));
          const down = document.createElement('button');
          down.textContent = '▼';
          down.addEventListener('click', () => this.moveSort(pos, 1));
          row.append(label, up, down);
          box.appendChild(row);
        });
        add('확정', () => this.respond(encodeSort(this.sortOrder)), 'primary');
        break;
      }
      case 'counter': {
        title(`코인 ${p.count}개 배치`);
        const counts = new Array(p.cards.length).fill(0);
        let left = p.count;
        p.cards.forEach((c, i) => {
          const label = () => `${name(c.code)} (${counts[i]}/${c.counters})`;
          const b = add(label(), () => {
            if (left <= 0 || counts[i] >= c.counters) return;
            counts[i]++;
            left--;
            b.textContent = label();
          });
        });
        add('자동 분배', () => {
          let need = p.count;
          p.cards.forEach((c, i) => {
            const take = Math.max(0, Math.min(need, c.counters));
            counts[i] = take;
            need -= take;
          });
          this.respond(encodeCounters(counts));
        });
        add('확정', () => this.respond(encodeCounters(counts)), 'primary');
        break;
      }
      case 'confirm':
        title(`${p.deckTop ? '덱 위' : '카드'} 확인 · ${p.cards.map((c) => name(c.code)).join(', ') || '—'}`);
        add('확인', () => this.respond(encodeAck()), 'primary');
        break;
      case 'race':
      case 'attrib': {
        title(`${p.kind === 'race' ? '종족' : '속성'} 선언 (${p.count}개)`);
        const bits = p.kind === 'race' ? 64 : 32;
        for (let i = 0; i < bits; i++) {
          const on = p.kind === 'race' ? ((p.available >> BigInt(i)) & 1n) === 1n : ((p.available >>> i) & 1) === 1;
          if (!on) continue;
          const bit = 1 << i;
          const label = p.kind === 'race' ? (RACE_NAMES[bit] ?? `종족 ${i}`) : (ATTR_NAMES[bit] ?? `속성 ${i}`);
          add(label, () => this.respond(p.kind === 'race' ? encodeRace(1n << BigInt(i)) : encodeAttrib(bit)));
        }
        break;
      }
    }
  }

  /* ---------------- 렌더 ---------------- */
  private moveSort(pos: number, dir: number): void {
    const to = pos + dir;
    if (to < 0 || to >= this.sortOrder.length) return;
    const a = this.sortOrder;
    const tmp = a[pos]!;
    a[pos] = a[to]!;
    a[to] = tmp;
    this.renderPrompt();
  }

  private setupCanvas(): void {
    if (this.gl) return;
    this.gl = new BoardRenderer(this.root.querySelector('#d-gl') as HTMLCanvasElement);
    this.fx = (this.root.querySelector('#d-fx') as HTMLCanvasElement).getContext('2d')!;
  }

  /** 탭이 보일 때 호출 — 캔버스 크기를 다시 잡는다 */
  show(): void {
    this.resize();
  }

  private resize(): void {
    if (!this.gl || !this.fx) return;
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    if (!stage) return;
    const w = Math.max(360, stage.clientWidth);
    const h = Math.round(Math.min(900, Math.max(440, w * 0.8)));
    stage.style.height = h + 'px';
    this.gl.resize(w, h);
    const c = this.root.querySelector('#d-fx') as HTMLCanvasElement;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    this.render();
  }

  private render(): void {
    if (!this.fx) return;
    const stage = this.root.querySelector('#d-stage') as HTMLElement;
    if (!stage) return;
    const w = Math.max(360, stage.clientWidth);
    const h = Number(stage.style.height.replace('px', '')) || 420;
    const layout = layoutField(w, h);
    this.layout = layout;
    this.gl?.draw([]);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fx = this.fx;
    fx.save();
    fx.scale(dpr, dpr);
    drawBoard(fx, w, h, layout, this.state, { names: ['나', '상대'], highlight: this.highlight, stats: this.core?.stats });
    fx.restore();

    this.renderStatus();
  }

  private renderStatus(): void {
    const s = this.state;
    const box = this.$('d-status');
    if (!s) {
      box.innerHTML = '<span class="tag">—</span>';
      return;
    }
    const row = (k: string, v: string) => `<div class="kv"><b>${k}</b><span>${v}</span></div>`;
    box.innerHTML =
      row('P1 (나)', `LP ${s.lp[0]} · 덱 ${s.deck[0]} · 패 ${s.hand[0].length} · 묘지 ${s.grave[0].length} · 제외 ${s.banished[0].length}`) +
      row('P2 (상대)', `LP ${s.lp[1]} · 덱 ${s.deck[1]} · 패 ${s.hand[1].length} · 묘지 ${s.grave[1].length} · 제외 ${s.banished[1].length}`) +
      row('턴 / 페이즈', `${s.turn} · ${phaseName(s.phase)}`) +
      row('마지막', s.lastEvent || '—') +
      (this.core ? row('진단', `패킷 ${this.core.length} · RETRY ${this.core.retries} · 스크립트 ${this.scripts.size}`) : '');
  }

  private pushLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
    const box = this.root.querySelector('#d-log');
    if (box) box.innerHTML = this.log.slice(-40).map((l) => `<div>${l}</div>`).join('');
    box?.scrollTo({ top: box.scrollHeight });
  }

  private hint(msg: string): void {
    const el = this.root.querySelector('#d-hint');
    if (el) el.textContent = msg;
  }
}

/* ---------------- 덱 ---------------- */
const DECK_KEY = 'edopro.deck';

/** 덱 편집기가 localStorage 에 저장한 덱 (없으면 null) */
export function savedDeckPair(): LocalDeck[] | null {
  try {
    const j = JSON.parse(localStorage.getItem(DECK_KEY) ?? 'null') as
      | { main?: number[]; extra?: number[]; side?: number[] }
      | null;
    if (!j || !Array.isArray(j.main) || j.main.length === 0) return null;
    const deck: LocalDeck = { main: j.main, extra: j.extra ?? [] };
    return [deck, deck];
  } catch {
    return null;
  }
}

export function parseYdk(txt: string): LocalDeck[] {
  const decks: LocalDeck[] = [
    { main: [], extra: [] },
    { main: [], extra: [] },
  ];
  let zone: 'main' | 'extra' | 'side' = 'main';
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line === '!side') {
      zone = 'side';
      continue;
    }
    if (line.startsWith('!')) continue;
    const code = Number(line);
    if (!Number.isFinite(code) || code <= 0) continue;
    if (zone === 'side') continue;
    (zone === 'main' ? decks[0]!.main : decks[0]!.extra!).push(code);
  }
  return decks;
}

/** 카드 DB 에서 쓸만한 기본 덱(몬스터 위주 40장)을 만든다 */
export function defaultDeck(cards: Map<number, Card>): LocalDeck {
  const pool: number[] = [];
  for (const c of cards.values()) {
    if ((c.type & 0x1) === 0) continue; // 몬스터
    if (c.type & (0x40 | 0x2000 | 0x800000 | 0x4000000 | 0x80000)) continue; // 엑스트라/의식 제외
    if (c.level < 1 || c.level > 4) continue;
    if (c.atk < 1000) continue;
    pool.push(c.id);
    if (pool.length >= 14) break;
  }
  const main: number[] = [];
  for (const code of pool) {
    main.push(code, code, code);
    if (main.length >= 40) break;
  }
  return { main: main.slice(0, 40), extra: [] };
}
