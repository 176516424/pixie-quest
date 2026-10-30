/**
 * v27 UI 验收驱动（复核整改版，2026-10-30）
 *
 * 相比 v26 驱动的整改（评审意见逐条落实）：
 * 1. 新增 visInfo()/waitVisible()：真实可见性断言——
 *    getComputedStyle(display/visibility) + 自底向上祖先链检查 +
 *    getBoundingClientRect 面积 + elementFromPoint 命中验证（可交互性）。
 *    不再只查 .show 类（旧断言无法发现父容器 display:none 吞掉弹窗的假阳性）。
 * 2. UI-08 改为真实冰霜魔王：召唤精灵后 startLevel(2)+monsterIdx=2 真实进入
 *    第三章 Boss 战，等待 Boss 真实计时→蓄力→startCharge(freeze) 触发事件，
 *    不再用 startCharge 注入（旧证据对象是 Grass Slime，宣称冰霜魔王不成立）。
 * 3. UI-09/10/13 全部重新生成截图与结果，禁止复用旧证据。
 * 4. 环境口径统一：LLM 上游=受控 mock（127.0.0.1:15990，OpenAI 兼容），
 *    非 LM Studio（本次 LM Studio 不可用，report.md 同口径）。
 */
const fs=require('fs'), path=require('path'), {spawn}=require('child_process');
const PKG=__dirname;
const SHOT=path.join(PKG,'screenshots');
fs.mkdirSync(SHOT,{recursive:true});
fs.mkdirSync(path.join(PKG,'sessions'),{recursive:true});
const BASE='http://127.0.0.1:8797';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DBGPORT=9337;
const PROFILE=path.join(require('os').tmpdir(),'acc-chrome-profile-v27b');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------------- 极简 CDP 客户端 ---------------- */
let ws, msgId=0; const pending=new Map(); const cdpEvents=[];
function send(method, params={}){
  return new Promise((res,rej)=>{
    const id=++msgId; pending.set(id,{res,rej});
    ws.send(JSON.stringify({id,method,params}));
  });
}
async function cdpConnect(){
  for(let i=0;i<50;i++){
    try{ const r=await fetch(`http://127.0.0.1:${DBGPORT}/json/version`); if(r.ok) break; }catch(e){}
    await sleep(200);
  }
  const t=await (await fetch(`http://127.0.0.1:${DBGPORT}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
  ws.onmessage=m=>{
    const d=JSON.parse(m.data);
    if(d.id&&pending.has(d.id)){ const p=pending.get(d.id); pending.delete(d.id);
      if(d.error) p.rej(new Error(d.error.message)); else p.res(d.result); }
    else if(d.method) cdpEvents.push(d);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
}
async function ev(expr){
  const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails) throw new Error('页面脚本异常: '+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
  return r.result.value;
}
async function shot(name){
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(SHOT,name+'.png'),Buffer.from(r.data,'base64'));
  return 'screenshots/'+name+'.png';
}
async function waitFor(expr, ms=15000, label=''){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    if(await ev(expr)) return true;
    await sleep(200);
  }
  throw new Error('等待超时: '+label);
}

/* ---- 整改①：真实可见性断言 ----
   返回 {exists, display, visibility, w, h, inViewport, hit}：
   - 自底向上检查祖先链 display:none / visibility:hidden（旧假阳性的根因）
   - getBoundingClientRect 必须有实际面积且落在视口内
   - elementFromPoint(中心点) 必须命中元素自身或其后代（证明可被真实点击） */
const VIS_FN=`(function(sel){
  const el=document.querySelector(sel);
  if(!el) return {exists:false};
  const cs=getComputedStyle(el);
  let p=el, chainHidden=null;
  while(p && p!==document.documentElement){
    const pcs=getComputedStyle(p);
    if(pcs.display==='none'){ chainHidden='display:none @'+(p.id||p.tagName); break; }
    if(pcs.visibility==='hidden'){ chainHidden='visibility:hidden @'+(p.id||p.tagName); break; }
    p=p.parentElement;
  }
  const r=el.getBoundingClientRect();
  const inVp=r.width>2&&r.height>2&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
  let hit=false;
  if(inVp){
    const at=document.elementFromPoint(r.left+r.width/2, r.top+Math.min(30,r.height/2));
    hit=!!at&&(at===el||el.contains(at));
  }
  return {exists:true, display:cs.display, visibility:cs.visibility,
          w:Math.round(r.width), h:Math.round(r.height), inViewport:inVp,
          ancestorHidden:chainHidden, clickable:hit};
})`;
function visOk(v){ return v.exists && v.display!=='none' && v.visibility!=='hidden'
  && !v.ancestorHidden && v.inViewport && v.clickable; }
async function vis(sel){ return ev(VIS_FN+'('+JSON.stringify(sel)+')'); }
async function waitVisible(sel, ms=8000, label=''){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    const v=await vis(sel);
    if(visOk(v)) return v;
    await sleep(200);
  }
  const v=await vis(sel);
  throw new Error('可见性等待超时: '+label+' state='+JSON.stringify(v));
}

/* ---------------- 用例结果容器 ---------------- */
const results=[]; let currentCase='';
function rec(id,pass,actual,metrics,notes,evidence){
  results.push({id,pass,actual,metrics:metrics||{},notes:notes||'',evidence:evidence||[],consoleErrors:[],injections:''});
  console.log((pass?'PASS':'FAIL')+' '+id+' — '+actual);
}
function consoleErrsSince(){ return cdpEvents.filter(e=>
  (e.method==='Runtime.exceptionThrown')||
  (e.method==='Log.entryAdded'&&e.params.entry.level==='error'&&e.params.entry.source!=='network')
).length; }

async function freshPage(){
  await ev('localStorage.clear(); "cleared"');
  await send('Page.navigate',{url:BASE+'/'});
  await waitFor(`document.readyState==='complete' && document.querySelectorAll('.lvnode').length>0`, 15000, '地图渲染');
  await sleep(400);
}
async function enterBattle(){
  await ev('startLevel(0)');
  await waitFor(`$('gamescreen').style.display!=='none' && document.querySelectorAll('.opt').length===4`, 8000, '战斗界面');
  await sleep(300);
}
async function waitIdle(){
  await waitFor(`!busy && $('gamescreen').style.display!=='none' && (document.querySelectorAll('.opt').length===0 || [...document.querySelectorAll('.opt')].some(b=>!b.disabled))`, 15000, '回合空闲');
  await sleep(250);
}
async function clickCorrect(){
  await ev(`(function(){const w=curQ.o[curQ.a];const b=[...document.querySelectorAll('.opt')].find(x=>x.textContent===w);b.click();})()`);
}
async function clickWrong(){
  return ev(`(function(){const w=curQ.o[curQ.a];const b=[...document.querySelectorAll('.opt')].find(x=>x.textContent!==w);b.click();return b.textContent;})()`);
}
async function fairyOn(){
  await ev(`$('btnFairy').click()`);
  await waitFor(`fairyOn===true`, 15000, '精灵召唤');
  await sleep(300);
}

/* ---------------- UI-01 ---------------- */
async function ui01(){
  currentCase='UI-01';
  await freshPage();
  const mapVisible=await ev(`$('mapscreen').style.display!=='none'`);
  const lockState=await ev(`JSON.stringify([...document.querySelectorAll('.lvnode')].map(n=>({locked:n.classList.contains('locked'),hasClick:!!n.onclick})))`);
  await shot('ui01-map');
  const errs0=consoleErrsSince();
  await ev(`$('node0').click()`);
  await waitFor(`$('gamescreen').style.display!=='none' && document.querySelectorAll('.opt').length===4`, 8000, '进入第一章');
  await sleep(400);
  await shot('ui01-battle');
  const errs1=consoleErrsSince();
  const lock=JSON.parse(lockState);
  const pass=mapVisible && !lock[0].locked && lock[0].hasClick &&
    lock.slice(1).every(x=>x.locked&&!x.hasClick) && errs1===errs0;
  rec('UI-01',pass,
    `地图可见；node0 可点击进入、其余章节锁定（符合空存档）；进入战斗后无脚本异常`,
    {consoleErrors:errs1-errs0, levels:lock.length},
    '空存档（localStorage 已清）→ 仅第一章解锁，符合预期',
    ['screenshots/ui01-map.png','screenshots/ui01-battle.png']);
}

/* ---------------- UI-02 ---------------- */
async function ui02(){
  currentCase='UI-02';
  await freshPage(); await enterBattle();
  const before=await ev(`JSON.stringify({monHP,mp:heroMP,q:$('question').textContent,correct:curQ.o[curQ.a]})`);
  const b0=JSON.parse(before);
  await shot('ui02-before');
  /* 勇者攻击 10% 被闪开（真实机制）：循环重试直到命中（≤4 次），
     断言命中回合伤害在 18~26 单发区间，且每次尝试 MP 恰好 +12（上限 50） */
  let mp=b0.mp, hitDmg=0;
  for(let i=0;i<4;i++){
    await clickCorrect();
    await waitIdle();
    const st=JSON.parse(await ev(`JSON.stringify({monHP,mp:heroMP})`));
    const d=b0.monHP-st.monHP;
    if(st.mp!==Math.min(50,mp+12)) throw new Error('MP 结算异常: '+mp+'→'+st.mp);
    mp=st.mp;
    if(d>0){ hitDmg=d; break; }
  }
  const after=await ev(`JSON.stringify({monHP,mp:heroMP,q:$('question').textContent,opts:document.querySelectorAll('.opt').length,heroAlive:heroHP>0,gameOver})`);
  const a0=JSON.parse(after);
  await shot('ui02-after');
  const pass=a0.monHP<b0.monHP && hitDmg>=18 && hitDmg<=26 && a0.q!==b0.q &&
    a0.opts===4 && a0.heroAlive && !a0.gameOver;
  rec('UI-02',pass,
    `答对结算一次：怪兽 HP ${b0.monHP}→${a0.monHP}，命中回合伤害 ${hitDmg}（18~26 单发区间，仅可能来自一次结算）；MP 每次尝试恰好 +12（封顶 50）；进入下一题且选项 4 个；勇者存活`,
    {dmg:hitDmg,monHpBefore:b0.monHP,monHpAfter:a0.monHP},
    '勇者攻击 10% 被闪开为真实机制，驱动以多次尝试排除运气',
    ['screenshots/ui02-before.png','screenshots/ui02-after.png']);
}

/* ---------------- UI-03 ---------------- */
async function ui03(){
  currentCase='UI-03';
  await freshPage(); await enterBattle();
  const before=await ev(`JSON.stringify({hp:heroHP,q:$('question').textContent,correct:curQ.o[curQ.a],wrongBook:JSON.parse(localStorage.getItem('nce_battle_wrong')||'[]').length})`);
  const b0=JSON.parse(before);
  const wrongPick=await clickWrong();
  await waitIdle();
  const after=await ev(`JSON.stringify({hp:heroHP,q:$('question').textContent,book:JSON.parse(localStorage.getItem('nce_battle_wrong')||'[]')})`);
  const a0=JSON.parse(after);
  await shot('ui03-after-wrong');
  const pass=a0.book.length===b0.wrongBook+1 && a0.hp===b0.hp && a0.q!==b0.q &&
    a0.book[a0.book.length-1].q===b0.q && a0.book[a0.book.length-1].wrong===wrongPick &&
    a0.book[a0.book.length-1].ok===b0.correct && a0.book[a0.book.length-1].count===1;
  rec('UI-03',pass,
    `答错仅记录一次：错题本 ${b0.wrongBook}→${a0.book.length} 条，新记录题干/错误项(${wrongPick})/正确项与实际一致；攻击落空未掉血（HP ${b0.hp}→${a0.hp}）；进入下一题`,
    {wrongBefore:b0.wrongBook,wrongAfter:a0.book.length,hpBefore:b0.hp,hpAfter:a0.hp},
    '精灵未召唤（无 LLM 分支）',
    ['screenshots/ui03-after-wrong.png']);
}

/* ---------------- UI-04 ---------------- */
async function ui04(){
  currentCase='UI-04';
  await freshPage(); await enterBattle();
  await ev(`window.__xpN=0; window.__xpSum=0; const _g=gainXp; gainXp=(n,at)=>{window.__xpN++;window.__xpSum+=n;return _g(n,at)}; "hooked"`);
  /* A. 快速连点同一选项。勇者攻击有 10% 被闪开（真实机制），伤害可能为 0——
     循环重试直到出现命中回合（≤4 次），断言「每次答题尝试 gainXp 恰好 1 次 +8、
     命中回合伤害在 18~26 单发区间」，排除闪避运气对断言的干扰 */
  let attempts=0, hitDeltas=[];
  for(let i=0;i<4;i++){
    const b0=JSON.parse(await ev(`JSON.stringify({monHP})`));
    await ev(`(function(){const w=curQ.o[curQ.a];const b=[...document.querySelectorAll('.opt')].find(x=>x.textContent===w);b.click();b.click();b.click();})()`);
    await waitIdle();
    attempts++;
    const m0=JSON.parse(await ev(`JSON.stringify({monHP,xpN:window.__xpN,xpSum:window.__xpSum})`));
    const d=b0.monHP-m0.monHP;
    if(d>0){ hitDeltas.push(d); break; }
  }
  const m0=JSON.parse(await ev(`JSON.stringify({monHP,xpN:window.__xpN,xpSum:window.__xpSum,q:$('question').textContent})`));
  const passA=hitDeltas.length>=1 && hitDeltas.every(d=>d>=18&&d<=26) &&
    m0.xpN===attempts && m0.xpSum===8*attempts;
  await ev(`monHP=3; window.__xpN=0; window.__xpSum=0; window.__guardSamples=[]; "ready"`);
  const killClickP=`(function(){ window.__guardSamples.push(BATTLE_CORE.canAnswer({busy,gameOver,monHP,frozenUntil}));
    const b=document.querySelectorAll('.opt')[0]; if(b&&!b.disabled) b.click(); })()`;
  await clickCorrect();
  await waitFor(`monHP<=0`,5000,'击杀');
  for(let i=0;i<8;i++){ await ev(killClickP).catch(e=>{}); await sleep(120); }
  await waitIdle();
  const end=await ev(`JSON.stringify({xpN:window.__xpN,xpSum:window.__xpSum,hp:heroHP,opts:document.querySelectorAll('.opt').length,gameOver,guards:window.__guardSamples})`);
  const e0=JSON.parse(end);
  await shot('ui04-transition');
  const passB=e0.xpN===2&&e0.xpSum===14&&e0.hp>0&&!e0.gameOver&&e0.guards.length===8&&e0.guards.every(g=>g===false);
  rec('UI-04',passA&&passB,
    `A: ${attempts} 次答题尝试（含 ${4-hitDeltas.length<=0?0:(attempts-hitDeltas.length)} 次真实闪避）每次 gainXp 恰好 1 次 +8（共 ${m0.xpN} 次/${m0.xpSum}），命中回合伤害 ${hitDeltas.join('/')} 全在 18~26 单发区间——三连点仅结算一次；B: 换怪空档连点 8 次——canAnswer 守卫 8/8 拒绝，探针仅答题 +8 与击杀 +6 两笔（合计 ${e0.xpSum}），无重复结算`,
    {attempts,hitDeltas,xpCallsA:m0.xpN,xpSumA:m0.xpSum,xpCallsB:e0.xpN,xpSumB:e0.xpSum,transitionClicks:8,guardRejectedAll:e0.guards.every(g=>g===false)},
    '勇者攻击 10% 被闪开为真实机制（可能伤害 0），驱动以多次尝试+XP 探针排除运气；注入：monHP=3 触发击杀',
    ['screenshots/ui04-transition.png']);
}

/* ---------------- UI-05 ---------------- */
async function ui05(){
  currentCase='UI-05';
  await freshPage(); await enterBattle();
  await ev(`heroHP=3; heroMP=50; applyPoison(1,5); "poisoned"`);
  await shot('ui05-poisoned');
  const t0=Date.now();
  await waitFor(`heroHP===0 && gameOver===true`, 8000, '毒发死亡');
  const elapsed=Date.now()-t0;
  await sleep(400);
  const st=await ev(`JSON.stringify({hp:heroHP,gameOver,overlay:!!document.querySelector('#overlay.show'),title:$('ovtitle').textContent,opts:document.querySelectorAll('.opt').length})`);
  const s0=JSON.parse(st);
  await shot('ui05-dead');
  await ev(`(function(){const b=document.querySelectorAll('.opt')[0]; if(b) b.click();})()`).catch(e=>{});
  await sleep(500);
  const st2=await ev(`JSON.stringify({hp:heroHP,gameOver})`);
  const s2=JSON.parse(st2);
  const pass=s0.hp===0&&s0.gameOver&&s0.overlay&&/击倒/.test(s0.title)&&s2.hp===0&&s2.gameOver;
  rec('UI-05',pass,
    `注入 HP=3 + 中毒后，${(elapsed/1000).toFixed(1)}s 内真实计时结算死亡：HP=0、死亡浮层可见、gameOver=true；死后点击选项无效`,
    {deathAfterMs:elapsed,overlayTitle:s0.title,inputLocked:s2.hp===0&&s2.gameOver},
    '注入值：heroHP=3, applyPoison(1,5)',
    ['screenshots/ui05-poisoned.png','screenshots/ui05-dead.png']);
}

/* ---------------- UI-06 ---------------- */
async function ui06(){
  currentCase='UI-06';
  await freshPage(); await enterBattle();
  await ev(`heroHP=100; applyPoison(9,3); "poison"`);
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await sleep(3500);
  const a1=await ev(`JSON.stringify({hp:heroHP,poison:!!poison,map:$('mapscreen').style.display!=='none'})`);
  const s1=JSON.parse(a1);
  await shot('ui06-poison-cleared');
  await enterBattle();
  await ev(`doFreeze(60); "frozen60s"`);
  const frozenSet=await ev(`frozenUntil>Date.now()`);
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await sleep(1000);
  const cleared=await ev(`frozenUntil===0`);
  await enterBattle();
  const reenter=await ev(`JSON.stringify({frozen:frozenUntil>Date.now(),qzoneFrozen:$('qzone').classList.contains('frozen')})`);
  const s3=JSON.parse(reenter);
  await shot('ui06-freeze-cleared');
  await enterBattle();
  await ev(`startCharge({id:'freeze',name:'绝对冰冻'}); "charging"`);
  const chargingSet=await ev(`!!charging`);
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await sleep(4500);
  const c1=await ev(`JSON.stringify({charging:!!charging,frozen:frozenUntil>Date.now(),map:$('mapscreen').style.display!=='none'})`);
  const s5=JSON.parse(c1);
  await shot('ui06-charge-cleared');
  const pass=s1.hp===100&&!s1.poison&&s1.map&&frozenSet&&cleared&&!s3.frozen&&!s3.qzoneFrozen&&chargingSet&&!s5.charging&&!s5.frozen&&s5.map;
  rec('UI-06',pass,
    `a) 中毒返回地图：3.5s 后 HP 仍 100、poison 清空；b) 冻结 60s 返回地图：frozenUntil 归 0；c) 续力中返回地图：4.5s 后 charging=null 且无残留冻结`,
    {poisonHp:s1.hp,poisonCleared:!s1.poison,freezeSet:frozenSet,freezeCleared:cleared,reenterFrozen:s3.frozen,chargeSet:chargingSet,chargeCleared:!s5.charging,skillLandedAfterBack:s5.frozen},
    '注入值：applyPoison(9,3)、doFreeze(60)、startCharge(freeze)',
    ['screenshots/ui06-poison-cleared.png','screenshots/ui06-freeze-cleared.png','screenshots/ui06-charge-cleared.png']);
}

/* ---------------- UI-07 ---------------- */
async function ui07(){
  currentCase='UI-07';
  await freshPage(); await enterBattle();
  await ev(`heroHP=100; monTimer=1; window.__atk=0; window.__resetSeen=false; window.__resetAt=0;
    const _mt=monsterTurn; monsterTurn=async function(){ if(!charging&&!gameOver&&monHP>0&&heroHP>0) window.__atk++; return _mt.apply(this,arguments) };
    const _as=BATTLE_CORE.afterSkillMonTimer; BATTLE_CORE.afterSkillMonTimer=function(t){window.__resetSeen=true; window.__resetFrom=t; window.__resetAt=Date.now(); return _as(t)};
    startCharge({id:'frost',name:'冰霜吐息'}); "charging"`);
  await waitFor(`!!charging && (document.getElementById('chargefill')?.style.width||'')!==''`,3000,'续力条出现');
  const pct0=await ev(`parseFloat(document.getElementById('chargefill').style.width)||0`);
  await shot('ui07-charge-start');
  await sleep(3400);
  const pct1=await ev(`parseFloat(document.getElementById('chargefill').style.width)||0`);
  const midState=await ev(`JSON.stringify({monTimer,atk:window.__atk})`);
  const ms0=JSON.parse(midState);
  await shot('ui07-charge-end');
  await waitFor(`!charging && frozenUntil>Date.now() && window.__resetSeen`,6000,'大招落地并归位');
  const after=await ev(`JSON.stringify({monTimer,atk:window.__atk,resetFrom:window.__resetFrom,frozen:frozenUntil>Date.now(),charging:!!charging})`);
  const s0=JSON.parse(after);
  await waitFor(`window.__atk>0`,9000,'宽限期后的下一次普攻');
  const gap=await ev(`Date.now()-window.__resetAt`);
  await shot('ui07-after-ult');
  const pass=pct0<=15&&pct1>=85&&ms0.monTimer<0&&ms0.atk===0&&s0.resetFrom<0&&s0.atk===0&&s0.frozen&&!s0.charging&&gap>=1900;
  rec('UI-07',pass,
    `续力条 ${pct0.toFixed(0)}%→${pct1.toFixed(0)}%；续力期计时走负至 ${ms0.monTimer}（真实普攻 0 次）；大招落地 afterSkillMonTimer(${s0.resetFrom}) 归位，归位→首次普攻 ${gap}ms（≥1900ms），无立即补刀`,
    {pctStart:pct0,pctEnd:pct1,monTimerDuringCharge:ms0.monTimer,resetFrom:s0.resetFrom,graceGapMs:gap},
    '注入值：startCharge(frost)+monTimer=1',
    ['screenshots/ui07-charge-start.png','screenshots/ui07-charge-end.png','screenshots/ui07-after-ult.png']);
}

/* ---------------- UI-08（整改②：真实冰霜魔王） ----------------
   旧证据用 startCharge 注入且战斗对象是第一章 Grass Slime——撤回。
   现在真实进入第三章 Boss 战：精灵在线 → startLevel(2)+monsterIdx=2 →
   冰霜魔王按真实计时（timer=11s）行动，45% 概率蓄力「绝对冰冻」，
   startCharge(freeze) 发出含 SK_EN 映射 "Absolute Freeze" 的精灵事件。
   驱动只做两件事加速轮转（monTimer=1）和防止勇者意外死亡（heroHP=100），
   蓄力判定、事件文案、打码全部走游戏真实逻辑。 */
async function ui08(){
  currentCase='UI-08';
  await freshPage();
  await fairyOn();
  await waitFor(`!fairyBusy && !fairyPendingEv`,30000,'初始事件完成');
  await ev(`startLevel(2); monsterIdx=2; spawnMonster(true); "frost-king"`);
  await waitFor(`document.querySelectorAll('.opt').length===4 && $('monName').textContent.includes('冰霜魔王')`,8000,'冰霜魔王出现');
  const monName=await ev(`$('monName').textContent`);
  await shot('ui08-frost-king');
  const logsBefore=await ev(`fairyLogAll().length`);
  /* 加速轮转：每 700ms 把 Boss 计时拨到 1s，等待真实蓄力（45%/次）触发 */
  const t0=Date.now();
  let charged=false;
  while(Date.now()-t0<120000){
    await ev(`if(!charging&&!gameOver&&monHP>0){ monTimer=1; heroHP=100; } "tick"`).catch(e=>{});
    const has=await ev(`fairyLogAll().slice(${logsBefore}).some(e=>e.ev.includes('CHARGING the skill'))`);
    if(has){ charged=true; break; }
    await sleep(700);
  }
  if(!charged) throw new Error('120s 内 Boss 未蓄力（45%/次不应发生）');
  await waitFor(`!fairyBusy && !fairyPendingEv`,30000,'精灵处理蓄力事件');
  await sleep(400);
  await shot('ui08-frost-king-charge');
  const last=await ev(`JSON.stringify(fairyLogAll().slice(${logsBefore}))`);
  const entries=JSON.parse(last);
  const charge=entries.filter(e=>e.ev.includes('CHARGING the skill'));
  const c0=charge[charge.length-1];
  const pass=monName.includes('冰霜魔王') && charge.length>=1 && !!c0 &&
    c0.ev.includes('Absolute Freeze') && !c0.ev.includes('undefined') &&
    c0.ev.includes('INTERRUPT');
  rec('UI-08',pass,
    `真实冰霜魔王（怪物名「${monName}」，非注入技能）：Boss 真实计时轮转后蓄力，精灵事件含「Absolute Freeze」与打断指引、无 undefined。原文片段: ${c0?c0.ev.slice(0,90):'未找到'}…`,
    {monster:monName,chargeEvents:charge.length,containsFreeze:!!(c0&&c0.ev.includes('Absolute Freeze')),containsUndefined:charge.some(e=>e.ev.includes('undefined'))},
    '注入仅限：startLevel(2)+monsterIdx=2（直达第三章 Boss）、monTimer=1 加速轮转、heroHP=100 防意外死亡；蓄力/事件/文案全走真实逻辑',
    ['screenshots/ui08-frost-king.png','screenshots/ui08-frost-king-charge.png','sessions/ui08-frost-king-events.json']);
  fs.writeFileSync(path.join(PKG,'sessions','ui08-frost-king-events.json'),JSON.stringify(entries,null,1));
}

/* ---------------- UI-09（整改①：真实可见性） ---------------- */
async function ui09(){
  currentCase='UI-09';
  await freshPage(); await enterBattle();
  const wrongPick=await clickWrong();
  await waitIdle();
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnWrong').click()`);
  const v=await waitVisible('#wbwrap',6000,'错题本弹窗');
  const panelV=await vis('#wbpanel');
  const wb=await ev(`JSON.stringify({count:$('wbcount').textContent,list:$('wblist').textContent})`);
  const w0=JSON.parse(wb);
  await shot('ui09-wrongbook');
  await ev(`$('wbClose').click()`);
  await sleep(300);
  const closedV=await vis('#wbwrap');
  const pass=visOk(v)&&visOk(panelV)&&/共 1 题/.test(w0.count)&&w0.list.includes(wrongPick)&&
    closedV.display==='none';
  rec('UI-09',pass,
    `错题 1 条后回地图点「错题本」：弹窗真实可见（display=${v.display}、尺寸 ${v.w}×${v.h}、无祖先隐藏、中心点 elementFromPoint 可命中=${v.clickable}，面板同样可命中），计数「${w0.count}」含错误项「${wrongPick}」；关闭后 display=${closedV.display} 真实消失`,
    {display:v.display,w:v.w,h:v.h,ancestorHidden:v.ancestorHidden,clickable:v.clickable,panelClickable:panelV.clickable,count:w0.count,closedDisplay:closedV.display},
    '整改：断言升级为 getComputedStyle+祖先链+边界面积+elementFromPoint，不再只查 .show 类；修复弹窗父容器 display:none 后本用例才可能通过',
    ['screenshots/ui09-wrongbook.png']);
}

