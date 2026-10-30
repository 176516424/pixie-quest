/* pixie-quest v26 验收 · UI 用例 CDP 驱动（Chrome headless）
 * 用法：node driver-ui-acceptance.js
 * 产出：stdout 用例摘要 + <PKG>/driver-results.json + screenshots/*.png
 * 注入说明：UI-05/06/07 直接操作页面全局状态（标准第 7 节允许，注入值写入证据）；
 *          UI-11/12 覆盖 window.fetch 返回受控 mock 响应（不需要真实模型配合）。 */
'use strict';
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');

const PKG=process.argv[2];
if(!PKG){ console.error('usage: node driver-ui-acceptance.js <acceptance-pkg-dir>'); process.exit(2); }
const SHOT=path.resolve(PKG,'screenshots');
const BASE='http://127.0.0.1:8797';
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DBGPORT=9333;
const PROFILE=path.join(require('os').tmpdir(),'acc-chrome-profile');

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
/* 轮询等待页面内条件成立 */
async function waitFor(expr, ms=15000, label=''){
  const t0=Date.now();
  while(Date.now()-t0<ms){
    if(await ev(expr)) return true;
    await sleep(200);
  }
  throw new Error('等待超时: '+label);
}

/* ---------------- 用例结果容器 ---------------- */
const results=[]; let currentCase='';
function rec(id,pass,actual,metrics,notes,evidence){
  results.push({id,pass,actual,metrics,notes:notes||'',evidence:evidence||[],consoleErrors:[],injections:''});
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
    `地图可见；node0 可点击进入、node1-11 均锁定不可点（符合空存档）；进入战斗后无脚本异常`,
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
  await clickCorrect();
  await waitIdle();
  const after=await ev(`JSON.stringify({monHP,mp:heroMP,q:$('question').textContent,opts:document.querySelectorAll('.opt').length,heroAlive:heroHP>0,gameOver})`);
  const a0=JSON.parse(after);
  await shot('ui02-after');
  const delta=b0.monHP-a0.monHP;
  const pass=a0.monHP<b0.monHP && a0.mp===Math.min(50,b0.mp+12) && a0.q!==b0.q &&
    a0.opts===4 && a0.heroAlive && !a0.gameOver && delta>=18 && delta<=26;
  rec('UI-02',pass,
    `答对结算一次：怪兽 HP ${b0.monHP}→${a0.monHP}（伤害 ${delta}，介于 18~26 单发区间）；MP ${b0.mp}→${a0.mp}；进入下一题且选项 4 个；勇者存活`,
    {dmg:delta,mpGain:a0.mp-b0.mp,monHpBefore:b0.monHP,monHpAfter:a0.monHP},
    '伤害区间依据 rnd(18,26)+武器T0(=0)，仅可能来自一次结算',
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
    `答错仅记录一次：错题本 ${b0.wrongBook}→${a0.book.length} 条，新记录题干/错误项(${wrongPick})/正确项与实际一致；攻击落空未掉血（HP ${b0.hp}→${a0.hp}）；按 v26 无 LLM 规则直接进入下一题`,
    {wrongBefore:b0.wrongBook,wrongAfter:a0.book.length,hpBefore:b0.hp,hpAfter:a0.hp},
    '精灵未召唤（无 LLM 分支）',
    ['screenshots/ui03-after-wrong.png']);
}

