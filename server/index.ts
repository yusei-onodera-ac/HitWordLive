import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { calculateHitAndBlow, isValidHiraganaAnswer, maskWord, pointForAnswerCount } from '../shared/game.js';

type Phase = 'idle' | 'playing' | 'winner' | 'answer';
type AnswerHistory = { id: string; user: string; answer: string; hits: number; blows: number; at: string };
type WinnerState = { user: string; point: number; answer: string } | null;
type SimulatorState = { enabled: boolean; mode: 'normal' | 'rush' | 'winner'; liveUrl: string | null };
type ResponseLike = { writeHead: (code: number, headers?: Record<string, string>) => void; end: (body?: string) => void; write: (chunk: string) => void };
type RequestLike = { method?: string; url?: string; on: (event: string, cb: (chunk?: string) => void) => void };

const WORDS = ['こころ', 'にわとり', 'ひまわり', 'たぬき', 'あじさい', 'おにぎり', 'すいか', 'まつり', 'ゆうやけ'];
const SAMPLE_USERS = ['山田太郎', 'ねこ侍', 'ひまわり隊', 'Yuuファン', 'ことば博士', '夜更かし勢', '青空さん', 'コメント王'];
const SAMPLE_GUESSES = ['こころ', 'たぬき', 'さくら', 'すいか', 'まつり', 'ひかり', 'おにぎり', 'ひまわり', 'にわとり'];
const DB_PATH = 'hitwordlive.sqlite';
const clients = new Set<ResponseLike>();

let phase: Phase = 'idle';
let currentWord = WORDS[0];
let roundStartedAt = Date.now();
let history: AnswerHistory[] = [];
let validAnswerCount = 0;
let winner: WinnerState = null;
let liveUrl: string | null = null;
let simulator: SimulatorState = { enabled: false, mode: 'normal', liveUrl: null };
const lastAnswerAt = new Map<string, number>();
let roundTimer: NodeJS.Timeout | undefined;
let simulatorTimer: NodeJS.Timeout | undefined;

function sqlEscape(value: string) { return value.replaceAll("'", "''"); }
function query<T>(sql: string): T[] {
  const output = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) as T[] : [];
}
function execSql(sql: string) { execFileSync('sqlite3', [DB_PATH, sql]); }

