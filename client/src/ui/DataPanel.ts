/**
 * 데이터 패널 — 레포 동기화 상태 표시 + [지금 갱신].
 * 갱신은 서버(refresh.sh)에서 실행되며, 토큰이 필요하다(브라우저에만 저장).
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
    repos: Array<{ url: string; repo_name?: string; repo_path?: string; head?: string; error?: string }>;
  };
}

const TOKEN_KEY = 'edopro-refresh-token';

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
        <input id="d-token" type="password" placeholder="갱신 토큰 (REFRESH_TOKEN)" style="max-width:260px" />
        <button id="d-refresh" class="primary">지금 갱신</button>
        <span class="tag" id="d-hint"></span>
      </div>
      <pre id="d-log" class="mono" style="display:none;max-height:220px;overflow:auto;background:#090b0e;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;font-size:11.5px;line-height:1.5;white-space:pre-wrap"></pre>`;

    const tok = root.querySelector<HTMLInputElement>('#d-token')!;
    tok.value = localStorage.getItem(TOKEN_KEY) || '';
    tok.addEventListener('change', () => localStorage.setItem(TOKEN_KEY, tok.value));
    root.querySelector('#d-refresh')!.addEventListener('click', () => this.refresh());

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
      ? `카드 ${m.counts.cards?.toLocaleString()} · 스크립트 ${m.counts.script} · 금제 ${m.counts.lflist} · 퍼즐 ${m.counts.puzzle}`
      : '—');
    const stateText = s.state === 'running'
      ? '갱신 중…'
      : s.state === 'done'
        ? '완료'
        : s.state === 'failed'
          ? `실패 (exit ${s.code})`
          : '대기';
    this.set('#d-state', s.cooldown > 0 ? `${stateText} · ${s.cooldown}초 뒤 가능` : stateText);

    if (m) {
      const heads = m.repos
        .map((r) => `${(r.repo_path || r.url).split('/').pop()}:${(r.head || r.error || '').slice(0, 7)}`)
        .join('  ');
      this.set('#d-repos', heads.length > 90 ? heads.slice(0, 90) + '…' : heads);
    }

    const log = this.root.querySelector<HTMLElement>('#d-log')!;
    if (s.log?.length) {
      log.style.display = 'block';
      log.textContent = s.log.join('\n');
      log.scrollTop = log.scrollHeight;
    }

    const btn = this.root.querySelector<HTMLButtonElement>('#d-refresh')!;
    btn.disabled = !s.enabled || s.running || s.cooldown > 0;
    this.set('#d-hint', s.enabled ? '' : '서버에 REFRESH_TOKEN 이 설정되지 않아 갱신할 수 없습니다');
  }

  private async refresh(): Promise<void> {
    const token = this.root.querySelector<HTMLInputElement>('#d-token')!.value.trim();
    if (!token) {
      this.set('#d-hint', '토큰을 입력하세요');
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
    this.set('#d-hint', '요청 중…');
    try {
      const r = await fetch('/api/data/refresh', { method: 'POST', headers: { 'X-Token': token } });
      const j = (await r.json()) as { error?: string; retryIn?: number };
      if (r.status === 202) {
        this.set('#d-hint', '시작됨 — 진행 상황은 아래 로그');
        void this.poll();
      } else {
        this.set('#d-hint', j.error ? `${j.error}${j.retryIn ? ' (' + j.retryIn + '초)' : ''}` : 'HTTP ' + r.status);
      }
    } catch (e) {
      this.set('#d-hint', '실패: ' + (e as Error).message);
    }
  }

  private set(sel: string, v: string): void {
    const el = this.root.querySelector(sel);
    if (el) el.textContent = v;
  }
}
