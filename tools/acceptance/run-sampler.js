#!/usr/bin/env node
/* v27 验收 · LLM 专项采样一体化 harness：
 * 起 mock 上游(15990) + 游戏服务器 8797（质量采样）与 8799（无上游 → 不可用探测）
 * → 运行 hint-metrics.js → 全部清理。用法：node tools/acceptance/run-sampler.js <out.json> [n=40] */
'use strict';
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.argv[2] || path.join(__dirname, 'hint-metrics.json');
const N = process.argv[3] || '40';
const env = (p, llm, logDir) => ({ ...process.env, PORT: String(p), LLM_PORT: String(llm), LLM_TIMEOUT_MS: '25000', LOG_DIR: logDir });
const mock = spawn(process.execPath, [path.join(__dirname, 'mock-upstream.js'), '15990'], { stdio: 'inherit' });
const s1 = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env: env(8797, 15990, path.join(OUT, '..', 'sampler-logdir')), stdio: 'ignore' });
const s2 = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], { env: env(8799, 15999, path.join(OUT, '..', 'unavail-logdir')), stdio: 'ignore' });
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let up = false;
  for (let i = 0; i < 30 && !up; i++) { try { const r = await fetch('http://127.0.0.1:8797/'); up = r.ok; } catch (e) {} if (!up) await wait(300); }
  if (!up) throw new Error('server 8797 not up');
  const child = spawn(process.execPath, [path.join(__dirname, 'hint-metrics.js'), '--base', 'http://127.0.0.1:8797', '--unavail-base', 'http://127.0.0.1:8799', '--n', String(N), '--out', OUT], { stdio: 'inherit' });
  child.on('exit', code => {
    try { mock.kill(); s1.kill(); s2.kill(); } catch (e) {}
    setTimeout(() => process.exit(code), 300);
  });
})().catch(e => { console.error('FATAL', e); try { mock.kill(); s1.kill(); s2.kill(); } catch (_) {} process.exit(1); });
