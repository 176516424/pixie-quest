#!/usr/bin/env node
/* v27 验收 · 三组对照实验驱动（exp=none / static / llm）
 * 设计要点：
 * - 三组同种子(?seed=20261030) + 驱动侧固定题目序列（覆盖 pool 注入单题后调 nextQuestion）
 *   → 三组严格同题 60 道（d1/d2/d3 各 20，按题库顺序等距抽取，三组完全一致）
 * - 学生模型（可复核）：作答概率 = hash(qid|attempt) 映射，与组别无关；
 *     首答正确率基准 d1=0.70 / d2=0.50 / d3=0.35；
 *     重试增益（模拟参数，报告公开）：L1 提示后 +0.15，L2 +0.30，L3 +0.45（上限 0.95）
 *   → 每道题在任一组遇到时首答/重试概率相同，组间差异只来自「有无提示」
 * - 战斗资源每题重置注入（heroHP=100/heroMP=50/monHP=9999），三组一致，保证 60 题全部完成
 * - llm 组走 mock 上游（88% 合法 JSON / 6% 纯文本 / 3% 空串 / 3% 缺字段——确定性混合，
 *   按题号哈希分配，覆盖三条降级路径），并采集 hintStats（llmPerQuestion/cacheHit/fallback）
 * 产出：<PKG>/experiments/{none,static,llm}-run.json + summary.json + logdir/（/savelogs 原始日志）
 * 用法：node tools/acceptance/run-experiments.js <acceptance-pkg-dir>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const PKG = process.argv[2];
if (!PKG) { console.error('usage: node run-experiments.js <pkg>'); process.exit(2); }
const EXPDIR = path.join(PKG, 'experiments');
fs.mkdirSync(EXPDIR, { recursive: true });
const ROOT = path.join(__dirname, '..', '..');
const NCE_SHARED = require(path.join(ROOT, 'nce-shared.js'));

const BASE = 'http://127.0.0.1:8798';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DBGPORT = 9345, MOCKPORT = 15990, SVPORT = 8798;
const SEED = 20261030, NQ = 60;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- mock LLM 上游 ---------------- */
function startMock() {
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'mock-qwen3.5-9b' }] })); return;
      }
      let msgs = []; try { msgs = JSON.parse(body).messages || []; } catch (e) {}
      const sys = (msgs.find(m => m.role === 'system') || {}).content || '';
      const user = (msgs.find(m => m.role === 'user') || {}).content || '';
      const qidm = sys.match(/"questionId"\s*:\s*"([^"]+)"/);
      const qid = qidm ? qidm[1] : 'unknown';
      const lm = user.match(/level-(\d+)/);
      const level = lm ? +lm[1] : 1;
      const km = sys.match(/"knowledge"\s*:\s*\[([^\]]*)\]/);
      const tp = km ? (km[1].split(',')[0].replace(/"/g, '').trim() || 'verb') : 'verb';
      const h = fnv(qid);
      const roll = h % 100;
      let content;
      if (roll < 88) {
        content = JSON.stringify({ mood: ['happy','worried','proud'][h % 3], hintLevel: level, teachingPoint: tp, text: 'Think about the pattern here. Compare the forms carefully before you choose. 🧚' });
      } else if (roll < 94) {
        content = 'Take it slow — read the sentence first, then decide what kind of word fits the blank. 📘';
      } else if (roll < 97) {
        content = '';
      } else {
        content = JSON.stringify({ mood: 'happy', hintLevel: level, teachingPoint: tp });
      }
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
      }, 250 + (h % 500));
    });
  });
  return new Promise(r => srv.listen(MOCKPORT, '127.0.0.1', () => r(srv)));
}
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
/* 学生模型：与组别无关，只依赖 (qid, attempt) */
const BASE_P = { 1: 0.70, 2: 0.50, 3: 0.35 };
const BOOST = [0.15, 0.30, 0.45];   /* attempt2/3/4（对应 L1/L2/L3 提示后） */
function passProb(qid, attempt, d) {
  if (attempt <= 1) return BASE_P[d] || 0.5;
  return Math.min(0.95, (BASE_P[d] || 0.5) + BOOST[Math.min(attempt - 2, BOOST.length - 1)]);
}
function studentCorrect(qid, attempt, d) {
  return (fnv(qid + '|' + attempt) / 4294967296) < passProb(qid, attempt, d);
}

