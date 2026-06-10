type RankingRow = { rank: number; name: string; point: number };
type GameState = {
  phase: 'idle' | 'playing' | 'winner' | 'answer';
  liveUrl: string | null;
  simulator: { enabled: boolean; mode: 'normal' | 'rush' | 'winner'; liveUrl: string | null };
  wordMask: string;
  answer: string | null;
  length: number;
  remainingSeconds: number;
  history: { id: string; user: string; answer: string; hits: number; blows: number }[];
  winner: { user: string; point: number; answer: string } | null;
  rankings: { daily: RankingRow[]; monthly: RankingRow[] };
};

const initialState: GameState = {
  phase: 'idle', liveUrl: null, simulator: { enabled: false, mode: 'normal', liveUrl: null }, wordMask: '', answer: null, length: 0,
  remainingSeconds: 0, history: [], winner: null, rankings: { daily: [], monthly: [] },
};
let state = initialState;
const root = document.querySelector<HTMLDivElement>('#root')!;

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60);
  const second = String(seconds % 60).padStart(2, '0');
  return `${minute}:${second}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!));
}

async function post(path: string, body: unknown = {}) {
  await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function spectacle(active: boolean) {
  const confetti = Array.from({ length: 90 }, (_, i) => `<span class="confetti" style="left:${(i * 37) % 100}%;animation-delay:${(i % 17) / 6}s;width:${8 + (i % 13)}px;height:${8 + (i % 13)}px"></span>`).join('');
  const fireworks = Array.from({ length: 9 }, (_, i) => `<span class="firework" style="left:${12 + ((i * 19) % 76)}%;top:${8 + ((i * 11) % 38)}%;animation-delay:${(i % 6) / 5}s"></span>`).join('');
  return `<div class="spectacle ${active ? 'is-active' : ''}" aria-hidden="true">${confetti}${fireworks}<div class="aurora aurora-a"></div><div class="aurora aurora-b"></div></div>`;
}

function renderOverlay() {
  const progress = state.phase === 'playing' ? `${(state.remainingSeconds / 300) * 100}%` : '0%';
  root.innerHTML = `
    <main class="overlay-stage">
      ${spectacle(state.phase === 'winner')}
      <section class="hero-card">
        <p class="eyebrow">YouTube Live Comment Game</p>
        <h1>ゆうチューブライブ</h1>
        <div class="word-mask ${state.phase}">${escapeHtml(state.wordMask || '待機中')}</div>
        ${state.answer ? `<p class="answer-reveal">解答：${escapeHtml(state.answer)}</p>` : ''}
        <div class="timer-wrap"><span class="timer">${formatTime(state.remainingSeconds)}</span><div class="timebar"><span style="width:${progress}"></span></div></div>
      </section>
      ${state.winner ? `<section class="winner-card"><div class="winner-burst">WINNER</div><strong>${escapeHtml(state.winner.user)}</strong><p>${state.winner.point}ポイント付与</p><small>解答：${escapeHtml(state.winner.answer)}</small></section>` : ''}
      <section class="history-panel"><h2>回答履歴 最新10件</h2><div class="history-list">
        ${state.history.map((item) => `<article class="history-item"><span class="user">${escapeHtml(item.user)}</span><strong>${escapeHtml(item.answer)}</strong><em>${item.hits}H ${item.blows}B</em></article>`).join('')}
      </div></section>
    </main>`;
}

function rankingCard(title: string, rows: RankingRow[]) {
  return `<section class="ranking-card"><h2>${title}</h2>${rows.length === 0 ? '<p class="empty">まだポイントがありません</p>' : rows.map((row) => `<div class="ranking-row"><span class="rank">${row.rank}</span><span>${escapeHtml(row.name)}</span><strong>${row.point}pt</strong></div>`).join('')}</section>`;
}

function renderRanking() {
  root.innerHTML = `<main class="ranking-page"><h1>Ranking</h1><div class="ranking-grid">${rankingCard('日間 TOP10', state.rankings.daily)}${rankingCard('月間 TOP10', state.rankings.monthly)}</div></main>`;
}

function renderAdmin() {
  root.innerHTML = `
    <main class="admin-page"><h1>管理画面</h1>
      <section class="admin-card"><h2>配信操作</h2><input id="liveUrl" placeholder="YouTube Live URL"><div class="button-grid">
        <button data-action="start">ゲーム開始</button><button data-action="stop">ゲーム停止</button><button data-action="skip">お題スキップ</button><button data-action="show">答え表示</button>
      </div></section>
      <section class="admin-card simulator-card"><h2>ライブ風テスト機能</h2><p>実際にライブ中のコメントが流れているように、複数ユーザーの回答を自動投入します。</p><div class="button-grid">
        <button data-action="test-normal">通常テスト</button><button data-action="test-rush">コメント急増</button><button data-action="test-winner">正解演出テスト</button><button data-action="test-stop">テスト停止</button>
      </div><p class="status">状態：${state.simulator.enabled ? `稼働中 (${state.simulator.mode})` : '停止中'}</p></section>
      <section class="admin-card"><h2>手動コメント投入</h2><input id="user" value="テスト視聴者" placeholder="ユーザー名"><input id="answer" placeholder="ひらがな回答"><button data-action="comment">コメント送信</button></section>
    </main>`;
}

function render() {
  if (location.pathname === '/ranking') renderRanking();
  else if (location.pathname === '/admin') renderAdmin();
  else renderOverlay();
}

root.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const action = target.dataset.action;
  if (!action) return;
  const liveUrl = (document.querySelector<HTMLInputElement>('#liveUrl')?.value) ?? '';
  const user = (document.querySelector<HTMLInputElement>('#user')?.value) ?? 'テスト視聴者';
  const answer = (document.querySelector<HTMLInputElement>('#answer')?.value) ?? '';
  const actions: Record<string, () => Promise<void>> = {
    start: () => post('/api/admin/start', { liveUrl }), stop: () => post('/api/admin/stop'), skip: () => post('/api/admin/skip'), show: () => post('/api/admin/show-answer'),
    'test-normal': () => post('/api/admin/test/start', { mode: 'normal' }), 'test-rush': () => post('/api/admin/test/start', { mode: 'rush' }), 'test-winner': () => post('/api/admin/test/start', { mode: 'winner' }),
    'test-stop': () => post('/api/admin/test/stop'), comment: () => post('/api/test/comment', { user, answer }),
  };
  void actions[action]?.();
});

fetch('/api/game/state').then((res) => res.json()).then((next: GameState) => { state = next; render(); }).catch(render);
const events = new EventSource('/api/events');
events.onmessage = (event) => { state = JSON.parse(event.data) as GameState; render(); };