/* ---------------- UI-10（整改①：真实可见性） ---------------- */
async function ui10(){
  currentCase='UI-10';
  await freshPage();
  await fairyOn();
  await enterBattle();
  await waitFor(`fairyLogAll().length>=1 && !fairyBusy`,30000,'至少一条精灵日志');
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  const total=await ev(`fairyLogAll().length`);
  await ev(`$('btnFairyLog').click()`);
  const v=await waitVisible('#flwrap',6000,'精灵日志弹窗');
  const panelV=await vis('#flpanel');
  const fl=await ev(`JSON.stringify({count:$('flcount').textContent,items:$('fllist').children.length,stats:$('flstats').textContent})`);
  const f0=JSON.parse(fl);
  await shot('ui10-fairylog');
  await ev(`$('flClose').click()`);
  await sleep(300);
  const closedV=await vis('#flwrap');
  const pass=visOk(v)&&visOk(panelV)&&f0.count.includes(String(total))&&f0.items>=1&&f0.stats.length>1&&
    closedV.display==='none';
  rec('UI-10',pass,
    `精灵日志 ${total} 条：弹窗真实可见（display=${v.display}、尺寸 ${v.w}×${v.h}、无祖先隐藏、中心点可命中=${v.clickable}），计数「${f0.count}」、条目 ${f0.items}、心情统计非空；关闭后 display=${closedV.display} 真实消失`,
    {total,display:v.display,w:v.w,h:v.h,ancestorHidden:v.ancestorHidden,clickable:v.clickable,panelClickable:panelV.clickable,items:f0.items,closedDisplay:closedV.display},
    '整改：真实可见性断言（同 UI-09）',
    ['screenshots/ui10-fairylog.png']);
}

