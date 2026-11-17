/**
 * 데이터 패널 — 레포 동기화 상태 + [지금 갱신].
 * 토큰 없이 동작하며, 서버가 **30초 쿨다운**으로 보호한다(연타/DoS 방지 + 안내 문구).
 */
interface StatusResp {
  enabled: boolean;
  state: 'idle' | 'running' | 'done' | 'failed';
  started: number | null;
  finished: number | null;
  code: number | null;
  cooldown: number;
  running: boolean;
  log: string[];
  meta: null | {
    built: string;
    counts: Record<string, number>;
    repos: Array<{ url: string; repo_path?: string; head?: string; error?: string }>;
  };
}

export class DataPanel {
  private timer: number | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="panel">
        <div class="kv"><b>데이터 기준</b><span id="d-built">—</span></div>
        <div class="kv"><b>카드 / 스크립트 / 금제 / 퍼즐</b><span id="d-counts">—</span></div>
        <div class="kv"><b>상태</b><span id="d-state">—</span></div>
        <div class="kv"><b>레포</b><span id="d-repos">—</span></div>
      </div>
      <div class="row">
        <button id="d-refresh" class="primary">지금 갱신</button>
        <span class="tag" id="d-hint"></span>
      </div>
      <pre id="d-log" class="mono" style="display:none;max-height:220px;overflow:auto;background:#090b0e;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;font-size:11.5px;line-height:1.5;white-space:pre-wrap"></pre>`;

    root.querySelector('#d-refresh')!.addEventListener('click', () => void this.refresh());
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), 5000);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    try {
      const r = await fetch('/api/data/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      this.render((await r.json()) as StatusResp);
    } catch (e) {
      this.set('#d-state', 'API 없음 (' + (e as Error).message + ')');
    }
  }

  private render(s: StatusResp): void {
    const m = s.meta;
    this.set('#d-built', m ? m.built : '없음');
    this.set('#d-counts', m
      ? `카드 ${(m.counts.cards ?? 0).toLocaleString()} (한 ${m.counts.ko ?? 0}/영 ${m.counts.en ?? 0}) · 스크립트 ${m.counts.script} · 금제 ${m.counts.lflist} · 퍼즐 ${m.counts.puzzle}`
      : '—');
    const stateText = s.state === 'running' ? '갱신 중…'
      : s.state === 'done' ? '완료'
      : s.state === 'failed' ? `실패 (exit ${s.code})` : '대기';
    this.set('#d-state', s.cooldown > 0 ? `${stateText} · ${s.cooldown}초 후 가능` : stateText);

    if (m) {
      const heads = m.repos
        .map((r) => `${(r.repo_path || r.url).split('/').pop()}:${(r.head || r.error || '').slice(0, 7)}`)
        .join('  ');
      this.set('#d-repos', heads.length > 96 ? heads.slice(0, 96) + '…' : heads);
    }

    const log = this.root.querySelector<HTMLElement>('#d-log')!;
    if (s.log?.length) {
      log.style.display = 'block';
      log.textContent = s.log.join('\n');
      log.scrollTop = log.scrollHeight;
    }

    const btn = this.root.querySelector<HTMLButtonElement>('#d-refresh')!;
    btn.disabled = s.running || s.cooldown > 0;
    this.set('#d-hint',
      s.running ? '갱신 중입니다 — 끝나면 자동으로 새 데이터가 반영됩니다'
        : s.cooldown > 0 ? `${s.cooldown}초 후에 다시 시도할 수 있습니다`
          : '카드 DB·스크립트·금제를 최신으로 받아옵니다(수 분 소요)');
  }

  private async refresh(): Promise<void> {
    this.set('#d-hint', '요청 중…');
    try {
      const r = await fetch('/api/data/refresh', { method: 'POST' });
      const j = (await r.json()) as { error?: string; retryIn?: number };
      if (r.status === 202) this.set('#d-hint', '시작됨 — 진행 상황은 아래 로그');
      else if (r.status === 429) this.set('#d-hint', `${j.retryIn ?? 30}초 후에 다시 시도할 수 있습니다`);
      else this.set('#d-hint', j.error || 'HTTP ' + r.status);
      void this.poll();
    } catch (e) {
      this.set('#d-hint', '실패: ' + (e as Error).message);
    }
  }

  private set(sel: string, v: string): void {
    const el = this.root.querySelector(sel);
    if (el) el.textContent = v;
  }
}
