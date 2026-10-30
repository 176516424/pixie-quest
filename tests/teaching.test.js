'use strict';
/* ================================================================
   teaching.test.js — V28 批次 C 教学闭环纯逻辑（TCH-01~14）
================================================================ */
const test = require('node:test');
const assert = require('node:assert');
const NCE = require('../nce-shared.js');
const TEACH = require('../src/teaching.js');

const Q = NCE.QUESTIONS;
const byId = id => Q.find(x=>x.id===id);
/* 固定样题（题库真实数据，audit 通过） */
const goPast   = byId('q4uwq8y');               /* go 的过去式是？ went/goed/gone/goes */
const patternQ = byId('qtx8b6q');               /* "Can you help me?" 是在向别人？ */

/* ---------- C1 错因诊断 ---------- */
test('TCH-01 三形混淆：选了本动词三形之一的错误槽位', ()=>{
  const d=TEACH.diagnoseError(goPast,'gone');            /* gone 是 go 的过去分词，非过去式 */
  assert.strictEqual(d.category,'三形混淆');
  assert.strictEqual(d.basis,'form-slot');
  const d2=TEACH.diagnoseError(goPast,'go');
  assert.strictEqual(d2.category,'三形混淆');
});

test('TCH-02 拼写混淆：过度规则化（goed）与近似拼写两条路径', ()=>{
  const d=TEACH.diagnoseError(goPast,'goed');
  assert.strictEqual(d.category,'拼写混淆');
  assert.strictEqual(d.basis,'affix-overgeneralization');
  const d2=TEACH.diagnoseError(goPast,'gent');           /* 与 went 编辑距离 1 */
  assert.strictEqual(d2.category,'拼写混淆');
  assert.strictEqual(d2.basis,'near-spelling');
});

test('TCH-03 词义不清：选项是另一个动词的合法三形', ()=>{
  const d=TEACH.diagnoseError(goPast,'ate');             /* eat 的过去式 */
  assert.strictEqual(d.category,'词义不清');
  assert.match(d.basis,/^other-verb-form:/);
});

test('TCH-04 句型误判：句型题答错归句型误判', ()=>{
  const wrong=patternQ.o[(patternQ.a+1)%patternQ.o.length];
  const d=TEACH.diagnoseError(patternQ,wrong);
  assert.strictEqual(d.category,'句型误判');
  assert.strictEqual(d.basis,'pattern-question');
});

test('TCH-05 证据不足返回未知：随机词/非法输入', ()=>{
  assert.strictEqual(TEACH.diagnoseError(goPast,'banana').category,'未知');
  assert.strictEqual(TEACH.diagnoseError(null,'x').category,'未知');
  assert.strictEqual(TEACH.diagnoseError(goPast,'').category,'未知');
  assert.strictEqual(TEACH.diagnoseError({q:'go 的过去式是？'},'x').category,'未知');  /* 无 a/o */
});

test('TCH-06 类别与题目类型兼容性校验', ()=>{
  assert.strictEqual(TEACH.isCategoryCompatible(patternQ,'句型误判'),true);
  assert.strictEqual(TEACH.isCategoryCompatible(patternQ,'三形混淆'),false);
  assert.strictEqual(TEACH.isCategoryCompatible(goPast,'句型误判'),false);
  assert.strictEqual(TEACH.isCategoryCompatible(goPast,'三形混淆'),true);
  assert.strictEqual(TEACH.isCategoryCompatible(goPast,'未知'),true);
  assert.strictEqual(TEACH.isCategoryCompatible(goPast,'不存在类别'),false);
});

test('TCH-07 诊断全题库扫描：输出必须在受限闭集内且不包含正确答案原文', ()=>{
  let n=0;
  for(const q of Q){
    if(typeof q.a!=='number'||!Array.isArray(q.o)) continue;
    const correct=q.o[q.a];
    for(const o of q.o){
      if(o===correct) continue;
      const d=TEACH.diagnoseError(q,o);
      assert.ok(TEACH.DIAG_CATEGORIES.includes(d.category),'非法类别 '+d.category);
      /* 诊断结果只含类别与规则名，绝不能携带答案原文 */
      const s=JSON.stringify(d);
      if(correct.length>=3&&!/^[A-Za-z]{2,}$/.test(correct)) assert.ok(!s.includes(correct),'诊断泄答案: '+s);
      n++;
    }
  }
  assert.ok(n>500,'扫描样本量异常: '+n);
});

/* ---------- C2 学习者摘要 ---------- */
const ev=(qid,phase,ok,knowledge,t)=>({qid,phase,ok,knowledge:knowledge||[],t});

test('TCH-08 摘要：最近仍错的题进 weaknesses，错过但最近对的进 masteredRecently', ()=>{
  const events=[
    ev('q1','first',false,['past'],1000),
    ev('q1','retry',false,['past'],2000),      /* q1 最近仍错 → 弱点 */
    ev('q2','first',false,['past'],3000),
    ev('q2','retry',true,['past'],4000),       /* q2 错过但最近对 → 掌握 */
    ev('q3','first',true,['past'],5000),       /* 一次就对 → 都不进 */
  ];
  const s=TEACH.buildLearnerSummary(events);
  assert.deepStrictEqual(s.recentWeaknesses.map(x=>x.qid),['q1']);
  assert.strictEqual(s.recentWeaknesses[0].wrong,2);
  assert.deepStrictEqual(s.masteredRecently,['q2']);
});

