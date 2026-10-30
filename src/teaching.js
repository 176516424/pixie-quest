'use strict';
/* ================================================================
   teaching.js — 教学闭环纯逻辑（V28 批次 C）
   包含：C1 错因诊断 / C2 学习者摘要 / C3 L4 答后讲解门禁 /
        C4 延迟复习队列。原则与 hint-engine 一致：
   - 纯逻辑，不碰 DOM、不持有全局状态；依赖经 factory 注入
     （浏览器 window.NCE_SHARED，Node require('../nce-shared.js')）
   - 一切结论可由事件历史重算；证据不足一律返回"未知"，不强行推断
   - 诊断类别只决定提示策略，绝不包含正确答案原文（L4 结算后才放行）
================================================================ */
(function(root, factory){
  if(typeof module==='object'&&module.exports){ module.exports=factory(require('../nce-shared.js')); }
  else{ root.TEACH_CORE=factory(root.NCE_SHARED); }
})(typeof self!=='undefined'?self:this, function(NCE){

const VERB_MAP = NCE && NCE.VERB_MAP ? NCE.VERB_MAP : {};

/* ---- C1 错因诊断 ----
   受限类别闭集：只允许以下五种，不做开放分类 */
const DIAG_CATEGORIES=['三形混淆','句型误判','词义不清','拼写混淆','未知'];

/* 事件阶段闭包：首答 / 提示后重试 / 延迟复习——三者指标分开统计，不得合并 */
const PHASES={FIRST:'first',RETRY:'retry',REVIEW:'review'};

/* Levenshtein 距离（小词表够用，O(nm) 无所谓） */
function _editDistance(a,b){
  a=String(a).toLowerCase(); b=String(b).toLowerCase();
  const m=a.length,n=b.length;
  if(Math.abs(m-n)>2) return 3;           /* 超出判定阈值提前止损 */
  const dp=new Array(n+1);
  for(let j=0;j<=n;j++) dp[j]=j;
  for(let i=1;i<=m;i++){
    let prev=dp[0]; dp[0]=i;
    for(let j=1;j<=n;j++){
      const tmp=dp[j];
      dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+(a[i-1]===b[j-1]?0:1));
      prev=tmp;
    }
  }
  return dp[n];
}
/* 从题干提取动词原形："go 的过去式是？" → 'go'（与 hint-engine 同口径） */
function _stemOf(q){
  const m=String(q||'').match(/^([a-z]+)/);
  return m?m[1]:null;
}
/* 判断选项是否属于某个动词的三形集合 */
function _inVerbForms(word, excludeVerb){
  const w=String(word||'').trim().toLowerCase();
  if(!w) return null;
  for(const v in VERB_MAP){
    if(v===excludeVerb) continue;
    const row=VERB_MAP[v];
    if([row.past,row.pp,v].indexOf(w)>=0) return v;
  }
  return null;
}

/* 题目类型兼容性校验：类别必须与题目类型匹配，防诊断结果串型 */
function isCategoryCompatible(q, category){
  if(DIAG_CATEGORIES.indexOf(category)<0) return false;
  if(category==='未知') return true;
  const kn=Array.isArray(q&&q.knowledge)?q.knowledge:[];
  const isVerbQ=kn.indexOf('verb')>=0;
  const isPatternQ=kn.indexOf('question-pattern')>=0;
  if(isPatternQ) return category==='句型误判'||category==='词义不清';
  if(isVerbQ) return category!=='句型误判';
  return category==='未知';           /* 无类型标签的题只允许"未知" */
}

/* 诊断入口：输入题目对象 + 错误选项文本 → {category, basis}。
   basis 记录命中规则，保证每条诊断可审计、可重算。
   任何输入异常/证据不足 → {category:'未知'}，绝不硬猜 */
function diagnoseError(q, wrongOpt){
  const unknown={category:'未知',basis:'insufficient-evidence'};
  if(!q||typeof q.q!=='string'||typeof wrongOpt!=='string'||!wrongOpt.trim()) return unknown;
  const chosen=wrongOpt.trim();
  const correct=typeof q.a==='number'&&q.o?q.o[q.a]:null;
  if(!correct) return unknown;
  const kn=Array.isArray(q.knowledge)?q.knowledge:[];
  const isPatternQ=kn.indexOf('question-pattern')>=0;

  /* ① 句型题：答错即句型误判（题干/选项均为句型判定语义） */
  if(isPatternQ) return {category:'句型误判',basis:'pattern-question'};

  /* ② 动词题按确定性规则链逐级判定 */
  const stem=_stemOf(q.q);
  const row=stem?VERB_MAP[stem]:null;
  if(row){
    /* 2a. 选项是本动词三形之一但选错槽位 → 三形混淆 */
    if([row.past,row.pp,stem].indexOf(chosen.toLowerCase())>=0)
      return {category:'三形混淆',basis:'form-slot'};
    /* 2b. 选项是另一个动词的合法三形 → 词义不清（动词张冠李戴） */
    const other=_inVerbForms(chosen, stem);
    if(other) return {category:'词义不清',basis:'other-verb-form:'+other};
    /* 2c. 选项以动词原形为词干（过度规则化 goed/showing）或与正确答案
       编辑距离 ≤2（近似拼写）→ 拼写混淆 */
    if(chosen.toLowerCase().indexOf(stem)===0)
      return {category:'拼写混淆',basis:'affix-overgeneralization'};
    if(_editDistance(chosen, correct)<=2)
      return {category:'拼写混淆',basis:'near-spelling'};
  }
  /* 2d. pattern-family 题（三形变体代码 AAA/ABA/ABB/ABC）：选错家族码属于三形混淆 */
  if(kn.indexOf('pattern-family')>=0&&/^(AAA|ABA|ABB|ABC)/.test(chosen))
    return {category:'三形混淆',basis:'family-code'};
  return unknown;
}

/* ---- C2 学习者摘要 ----
   只消费可重算的事件流：{qid, phase, ok, knowledge, t}
   输出最小结构化摘要，直接对接 hint-engine.buildHintContext 的
   recentWeaknesses / masteredRecently 协议字段 */
const LEARNER_CAP=500;                 /* 事件历史上限，防止无限增长 */
const PHASE_VALUES=Object.keys(PHASES).map(k=>PHASES[k]);   /* ['first','retry','review'] */
function pushLearnerEvent(events, ev){
  const arr=Array.isArray(events)?events.slice():[];
  if(!ev||!ev.qid||typeof ev.ok!=='boolean') return arr;
  /* phase 校验按"值"判断：PHASES 键是大写别名，事件里传的是小写值 */
  const phase=PHASE_VALUES.indexOf(ev.phase)>=0?ev.phase:PHASES.FIRST;
  arr.push({qid:String(ev.qid),phase:phase,
            ok:!!ev.ok,knowledge:Array.isArray(ev.knowledge)?ev.knowledge.slice():[],
            t:Number(ev.t)||Date.now()});
  return arr.slice(-LEARNER_CAP);
}
function buildLearnerSummary(events, opts){
  opts=opts||{};
  const cap=Math.max(1,opts.cap||5);
  const list=Array.isArray(events)?events:[];
  /* 最近弱点：按题聚合，最近一次结果为错（或错多于对）的题，
     排序 = 错误次数降序 → 最近错误时间新者优先 */
  const byQ={};
  list.forEach(e=>{
    const k=e.qid;
    if(!byQ[k]) byQ[k]={qid:k,wrong:0,ok:0,last:e,tag:(e.knowledge&&e.knowledge[0])||''};
    if(!e.ok) byQ[k].wrong++;
    else byQ[k].ok++;
    if(e.t>=byQ[k].last.t) byQ[k].last=e;
    if(!byQ[k].tag&&e.knowledge&&e.knowledge[0]) byQ[k].tag=e.knowledge[0];
  });
  const weaknesses=Object.keys(byQ)
    .map(k=>byQ[k])
    .filter(x=>x.wrong>0&&x.last&&!x.last.ok)          /* 最近一次仍错 */
    .sort((a,b)=>(b.wrong-a.wrong)||(b.last.t-a.last.t))
    .slice(0,cap)
    .map(x=>({qid:x.qid,tag:x.tag,wrong:x.wrong}));
  /* 最近掌握：曾经错过、最近一次答对的题（新→旧） */
  const masteredRecently=Object.keys(byQ)
    .map(k=>byQ[k])
    .filter(x=>x.wrong>0&&x.last&&x.last.ok)
    .sort((a,b)=>b.last.t-a.last.t)
    .slice(0,cap)
    .map(x=>x.qid);
  return {recentWeaknesses:weaknesses,masteredRecently:masteredRecently};
}

/* ---- C3 L4 答后讲解门禁 ----
   作答结算（question settled）前只允许 L1~L3；
   L4 与正确答案原文只在结算后放行。门禁是纯函数，游戏侧必须先过门禁再展示 */
const L4_STAGE={IN_QUESTION:'in-question',SETTLED:'settled'};
function canShowL4(stage){
  return stage===L4_STAGE.SETTLED;
}
/* L4 讲解文本：优先题库已审计的 explanation（构建期人工审核过）；
   题库没有讲解时退回知识点标签的静态描述（绝不现场编造语法事实）。
   返回 {text, source}；source ∈ 'bank'|'static'。输入非法返回 null */
function l4Text(q){
  if(!q||typeof q.q!=='string') return null;
  if(typeof q.explanation==='string'&&q.explanation.trim())
    return {text:q.explanation.trim(),source:'bank'};
  const kn=Array.isArray(q.knowledge)?q.knowledge:[];
  if(!kn.length) return {text:'本题已结算。可回错题本复习同类考点。',source:'static'};
  return {text:'本题已结算。考点标签：'+kn.join(' / ')+'。可回错题本复习同类考点。',source:'static'};
}

/* ---- C4 延迟复习队列 ----
   本地规则、零 LLM。评分 = 错误次数×2 + 距今天数：
   错得越多越优先、搁得越久越优先；同分先错的先复习。
   输入错题本条目（建议含 qid/knowledge/category），输出排序后的复习队列 */
function buildReviewQueue(list, now){
  const t=Number(now)||Date.now();
  if(!Array.isArray(list)) return [];
  return list
    .filter(e=>e&&e.q)
    .map(e=>{
      const days=Math.max(0,Math.floor((t-(Number(e.t)||t))/86400000));
      const count=Math.max(1,Number(e.count)||1);
      return {qid:e.qid||null, q:e.q, s:e.s||'', knowledge:Array.isArray(e.knowledge)?e.knowledge:[],
              category:e.category||null, count, days,
              score:count*2+days, t:Number(e.t)||0};
    })
    .sort((a,b)=>(b.score-a.score)||(a.t-b.t));
}

return {DIAG_CATEGORIES, PHASES, L4_STAGE,
        isCategoryCompatible, diagnoseError,
        pushLearnerEvent, buildLearnerSummary,
        canShowL4, l4Text, buildReviewQueue};
});
