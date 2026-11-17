/** 카드 인덱스 — tools/cards.py 가 만든 public/data/cards.json 을 1회 로드. */

export interface Card {
  id: number;
  name: string;
  type: number;
  atk: number;
  def: number;
  level: number;
  race: number;
  attr: number;
  desc: string;
}

/** ocgapi_constants.h 의 TYPE_* */
export const TYPE = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  NORMAL: 0x10,
  EFFECT: 0x20,
  FUSION: 0x40,
  RITUAL: 0x80,
  SYNCHRO: 0x2000,
  XYZ: 0x800000,
  LINK: 0x4000000,
  PENDULUM: 0x1000000,
} as const;

export function isMonster(c: Card): boolean {
  return (c.type & TYPE.MONSTER) !== 0;
}
export function isExtraDeck(c: Card): boolean {
  return (c.type & (TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK)) !== 0;
}

let cache: Card[] | null = null;
let byId: Map<number, Card> | null = null;

export async function loadCards(): Promise<Card[]> {
  if (cache) return cache;
  const res = await fetch('/data/cards.json');
  if (!res.ok) throw new Error('카드 인덱스 로드 실패 ' + res.status);
  const j = (await res.json()) as { cards: Array<[number, string, number, number, number, number, number, number, string]> };
  cache = j.cards.map((r) => ({
    id: r[0],
    name: r[1],
    type: r[2],
    atk: r[3],
    def: r[4],
    level: r[5],
    race: r[6],
    attr: r[7],
    desc: r[8],
  }));
  byId = new Map(cache.map((c) => [c.id, c]));
  return cache;
}

export function cardById(id: number): Card | undefined {
  return byId?.get(id);
}

export function search(cards: Card[], q: string, kind: 'all' | 'monster' | 'spell' | 'trap'): Card[] {
  const s = q.trim().toLowerCase();
  const out: Card[] = [];
  for (const c of cards) {
    if (kind === 'monster' && !isMonster(c)) continue;
    if (kind === 'spell' && (c.type & TYPE.SPELL) === 0) continue;
    if (kind === 'trap' && (c.type & TYPE.TRAP) === 0) continue;
    if (!s) {
      out.push(c);
      if (out.length >= 300) break;
      continue;
    }
    if (c.name.toLowerCase().includes(s) || String(c.id).startsWith(s)) {
      out.push(c);
      if (out.length >= 300) break;
    }
  }
  return out;
}
