'use strict';
/* ================================================================
   hint-engine.test.js — v27 第 1 批分级提示引擎（HINT-01~06）
================================================================ */
const test = require('node:test');
const assert = require('node:assert');
const NCE = require('../nce-shared.js');
const HINT = require('../src/hint-engine.js');

const Q = NCE.QUESTIONS;
const VERB_DB = NCE.VERB_DB;
/* 与 game-core.buildMaskOpts 同构的泄题名单：正确项原文 + 题干/选项中的动词三形 */
function maskOpts(snap){
  const opts=[];
  if(snap.correct) opts.push(snap.correct);
  const words=(snap.q+' '+snap.o.join(' ')).toLowerCase().match(/[a-z][a-z'-]{1,}/g)||[];
  VERB_DB.forEach(v=>{
    if(words.indexOf(String(v[0]).toLowerCase())>=0) opts.push(String(v[1]),String(v[2]));
  });
  return opts;
}
function leaks(text, names){
  const t=String(text);
  return (names||[]).filter(w=>{
    if(!w||w.length<2) return false;
    if(/^[A-Za-z][A-Za-z'\- ]{1,}$/.test(w)) return new RegExp('\\b'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(t);
    return t.indexOf(w)>=0;
  });
}

test('HINT-04 allowedHintLevel 单调有界，attempt>=3 后不再升级', () => {
  assert.strictEqual(HINT.allowedHintLevel(1), 1);
  assert.strictEqual(HINT.allowedHintLevel(2), 2);
  assert.strictEqual(HINT.allowedHintLevel(3), 3);
  assert.strictEqual(HINT.allowedHintLevel(5), 3);
  assert.strictEqual(HINT.allowedHintLevel(0), 1);
  assert.strictEqual(HINT.allowedHintLevel(undefined), 1);
  assert.strictEqual(HINT.nextHintLevel(1), 2);
  assert.strictEqual(HINT.nextHintLevel(2), 3);
  assert.strictEqual(HINT.nextHintLevel(3), null);
});

test('HINT-01 staticHint 全题库 L1/L2 文案零泄题', () => {
  let checked=0;
  for(const q of Q){
    const snap={q:q.q, o:q.o.map(String), correct:String(q.o[q.a])};
    const names=maskOpts(snap);
    for(const lv of [1,2]){
      const h=HINT.staticHint(q, lv);
      assert.ok(h && h.text, 'L'+lv+' 提示缺失: '+q.q);
      assert.strictEqual(h.hintLevel, lv);
      assert.ok(!leaks(h.text, names).length, 'L'+lv+' 泄题 '+q.q+' → '+h.text);
      checked++;
    }
  }
  assert.ok(checked >= Q.length*2, '覆盖两级别 × 全题库: '+checked);
});

test('HINT-01 staticHint L3 按错误项生成针对性讲解且零泄题', () => {
  for(const q of Q){
    const snap={q:q.q, o:q.o.map(String), correct:String(q.o[q.a])};
    const names=maskOpts(snap);
    const wrong=String(q.o[(q.a+1)%4]);
    const h=HINT.staticHint(q, 3, wrong);
    assert.ok(h && h.text, 'L3 缺失: '+q.q);
    assert.strictEqual(h.hintLevel, 3);
    assert.strictEqual(h.mood, 'sad');
    /* L3 允许描述「你选的形式」，但绝不能提到正确项原文 */
    assert.ok(!leaks(h.text, [snap.correct]).length, 'L3 泄正确项 '+q.q+' → '+h.text);
  }
});

test('HINT-01 staticHint 边界：级别越界/空题返回 null', () => {
  assert.strictEqual(HINT.staticHint(null, 1), null);
  assert.strictEqual(HINT.staticHint({q:'x'}, 0), null);
  assert.strictEqual(HINT.staticHint({q:'x'}, 4), null);
});

test('HINT-02 validateHintOutput 非法输入全部拒绝并给原因', () => {
  const M={happy:1,love:1,proud:1,worried:1,panic:1,sad:1,angry:1,surprised:1,sleepy:1};
  const ok={mood:'worried',hintLevel:2,teachingPoint:'irregular-past',text:'Compare the last two forms.'};
  assert.strictEqual(HINT.validateHintOutput(ok,{moods:M}).ok, true);
  const bad=[null, 'str', [], {}, {...ok,mood:''}, {...ok,mood:'nope'}, {...ok,hintLevel:0},
             {...ok,hintLevel:4}, {...ok,hintLevel:'x'}, {...ok,teachingPoint:'  '},
             {...ok,text:''}, {...ok,text:'x'.repeat(401)}];
  const reasons=bad.map(b=>{ const r=HINT.validateHintOutput(b,{moods:M}); return r.ok===false?r.reason:('UNEXPECTED-OK:'+JSON.stringify(b).slice(0,50)); });
  assert.deepStrictEqual(reasons, ['not-an-object','not-an-object','not-an-object','mood-missing','mood-missing','mood-illegal:nope','hintLevel-out-of-range','hintLevel-out-of-range','hintLevel-out-of-range','teachingPoint-empty','text-empty','text-too-long']);
});

test('HINT-02 validateHintOutput 输出值规范：mood 小写化、数值化', () => {
  const r=HINT.validateHintOutput({mood:'Worried',hintLevel:'2',teachingPoint:'tp',text:' hi '});
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.value, {mood:'worried',hintLevel:2,teachingPoint:'tp',text:'hi'});
});

test('HINT-03 parseLLMHintOutput 容忍包裹与杂文本，非 JSON 返回 null', () => {
  const inner='{"mood":"happy","hintLevel":1,"teachingPoint":"past","text":"Think about the past."}';
  assert.deepStrictEqual(HINT.parseLLMHintOutput(inner), JSON.parse(inner));
  assert.deepStrictEqual(HINT.parseLLMHintOutput('```json\n'+inner+'\n```'), JSON.parse(inner));
  assert.deepStrictEqual(HINT.parseLLMHintOutput('Sure! '+inner+' hope it helps'), JSON.parse(inner));
  assert.strictEqual(HINT.parseLLMHintOutput(''), null);
  assert.strictEqual(HINT.parseLLMHintOutput('no json here'), null);
  assert.strictEqual(HINT.parseLLMHintOutput('{broken json}'), null);
  assert.strictEqual(HINT.parseLLMHintOutput(null), null);
});

test('HINT-05 buildHintContext 摘要字段齐全且 attempt 越界收敛', () => {
  const q=Q[0];
  const ctx=HINT.buildHintContext(q, 5, ['goed','eated'], {recentWeaknesses:['pattern-family']});
  assert.strictEqual(ctx.questionId, q.id);
  assert.strictEqual(ctx.attempt, 5);
  assert.strictEqual(ctx.allowedHintLevel, 3);
  assert.deepStrictEqual(ctx.wrongChoices, ['goed','eated']);
  assert.deepStrictEqual(ctx.knowledge, q.knowledge);
  assert.deepStrictEqual(ctx.recentWeaknesses, ['pattern-family']);
  assert.deepStrictEqual(ctx.masteredRecently, []);
  assert.strictEqual(HINT.buildHintContext(null, 1, []), null);
});

test('HINT-06 缓存键稳定：同参数同键，异参数异键', () => {
  assert.strictEqual(HINT.hintCacheKey('q1', 2, 2), 'q1|2|2');
  assert.strictEqual(HINT.hintCacheKey('q1', 2, 2), HINT.hintCacheKey('q1', 2, 2));
  assert.notStrictEqual(HINT.hintCacheKey('q1', 2, 2), HINT.hintCacheKey('q1', 3, 2));
  assert.notStrictEqual(HINT.hintCacheKey('q1', 2, 2), HINT.hintCacheKey('q1', 2, 3));
  assert.notStrictEqual(HINT.hintCacheKey('q1', 2, 2), HINT.hintCacheKey('q2', 2, 2));
});

test('HINT-03 HINT_SYS：级别受钳制且输出协议含 JSON 要求', () => {
  assert.ok(HINT.HINT_SYS(1).includes('"hintLevel":1'));
  assert.ok(HINT.HINT_SYS(2).includes('"hintLevel":2'));
  assert.ok(HINT.HINT_SYS(9).includes('"hintLevel":3'), '越界钳到 3');
  assert.ok(HINT.HINT_SYS(2, {questionId:'q1',attempt:2}).includes('LEARNER STATE'));
});

test('HINT-03 shouldCallLLM 调度策略：提示/出题/答错走 LLM，普通事件本地', () => {
  assert.strictEqual(HINT.shouldCallLLM('hint'), 'llm');
  assert.strictEqual(HINT.shouldCallLLM('quiz-new'), 'llm');
  assert.strictEqual(HINT.shouldCallLLM('quiz-wrong'), 'llm');
  assert.strictEqual(HINT.shouldCallLLM('quiz-correct'), 'local');
  assert.strictEqual(HINT.shouldCallLLM('heartbeat'), 'local');
  assert.strictEqual(HINT.shouldCallLLM('unknown'), 'local');
});
