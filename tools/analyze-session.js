/* 全量日志分析：题目曝光 / 玩家表现 / 精灵台词质检 / 泄题复查 / 数据质量问题
   用法：node tools/analyze-session.js [player-log.json] [fairy-log.json]
   缺省用 1029 实验快照（仓库根目录）；实时日志传 log-player-{sid}.json / log-fairy-{sid}.json */
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const DIR=ROOT;

/* ---- 载入题库（require 共享模块 nce-shared.js：与游戏同一份源，结构级零漂移，
        不再从 HTML 做字符串切片 + eval——改 HTML 布局也不会碎） ---- */
const {QUESTIONS:BANK, VERB_DB:VERBS}=require('../nce-shared.js');
const qtype=q=>{ /* 参数：题干字符串（口径与 question-audit.js 的 qtype2 一致：
  兼容"变形/不规则变形"变体与"过去式拼写"等措辞，旧正则把 6 道变体分类题错记进句型桶） */
  if(/的过去式(是|拼写)？$/.test(q))return '动词·过去式';
  if(/的过去分词是？$/.test(q))return '动词·过去分词';
  if(/的三种形式是？$/.test(q))return '动词·三形默写';
  if(/中哪个是过去分词？$/.test(q))return '动词·认过去分词';
  if(/补全三形？$/.test(q))return '动词·补全三形';
  if(q.includes('属于哪种')&&q.includes('变形'))return '动词·变形分类';
  return '疑问句型/其他';
};
console.log('== 题库 ==');
console.log('总数',BANK.length,'| 按类型',
  JSON.stringify(BANK.reduce((a,q)=>(a[qtype(q.q)]=(a[qtype(q.q)]||0)+1,a),{})),
  '| 按难度',
  JSON.stringify(BANK.reduce((a,q)=>(a['d'+q.d]=(a['d'+q.d]||0)+1,a),{})));

/* ---- 载入日志（路径参数化） ---- */
const playerPath=process.argv[2]||path.join(DIR,'player-session-1029.json');
const fairyPath =process.argv[3]||path.join(DIR,'fairy-session-1029.json');
const player=JSON.parse(fs.readFileSync(playerPath,'utf8'));
const fairy=JSON.parse(fs.readFileSync(fairyPath,'utf8'));
const picks=player.filter(e=>['pick','retry-pick'].includes(e.ev));
const fmt=t=>new Date(t).toTimeString().slice(0,8);

/* ---- 1) 玩家离线重判 ---- */
console.log('\n== 玩家表现（离线按题库重判） ==');
let per={},conf=[];
let firstOk=0,firstN=0,retryOk=0,retryN=0;
picks.forEach(e=>{
  const q=BANK.find(x=>x.q===e.q&&x.o.includes(e.pickText));
  if(!q){console.log('  ⚠ 无法匹配题库:',e.q);return;}
  const ok=q.o[q.a]===e.pickText;
  const t=qtype(q.q);
  per[t]=per[t]||{n:0,ok:0}; per[t].n++; if(ok)per[t].ok++;
  if(e.ev==='pick'){firstN++; if(ok)firstOk++;}
  else {retryN++; if(ok)retryOk++;}
  if(!ok&&t==='动词·变形分类'){
    const truth=q.o[q.a], wrong=e.pickText;
    conf.push([truth.slice(0,3),wrong.slice(0,3)]);
  }
});
Object.entries(per).forEach(([t,v])=>console.log(' ',t+':',v.ok+'/'+v.n,'=',Math.round(v.ok/v.n*100)+'%'));
console.log(' 首答:',firstOk+'/'+firstN,'=',Math.round(firstOk/firstN*100)+'%','| 重试后:',retryOk+'/'+retryN,'=',Math.round(retryOk/retryN*100)+'%');

/* ---- 2) 题目曝光 ---- */
console.log('\n== 题目曝光 ==');
const seen={};
picks.forEach(e=>{seen[e.q]=seen[e.q]||{n:0,wrong:0};seen[e.q].n++;});
picks.forEach(e=>{
  const q=BANK.find(x=>x.q===e.q&&x.o.includes(e.pickText));
  if(q&&q.o[q.a]!==e.pickText)seen[e.q].wrong++;
});
const uniq=Object.keys(seen).length;
console.log(' 唯一题目:',uniq,'/',BANK.length,'| 总作答',picks.length,'次（重做',picks.length-uniq,'）');
const byCh={};
picks.forEach(e=>{byCh[e.chapter]=byCh[e.chapter]||{n:0,ok:0};
  const q=BANK.find(x=>x.q===e.q&&x.o.includes(e.pickText));
  if(q&&q.o[q.a]===e.pickText)byCh[e.chapter].ok++; byCh[e.chapter].n++;});