/* ---------------- 极简 CDP 客户端 ---------------- */
let ws, msgId = 0; const pending = new Map(); const cdpEvents = [];
function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function cdpConnect() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${DBGPORT}/json/version`); if (r.ok) break; } catch (e) {}
    await sleep(200);
  }
  const t = await (await fetch(`http://127.0.0.1:${DBGPORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method) cdpEvents.push(d);
  };
  await send('Page.enable'); await send('Runtime.enable');
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr, ms = 12000, label = '') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); }
  throw new Error('等待超时: ' + label);
}
/* 等待输入被受理：非 busy、未冻结（canAnswer 守卫会静默拒绝冻结期的点击）、有可用选项 */
async function waitClickable() {
  await waitFor(`!busy && Date.now()>=(typeof frozenUntil!=='undefined'?frozenUntil:0) && monHP>0 && gameOver===false
    && document.querySelectorAll('.opt').length===4 && [...document.querySelectorAll('.opt')].some(b=>!b.disabled)`, 15000, '可作答');
}
/* 带受理校验的点击：点击后 400ms 内必须出现 ok/bad 标记或进入 busy（攻击动画），
   否则视为被守卫拒绝（冻结/空档），等待后重试，杜绝「幻影作答」混入数据 */
async function verifiedClick(pickExpr) {
  for (let k = 0; k < 5; k++) {
    const cls = await ev(`(function(){ const b=${pickExpr}; if(!b) return 'NOBTN'; if(b.disabled) return 'DISABLED'; b.click(); return b.className; })()`);
    if (cls === 'NOBTN') return false;
    const ok = await waitFor(`busy || [...document.querySelectorAll('.opt')].some(b=>b.classList.contains('ok')||b.classList.contains('bad'))`, 1500, '受理').catch(() => false);
    if (ok) return true;
    await waitClickable();
    await sleep(150);
  }
  return false;
}

/* ---------------- 题目序列（三组一致） ---------------- */
function fixedQuestions() {
  const Q = NCE_SHARED.QUESTIONS;
  const out = { 1: [], 2: [], 3: [] };
  for (const d of [1, 2, 3]) {
    const pool = Q.filter(q => q.d === d);
    const step = Math.max(1, Math.floor(pool.length / 20));
    for (let i = 0; out[d].length < 20 && i < pool.length; i += step) out[d].push(pool[i].id);
  }
  /* 交错排列 d1/d2/d3，接近真实游玩分布 */
  const seq = [];
  for (let i = 0; i < 20; i++) { seq.push(out[1][i], out[2][i], out[3][i]); }
  return seq;
}