/* ---------------- UI-04 ---------------- */
async function ui04(){
  currentCase='UI-04';
  await freshPage(); await enterBattle();
  /* 挂 gainXp 探针：heroXp 会因升级重置，不能直接用它做精确结算断言 */
  await ev(`window.__xpN=0; window.__xpSum=0; const _g=gainXp; gainXp=(n,at)=>{window.__xpN++;window.__xpSum+=n;return _g(n,at)}; "hooked"`);
  /* A. 快速连点同一选项 */
  const before=await ev(`JSON.stringify({monHP})`);
  const b0=JSON.parse(before);
  await ev(`(function(){const w=curQ.o[curQ.a];const b=[...document.querySelectorAll('.opt')].find(x=>x.textContent===w);b.click();b.click();b.click();})()`);
  await waitIdle();
  const mid=await ev(`JSON.stringify({monHP,xpN:window.__xpN,xpSum:window.__xpSum,q:$('question').textContent})`);
  const m0=JSON.parse(mid);
  const delta=b0.monHP-m0.monHP;
  const passA=delta>=18&&delta<=26&&m0.xpN===1&&m0.xpSum===8;
  /* B. 换怪空档点击旧选项 */
  await ev(`monHP=3; window.__xpN=0; window.__xpSum=0; window.__guardSamples=[]; "ready"`);
  const killClickP=`(function(){ window.__guardSamples.push(BATTLE_CORE.canAnswer({busy,gameOver,monHP,frozenUntil}));
    const b=document.querySelectorAll('.opt')[0]; if(b&&!b.disabled) b.click(); })()`;
  await clickCorrect();
  await waitFor(`monHP<=0`,5000,'击杀');
  /* 击杀瞬间到新怪刷出之间连点旧选项，同时采样守卫判定 */
  for(let i=0;i<8;i++){ await ev(killClickP).catch(e=>{}); await sleep(120); }
  await waitIdle();
  const end=await ev(`JSON.stringify({xpN:window.__xpN,xpSum:window.__xpSum,hp:heroHP,opts:document.querySelectorAll('.opt').length,gameOver,guards:window.__guardSamples})`);
  const e0=JSON.parse(end);
  await shot('ui04-transition');
  /* 击杀题 +8 与系统击杀奖励 +6 是仅有的两笔经验；空档连点不得产生第三笔 */
  const passB=e0.xpN===2&&e0.xpSum===14&&e0.hp>0&&!e0.gameOver&&e0.guards.length===8&&e0.guards.every(g=>g===false);
  rec('UI-04',passA&&passB,
    `A: 三连点同一选项仅结算一次（HP ${b0.monHP}→${m0.monHP}，伤害 ${delta} 在 18~26 单发区间；gainXp 探针恰好 1 次 +8）；B: 换怪空档连点 8 次旧选项——8 次采样 canAnswer 守卫全部拒绝(${e0.guards.filter(g=>!g).length}/8)，探针仅 2 笔（答题 +8 + 击杀奖励 +6 = ${e0.xpSum}），无第三笔经验、勇者未掉血、异常 0`,
    {doubleClickDmg:delta,xpCallsA:m0.xpN,xpSumA:m0.xpSum,xpCallsB:e0.xpN,xpSumB:e0.xpSum,transitionClicks:8,guardRejectedAll:e0.guards.every(g=>g===false)},
    '注入：monHP=3 触发击杀；gainXp 探针替代 heroXp 直读（升级会重置 heroXp）；击杀奖励 +6 来自 HTML:1044 gainXp(m.boss?15:6)',
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
  const st=await ev(`JSON.stringify({hp:heroHP,gameOver,overlay:$('overlay').classList.contains('show'),title:$('ovtitle').textContent,opts:document.querySelectorAll('.opt').length})`);
  const s0=JSON.parse(st);
  await shot('ui05-dead');
  /* 死亡后输入锁定验证 */
  await ev(`(function(){const b=document.querySelectorAll('.opt')[0]; if(b) b.click();})()`).catch(e=>{});
  await sleep(500);
  const st2=await ev(`JSON.stringify({hp:heroHP,gameOver})`);
  const s2=JSON.parse(st2);
  const pass=s0.hp===0&&s0.gameOver&&s0.overlay&&/击倒/.test(s0.title)&&s2.hp===0&&s2.gameOver;
  rec('UI-05',pass,
    `注入 HP=3 + 中毒 1 回合×5 伤害后，${(elapsed/1000).toFixed(1)}s 内页面实际计时结算死亡：HP=0、死亡浮层「${s0.title}」可见、gameOver=true；死后点击选项无效（HP 仍 0，战斗不再推进）`,
    {deathAfterMs:elapsed,overlayTitle:s0.title,inputLocked:s2.hp===0&&s2.gameOver},
    '注入值：heroHP=3, applyPoison(1,5)；结算走页面真实 2.8s 毒 tick',
    ['screenshots/ui05-poisoned.png','screenshots/ui05-dead.png']);
}

/* ---------------- UI-06 ---------------- */
async function ui06(){
  currentCase='UI-06';
  /* a) 毒 */
  await freshPage(); await enterBattle();
  await ev(`heroHP=100; applyPoison(9,3); "poison"`);
  await ev(`$('skMap').click()`);   /* 用户路径：战斗内点「返回地图」 */
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await sleep(3500);
  const a1=await ev(`JSON.stringify({hp:heroHP,poison:!!poison,map:$('mapscreen').style.display!=='none'})`);
  const s1=JSON.parse(a1);
  await shot('ui06-poison-cleared');
  /* b) 冻结 */
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
  /* c) 续力 */
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
    `a) 中毒中返回地图：3.5s 后 HP 仍 100、poison=null（原 tick 不再扣血）；b) 冻结 60s 返回地图：frozenUntil 归 0，重进战斗答题区无冻结；c) 续力中返回地图：4.5s 后 charging=null 且 frozenUntil=0（原 4s 续力未在大招落地）`,
    {poisonHp:s1.hp,poisonCleared:!s1.poison,freezeSet:frozenSet,freezeCleared:cleared,reenterFrozen:s3.frozen,chargeSet:chargingSet,chargeCleared:!s5.charging,skillLandedAfterBack:s5.frozen},
    '注入值：applyPoison(9,3)、doFreeze(60)、startCharge(freeze)；返回地图走页面 skMap 按钮',
    ['screenshots/ui06-poison-cleared.png','screenshots/ui06-freeze-cleared.png','screenshots/ui06-charge-cleared.png']);
}