/* ---------------- UI-11 ---------------- */
async function ui11(){
  currentCase='UI-11';
  await freshPage();
  await fairyOn();
  await enterBattle();
  const q1=await ev(`JSON.stringify({q:$('question').textContent,correct:curQ.o[curQ.a]})`);
  const Q1=JSON.parse(q1);
  await waitFor(`!fairyBusy && !fairyPendingEv`,30000,'初始精灵事件完成');
  await ev(`window.__captured=[]; window.__leak=${JSON.stringify(Q1.correct)};
    window.fetch=async(url,opts)=>{ window.__captured.push({url:String(url),body:opts&&opts.body});
      await new Promise(r=>setTimeout(r,1200));
      return new Response(JSON.stringify({choices:[{message:{content:'[worried] Stay calm my dear! Remember the word '+window.__leak+' from before, keep thinking!'}}]}),{status:200,headers:{'Content-Type':'application/json'}}); }; "mocked"`);
  await ev(`fairyEvent('TEST snapshot event: old question was shown when this fired')`);
  await clickCorrect();
  await waitIdle();
  const q2=await ev(`JSON.stringify({q:$('question').textContent,correct:curQ.o[curQ.a]})`);
  const Q2=JSON.parse(q2);
  await waitFor(`!fairyBusy && !fairyPendingEv`,15000,'精灵响应返回');
  await sleep(400);
  const last6=await ev(`JSON.stringify(fairyLogAll().slice(-6))`);
  const entries=JSON.parse(last6);
  const test=entries.find(e=>e.ev.includes('TEST snapshot event'));
  await shot('ui11-snapshot-masked');
  const pass=!!test && test.quiz===Q1.q
    && !test.text.includes(Q1.correct) && test.text.includes('🚫')
    && Q1.q!==Q2.q && Q1.correct!==Q2.correct;
  rec('UI-11',pass,
    `旧题事件发出后立刻答对切到新题，1.2s 后 mock 响应返回：日志 quiz 字段仍为旧题；该条台词含打码 🚫 且不含旧题答案原文「${Q1.correct}」`,
    {logQuizIsOld:!!(test&&test.quiz===Q1.q),masked:!!(test&&test.text.includes('🚫')),leak:!!(test&&test.text.includes(Q1.correct)),qChanged:Q1.q!==Q2.q,capturedRequests:(await ev(`window.__captured.length`))},
    '注入：window.fetch mock（延迟 1.2s）',
    ['screenshots/ui11-snapshot-masked.png','sessions/ui11-captured-request.json']);
  const captured=await ev(`JSON.stringify(window.__captured)`);
  fs.writeFileSync(path.join(PKG,'sessions','ui11-captured-request.json'),captured);
}