/* ---------------- 单组实验 ---------------- */
async function runGroup(exp, qids) {
  /* 先落到同源页面（about:blank 是 opaque origin，直接 clear localStorage 会抛异常） */
  await send('Page.navigate', { url: BASE + '/' });
  await waitFor(`document.readyState==='complete'`, 15000, '落地页');
  await ev(`localStorage.clear(); location.href='${BASE}/?seed=${SEED}&exp=${exp}'; "nav"`);
  await waitFor(`document.readyState==='complete' && document.querySelectorAll('.lvnode').length>0`, 15000, '地图');
  await ev(`startLevel(0)`);
  await waitFor(`document.querySelectorAll('.opt').length===4`, 8000, '首题');
  const records = [];
  for (let i = 0; i < qids.length; i++) {
    const qid = qids[i];
    const setup = await ev(`(function(){
      const q=QUESTIONS.find(x=>x.id==='${qid}'); if(!q) return 'NOQ';
      heroHP=100; heroMP=50; monHP=9999; gameOver=false;
      pool=[{q,i:0}]; askedIdx=[]; nextQuestion(); return 'OK';
    })()`);
    if (setup !== 'OK') { records.push({ qid, error: setup }); continue; }
    await waitFor(`document.querySelectorAll('.opt').length===4 && !busy`, 8000, '出题 ' + qid);
    await sleep(120);
    const attempts = [], hints = [];
    let attempt = 0;
    while (attempt < 4) {
      attempt++;
      await waitClickable();
      const roll = studentCorrect(qid, attempt, await ev('curQ.d'));
      if (roll) {
        const accepted = await verifiedClick(`[...document.querySelectorAll('.opt')].find(b=>b.textContent===curQ.o[curQ.a]&&!b.disabled)`);
        attempts.push({ n: attempt, correct: true, accepted });
      } else {
        const wrongTxt = await ev(`(function(){
          const bs=[...document.querySelectorAll('.opt')].filter(b=>b.textContent!==curQ.o[curQ.a]&&!b.disabled);
          if(!bs.length) return null; return bs[0].textContent;
        })()`);
        if (wrongTxt === null) { /* 没有可点的错误项了（全禁用）→ 等重启用后点正确项 */
          await waitFor(`[...document.querySelectorAll('.opt')].some(b=>!b.disabled)`, 8000, '重启用');
          const accepted = await verifiedClick(`[...document.querySelectorAll('.opt')].find(b=>b.textContent===curQ.o[curQ.a]&&!b.disabled)`);
          attempts.push({ n: attempt, correct: true, forced: true, accepted });
          break;
        }
        const accepted = await verifiedClick(`[...document.querySelectorAll('.opt')].find(b=>b.textContent==='${wrongTxt.replace(/'/g, "\\'")}'&&!b.disabled)`);
        attempts.push({ n: attempt, correct: false, picked: wrongTxt, accepted });
      }
      if (attempts[attempts.length - 1].correct) break;
      /* 答错后：none 组自动下一题（本题作答结束，跳出重试循环）；
         static/llm 组等提示条出现再重试 */
      if (exp === 'none') {
        await waitFor(`document.querySelectorAll('.opt').length===4 && !busy && [...document.querySelectorAll('.opt')].every(b=>!b.classList.contains('bad'))`, 10000, 'none 下一题');
        break;
      } else {
        const hintShown = await waitFor(`document.getElementById('hintBar').style.display==='block' && document.getElementById('hintBar').querySelector('.htext').textContent.length>0`, 15000, '提示条').catch(() => false);
        if (hintShown) {
          const h = await ev(`(function(){ const b=document.getElementById('hintBar');
            return {src:b.querySelector('.hsrc').textContent, text:b.querySelector('.htext').textContent.slice(0,120)}; })()`);
          hints.push({ afterAttempt: attempt, src: h.src, text: h.text });
        }
        await waitFor(`[...document.querySelectorAll('.opt')].some(b=>!b.disabled&&b.textContent!==curQ.o[curQ.a]) || [...document.querySelectorAll('.opt')].some(b=>!b.disabled)`, 15000, '选项重启用');
        await sleep(200);
      }
    }
    /* 等本题流程走完（题面切换或进入下一题渲染） */
    await waitFor(`!busy`, 10000, '回合结束');
    const rec = { qid, d: await ev('curQ.d'), attempts, hints, questionSwitched: false };
    records.push(rec);
  }
  /* 统计与日志收集 */
  const hintStats = await ev(`JSON.stringify(hintStats)`);
  const playerLog = await ev(`JSON.parse(localStorage.getItem('nce_player_log')||'[]')`);
  /* 上报 /savelogs（tag v3 生产路径） */
  let upload = null;
  try {
    const res = await fetch(BASE + '/savelogs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'v3', sid: 'v27acc-' + exp + '-' + SEED, exp, seed: SEED, model: NCE_SHARED.LLM_MODEL, sysVer: 3,
        fairy: [], player: playerLog, hintStats: JSON.parse(hintStats) }) });
    upload = { status: res.status, body: await res.json() };
  } catch (e) { upload = { error: String(e.message || e) }; }
  return { exp, records, hintStats: JSON.parse(hintStats), playerLogCount: playerLog.length, upload };
}