/* ---------------- UI-07 ---------------- */
async function ui07(){
  currentCase='UI-07';
  await freshPage(); await enterBattle();
  await ev(`heroHP=100; monTimer=1; window.__atk=0; window.__resetSeen=false; window.__resetFrom=null; window.__resetAt=0;
    const _mt=monsterTurn; monsterTurn=async function(){ if(!charging&&!gameOver&&monHP>0&&heroHP>0) window.__atk++; return _mt.apply(this,arguments) };
    const _as=BATTLE_CORE.afterSkillMonTimer; BATTLE_CORE.afterSkillMonTimer=function(t){window.__resetSeen=true; window.__resetFrom=t; window.__resetAt=Date.now(); return _as(t)};
    startCharge({id:'frost',name:'冰霜吐息'}); "charging"`);
  /* monTimer=1 起步：续力期间 1s tick 把它减成负数（monsterTurn 有 charging 守卫不普攻），
     大招落地后应经 afterSkillMonTimer 归位——完整复刻真实连招修复路径。
     __atk 只统计通过 charging 守卫的真实普攻（空调用不计） */
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
  /* 归位→首次真实普攻：monTimer 归位 3 个 1s tick，但与 tick 相位不对齐，
     墙钟间隔实测 2.0~3.0s——符合计划文档「大招后 2~3 秒喘息」设计口径 */
  await waitFor(`window.__atk>0`,9000,'宽限期后的下一次普攻');
  const gap=await ev(`Date.now()-window.__resetAt`);
  await shot('ui07-after-ult');
  const pass=pct0<=15&&pct1>=85&&ms0.monTimer<0&&ms0.atk===0&&s0.resetFrom<0&&s0.atk===0&&s0.frozen&&!s0.charging&&gap>=1900;
  rec('UI-07',pass,
    `续力条从 ${pct0.toFixed(0)}% 涨到 ${pct1.toFixed(0)}%（4s 周期）；续力期 monTimer 走负至 ${ms0.monTimer}（真实普攻探针 0 次——charging 守卫全程拦截）；大招落地时 afterSkillMonTimer(${s0.resetFrom}) 归位 3 个计时 tick，归位→首次普攻间隔 ${gap}ms（≥1900ms 下界；与 tick 相位有关，设计口径 2~3 秒喘息），无「立即补刀」`,
    {pctStart:pct0,pctEnd:pct1,monTimerDuringCharge:ms0.monTimer,resetFrom:s0.resetFrom,graceGapMs:gap,realAttacksDuringCharge:ms0.atk},
    '注入值：startCharge(frost)+monTimer=1（复刻「续力期计时走负→大招后归位」真实路径，跳过 25% RNG）；monsterTurn/afterSkillMonTimer 挂探针计数',
    ['screenshots/ui07-charge-start.png','screenshots/ui07-charge-end.png','screenshots/ui07-after-ult.png']);
}

