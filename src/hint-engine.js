'use strict';
/* ================================================================
   hint-engine.js — 分级提示引擎（v27 第 1 批）
   定位：LLM 是可选的教学增强器。游戏侧决定 hintLevel，
   LLM 只组织语言；LLM 不可用/超时/非法输出时静态提示兜底。
   原则：纯逻辑，不碰 DOM、不持有全局状态；依赖经 factory 注入
   （浏览器 window.NCE_SHARED，Node require('./nce-shared.js')），
   Node 测试与浏览器游戏共用同一份实现。
================================================================ */
(function(root, factory){
  if(typeof module==='object'&&module.exports){ module.exports=factory(require('../nce-shared.js')); }
  else{ root.HINT_ENGINE=factory(root.NCE_SHARED); }
})(typeof self!=='undefined'?self:this, function(NCE){

const VERB_MAP = NCE && NCE.VERB_MAP ? NCE.VERB_MAP : {};

/* ---- 分级提示协议 ----
   L1 知识点提醒 / L2 思考策略 / L3 针对错误项讲解；4 = 答后解析（第 2 批启用）
   游戏侧决定级别，模型只组织语言 */
const HINT_LEVELS={1:'knowledge',2:'strategy',3:'wrong-option'};
const POST_ANSWER_LEVEL=4;
const MAX_HINT_LEVEL=3;

/* attempt（同题第几次作答机会，从 1 开始）→ 允许的最高提示级别，单调有界 */
function allowedHintLevel(attempt){
  const n=Math.max(1, Number(attempt)||1);
  return Math.min(n, MAX_HINT_LEVEL);
}
/* 升级到下一级；已在顶级返回 null（再错就该换题，不是无限重讲） */
function nextHintLevel(prev){
  const n=Number(prev)||0;
  return n>=MAX_HINT_LEVEL?null:n+1;
}

/* ---- 学习者状态摘要（结构化上下文，P1 画像的接口先立） ----
   只传当前所需字段，不塞整段历史 */
function buildHintContext(q, attempt, wrongChoices, opts){
  opts=opts||{};
  if(!q||typeof q.a!=='number'||!Array.isArray(q.o)) return null;
  return {
    questionId:String(q.id||''),
    attempt:Math.max(1, Number(attempt)||1),
    wrongChoices:(wrongChoices||[]).map(String).slice(-4),
    knowledge:Array.isArray(q.knowledge)?q.knowledge.slice():[],
    allowedHintLevel:allowedHintLevel(attempt),
    /* 第 2 批填充（学习者画像）：协议保留 */
    recentWeaknesses:opts.recentWeaknesses||[],
    masteredRecently:opts.masteredRecently||[]
  };
}

/* ---- 静态提示文案（零请求、零泄题） ----
   按题目 knowledge 标签生成 L1/L2；L3 按错误选项特征生成针对性讲解。
   铁律：文案只讲抽象规则，绝不包含任何选项原文、正确答案或具体变形 */
function _verbOf(stem){
  const m=String(stem||'').match(/^([a-z]+)/);
  return m?m[1]:null;
}
function _knowledgeKey(k){
  const karr=Array.isArray(k)?k:[];
  if(karr.indexOf('pattern-family')>=0) return 'pattern-family';
  if(karr.indexOf('past-participle')>=0) return 'past-participle';
  if(karr.indexOf('three-forms')>=0) return 'three-forms';
  if(karr.indexOf('past')>=0) return 'past';
  return 'question-pattern';
}
const _L1={
  'past':'This quiz is about the PAST form of a verb - something that already happened. 📖',
  'past-participle':'This quiz asks for the THIRD form of a verb (the past participle). 📖',
  'pattern-family':'This quiz asks which family the three verb forms belong to. 📖',
  'three-forms':'This quiz is about ALL THREE forms of one verb - base, past, past participle. 📖',
  'question-pattern':'This quiz is about a question pattern - what KIND of question it is. 📖'
};
const _L2={
  'past':'Think: does this verb build its past form with a regular ending, or does it change completely? Recall its three forms. 🤔',
  'past-participle':'Recall the three forms - the one you need may NOT be equal to the simple past. Check the third slot. 🤔',
  'pattern-family':'Compare the LAST two forms first: identical? If they differ, compare the FIRST and THIRD. Then match what you see to the code meaning on the buttons. 🤔',
  'three-forms':'Rebuild the chain in order: base form, then past, then past participle. Fill the missing link. 🤔',
  'question-pattern':'Look at the question word and the word order - what type of question does that make? 🤔'
};
/* L3：按错误选项特征分类（不提正确项） */
function _l3Reason(stem, wrongChoice){
  const w=String(wrongChoice||'').trim();
  const v=_verbOf(stem);
  const row=v&&VERB_MAP[v];
  if(row){
    const three=[row.past,row.pp,v];
    if(three.indexOf(w)>=0) return 'The form you chose DOES belong to this verb, but it is a different slot - not the one this question asks for. 🔍';
  }
  if(/[a-z]ed\b/i.test(w)) return 'The form you chose follows the regular -ed rule, but this verb does NOT follow that rule. 🔍';
  if(/[a-z]ing\b/i.test(w)) return 'You picked an -ing form - that describes ongoing action, not the form this question asks for. 🔍';
  if(/^[a-z]+s\b/i.test(w)) return 'That is the third-person singular form - a different form altogether. 🔍';
  if(/^(AAA|ABA|ABB|ABC)（/.test(w)) return 'Read the code meaning on each button again, then re-check the three forms. 🔍';
  return 'Look again at the rule behind this question - the option you chose breaks it. 🔍';
}
/* 返回结构化提示对象 {mood,hintLevel,teachingPoint,text}；级别越界返回 null */
function staticHint(q, level, wrongChoice){
  if(!q||!q.q) return null;
  const lv=Number(level)||0;
  if(lv<1||lv>MAX_HINT_LEVEL) return null;
  const key=_knowledgeKey(q.knowledge);
  const tp='knowledge' in q?q.knowledge.join('-'):key;
  if(lv===1) return {mood:'worried',hintLevel:1,teachingPoint:key,text:_L1[key]};
  if(lv===2) return {mood:'worried',hintLevel:2,teachingPoint:key,text:_L2[key]};
  return {mood:'sad',hintLevel:3,teachingPoint:key,text:_l3Reason(q.q, wrongChoice)};
}

/* ---- 结构化输出校验 ----
   协议：{mood, hintLevel, teachingPoint, text}；任一不符判非法并给原因 */
function validateHintOutput(obj, opts){
  opts=opts||{};
  const moods=opts.moods||null;
  if(!obj||typeof obj!=='object'||Array.isArray(obj)) return {ok:false,reason:'not-an-object'};
  const mood=typeof obj.mood==='string'?obj.mood.toLowerCase():'';
  if(!mood) return {ok:false,reason:'mood-missing'};
  if(moods&&!moods[mood]) return {ok:false,reason:'mood-illegal:'+mood};
  const lv=Number(obj.hintLevel);
  if(!Number.isInteger(lv)||lv<1||lv>MAX_HINT_LEVEL) return {ok:false,reason:'hintLevel-out-of-range'};
  const tp=typeof obj.teachingPoint==='string'?obj.teachingPoint.trim():'';
  if(!tp) return {ok:false,reason:'teachingPoint-empty'};
  const tx=typeof obj.text==='string'?obj.text.trim():'';
  if(!tx) return {ok:false,reason:'text-empty'};
  if(tx.length>400) return {ok:false,reason:'text-too-long'};
  return {ok:true,value:{mood:mood,hintLevel:lv,teachingPoint:tp,text:tx}};
}

/* ---- LLM 输出解析：容忍 ```json 包裹与前后杂文本 ----
   解析不出合法 JSON 返回 null（上层降级，不硬猜） */
function parseLLMHintOutput(text){
  let t=String(text||'').trim();
  if(!t) return null;
  const fence=t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if(fence) t=fence[1].trim();
  if(!t.startsWith('{')){
    const s=t.indexOf('{'), e=t.lastIndexOf('}');
    if(s<0||e<=s) return null;
    t=t.slice(s,e+1);
  }
  try{ return JSON.parse(t); }catch(e){ return null; }
}

/* ---- 缓存键：同 (题, 尝试, 级别) 复用，避免重复请求 ---- */
function hintCacheKey(questionId, attempt, level){
  return String(questionId||'')+'|'+(Number(attempt)||0)+'|'+(Number(level)||0);
}

/* ---- 分级提示 system prompt：游戏侧定级别，模型只组织语言 ----
   与 FAIRY_SYS 同源规则：只说英语、绝不泄答案、心情开头；
   但输出协议为 JSON。hintCtx 由调用方从 buildHintContext 产出 */
function HINT_SYS(level, hintCtx){
  const lv=Math.max(1,Math.min(Number(level)||1,MAX_HINT_LEVEL));
  const kind={1:'state WHAT the quiz tests (the knowledge direction only)',
              2:'give a THINKING STRATEGY - what to compare or recall, never the answer',
              3:'explain why the option he chose is wrong - describe the rule it breaks, never name the correct option'}[lv];
  return 'You are Pixie, a tiny fairy mother watching over the hero in a pixel quiz battle. You only speak easy English with 1-2 emojis.\n'+
  'TASK: write ONE teaching hint line for the CURRENT quiz. '+kind+'.\n'+
  'HARD RULES:\n'+
  '- NEVER reveal, quote, or paraphrase ANY option text or the correct answer.\n'+
  '- NEVER mention any specific verb form or example transformation (no concrete examples at all).\n'+
  '- Teach the abstract rule or thinking strategy only. If unsure of a grammar fact, describe the strategy instead of inventing a rule.\n'+
  '- One line, max ~25 words.\n'+
  'OUTPUT FORMAT: reply with ONLY a JSON object, no other text:\n'+
  '{"mood":"<one of: happy,love,proud,worried,panic,sad>","hintLevel":'+lv+',"teachingPoint":"<short tag like irregular-past or question-pattern>","text":"<your hint line>"}\n'+
  (hintCtx?('LEARNER STATE (JSON): '+JSON.stringify(hintCtx)+'\n'):'')+
  'hintLevel in your reply MUST be '+lv+'.';
}

/* ---- 调度策略：哪类事件值得调 LLM（第 1 批接口先立，第 3 批扩展） ----
   返回 'llm'（走模型）| 'local'（本地模板/静态直出） */
function shouldCallLLM(evType){
  switch(evType){
    case 'hint': return 'llm';                 /* 提示通道由 hintLevel/缓存再细分 */
    case 'quiz-new': return 'llm';             /* 出题介入保留个性化 */
    case 'quiz-wrong': return 'llm';
    case 'quiz-correct': return 'local';       /* 普通夸奖本地模板（P2 全量落地） */
    case 'kill': case 'levelup': case 'dodge': case 'heal': case 'heartbeat': return 'local';
    default: return 'local';
  }
}

return {HINT_LEVELS, POST_ANSWER_LEVEL, MAX_HINT_LEVEL,
        allowedHintLevel, nextHintLevel, buildHintContext,
        staticHint, validateHintOutput, parseLLMHintOutput,
        hintCacheKey, HINT_SYS, shouldCallLLM};
});
