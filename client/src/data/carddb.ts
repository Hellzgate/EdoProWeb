/** 카드 인덱스 — cards.json(한/영 병기) 로드 + 이름·설명 키워드 검색 + 언어 필터. */

export interface Card {
  id: number;
  name: string;      // 표시 언어(한국어 우선)
  nameEn: string;
  type: number;
  atk: number;
  def: number;
  level: number;
  race: number;
  attr: number;
  desc: string;
  descEn: string;
  hasKo: boolean;
}

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

/** 카드 종류/종족/속성 한국어 키워드 → 비트 */
const TYPE_WORDS: Array<[RegExp, number]> = [
  [/몬스터|monster/i, TYPE.MONSTER],
  [/마법|spell/i, TYPE.SPELL],
  [/함정|trap/i, TYPE.TRAP],
  [/융합|fusion/i, TYPE.FUSION],
  [/싱크로|synchro/i, TYPE.SYNCHRO],
  [/엑시즈|xyz/i, TYPE.XYZ],
  [/링크|link/i, TYPE.LINK],
  [/리추얼|의식|ritual/i, TYPE.RITUAL],
  [/펜듈럼|pendulum/i, TYPE.PENDULUM],
];

export const isMonster = (c: Card) => (c.type & TYPE.MONSTER) !== 0;
export const isExtraDeck = (c: Card) =>
  (c.type & (TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK)) !== 0;

let cache: Card[] | null = null;
let byId: Map<number, Card> | null = null;

type Row = [number, string, number, number, number, number, number, number, string, string?, string?, number?];

export async function loadCards(): Promise<Card[]> {
  if (cache) return cache;
  const res = await fetch('/data/cards.json');
  if (!res.ok) throw new Error('카드 인덱스 로드 실패 ' + res.status);
  const j = (await res.json()) as { cards: Row[] };
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
    nameEn: r[9] ?? r[1],
    descEn: r[10] ?? r[8],
    hasKo: (r[11] ?? 0) === 1,
  }));
  byId = new Map(cache.map((c) => [c.id, c]));
  return cache;
}

export const cardById = (id: number): Card | undefined => byId?.get(id);

export interface SearchOpts {
  /** 표시 언어 */
  lang?: 'ko' | 'en';
  /** 한국어 번역이 있는 카드만 */
  translatedOnly?: boolean;
  kind?: 'all' | 'monster' | 'spell' | 'trap';
  limit?: number;
}

export function displayName(c: Card, lang: 'ko' | 'en'): string {
  return lang === 'en' ? c.nameEn || c.name : c.name;
}
export function displayDesc(c: Card, lang: 'ko' | 'en'): string {
  return lang === 'en' ? c.descEn || c.desc : c.desc;
}

/**
 * 검색: **ID / 이름 / 효과 설명(키워드)** 을 모두 본다.
 * "묘지", "특수 소환", "드래곤" 같은 단어로도 결과가 나온다.
 */
export function search(cards: Card[], q: string, o: SearchOpts = {}): Card[] {
  const s = q.trim().toLowerCase();
  const out: Card[] = [];
  const limit = o.limit ?? 400;
  let typeMask = 0;
  if (s) for (const [re, bit] of TYPE_WORDS) if (re.test(s)) typeMask |= bit;

  for (const c of cards) {
    if (o.translatedOnly && !c.hasKo) continue;
    if (o.kind === 'monster' && !isMonster(c)) continue;
    if (o.kind === 'spell' && (c.type & TYPE.SPELL) === 0) continue;
    if (o.kind === 'trap' && (c.type & TYPE.TRAP) === 0) continue;
    if (typeMask && (c.type & typeMask) === 0) continue;

    if (!s) {
      out.push(c);
    } else if (
      c.id.toString().startsWith(s) ||
      c.name.toLowerCase().includes(s) ||
      c.nameEn.toLowerCase().includes(s) ||
      c.desc.toLowerCase().includes(s) ||
      c.descEn.toLowerCase().includes(s)
    ) {
      out.push(c);
    }
    if (out.length >= limit) break;
  }
  return out;
}