execSql(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, youtube_name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT UNIQUE NOT NULL, length INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rankings (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, point INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS game_history (id INTEGER PRIMARY KEY AUTOINCREMENT, word_id INTEGER, winner_user_id INTEGER, point INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ng_users (id INTEGER PRIMARY KEY AUTOINCREMENT, youtube_name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS ng_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT UNIQUE NOT NULL);
`);
for (const word of WORDS) execSql(`INSERT OR IGNORE INTO words (word, length) VALUES ('${sqlEscape(word)}', ${[...word].length});`);

function rankingRange(range: 'daily' | 'monthly') {
  const where = range === 'daily' ? "date(r.created_at, 'localtime') = date('now', 'localtime')" : "strftime('%Y-%m', r.created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
  return query<{ name: string; point: number }>(`SELECT u.youtube_name as name, SUM(r.point) as point FROM rankings r JOIN users u ON u.id = r.user_id WHERE ${where} GROUP BY r.user_id ORDER BY point DESC, MIN(r.created_at) ASC LIMIT 10`);
}
function withRanks(rows: { name: string; point: number }[]) {
  let previousPoint: number | null = null;
  let rank = 0;
  return rows.map((row, index) => { if (row.point !== previousPoint) rank = index + 1; previousPoint = row.point; return { ...row, rank }; });
}
function getState() {
  const elapsed = Math.floor((Date.now() - roundStartedAt) / 1000);
  return {
    phase, liveUrl, simulator, wordMask: phase === 'playing' || phase === 'winner' ? maskWord(currentWord) : '',
    answer: phase === 'answer' || phase === 'winner' ? currentWord : null, length: [...currentWord].length,
    remainingSeconds: phase === 'playing' ? Math.max(0, 300 - elapsed) : 0, history: history.slice(0, 10), winner,
    rankings: { daily: withRanks(rankingRange('daily')), monthly: withRanks(rankingRange('monthly')) },
  };
}
function broadcast() {
  const payload = `data: ${JSON.stringify(getState())}\n\n`;
  for (const client of clients) client.write(payload);
}
function chooseWord() {
  const [row] = query<{ word: string }>('SELECT word FROM words ORDER BY RANDOM() LIMIT 1');
  currentWord = row?.word ?? WORDS[Math.floor(Math.random() * WORDS.length)];
}
function startRound() {
  chooseWord(); phase = 'playing'; roundStartedAt = Date.now(); history = []; winner = null; validAnswerCount = 0; lastAnswerAt.clear();
  clearTimeout(roundTimer); roundTimer = setTimeout(showAnswer, 300_000); broadcast();
}
function award(userName: string) {
  const point = pointForAnswerCount(validAnswerCount);
  execSql(`INSERT OR IGNORE INTO users (youtube_name) VALUES ('${sqlEscape(userName)}');`);
  const [user] = query<{ id: number }>(`SELECT id FROM users WHERE youtube_name = '${sqlEscape(userName)}' LIMIT 1`);
  execSql(`INSERT INTO rankings (user_id, point) VALUES (${user.id}, ${point});`);
  const [word] = query<{ id: number }>(`SELECT id FROM words WHERE word = '${sqlEscape(currentWord)}' LIMIT 1`);
  execSql(`INSERT INTO game_history (word_id, winner_user_id, point) VALUES (${word?.id ?? 'NULL'}, ${user.id}, ${point});`);
  winner = { user: userName, point, answer: currentWord };
}
function submitComment(user: string, answer: string) {
  if (phase !== 'playing') return;
  const isNgUser = query(`SELECT 1 FROM ng_users WHERE youtube_name = '${sqlEscape(user)}' LIMIT 1`).length > 0;
  const isNgWord = query(`SELECT 1 FROM ng_words WHERE instr('${sqlEscape(answer)}', word) > 0 LIMIT 1`).length > 0;
  const now = Date.now();
  if (isNgUser || isNgWord || now - (lastAnswerAt.get(user) ?? 0) < 10_000 || !isValidHiraganaAnswer(answer, [...currentWord].length)) return;
  lastAnswerAt.set(user, now); validAnswerCount += 1;
  const result = calculateHitAndBlow(currentWord, answer);
  history = [{ id: `${now}-${user}`, user, answer, hits: result.hits, blows: result.blows, at: new Date(now).toISOString() }, ...history].slice(0, 10);
  if (answer === currentWord) { phase = 'winner'; clearTimeout(roundTimer); award(user); broadcast(); setTimeout(startRound, 8_000); return; }
  broadcast();
}
function showAnswer() { if (phase === 'idle') return; phase = 'answer'; winner = null; clearTimeout(roundTimer); broadcast(); setTimeout(startRound, 8_000); }
function simulatorTick() {
  if (!simulator.enabled || phase !== 'playing') return;
  const user = SAMPLE_USERS[Math.floor(Math.random() * SAMPLE_USERS.length)];
  const candidates = SAMPLE_GUESSES.filter((word) => [...word].length === [...currentWord].length);
  let guess = candidates[Math.floor(Math.random() * candidates.length)] ?? currentWord;
  if ((simulator.mode === 'winner' && Math.random() > 0.65) || (simulator.mode === 'rush' && Math.random() > 0.92)) guess = currentWord;
  submitComment(user, guess);
}
function configureSimulator(enabled: boolean, mode: SimulatorState['mode'] = simulator.mode) {
  simulator = { enabled, mode, liveUrl: enabled ? 'https://www.youtube.com/watch?v=TEST_LIVE_MODE' : null };
  clearInterval(simulatorTimer); if (enabled) simulatorTimer = setInterval(simulatorTick, mode === 'rush' ? 900 : 1800); broadcast();
}
function json(res: ResponseLike, data: unknown) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
function readBody(req: RequestLike) {
  return new Promise<Record<string, unknown>>((resolve) => { let body = ''; req.on('data', (chunk = '') => { body += chunk; }); req.on('end', () => { try { resolve(body ? JSON.parse(body) as Record<string, unknown> : {}); } catch { resolve({}); } }); });
}
function serveStatic(pathname: string, res: ResponseLike) {
  const file = pathname === '/' || pathname === '/admin' || pathname === '/ranking' ? 'index.html' : pathname.slice(1);
  const full = join(process.cwd(), 'dist/public', file);
  if (!existsSync(full)) { res.writeHead(404); res.end('Not found'); return; }
  const type = extname(full) === '.css' ? 'text/css' : extname(full) === '.js' ? 'text/javascript' : 'text/html';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(readFileSync(full, 'utf8'));
}

createServer(async (req: RequestLike, res: ResponseLike) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); clients.add(res); res.write(`data: ${JSON.stringify(getState())}\n\n`); req.on('close', () => clients.delete(res)); return; }
  if (req.method === 'GET' && url.pathname === '/api/game/state') return json(res, getState());
  if (req.method === 'GET' && url.pathname === '/api/ranking') return json(res, getState().rankings);
  if (req.method === 'POST') {
    const body = await readBody(req);
    if (url.pathname === '/api/admin/login') return json(res, { ok: true, token: 'local-admin' });
    if (url.pathname === '/api/admin/start') { liveUrl = typeof body.liveUrl === 'string' ? body.liveUrl : null; startRound(); return json(res, getState()); }
    if (url.pathname === '/api/admin/stop') { phase = 'idle'; clearTimeout(roundTimer); broadcast(); return json(res, getState()); }
    if (url.pathname === '/api/admin/skip') { startRound(); return json(res, getState()); }
    if (url.pathname === '/api/admin/show-answer') { showAnswer(); return json(res, getState()); }
    if (url.pathname === '/api/admin/test/start') { configureSimulator(true, body.mode === 'rush' || body.mode === 'winner' ? body.mode : 'normal'); if (phase === 'idle') startRound(); return json(res, getState()); }
    if (url.pathname === '/api/admin/test/stop') { configureSimulator(false); return json(res, getState()); }
    if (url.pathname === '/api/test/comment') { submitComment(String(body.user ?? 'テスト視聴者'), String(body.answer ?? '')); return json(res, getState()); }
  }
  serveStatic(url.pathname, res);
}).listen(Number(process.env.PORT ?? 3000), () => console.log('HitWordLive listening on http://localhost:3000'));
