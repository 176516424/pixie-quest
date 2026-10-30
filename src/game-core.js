'use strict';
/* ================================================================
   game-core.js — 战斗核心纯逻辑（v26 阶段 1）
   原则：这里只有「规则」，不碰 DOM、不持有全局状态——
   所有函数入参出参自洽，Node 测试与浏览器游戏共用同一份实现。
   随机数统一经 rng 参数注入（缺省 Math.random），保证可确定性复现。
================================================================ */
(function(root, factory){
  if(typeof module==='object'&&module.exports){ module.exports=factory(); }
  else{ root.BATTLE_CORE=factory(); }
})(typeof self!=='undefined'?self:this, function(){

/* ---- 选项洗牌：Fisher-Yates，均匀无偏（rng 注入以便测试） ---- */
function shuffle4(rng){
  const r=rng||Math.random;
  const a=[0,1,2,3];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(r()*(i+1));
    const t=a[i]; a[i]=a[j]; a[j]=t;
  }
  return a;
}

/* ---- 勇者答案字母解析 ----
   优先「answer/choice/pick: X」式明确表达；独立裸字母兜底；都没有返回 null
   （调用方记 no-pick）。避免模型多说一句 "I think…" 就抓错字母 */
function parsePick(text){
  const t=String(text||'').trim();
  let m=t.match(/(?:^|\b(?:answer|choice|pick)\s*[：:]?\s*)([ABCD])\b/i);
  if(m) return m[1].toUpperCase();
  m=t.match(/\b([ABCD])\b/);
  return m?m[1]:null;
}

/* ---- 中毒一跳结算（纯函数） ----
   输入当前状态，输出新状态。死亡判定先于回合耗尽判定——
   修复 P0：旧实现在最后一跳致死时走 turns<=0 分支而漏调 heroDown */
function poisonTickStep(st){
  const hp=Math.max(0, st.hp-st.dmg);
  const turns=st.turns-1;
  const dead=hp<=0;
  return {hp, turns, dead, done:!dead&&turns<=0};
}

/* ---- 续力条填充百分比：4 秒续力从 0% 涨到 100% ----
   修复：旧公式分母 100，条从 60% 起跳 */
const CHARGE_MS=4000;
function chargeFillPct(untilMs, nowMs){
  const left=Math.max(0, untilMs-nowMs);
  return Math.max(0, Math.min(100, 100-left/CHARGE_MS*100));
}

/* ---- 大招落地后怪兽计时归位 ----
   续力期 monTimer 被 1s 计时器减成负数，不归位会立刻补普攻形成连招 */
const AFTER_SKILL_GRACE_S=3;
function afterSkillMonTimer(monTimer){
  return Math.max(monTimer||0, AFTER_SKILL_GRACE_S);
}

/* ---- answer() 入口守卫（纯判定） ----
   状态机口径：map → battle → charging/transition → gameOver。
   非法状态（出招中/已结束/换怪空档/答题区冻结）一律拒绝输入 */
function canAnswer(st){
  if(st.busy||st.gameOver||st.monHP<=0) return false;
  if(st.frozenUntil && Date.now()<st.frozenUntil) return false;
  return true;
}

/* ---- 题面快照（打码与日志用） ----
   事件发生瞬间抓取，LLM 思考的几秒里题面切走也不受影响 */
function quizSnapshot(q){
  if(!q||typeof q.a!=='number'||!Array.isArray(q.o)) return null;
  return {q:String(q.q||''), o:q.o.map(String), correct:String(q.o[q.a])};
}

/* ---- 泄漏打码名单构建（与旧 askFairy 内联逻辑同构，纯函数化） ----
   正确选项原文 + 题干/选项里出现的不规则动词全部变形 */
function buildMaskOpts(snap, verbDB){
  const maskOpts=[];
  if(snap&&snap.correct) maskOpts.push(snap.correct);
  if(snap&&Array.isArray(snap.o)){
    /* v27 验收 DEF-002：全部选项原文入名单——模型幻觉/恶意引用任何干扰项都必须被掩码，
       不能只掩正确项（正确项被掩≠安全，引用「goed」这类干扰项同样违反答前不引选项规则） */
    snap.o.forEach(o=>maskOpts.push(String(o)));
  }
  if(snap&&snap.q){
    const words=(snap.q+' '+(snap.o||[]).join(' ')).toLowerCase().match(/[a-z][a-z'-]{1,}/g)||[];
    (verbDB||[]).forEach(v=>{
      if(words.indexOf(String(v[0]).toLowerCase())>=0) maskOpts.push(String(v[1]),String(v[2]));
    });
  }
  return maskOpts;
}

return {shuffle4, parsePick, poisonTickStep, chargeFillPct, afterSkillMonTimer,
        canAnswer, quizSnapshot, buildMaskOpts, CHARGE_MS, AFTER_SKILL_GRACE_S};
});
