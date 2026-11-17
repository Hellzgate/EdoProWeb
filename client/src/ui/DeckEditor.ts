/**
 * 덱 편집기 — 언어 선택 · 키워드 검색(이름+효과 설명) · 가상 리스트 · main/extra/side · .ydk.
 */
import {
  cardById, displayName, isExtraDeck, loadCards, search, TYPE, type Card,
} from '../data/carddb.ts';

type Zone = 'main' | 'extra' | 'side';

const ROW_H = 44;
const LIMIT = { main: 60, extra: 15, side: 15 } as const;

export class DeckEditor {
  private cards: Card[] = [];
  private deck: Record<Zone, number[]> = { main: [], extra: [], side: [] };
  private results: Card[] = [];
  private scrollTop = 0;
  private ready = false;
  private lang: 'ko' | 'en' = 'ko';

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="deck-wrap">
        <div class="deck-pane">
          <div class="deck-bar">
            <input id="dk-q" type="text" placeholder="이름 · ID · 효과 키워드 (예: 묘지, 특수 소환)" />
            <select id="dk-lang">
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
            <select id="dk-kind">
              <option value="all">전체</option>
              <option value="monster">몬스터</option>
              <option value="spell">마법</option>
              <option value="trap">함정</option>
            </select>
            <label class="tag"><input id="dk-onlyko" type="checkbox" /> 번역된 카드만</label>
            <span class="tag" id="dk-count">—</span>
          </div>
          <div class="deck-list" id="dk-list"><div class="deck-viewport" id="dk-vp"></div></div>
          <div class="muted" id="dk-desc" style="margin-top:8px;font-size:12px;line-height:1.5;min-height:34px"></div>
        </div>
        <div class="deck-side">
          <div class="deck-zone" data-zone="main"><header>메인 <b id="c-main">0</b>/60</header><ul id="l-main"></ul></div>
          <div class="deck-zone" data-zone="extra"><header>엑스트라 <b id="c-extra">0</b>/15</header><ul id="l-extra"></ul></div>
          <div class="deck-zone" data-zone="side"><header>사이드 <b id="c-side">0</b>/15</header><ul id="l-side"></ul></div>
          <div class="deck-bar">
            <button id="dk-export" class="primary">.ydk 내보내기</button>
            <button id="dk-clear">비우기</button>
          </div>
        </div>
      </div>`;
    this.bind();
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      this.cards = await loadCards();
      this.ready = true;
      this.refresh();
    } catch (e) {
      this.root.querySelector('#dk-count')!.textContent = (e as Error).message;
    }
  }

  private bind(): void {
    const q = this.root.querySelector<HTMLInputElement>('#dk-q')!;
    q.addEventListener('input', () => this.refresh());
    this.root.querySelector<HTMLSelectElement>('#dk-kind')!.addEventListener('change', () => this.refresh());
    this.root.querySelector<HTMLSelectElement>('#dk-lang')!.addEventListener('change', (e) => {
      this.lang = (e.target as HTMLSelectElement).value as 'ko' | 'en';
      this.refresh();
    });
    this.root.querySelector<HTMLInputElement>('#dk-onlyko')!.addEventListener('change', () => this.refresh());

    const list = this.root.querySelector<HTMLElement>('#dk-list')!;
    list.addEventListener('scroll', () => {
      this.scrollTop = list.scrollTop;
      this.renderList();
    });

    this.root.querySelector('#dk-export')!.addEventListener('click', () => this.exportYdk());
    this.root.querySelector('#dk-clear')!.addEventListener('click', () => {
      this.deck = { main: [], extra: [], side: [] };
      this.renderZones();
    });
  }

  private refresh(): void {
    if (!this.ready) return;
    const q = this.root.querySelector<HTMLInputElement>('#dk-q')!.value;
    const kind = this.root.querySelector<HTMLSelectElement>('#dk-kind')!.value as 'all' | 'monster' | 'spell' | 'trap';
    const translatedOnly = this.root.querySelector<HTMLInputElement>('#dk-onlyko')!.checked;
    this.results = search(this.cards, q, { lang: this.lang, translatedOnly, kind });
    this.root.querySelector('#dk-count')!.textContent =
      `${this.results.length.toLocaleString()} / ${this.cards.length.toLocaleString()}장`;
    const vp = this.root.querySelector<HTMLElement>('#dk-vp')!;
    vp.style.height = this.results.length * ROW_H + 'px';
    this.scrollTop = 0;
    this.root.querySelector<HTMLElement>('#dk-list')!.scrollTop = 0;
    this.renderList();
    this.renderZones();
  }

  private renderList(): void {
    const list = this.root.querySelector<HTMLElement>('#dk-list')!;
    const vp = this.root.querySelector<HTMLElement>('#dk-vp')!;
    const viewH = list.clientHeight || 460;
    const first = Math.max(0, Math.floor(this.scrollTop / ROW_H) - 2);
    const last = Math.min(this.results.length, Math.ceil((this.scrollTop + viewH) / ROW_H) + 2);

    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      const c = this.results[i]!;
      const row = document.createElement('div');
      row.className = 'deck-row';
      Object.assign(row.style, { position: 'absolute', top: i * ROW_H + 'px', left: '0', right: '0', height: ROW_H + 'px' });
      const extra = isExtraDeck(c);
      row.innerHTML =
        `<span class="t">${esc(displayName(c, this.lang))}</span>` +
        `<span class="m">${c.id}</span>` +
        `<span class="b">${extra ? 'EX' : (c.type & TYPE.MONSTER ? `${c.level}★ ${c.atk}/${c.def}` : '')}</span>`;
      row.onclick = () => this.add(c);
      row.onmouseenter = () => this.showDesc(c);
      frag.appendChild(row);
    }
    vp.innerHTML = '';
    vp.appendChild(frag);
  }

  private showDesc(c: Card): void {
    const box = this.root.querySelector<HTMLElement>('#dk-desc')!;
    const d = c.desc || c.descEn;
    box.textContent = `${displayName(c, this.lang)} — ${CARD_KIND[c.type & 0x7] ?? ''} ${d ? '· ' + d.slice(0, 160) : ''}`;
  }

  private add(c: Card): void {
    const zone: Zone = isExtraDeck(c) ? 'extra' : 'main';
    if (this.deck[zone].length >= LIMIT[zone]) return;
    this.deck[zone].push(c.id);
    this.renderZones();
  }

  private renderZones(): void {
    (['main', 'extra', 'side'] as Zone[]).forEach((z) => {
      const ul = this.root.querySelector<HTMLElement>('#l-' + z)!;
      this.root.querySelector<HTMLElement>('#c-' + z)!.textContent = String(this.deck[z].length);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < this.deck[z].length; i++) {
        const c = cardById(this.deck[z][i]!);
        const li = document.createElement('li');
        li.innerHTML = `<span class="t">${esc(c ? displayName(c, this.lang) : '#' + this.deck[z][i])}</span><button title="빼기">×</button>`;
        li.querySelector('button')!.addEventListener('click', () => {
          this.deck[z].splice(i, 1);
          this.renderZones();
        });
        frag.appendChild(li);
      }
      ul.innerHTML = '';
      ul.appendChild(frag);
    });
  }

  private exportYdk(): void {
    const lines = ['#created by edopro-web-client', '#main'];
    for (const id of this.deck.main) lines.push(String(id));
    lines.push('#extra');
    for (const id of this.deck.extra) lines.push(String(id));
    lines.push('!side');
    for (const id of this.deck.side) lines.push(String(id));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }));
    a.download = 'deck.ydk';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

const CARD_KIND: Record<number, string> = { 1: '몬스터', 2: '마법', 4: '함정' };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
}
