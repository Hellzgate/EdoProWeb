/**
 * 스크립트 소스 — ocgcore 의 scriptReader 는 **동기** 콜백이라 즉시 문자열을 줘야 한다.
 * 따라서 미리 받아 캐시하고, 없으면 null(그 카드 효과만 동작하지 않음).
 *
 * 인덱스: /data/script/index.json  (파일명 → 저장소 폴더)
 *   tools/gen-script-index.mjs 가 생성한다.
 */
import type { ScriptSource } from '../core/ocgcore.ts';

export interface ScriptIndexEntry {
  /** 'c12345.lua' → 'delta-bagooska' */
  [name: string]: string;
}

export class ScriptCache {
  private index = new Map<string, string>();
  private loaded = new Map<string, string>();
  private inflight = new Map<string, Promise<void>>();
  readonly missing = new Set<string>();

  /** ocgcore scriptReader 로 넘길 동기 소스 */
  readonly source: ScriptSource = (name: string) => this.get(name);

  private base: string;
  private fetcher: (url: string) => Promise<string | null>;

  constructor(base = '/data/script', fetcher: (url: string) => Promise<string | null> = defaultFetch) {
    this.base = base;
    this.fetcher = fetcher;
  }

  async loadIndex(): Promise<number> {
    const txt = await this.fetcher(`${this.base}/index.json`);
    if (!txt) return 0;
    const j = JSON.parse(txt) as ScriptIndexEntry;
    for (const [name, repo] of Object.entries(j)) this.index.set(name, repo);
    return this.index.size;
  }

  /** 동기 콜백 — 캐시에 있으면 즉시 반환 */
  get(name: string): string | null {
    const hit = this.loaded.get(name);
    if (hit !== undefined) return hit;
    if (this.index.has(name)) {
      // 아직 안 받음: 백그라운드로 받아 둔다(다음 호출부터 사용)
      this.prefetch(name);
    }
    this.missing.add(name);
    return null;
  }

  /** 덱의 카드 스크립트 + 시스템 스크립트를 미리 받는다 */
  async preload(names: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    const list = [...new Set(names.filter((n) => this.index.has(n)))];
    let done = 0;
    for (const name of list) {
      await this.prefetch(name);
      done++;
      onProgress?.(done, list.length);
    }
  }

  async preloadCards(codes: number[], extra: number[] = []): Promise<void> {
    const names = [...codes, ...extra].map((c) => `c${c}.lua`).filter((n) => this.index.has(n));
    await this.preload(names);
  }

  private prefetch(name: string): Promise<void> {
    const hit = this.inflight.get(name);
    if (hit) return hit;
    const repo = this.index.get(name);
    if (!repo) return Promise.resolve();
    const p = this.fetcher(`${this.base}/${repo}/${name}`).then((src) => {
      if (src) this.loaded.set(name, src);
      this.inflight.delete(name);
    });
    this.inflight.set(name, p);
    return p;
  }

  get size(): number {
    return this.loaded.size;
  }
}

async function defaultFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** 시스템 스크립트 이름 목록 (LocalCore.SYSTEM_SCRIPTS 와 동일) */
export const SYS_SCRIPTS = [
  'constant.lua',
  'utility.lua',
  'archetype_setcode_constants.lua',
  'card_counter_constants.lua',
  'cards_specific_functions.lua',
  'deprecated_functions.lua',
  'chain.lua',
  'proc_fusion_spell.lua',
  'proc_fusion.lua',
  'proc_link.lua',
  'proc_maximum.lua',
  'proc_normal.lua',
  'proc_pendulum.lua',
  'proc_ritual.lua',
  'proc_rush.lua',
  'proc_skill.lua',
  'proc_synchro.lua',
  'proc_union.lua',
  'proc_unofficial.lua',
  'proc_workaround.lua',
  'proc_xyz.lua',
];
