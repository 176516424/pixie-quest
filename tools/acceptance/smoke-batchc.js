'use strict';
/* 批次 C 冒烟驱动 v2（三段式）：
   段A 默认模式 — C1 诊断入库 / C3 答错结算 L4 / 换题清讲解 / C2 摘要
   段B static模式 — 答错→静态提示→重试答对：retry 事件 + 结算 L4
   段C 错题本复习 — 复习答错/答对分路径 + 清空归零                              */
const fs=require('fs'), path=require('path'), {spawn}=require('child_process');
const BASE='http://127.0.0.1:8797';
const DBGPORT=9342;
const PROFILE=path.join(require('os').tmpdir(),'acc-chrome-profile-c28b');
const CHROME='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws, msgId=0; const pending=new Map();
function send(method,params){
  return new Promise((res,rej)=>{
    const id=++msgId; pending.set(id,{res,rej});
    ws.send(JSON.stringify({id,method,params:params||{}}));
  });
}
async function ev(expr){
  const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw new Error('页面脚本异常: '+((r.exceptionDetails.exception&&r.exceptionDetails.exception.description)||r.exceptionDetails.text));
  return r.result.value;
}
async function waitFor(expr,timeout,label){
  const t0=Date.now();
  while(Date.now()-t0<timeout){
    if(await ev('!!('+expr+')')) return true;
    await sleep(150);
  }
  throw new Error('等待超时: '+(label||expr));
}
const consoleErrors=[];
const results=[];
function rec(id,pass,actual){ results.push({id,pass,actual}); console.log((pass?'PASS':'FAIL')+' '+id+' — '+actual); }
async function fresh(url){
  await send('Page.navigate',{url:BASE+url});
  await waitFor(`document.readyState==='complete'`,15000,'首屏');
  await ev(`localStorage.removeItem('nce_battle_hist'); localStorage.removeItem('nce_battle_wrong'); 1`);
}
async function startBattle(){ await ev(`startLevel(0); 1`); await waitFor(`$('opts').children.length===4`,8000,'出题'); }
async function clickOpt(i){ await ev(`document.querySelectorAll('.opt')[${i}].click(); 1`); }
/* 选项 DOM 顺序是 shuffle 过的：必须按文本找按钮，不能按原数组下标点 DOM 位置 */
async function clickWrong(){ await ev(`[...document.querySelectorAll('.opt')].find(b=>b.textContent!==curQ.o[curQ.a]).click(); 1`); }
async function clickCorrect(){ await ev(`[...document.querySelectorAll('.opt')].find(b=>b.textContent===curQ.o[curQ.a]).click(); 1`); }
async function optsReady(){ await waitFor(`!busy&&!gameOver&&monHP>0&&$('opts').children.length===4&&Array.from(document.querySelectorAll('.opt')).every(b=>!b.disabled)`,9000,'选项可用'); }
async function wrongIdxOf(){ return ev(`[0,1,2,3].find(i=>i!==curQ.a)`); }
async function settleL4poll(timeout){
  /* 轮询结算讲解出现（答错题在换题边界触发 L4） */
  const t0=Date.now(); let owner='';
  while(Date.now()-t0<timeout){
    const st=await ev(`(function(){ const b=$('hintBar');
      return JSON.stringify({hit:b.style.display!=='none'&&document.querySelector('#hintBar .hsrc').textContent.indexOf('结算')>=0,
        qid:curQ?curQ.id:null, txt:document.querySelector('#hintBar .htext').textContent.slice(0,70)}); })()`);
    const s=JSON.parse(st);
    if(s.hit){ return {seen:true,qid:s.qid,txt:s.txt}; }
    await sleep(120);
  }
  return {seen:false,qid:'',txt:''};
}
(async()=>{
  const chrome=spawn(CHROME,[`--remote-debugging-port=${DBGPORT}`,`--user-data-dir=${PROFILE}`,
    '--no-proxy-server','--headless=new','--no-first-run','--no-default-browser-check','--window-size=1280,800','about:blank'],{stdio:'ignore'});
  try{
    for(let i=0;i<40;i++){ try{ const r=await fetch(`http://127.0.0.1:${DBGPORT}/json/version`); if(r.ok) break; }catch(e){} await sleep(200); }
    const t=await (await fetch(`http://127.0.0.1:${DBGPORT}/json/new?about:blank`,{method:'PUT'})).json();
    ws=new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res,rej)=>{ ws.onopen=res; ws.onerror=rej; });
    ws.onmessage=m=>{ const d=JSON.parse(m.data);
      if(d.id&&pending.has(d.id)){ const p=pending.get(d.id); pending.delete(d.id);
        d.error?p.rej(new Error(d.error.message)):p.res(d.result); }
      else if(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'){
        const txt=(d.params.args||[]).map(a=>a.value||a.description||'').join(' ');
        if(!txt.includes('PLAYER_LOG')) consoleErrors.push(txt.slice(0,200));
      }
      else if(d.method==='Runtime.exceptionThrown'){
        const desc=(d.params.exceptionDetails.exception&&d.params.exceptionDetails.exception.description)||d.params.exceptionDetails.text;
        if(!/PLAYER_LOG/.test(desc||'')) consoleErrors.push(String(desc).slice(0,200));
      }};
    await send('Page.enable'); await send('Runtime.enable');

    /* ============ 段A：默认模式 ============ */
    await fresh('/');
    rec('T-01 模块加载', await ev(`typeof TEACH_CORE==='object'&&typeof TEACH_CORE.diagnoseError==='function'&&typeof TEACH_CORE.buildReviewQueue==='function'`),
      'TEACH_CORE 注入页面，诊断/复习/门禁接口可用');
    await startBattle();
    const q1id=await ev(`curQ.id`);
    await optsReady();
    await clickWrong();
    const wb1=JSON.parse(await ev(`localStorage.getItem('nce_battle_wrong')||'[]'`));
    const h1=JSON.parse(await ev(`localStorage.getItem('nce_battle_hist')||'[]'`));
    rec('T-02 C1 诊断入库', !!(wb1[0]&&wb1[0].cat&&wb1[0].qid===q1id&&h1[0]&&h1[0].phase==='first'&&h1[0].ok===false),
      '错题条目 qid='+q1id+' 类别「'+(wb1[0]&&wb1[0].cat)+'」(basis='+(wb1[0]&&wb1[0].catBasis)+')；历史 first:false');
    const l4=await settleL4poll(8000);
    rec('T-03 C3 答错结算 L4', l4.seen&&l4.txt.length>0,
      '换题边界出「📖 结算讲解」：'+l4.txt);
    await waitFor(`$('opts').children.length===4&&$('opts').children[0].disabled===false`,9000,'新题渲染');
    const cleared=await ev(`$('hintBar').style.display==='none'||document.querySelector('#hintBar .hsrc').textContent.indexOf('结算')<0`);
    rec('T-04 C3 换题清讲解', cleared, '新题出现后上一题讲解已清（hintClear）');
    const sum=JSON.parse(await ev(`JSON.stringify(TEACH_CORE.buildLearnerSummary(JSON.parse(localStorage.getItem('nce_battle_hist')||'[]')))`));
    rec('T-05 C2 学习者摘要', sum.recentWeaknesses.length>=1&&sum.recentWeaknesses[0].qid===q1id,
      'weaknesses='+JSON.stringify(sum.recentWeaknesses)+'（最近仍错的题进弱点列表）');

    /* ============ 段B：static 模式（重试路径） ============ */
    await fresh('/?exp=static');
    await startBattle();
    const q2id=await ev(`curQ.id`);
    await optsReady();
    await clickWrong();
    /* static 分支在 heroMiss 动画后才执行：条件等待而不是固定 sleep */
    await waitFor(`qAttempt>=1&&$('hintBar').style.display!=='none'&&document.querySelector('#hintBar .hsrc').textContent.indexOf('静态')>=0`,8000,'静态提示出现');
    const retryEnabled=await ev(`Array.from(document.querySelectorAll('.opt')).some(b=>!b.disabled&&!b.classList.contains('bad'))`);
    rec('T-06 static 提示与重试解锁', retryEnabled===true,
      '答错后静态提示出现（L'+await ev(`qAttempt`)+' 级）、未错选项重新可用='+retryEnabled);
    await waitFor(`Array.from(document.querySelectorAll('.opt')).some(b=>!b.disabled&&!b.classList.contains('bad'))`,5000,'重试解锁');
    await clickCorrect();
    let l4b={seen:false};
    for(let i=0;i<50;i++){ await sleep(150);
      const st=await ev(`(function(){ const b=$('hintBar');
        return JSON.stringify({hit:b.style.display!=='none'&&document.querySelector('#hintBar .hsrc').textContent.indexOf('结算')>=0,txt:document.querySelector('#hintBar .htext').textContent.slice(0,70)}); })()`);
      const s=JSON.parse(st); if(s.hit){ l4b={seen:true,txt:s.txt}; break; } }
    const hist2=JSON.parse(await ev(`localStorage.getItem('nce_battle_hist')||'[]'`));
    const retryEv=hist2.filter(e=>e.qid===q2id);
    rec('T-07 C2/C3 重试+结算L4', !!(l4b.seen&&retryEv.length>=2&&retryEv[0].ok===false&&retryEv[retryEv.length-1].ok===true&&retryEv[retryEv.length-1].phase==='retry'),
      '同题先错后对：'+retryEv.map(e=>e.phase+':'+(e.ok?'ok':'miss')).join('→')+'；结算讲解「'+l4b.txt+'」');
    const wbAfter=JSON.parse(await ev(`localStorage.getItem('nce_battle_wrong')||'[]'`));
    rec('T-08 答对移出错题本', !wbAfter.find(x=>x.qid===q2id), '重试答对后该题已掌握移除（剩 '+wbAfter.length+' 条）');

    /* ============ 段C：错题本复习闭环 ============ */
    /* 制造一条错题：static 模式答错后不重试，直接回地图（战斗中止，错题保留） */
    await optsReady();
    await clickWrong(); await sleep(900);
    await ev(`$('skMap').click(); 1`);
    await waitFor(`$('mapscreen').style.display!=='none'`,5000,'回地图');
    await ev(`$('btnWrong').click(); 1`);
    await waitFor(`$('wbwrap').classList.contains('show')`,5000,'错题本打开');
    const catChip=await ev(`(document.querySelector('#wblist .wbitem')||{}).textContent||''`);
    await ev(`Array.from(document.querySelectorAll('#wblist .pbtn')).find(b=>b.textContent.indexOf('复习')>=0).click(); 1`);
    await waitFor(`!!document.querySelector('#rvopts')&&document.querySelector('#rvopts').children.length===4`,5000,'复习题渲染');
    /* 复习答错路径 */
    const rvWrong=(await ev(`(function(){ const txt=document.querySelector('.wbq').textContent.replace('🔁 ','');
      const q=QUESTIONS.find(x=>x.q===txt); return q.a===0?1:0; })()`));
    await clickRv(rvWrong);
    await sleep(300);
    const fbWrong=await ev(`(document.querySelector('#rvfb')||{textContent:''}).textContent.indexOf('❌')>=0`);
    const rvMissEv=JSON.parse(await ev(`JSON.stringify((JSON.parse(localStorage.getItem('nce_battle_hist')||'[]')).filter(e=>e.phase==='review'&&e.ok===false))`));
    rec('T-09 C4 复习-答错', !!(fbWrong&&rvMissEv.length===1),
      '复习答错：反馈出现、review:false 事件入库（含 L4 式讲解反馈）');
    await sleep(2400);
    /* 队列前进：答错后 idx++。只有 1 条 → 完成页。重新打开错题本再复习并答对 */
    await ev(`$('wbClose').click(); $('btnWrong').click(); 1`);
    await waitFor(`$('wbwrap').classList.contains('show')`,5000,'错题本再打开');
    await ev(`Array.from(document.querySelectorAll('#wblist .pbtn')).find(b=>b.textContent.indexOf('复习')>=0).click(); 1`);
    await waitFor(`!!document.querySelector('#rvopts')&&document.querySelector('#rvopts').children.length===4`,5000,'复习题再渲染');
    const rvOk=await ev(`(function(){ const txt=document.querySelector('.wbq').textContent.replace('🔁 ','');
      const q=QUESTIONS.find(x=>x.q===txt); return q.a; })()`);
    await clickRv(rvOk);
    await sleep(300);
    const fbOk=await ev(`(document.querySelector('#rvfb')||{textContent:''}).textContent.indexOf('✅')>=0`);
    await sleep(2400);
    const fin=JSON.parse(await ev(`JSON.stringify({wb:JSON.parse(localStorage.getItem('nce_battle_wrong')||'[]').length,
      ok:JSON.parse(localStorage.getItem('nce_battle_hist')||'[]').filter(e=>e.phase==='review'&&e.ok===true).length})`));
    rec('T-10 C4 复习-答对移除', !!(fbOk&&fin.wb===0&&fin.ok===1),
      '复习答对：✅ 反馈、错题本清空（'+fin.wb+' 条）、review:true 事件 '+fin.ok+' 条');
    /* 清空归零 */
    await ev(`$('wbClear').click(); 1`);
    const cl=JSON.parse(await ev(`JSON.stringify({h:JSON.parse(localStorage.getItem('nce_battle_hist')||'[]').length,
      w:JSON.parse(localStorage.getItem('nce_battle_wrong')||'[]').length})`));
    rec('T-11 清空归零不串画像', cl.h===0&&cl.w===0, '清空后历史 '+cl.h+' 条、错题 '+cl.w+' 条');
    rec('T-12 控制台错误', consoleErrors.length===0, consoleErrors.length?('发现 '+consoleErrors.length+' 条: '+consoleErrors[0]):'全程 0 条未捕获异常');

    const np=results.filter(r=>r.pass).length;
    console.log(`\n=== 冒烟汇总: ${np}/${results.length} PASS ===`);
    fs.writeFileSync(path.join(__dirname,'smoke-batchc-results.json'),
      JSON.stringify({executedAt:new Date().toISOString(),pass:np,total:results.length,results,consoleErrors},null,1));
  }catch(e){
    console.error('驱动失败:',e.message);
    const np=results.filter(r=>r.pass).length;
    fs.writeFileSync(path.join(__dirname,'smoke-batchc-results.json'),
      JSON.stringify({executedAt:new Date().toISOString(),pass:np,total:results.length,results,consoleErrors,fatal:e.message},null,1));
    process.exitCode=1;
  }finally{
    try{ ws&&ws.close(); }catch(e){}
    try{ chrome.kill(); }catch(e){}
  }
})();
async function clickRv(i){ await ev(`document.querySelectorAll('#rvopts .pbtn')[${i}].click(); 1`); }