/* ---------------- UI-08 ---------------- */
async function ui08(){
  currentCase='UI-08';
  await freshPage();
  await fairyOn();
  await enterBattle();
  const logsBefore=await ev(`fairyLogAll().length`);
  await ev(`startCharge({id:'freeze',name:'绝对冰冻'}); "charging"`);
  await waitFor(`fairyLogAll().length>${logsBefore} && !fairyBusy && !fairyPendingEv`,30000,'精灵处理蓄力事件');
  await sleep(500);
  const last6=await ev(`JSON.stringify(fairyLogAll().slice(-6))`);
  const entries=JSON.parse(last6);
  const charge=entries.filter(e=>e.ev.includes('CHARGING the skill'));
  await shot('ui08-freeze-event');
  const pass=charge.length>=1&&charge.every(e=>e.ev.includes('Absolute Freeze')&&!e.ev.includes('undefined'));
  const c0=charge[charge.length-1];
  rec('UI-08',pass,
    `冰霜魔王蓄力触发精灵事件（检索最近 ${entries.length} 条中的蓄力事件 ${charge.length} 条），文案含「Absolute Freeze」且无 undefined。原文片段: ${c0?c0.ev.slice(0,90):'未找到'}…`,
    {chargeEvents:charge.length,containsFreeze:!!(c0&&c0.ev.includes('Absolute Freeze')),containsUndefined:charge.some(e=>e.ev.includes('undefined'))},
    '注入值：startCharge(freeze)（第三 Boss「绝对冰冻」技能，跳过 45% RNG）；大招未被拦截会继续落地产生后续事件，故按事件类型检索而非取末条',
    ['screenshots/ui08-freeze-event.png','sessions/ui08-fairy-entry.json']);
  fs.writeFileSync(path.join(PKG,'sessions','ui08-fairy-entry.json'),JSON.stringify(entries,null,1));
}

/* ---------------- UI-09 ---------------- */
async function ui09(){
  currentCase='UI-09';
  await freshPage(); await enterBattle();
  const wrongPick=await clickWrong();
  await waitIdle();
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnWrong').click()`);
  await sleep(400);
  const wb=await ev(`JSON.stringify({show:$('wbwrap').classList.contains('show'),count:$('wbcount').textContent,list:$('wblist').textContent})`);
  const w0=JSON.parse(wb);
  await shot('ui09-wrongbook');
  await ev(`$('wbClose').click()`);
  await sleep(300);
  const closed=await ev(`!$('wbwrap').classList.contains('show')`);
  const pass=w0.show&&/共 1 题/.test(w0.count)&&w0.list.includes(wrongPick)&&closed;
  rec('UI-09',pass,
    `错题 1 条后回地图点「错题本」：弹窗可见（计数「${w0.count}」），列表含错误项「${wrongPick}」；关闭后弹窗隐藏`,
    {visible:w0.show,count:w0.count,closeWorks:closed},
    '',
    ['screenshots/ui09-wrongbook.png']);
}

