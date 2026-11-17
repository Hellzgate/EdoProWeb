/**
 * 이미지 자산 — 원본 EDOPro 자산을 그대로 쓴다.
 *   카드: /data/pics/<id>.jpg  (EDOPro pics, 볼륨에서 서빙)
 *   필드/뒷면: /theme/field.png · cover.png(엑덱) · cover2.png(덱)
 *
 * 로딩은 비동기지만 그리기는 동기여야 하므로, 없으면 null 을 돌려주고
 * onload 시 콜백으로 다시 그리게 한다.
 */
const cards = new Map<number, HTMLImageElement | null>();
const pending = new Set<number>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function onAssetLoad(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function cardImage(code: number): HTMLImageElement | null {
  const hit = cards.get(code);
  if (hit !== undefined) return hit;
  if (pending.has(code)) return null;
  pending.add(code);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    cards.set(code, img);
    pending.delete(code);
    notify();
  };
  img.onerror = () => {
    cards.set(code, null); // 없음 — 다시 시도하지 않는다
    pending.delete(code);
    notify();
  };
  img.src = `/data/pics/${code}.jpg`;
  cards.set(code, null); // 로딩 전
  return null;
}

/** 여러 장 미리 요청(그리기 전에 호출) */
export function preloadCards(codes: number[]): void {
  for (const c of codes) cardImage(c);
}

const static_ = new Map<string, HTMLImageElement | null>();

function load(url: string): HTMLImageElement | null {
  const hit = static_.get(url);
  if (hit !== undefined) return hit;
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    static_.set(url, img);
    notify();
  };
  img.onerror = () => {
    static_.set(url, null);
    notify();
  };
  img.src = url;
  static_.set(url, null);
  return null;
}

/** 선택 가능한 매트(원본 EDOPro textures) */
export const MATS = ['field', 'field2', 'field3', 'field4'] as const;
let matFile = 'field3';

export function setFieldMat(name: string): void {
  if (!MATS.includes(name as (typeof MATS)[number])) return;
  matFile = name;
}

export function currentFieldMat(): string {
  return matFile;
}

export const fieldImage = (): HTMLImageElement | null => load(`/theme/${matFile}.png`);
/** 엑스트라 덱 뒷면(주황) */
export const extraBack = (): HTMLImageElement | null => load('/theme/cover.png');
/** 메인 덱 뒷면(보라) */
export const deckBack = (): HTMLImageElement | null => load('/theme/cover2.png');