/* ---------------- UI-12 ---------------- */
async function ui12(){
  currentCase='UI-12';
  await ev(`window.__pwned=undefined; window.__pwned2=undefined;
    window.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'[happy] <img src=x onerror="window.__pwned=1"> nice <script>window.__pwned2=1<\\/script> done'}}]}),{status:200,headers:{'Content-Type':'application/json'}}); "mocked-html"`);
  await ev(`fairyEvent('TEST render safety: model returned html')`);
  await waitFor(`!fairyBusy && !fairyPendingEv`,15000,'精灵响应返回');
  await sleep(300);
  const bubble=await ev(`JSON.stringify({text:$('fairyBubble').textContent,html:$('fairyBubble').innerHTML,img:!!$('fairyBubble').querySelector('img'),script:!!$('fairyBubble').querySelector('script'),pwned:window.__pwned||null,pwned2:window.__pwned2||null})`);
  const b0=JSON.parse(bubble);
  await shot('ui12-bubble-safe');
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnFairyLog').click()`);
  const fv=await waitVisible('#flwrap',6000,'精灵日志弹窗');
  await sleep(400);
  const fl=await ev(`JSON.stringify({img:!!$('fllist').querySelector('img'),script:!!$('fllist').querySelector('script'),literal:$('fllist').textContent.includes('<img')})`);
  const f0=JSON.parse(fl);
  await shot('ui12-fairylog-safe');
  await ev(`$('flClose').click()`);
  const pass=!b0.img&&!b0.script&&!b0.pwned&&!b0.pwned2&&b0.text.includes('<img')&&!f0.img&&!f0.script&&f0.literal&&visOk(fv);
  rec('UI-12',pass,
    `模型文本含 <img onerror> 与 <script>：气泡与精灵日志均按纯文本显示，未创建元素、未执行（__pwned 空）；日志弹窗真实可见`,
    {bubbleImgElement:b0.img,bubbleScriptElement:b0.script,scriptExecuted:!!b0.pwned,onerrorExecuted:!!b0.pwned2,logImgElement:f0.img,logVisible:visOk(fv)},
    '注入：window.fetch mock 返回带 HTML 的受控文本',
    ['screenshots/ui12-bubble-safe.png','screenshots/ui12-fairylog-safe.png']);
}

