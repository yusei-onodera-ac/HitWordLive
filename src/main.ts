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

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!));
}

async function post(path: string, body: unknown = {}) {
  await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function spectacle(active: boolean) {
  const petals = Array.from({ length: 42 }, (_, i) => `<span class="petal" style="left:${(i * 29) % 100}%;animation-delay:${(i % 14) / 7}s;--r:${(i * 47) % 360}deg"></span>`).join('');
  const sparks = Array.from({ length: 12 }, (_, i) => `<span class="spark" style="left:${10 + ((i * 17) % 80)}%;top:${10 + ((i * 13) % 48)}%;animation-delay:${(i % 5) / 6}s"></span>`).join('');
  return `<div class="spectacle ${active ? 'is-active' : ''}" aria-hidden="true">${petals}${sparks}<div class="red-flash"></div></div>`;
}

function currentDisplay() {
  const latest = state.history[0];
  const length = state.length || 3;
  if (state.winner) return { chars: [...state.winner.answer], user: state.winner.user, label: '正解', result: `${length}hit 0blow`, mark: 'correct' };
  if (state.phase === 'answer' && state.answer) return { chars: [...state.answer], user: '', label: '時間切れ', result: '答え表示', mark: 'wrong' };
  if (latest) return { chars: [...latest.answer], user: latest.user, label: '不正解', result: `${latest.hits}hit ${latest.blows}blow`, mark: 'wrong' };
  return { chars: Array.from({ length }, () => ''), user: '', label: '', result: '', mark: 'none' };
}

function historyColumns() {
  const rows = state.history.slice(0, 10);
  return rows.map((item) => `<p><span>${escapeHtml(item.user)}：${escapeHtml(item.answer)}</span><b>${item.hits}hit ${item.blows}blow</b></p>`).join('');
}

function renderOverlay() {
  const display = currentDisplay();
  const time = formatTime(state.remainingSeconds);
  root.innerHTML = `
    <main class="overlay-stage ${display.mark === 'correct' ? 'is-correct' : ''}">
      ${spectacle(display.mark === 'correct')}
      <div class="stage-frame" aria-hidden="true"></div>
      <header class="game-header">
        <p>-視聴者参加型-</p>
        <h1>単語当てゲーム</h1>
        <p>単語版ヒット＆ブロー</p>
      </header>
      <section class="question-area">
        <div class="panel-title"><span></span><p class="prompt">単語を当てろ（${state.length || display.chars.length}文字）</p><span></span></div>
        <div class="answer-line">
          <div class="current-player meta-box ${display.user ? '' : 'is-empty'}"><span>回答者</span><strong>${display.user ? escapeHtml(display.user) : '待機中'}</strong></div>
          <div class="letter-row length-${display.chars.length}">
            ${display.chars.map((char) => `<div class="letter-box">${escapeHtml(char)}</div>`).join('')}
          </div>
          <div class="timer-box meta-box"><span>残り時間</span><strong>${time}</strong></div>
        </div>
        ${display.mark !== 'none' ? `<div class="judge ${display.mark}"><span>${display.label}</span><strong>${display.result}</strong></div>` : '<div class="judge-placeholder"></div>'}
        ${display.mark === 'wrong' ? '<div class="wrong-mark">×</div>' : ''}
        ${display.mark === 'correct' ? '<div class="correct-mark">〇</div>' : ''}
      </section>
      <section class="history-panel">
        ${state.winner ? `<div class="winner-strip"><span>解答履歴</span><strong>正解者　${escapeHtml(state.winner.user)}　${state.winner.point}ポイント獲得</strong></div>` : '<h2 class="history-title">解答履歴</h2>'}
        <div class="history-grid">${historyColumns()}</div>
      </section>
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