function summarize(run) {
  /* 只统计被游戏受理的作答（accepted!==false），冻结期被守卫拒绝的点击不计入 */
  const first = run.records.filter(r => r.attempts && r.attempts.some(a => a.accepted !== false));
  const total = first.length;
  const firstCorrect = first.filter(r => r.attempts[0].correct && r.attempts[0].accepted !== false).length;
  const retried = first.filter(r => r.attempts.some(a => a.correct && a.accepted !== false && a.n > 1));
  const retrySolved = retried.filter(r => r.attempts.some(a => a.correct && a.accepted !== false && a.n > 1)).length;
  const attemptsTotal = first.reduce((s, r) => s + r.attempts.filter(a => a.accepted !== false).length, 0);
  const hintLat = run.playerLogCount ? null : null;
  return {
    exp: run.exp, sampleCount: total,
    firstCorrectRate: total ? +(100 * firstCorrect / total).toFixed(2) : 0,
    retriedCount: retried.length,
    retrySolvedRate: retried.length ? +(100 * retrySolved / retried.length).toFixed(2) : null,
    avgAttemptsPerQuestion: total ? +(attemptsTotal / total).toFixed(3) : 0,
    hintStats: run.hintStats
  };
}

(async () => {
  console.log('[1] mock upstream :' + MOCKPORT);
  const mock = await startMock();
  console.log('[2] game server :' + SVPORT);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
    env: { ...process.env, PORT: String(SVPORT), LLM_PORT: String(MOCKPORT), LLM_TIMEOUT_MS: '25000', LOG_DIR: path.join(EXPDIR, 'logdir') },
    stdio: 'ignore'
  });
  await sleep(1200);
  console.log('[3] chrome headless :' + DBGPORT);
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBGPORT}`, '--window-size=1280,900',
    `--user-data-dir=${path.join(require('os').tmpdir(), 'v27-exp-chrome')}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  await cdpConnect();
  const qids = fixedQuestions();
  fs.writeFileSync(path.join(EXPDIR, 'fixed-question-sequence.json'), JSON.stringify(qids, null, 1));
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const groups = only || ['none', 'static', 'llm'];
  const runs = [];
  for (const exp of groups) {
    console.log('[exp] ' + exp + ' start');
    const t0 = Date.now();
    const run = await runGroup(exp, qids);
    run.elapsedMs = Date.now() - t0;
    runs.push(run);
    fs.writeFileSync(path.join(EXPDIR, exp + '-run.json'), JSON.stringify(run, null, 1));
    const s = summarize(run);
    console.log(`[exp] ${exp} done in ${(run.elapsedMs / 1000).toFixed(0)}s — 样本 ${s.sampleCount}，首答正确率 ${s.firstCorrectRate}%，重试 ${s.retriedCount} 次（解决率 ${s.retrySolvedRate}%)`);
  }
  /* 汇总：三组 + 学生模型说明（ONLY 部分重跑时与已有 summary 合并） */
  const sumPath = path.join(EXPDIR, 'summary.json');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(sumPath, 'utf8')); } catch (e) {}
  const merged = { ...(prev.groups ? Object.fromEntries(prev.groups.map(g => [g.exp, g])) : {}),
                   ...Object.fromEntries(runs.map(g => [g.exp, summarize(g)])) };
  const summary = { generatedAt: new Date().toISOString(), seed: SEED, questionCount: qids.length,
    studentModel: { base: BASE_P, boostByAttempt: BOOST, note: '作答概率=hash(qid|attempt)映射，与组别无关；增益为模拟参数' },
    groups: ['none', 'static', 'llm'].filter(e => merged[e]).map(e => merged[e]) };
  fs.writeFileSync(sumPath, JSON.stringify(summary, null, 1));
  console.log('SUMMARY ' + JSON.stringify(summary.groups.map(g => ({ exp: g.exp, n: g.sampleCount, first: g.firstCorrectRate, retry: g.retrySolvedRate }))));
  try { ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { srv.kill(); } catch (e) {}
  try { mock.close(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.error('FATAL', e); try { process.exit(1); } catch (_) {} process.exit(1); });