/* ---------------- UI-13（整改：真实可见性 + 统一环境口径） ---------------- */
async function ui13(){
  currentCase='UI-13';
  const errs0=consoleErrsSince();
  await freshPage(); await enterBattle();
  await clickCorrect(); await waitIdle();
  await clickWrong(); await waitIdle();
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnWrong').click()`);
  const v=await waitVisible('#wbwrap',6000,'错题本弹窗（地图页）');
  const wb=await ev(`$('wbcount').textContent`);
  await shot('ui13-no-llm-flow');
  await ev(`$('wbClose').click()`); await sleep(200);
  const closedV=await vis('#wbwrap');
  const errs1=consoleErrsSince();
  const pass=visOk(v)&&/共 1 题/.test(wb)&&closedV.display==='none'&&errs1===errs0;
  rec('UI-13',pass,
    `未召唤精灵（LLM 上游=受控 mock 127.0.0.1:15990，本机 LM Studio 不可用）：答题对/错各一次、返回地图、错题本弹窗真实可见（display=${v.display}、尺寸 ${v.w}×${v.h}、可点击=${v.clickable}）并可关闭，全程无未捕获异常`,
    {consoleErrors:errs1-errs0,wrongbookVisible:visOk(v),wrongbookCount:wb,closedDisplay:closedV.display},
    '环境口径（与 report.md 一致）：本次全部使用受控 mock 上游，非 LM Studio；真实模型表现未验收',
    ['screenshots/ui13-no-llm-flow.png']);
}