test('TCH-09 摘要排序与容量上限：错误多者优先、同错数新者优先、cap 截断', ()=>{
  const events=[
    ev('a','first',false,[],1000),
    ev('a','retry',false,[],1100),             /* 错 2 次 */
    ev('b','first',false,[],5000),             /* 错 1 次但更新 */
    ev('c','first',false,[],2000),
    ev('d','first',false,[],3000),
    ev('e','first',false,[],4000),
    ev('f','first',false,[],6000),             /* cap=5 时 f(b 相同错数更新) 挤掉 c */
  ];
  const s=TEACH.buildLearnerSummary(events,{cap:5});
  assert.strictEqual(s.recentWeaknesses.length,5);
  assert.strictEqual(s.recentWeaknesses[0].qid,'a');        /* 错 2 次最优先 */
  assert.ok(!s.recentWeaknesses.map(x=>x.qid).includes('c'),'最旧且错最少的应被截断');
});

test('TCH-10 清空记录后旧画像不串入：空事件流 → 空摘要', ()=>{
  const s=TEACH.buildLearnerSummary([]);
  assert.deepStrictEqual(s.recentWeaknesses,[]);
  assert.deepStrictEqual(s.masteredRecently,[]);
  /* pushLearnerEvent 对非法事件不产生脏数据 */
  let arr=TEACH.pushLearnerEvent([],null);
  arr=TEACH.pushLearnerEvent(arr,{qid:'',phase:'first',ok:true});
  arr=TEACH.pushLearnerEvent(arr,ev('q1','first',true,[],1));
  assert.strictEqual(arr.length,1);
  /* phase 必须按值规范化保留：retry/review 不得被强制回落成 first */
  arr=TEACH.pushLearnerEvent(arr,ev('q2','retry',true,[],2));
  arr=TEACH.pushLearnerEvent(arr,ev('q3','review',false,[],3));
  arr=TEACH.pushLearnerEvent(arr,ev('q4','不存在的阶段',true,[],4));
  assert.strictEqual(arr[1].phase,'retry');
  assert.strictEqual(arr[2].phase,'review');
  assert.strictEqual(arr[3].phase,'first');
});

test('TCH-11 事件历史上限 500 条（保留最近）', ()=>{
  let arr=[];
  for(let i=0;i<600;i++) arr=TEACH.pushLearnerEvent(arr,ev('q'+i,'first',true,[],i));
  assert.strictEqual(arr.length,500);
  assert.strictEqual(arr[0].qid,'q100');
});

/* ---------- C3 L4 答后讲解门禁 ---------- */
test('TCH-12 L4 门禁：结算前一律不放行，结算后才放行', ()=>{
  assert.strictEqual(TEACH.canShowL4('in-question'),false);
  assert.strictEqual(TEACH.canShowL4('settled'),true);
  assert.strictEqual(TEACH.canShowL4(''),false);
  assert.strictEqual(TEACH.canShowL4(undefined),false);
});

test('TCH-13 L4 文本：优先题库审计讲解，无讲解退回静态标签，不现场编造', ()=>{
  const bank=TEACH.l4Text(goPast);
  assert.strictEqual(bank.source,'bank');
  assert.ok(bank.text.includes('went'));
  const noExp=Object.assign({},goPast); delete noExp.explanation;
  const st=TEACH.l4Text(noExp);
  assert.strictEqual(st.source,'static');
  assert.ok(st.text.includes('past'),'静态讲解必须来自题库知识点标签');
  assert.strictEqual(TEACH.l4Text(null),null);
});

/* ---------- C4 延迟复习队列 ---------- */
test('TCH-14 复习队列：错多者优先、搁久者优先、同分先错的先复习', ()=>{
  const DAY=86400000, now=30*DAY;
  const list=[
    {qid:'old1',  q:'旧题',  count:1, t:now-10*DAY},   /* 2+10=12 */
    {qid:'often', q:'多错',  count:3, t:now-1*DAY},    /* 6+1=7 */
    {qid:'new1',  q:'新错',  count:1, t:now-1*DAY},    /* 2+1=3 */
  ];
  const rq=TEACH.buildReviewQueue(list, now);
  assert.deepStrictEqual(rq.map(x=>x.qid),['old1','often','new1']);   /* 搁 10 天的旧题最优先 */
  assert.strictEqual(rq[0].score,12);
  /* 同分：先错的（t 更小）在前 */
  const tie=TEACH.buildReviewQueue([
    {qid:'x',q:'x',count:1,t:now-5*DAY},{qid:'y',q:'y',count:1,t:now-5*DAY+1000},
  ], now);
  assert.deepStrictEqual(tie.map(x=>x.qid),['x','y']);
  assert.deepStrictEqual(TEACH.buildReviewQueue('bad input', now),[]);
});
