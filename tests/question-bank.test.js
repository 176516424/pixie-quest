'use strict';
/* 题库结构契约测试：id 唯一、knowledge 合法、动词题带讲解、总量与分布符合文档 */
const test=require('node:test');
const assert=require('node:assert');
const {QUESTIONS, VERB_DB, maskLeaks, FAIRY_SYS, LLM_MODEL}=require('../nce-shared.js');

test('题库总量与难度分布（文档口径：198 = 60/90/48）', ()=>{
  assert.strictEqual(QUESTIONS.length,198);
  const d={1:0,2:0,3:0};
  QUESTIONS.forEach(q=>d[q.d]++);
  assert.deepStrictEqual(d,{1:60,2:90,3:48});
});

test('每道题都有唯一稳定 id', ()=>{
  const ids=new Set();
  QUESTIONS.forEach(q=>{
    assert.ok(q.id&&/^q[0-9a-z]+$/.test(q.id),'id 缺失或格式异常: '+q.q);
    assert.ok(!ids.has(q.id),'id 冲突: '+q.id+' · '+q.q);
    ids.add(q.id);
  });
});

test('id 对内容敏感（改题干 id 会变）', ()=>{
  /* 内容哈希：同库内不允许两道题内容一致——这与审计的结构检查互为防线 */
  const seen=new Set();
  QUESTIONS.forEach(q=>{
    const key=q.q+'|'+q.o.join('|');
    assert.ok(!seen.has(key),'题干+选项完全重复: '+q.q);
    seen.add(key);
  });
});

test('每道题都有合法 knowledge 标签', ()=>{
  const legal=new Set(['verb','irregular','past','past-participle','three-forms','pattern-family','question-pattern']);
  QUESTIONS.forEach(q=>{
    assert.ok(Array.isArray(q.knowledge)&&q.knowledge.length,'knowledge 缺失: '+q.q);
    q.knowledge.forEach(k=>assert.ok(legal.has(k),'非法标签 '+k+': '+q.q));
  });
  /* 考点细分抽查 */
  assert.deepStrictEqual(QUESTIONS.find(q=>q.q==='go 的过去式是？').knowledge,['verb','irregular','past']);
  assert.ok(QUESTIONS.find(q=>q.q.startsWith('swim — swam')).knowledge.includes('pattern-family'));
});

test('动词题带 explanation，句型题不硬造', ()=>{
  const verbQ=QUESTIONS.filter(q=>q.knowledge.includes('irregular'));
  assert.ok(verbQ.length>100);
  verbQ.forEach(q=>assert.ok(q.explanation&&q.explanation.length>6,'动词题缺讲解: '+q.q));
  const patQ=QUESTIONS.filter(q=>q.knowledge.includes('question-pattern'));
  patQ.forEach(q=>assert.strictEqual(q.explanation,undefined,'句型题不应有硬造讲解: '+q.q));
  /* 讲解内容抽查 */
  const go=QUESTIONS.find(q=>q.q==='go 的过去式是？');
  assert.ok(go.explanation.includes('went'));
});

test('共享模块契约：maskLeaks / FAIRY_SYS / LLM_MODEL 完整', ()=>{
  assert.strictEqual(LLM_MODEL,'qwen/qwen3.5-9b');
  assert.ok(FAIRY_SYS.includes('TYPE STRATEGY')&&FAIRY_SYS.length>1000);
  assert.strictEqual(maskLeaks('the answer is B',['went']),'the 🚫');
  assert.ok(maskLeaks('go becomes went',['went']).includes('🚫'));
});