Object.entries(byCh).forEach(([c,v])=>console.log(' 第'+c+'章:',v.ok+'/'+v.n,'=',Math.round(v.ok/v.n*100)+'%'));
/* 难度-章节映射检查 */
const dmap={};
picks.forEach(e=>{const q=BANK.find(x=>x.q===e.q&&x.o.includes(e.pickText));
  if(q){dmap[e.chapter]=dmap[e.chapter]||new Set();dmap[e.chapter].add(q.d);}});
Object.entries(dmap).forEach(([c,s])=>console.log(' 第'+c+'章出现难度: d'+[...s].sort().join(',d')));

/* ---- 3) 精灵台词质检 ---- */
console.log('\n== 精灵台词质检（94 条） ==');
/* 3a 泄题复查：台词里是否出现"当前题"的正确选项原文 */
let leak=[];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
fairy.forEach(e=>{
  if(!e.text||!e.quiz)return;
  const q=BANK.find(x=>e.quiz.includes(x.q.slice(0,Math.min(30,x.q.length))));
  if(!q)return;
  const correct=q.o[q.a];
  const re=new RegExp('(?<![\\u4e00-\\u9fa5A-Za-z])'+esc(correct)+'(?![\\u4e00-\\u9fa5A-Za-z])');
  if(re.test(e.text))leak.push({t:fmt(e.t),quiz:q.q.slice(0,30),correct:correct.slice(0,20),text:e.text.slice(0,90)});
});
console.log(' 泄题嫌疑（台词含当前题正确选项原文）:',leak.length);
leak.forEach(l=>console.log('  ⚠',l.t,l.quiz,'| 答案:',l.correct,'|',l.text));
/* 3b quiz 字段时序错位检测：用玩家时间线近似还原"事件发生时的题" */
let mism=0,checked=0;
const times=picks.map(e=>e.t);
fairy.forEach(e=>{
  if(!e.quiz)return; checked++;
  /* 找到该台词时间之前最近一次 pick 的题目——台词应对应那道题（ praise/wrong 类） */
  const prev=[...times].reverse().find(t=>t<=e.t);
  const p=prev!==undefined?picks.find(x=>x.t===prev):null;
  if(p&&['Your boy answered CO','Your boy just picked'].some(k=>e.ev.startsWith(k))){
    if(p.q!==e.quiz && !e.quiz.includes(p.q.slice(0,Math.min(20,p.q.length)))) mism++;
  }
});
console.log(' quiz字段疑似时序错位:',mism+'/'+checked,'条（praise/wrong 台词在打完动画后才落 log，题面已切到下一题）');
/* 3c 心跳观察缺席 */
const hb=fairy.filter(e=>/Quiet watching/i.test(e.ev)).length;
console.log(' 心跳观察触发次数:',hb,'（事件密集时正常被挤掉；阈值 30s 见页面 FAIRY_HEARTBEAT_MS）');
/* 3d 心情-事件匹配 sanity */
const moodByEv={};
fairy.forEach(e=>{const k=e.ev.startsWith('Your boy answered CO')?'答对':e.ev.startsWith('Your boy just picked')?'答错':e.ev.startsWith('A NEW')?'出题':'战斗事件';
  moodByEv[k]=moodByEv[k]||{};moodByEv[k][e.mood]=(moodByEv[k][e.mood]||0)+1;});
Object.entries(moodByEv).forEach(([k,v])=>console.log(' ',k,'心情:',JSON.stringify(v)));

/* ---- 4) 精灵提示 vs 答对率（提示是否帮到勇者） ---- */
console.log('\n== 提示有效性粗测 ==');
const rows=picks.map(e=>{
  const q=BANK.find(x=>x.q===e.q&&x.o.includes(e.pickText));
  return {ok:q&&q.o[q.a]===e.pickText, lat:e.latency, hintLen:(e.hint||'').length};
});
const withHint=rows.filter(r=>r.hintLen>40), noHint=rows.filter(r=>r.hintLen<=40);
if(noHint.length)console.log(' 无有效提示时正确率:',Math.round(100*noHint.filter(r=>r.ok).length/noHint.length)+'% ('+noHint.length+'题)');
console.log(' 有提示时正确率:',Math.round(100*withHint.filter(r=>r.ok).length/withHint.length)+'% ('+withHint.length+'题)');
console.log(' 决策延迟: 平均', (rows.reduce((s,r)=>s+(r.lat||0),0)/rows.length).toFixed(1)+'s',
  '| 最慢', Math.max(...rows.map(r=>r.lat||0)).toFixed(1)+'s');

/* ---- 5) 其他事件 ---- */
console.log('\n== 其他事件 ==');
player.filter(e=>!['pick','retry-pick'].includes(e.ev)).forEach(e=>console.log(' ',fmt(e.t),e.ev,JSON.stringify(e).slice(0,120)));
