#!/usr/bin/env node
/* 受控 mock LLM 上游（OpenAI 兼容 /v1/chat/completions）——hint 质量采样与降级链验证用。
 * 行为按 questionId 哈希确定性混合：88% 合法 JSON / 6% 纯文本 / 3% 空串 / 3% 缺字段；
 * 延迟 250–750ms。用法：node tools/acceptance/mock-upstream.js [port=15990] */
'use strict';
const http = require('http');
const PORT = parseInt(process.argv[2] || '15990', 10);
function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c);
  req.on('end', () => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-qwen3.5-9b' }] })); return;
    }
    let msgs = []; try { msgs = JSON.parse(b).messages || []; } catch (e) {}
    const sys = (msgs.find(m => m.role === 'system') || {}).content || '';
    const user = (msgs.find(m => m.role === 'user') || {}).content || '';
    /* 精灵台词请求（FAIRY_SYS 人设）：按事件关键词回复 [mood] 台词，含教学词、不泄题 */
    if (sys.includes('Pixie') || user.includes('BATTLEFIELD')) {
      let line = '[worried] Keep thinking about the pattern. Notice the timer and choose carefully!';
      if (/DEFEATED/.test(user)) line = '[proud] You won! Amazing English thinking out there! 🎉';
      else if (/CORRECTLY/.test(user)) line = '[proud] Great job! You remembered the verb form. Keep going!';
      else if (/WRONG/.test(user)) line = '[sad] Good try! Look at the sentence again — think about which verb form fits.';
      else if (/CHARGING/.test(user)) line = '[panic] Watch out! He is charging a skill — get ready to dodge!';
      else if (/POISONED/.test(user)) line = '[worried] You are poisoned! Heal soon and review the verb pattern meanwhile.';
      else if (/CRITICAL/.test(user)) line = '[panic] Your HP is low! Heal now, then focus on the question pattern.';
      else if (/FROZEN/.test(user)) line = '[worried] Stay calm! The quiz is frozen — review the verb forms in your head.';
      else if (/NEW quiz/.test(user)) line = '[thinking] Read the sentence first. What does the blank need here?';
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: line } }] }));
      }, 200);
      return;
    }
    const qidm = sys.match(/"questionId"\s*:\s*"([^"]+)"/);
    const qid = qidm ? qidm[1] : 'u' + (fnv(user) % 10000);
    const lm = user.match(/level-(\d+)/);
    const level = lm ? +lm[1] : 1;
    const km = sys.match(/"knowledge"\s*:\s*\[([^\]]*)\]/);
    const tp = km ? (km[1].split(',')[0].replace(/"/g, '').trim() || 'verb') : 'verb';
    const h = fnv(qid), roll = h % 100;
    let content;
    if (roll < 88) content = JSON.stringify({ mood: ['happy', 'worried', 'proud'][h % 3], hintLevel: level, teachingPoint: tp, text: 'Think about the pattern here. Compare the forms carefully before you choose. 🧚' });
    else if (roll < 94) content = 'Take it slow — read the sentence first, then decide what kind of word fits the blank. 📘';
    else if (roll < 97) content = '';
    else content = JSON.stringify({ mood: 'happy', hintLevel: level, teachingPoint: tp });
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
    }, 250 + (h % 500));
  });
});
srv.listen(PORT, '127.0.0.1', () => console.log('mock upstream on ' + PORT));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