/* ---------------- UI-10 ---------------- */
async function ui10(){
  currentCase='UI-10';
  await freshPage();   /* localStorage 已清——先造一条精灵日志 */
  await fairyOn();
  await enterBattle();
  await waitFor(`fairyLogAll().length>=1 && !fairyBusy`,30000,'至少一条精灵日志');
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  const total=await ev(`fairyLogAll().length`);
  await ev(`$('btnFairyLog').click()`);
  await sleep(400);
  const fl=await ev(`JSON.stringify({show:$('flwrap').classList.contains('show'),count:$('flcount').textContent,items:$('fllist').children.length,stats:$('flstats').textContent})`);
  const f0=JSON.parse(fl);
  await shot('ui10-fairylog');
  await ev(`$('flClose').click()`);
  await sleep(300);
  const closed=await ev(`!$('flwrap').classList.contains('show')`);
  const pass=f0.show&&f0.count.includes(String(total))&&f0.items>=1&&f0.stats.length>1&&closed;
  rec('UI-10',pass,
    `精灵日志 ${total} 条：弹窗可见（计数「${f0.count}」、条目 ${f0.items}、心情统计「${f0.stats}」）；关闭后隐藏`,
    {total,visible:f0.show,items:f0.items,closeWorks:closed},
    '',
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
  /* 等初始「出题」事件处理完（真实 LLM），避免 TEST 事件被排队覆盖丢弃 */
  await waitFor(`!fairyBusy && !fairyPendingEv`,30000,'初始精灵事件完成');
  /* 注入 mock fetch：延迟 1.2s 返回含旧题正确答案词的受控文本（模拟 LLM 思考期间切题） */
  await ev(`window.__captured=[]; window.__leak=${JSON.stringify(Q1.correct)};
    window.fetch=async(url,opts)=>{ window.__captured.push({url:String(url),body:opts&&opts.body});
      await new Promise(r=>setTimeout(r,1200));
      return new Response(JSON.stringify({choices:[{message:{content:'[worried] Stay calm my dear! Remember the word '+window.__leak+' from before, keep thinking!'}}]}),{status:200,headers:{'Content-Type':'application/json'}}); }; "mocked"`);
  /* 事件入队瞬间快照旧题 → 立刻答对切到新题（模拟 LLM 未返回时题面已切换） */
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
    `旧题「${Q1.q.slice(0,24)}…」事件发出后立刻答对切到新题，1.2s 后 mock 响应返回：日志 quiz 字段仍为旧题（${test?test.quiz.slice(0,24):'未找到'}）；该条台词含打码 🚫 且不含旧题答案原文「${Q1.correct}」（若误用新题打码则旧答案会原样泄出）`,
    {logQuizIsOld:!!(test&&test.quiz===Q1.q),masked:!!(test&&test.text.includes('🚫')),leak:!!(test&&test.text.includes(Q1.correct)),qChanged:Q1.q!==Q2.q,capturedRequests:(await ev(`window.__captured.length`))},
    '注入：window.fetch mock（延迟 1.2s）返回含旧题答案词的受控文本；事件与切题时序由驱动控制',
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
  /* 日志弹窗同样验证 */
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnFairyLog').click()`);
  await sleep(400);
  const fl=await ev(`JSON.stringify({img:!!$('fllist').querySelector('img'),script:!!$('fllist').querySelector('script'),literal:$('fllist').textContent.includes('<img')})`);
  const f0=JSON.parse(fl);
  await shot('ui12-fairylog-safe');
  await ev(`$('flClose').click()`);
  const pass=!b0.img&&!b0.script&&!b0.pwned&&!b0.pwned2&&b0.text.includes('<img')&&!f0.img&&!f0.script&&f0.literal;
  rec('UI-12',pass,
    `模型文本含 <img onerror> 与 <script>：气泡与精灵日志均按纯文本显示（textContent 含字面 '<img'），未创建元素，onerror/script 均未执行（__pwned/__pwned2 均为空）`,
    {bubbleImgElement:b0.img,bubbleScriptElement:b0.script,scriptExecuted:!!b0.pwned,onerrorExecuted:!!b0.pwned2,logImgElement:f0.img},
    '注入：window.fetch mock 返回带 HTML 的受控文本',
    ['screenshots/ui12-bubble-safe.png','screenshots/ui12-fairylog-safe.png']);
}

/* ---------------- UI-13 ---------------- */
async function ui13(){
  currentCase='UI-13';
  const errs0=consoleErrsSince();
  await freshPage(); await enterBattle();
  await clickCorrect(); await waitIdle();
  await clickWrong(); await waitIdle();
  await ev(`$('skMap').click()`);
  await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
  await ev(`$('btnWrong').click()`); await sleep(300);
  const wbOpen=await ev(`$('wbwrap').classList.contains('show')`);
  await ev(`$('wbClose').click()`); await sleep(200);
  const errs1=consoleErrsSince();
  await shot('ui13-no-llm-flow');
  const pass=wbOpen&&errs1===errs0;
  rec('UI-13',pass,
    `未召唤精灵（LM Studio 在线但未启用）：答题对/错各一次、返回地图、错题本开合全流程无阻塞、无未捕获异常`,
    {consoleErrors:errs1-errs0,wrongbookOpened:wbOpen},
    '不验收阶段 3 静态讲解（标准 1.2）',
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
    /* 控制台错误归集到对应用例窗口 */
    const summary={executedAt:new Date().toISOString(),base:BASE,results};
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
