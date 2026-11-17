/**
 * 덱 편집기 (P4) — 검색 + 가상 리스트 + main/extra/side + .ydk 내보내기.
 * 디자인 원칙: 데이터는 한 번만 로드하고, 리스트는 **보이는 행만** DOM 으로 만든다.
 */
import { cardById, isExtraDeck, loadCards, search, TYPE, type Card } from '../data/carddb.ts';

type Zone = 'main' | 'extra' | 'side';

const ROW_H = 44;
const LIMIT = { main: 60, extra: 15, side: 15 } as const;

export class DeckEditor {
  private cards: Card[] = [];
  private deck: Record<Zone, number[]> = { main: [], extra: [], side: [] };
  private results: Card[] = [];
  private scrollTop = 0;
  private ready = false;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="deck-wrap">
        <div class="deck-pane">
          <div class="deck-bar">
            <input id="dk-q" type="text" placeholder="카드 이름 · ID 검색" />
            <select id="dk-kind">
              <option value="all">전체</option>
              <option value="monster">몬스터</option>
              <option value="spell">마법</option>
              <option value="trap">함정</option>
            </select>
            <span class="tag" id="dk-count">—</span>
          </div>
          <div class="deck-list" id="dk-list"><div class="deck-viewport" id="dk-vp"></div></div>
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
    const kind = this.root.querySelector<HTMLSelectElement>('#dk-kind')!;
    q.addEventListener('input', () => this.refresh());
    kind.addEventListener('change', () => this.refresh());

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
    this.results = search(this.cards, q, kind);
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
    const viewH = list.clientHeight || 420;
    const first = Math.max(0, Math.floor(this.scrollTop / ROW_H) - 2);
    const last = Math.min(this.results.length, Math.ceil((this.scrollTop + viewH) / ROW_H) + 2);

    const frag = document.createDocumentFragment();
    for (let i = first; i < last; i++) {
      const c = this.results[i]!;
      const row = document.createElement('div');
      row.className = 'deck-row';
      row.style.position = 'absolute';
      row.style.top = i * ROW_H + 'px';
      row.style.left = '0';
      row.style.right = '0';
      row.style.height = ROW_H + 'px';
      row.innerHTML =
        `<span class="t">${esc(c.name)}</span>` +
        `<span class="m">${c.id}</span>` +
        `<span class="b">${isExtraDeck(c) ? 'EX' : (c.type & TYPE.MONSTER ? `${c.level}★ ${c.atk}/${c.def}` : '')}</span>`;
      row.onclick = () => this.add(c);
      frag.appendChild(row);
    }
    vp.innerHTML = '';
    vp.appendChild(frag);
  }

  private add(c: Card): void {
    const zone: Zone = isExtraDeck(c) ? 'extra' : 'main';
    if (this.deck[zone].length >= LIMIT[zone]) return;
    this.deck[zone].push(c.id);
    this.renderZones();
  }

  private renderZones(): void {
    const names: Record<Zone, string> = { main: '#l-main', extra: '#l-extra', side: '#l-side' };
    (['main', 'extra', 'side'] as Zone[]).forEach((z) => {
      const ul = this.root.querySelector<HTMLElement>(names[z])!;
      const counter = this.root.querySelector<HTMLElement>('#c-' + z)!;
      counter.textContent = String(this.deck[z].length);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < this.deck[z].length; i++) {
        const id = this.deck[z][i]!;
        const c = cardById(id);
        const li = document.createElement('li');
        li.innerHTML = `<span class="t">${esc(c?.name ?? '#' + id)}</span><button data-i="${i}" title="빼기">×</button>`;
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
    const lines: string[] = ['#created by edopro-web-client'];
    lines.push('#main');
    for (const id of this.deck.main) lines.push(String(id));
    lines.push('#extra');
    for (const id of this.deck.extra) lines.push(String(id));
    lines.push('!side');
    for (const id of this.deck.side) lines.push(String(id));
    const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deck.ydk';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]!);
}