/* ---------------- 主流程 ---------------- */
(async()=>{
  console.log('启动 Chrome headless…');
  const chrome=spawn(CHROME,[`--remote-debugging-port=${DBGPORT}`,`--user-data-dir=${PROFILE}`,
    '--headless=new','--no-first-run','--no-default-browser-check','--window-size=1280,800','about:blank'],{stdio:'ignore'});
  try{
    await cdpConnect();
    await send('Page.navigate',{url:BASE+'/'});
    await waitFor(`document.readyState==='complete'`,15000,'首屏');
    const cases=[ui01,ui02,ui03,ui04,ui05,ui06,ui07,ui08,ui09,ui10,ui11,ui12,ui13];
    for(const c of cases){
      try{ await c(); }
      catch(e){ rec(c.name.replace(/^ui/,'UI-').replace('0','0'),false,'驱动异常: '+e.message,{},{},[]); }
    }
    const summary={executedAt:new Date().toISOString(),base:BASE,
      upstream:'受控 mock 127.0.0.1:15990（OpenAI 兼容；LM Studio 不可用，与 report.md 口径一致）',
      driverVersion:'v27-rectified',results};
    fs.writeFileSync(path.join(PKG,'driver-results.json'),JSON.stringify(summary,null,1));
    console.log('\n=== 驱动汇总 ===');
    results.forEach(r=>console.log(`${r.pass?'PASS':'FAIL'} ${r.id}`));
    const npass=results.filter(r=>r.pass).length;
    console.log(`${npass}/${results.length} PASS`);
  }catch(e){
    console.error('驱动失败:',e);
    process.exitCode=1;
  }finally{
    try{ ws&&ws.close(); }catch(e){}
    try{ chrome.kill(); }catch(e){}
  }
})();
