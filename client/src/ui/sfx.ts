/**
 * 효과음 — 원본 EDOPro `sound/*.wav` 를 그대로 쓴다.
 * 브라우저 자동재생 정책 때문에 **사용자 클릭 이후**에만 재생된다(듀얼 시작 클릭이 그 역할).
 */
const FILES = ['draw', 'nextturn', 'phase', 'damage', 'gainlp', 'activate', 'set', 'attack'] as const;
export type SfxName = (typeof FILES)[number];

const cache = new Map<SfxName, HTMLAudioElement>();
let enabled = true;

export function setSfxEnabled(on: boolean): void {
  enabled = on;
}

export function sfxEnabled(): boolean {
  return enabled;
}

export function preloadSfx(): void {
  for (const name of FILES) {
    if (cache.has(name)) continue;
    const a = new Audio(`/theme/sound/${name}.wav`);
    a.preload = 'auto';
    a.volume = 0.55;
    cache.set(name, a);
  }
}

/** 짧은 효과음 — 같은 소리가 겹치면 복제해서 재생 */
export function playSfx(name: SfxName): void {
  if (!enabled) return;
  const base = cache.get(name);
  if (!base) return;
  try {
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = base.volume;
    void a.play().catch(() => {});
  } catch {
    /* 재생 실패는 무시 */
  }
}
