'use strict';
/* 🧚 精灵台词审计工具：直接 require 共享模块拿真实 system prompt（与线上一字不差），
   重放 16 个典型战场事件，收集她的每句台词并做"教学相关性"分类 */
const fs=require('fs'), http=require('http');
const {VERB_DB, maskLeaks, FAIRY_SYS:sys, LLM_MODEL}=require('./nce-shared.js');

function buildMaskOpts(quiz, optTexts){
  let maskOpts=(quiz&&typeof quiz.a==='number')?[String(quiz.o[quiz.a])]:optTexts.slice();
  const words=((quiz&&quiz.q)||''+' '+(quiz&&quiz.o||[]).join(' ')).toLowerCase().match(/[a-z][a-z'-]{1,}/g)||[];
  VERB_DB.forEach(v=>{ if(words.indexOf(String(v[0]).toLowerCase())>=0) maskOpts.push(String(v[1]),String(v[2])); });
  return maskOpts;
}

/* 2) 战场速览生成（与页面 battlefield() 同构） */
function digest(o){
  let s='=== BATTLEFIELD (you see everything in real time) ===\n';
  s+='Chapter: '+o.chapter+'\n';
  s+='Enemy: '+o.enemy+' — HP '+o.monHP+'/'+o.monMax+' ('+Math.round(o.monHP/o.monMax*100)+'% left)\n';
  s+='YOUR BOY: HP '+o.hp+'/100'+(o.hp<=25?' ⚠ CRITICAL!':o.hp<=50?' (badly hurt)':' (okay)')+', MP '+o.mp+'/50\n';
  s+='Enemy next attack in ~'+o.timer+'s\n';
  if(o.poison) s+='Your boy is POISONED and losing HP over time!\n';
  if(o.frozen) s+='Quiz area is FROZEN for '+o.frozen+'s more!\n';
  if(o.wrongPicks&&o.wrongPicks.length) s+='His wrong picks on this question: '+o.wrongPicks.join(', ')+'\n';
  if(o.quiz) s+='Current quiz: '+o.quiz.q+'\n'+o.quiz.o.map((x,i)=>String.fromCharCode(65+i)+'. '+x).join('\n')+'\n';
  /* 与游戏内 battlefield() 保持同构：JUST HAPPENED 放最后（稳定前缀最大化） */
  s+='JUST HAPPENED: '+o.event+'\n';
  return s;
}

/* 3) 重放事件（覆盖一整章的真实流程） */
const Q1={q:'go 的过去式是？',o:['goed','went','gone','goes'],a:1,correct:'went'};
const Q2={q:'"He doesn\'t like coffee, ___?" 反意部分应填？',o:["doesn't he",'does he','isn\'t he','does not he'],a:1,correct:'does he'};
const Q3={q:'buy — bought · bought 属于哪种不规则变形？',o:['ABB（过去式=过去分词）','AAA（三形同形）','ABC（三形都不同）','ABA（原形=过去分词）'],a:0,correct:'ABB'};
const EVENTS=[
 {name:'出题-动词',   o:{chapter:'Chapter 1 · Grassland',enemy:'Grass Slime',monHP:80,monMax:80,hp:100,mp:32,timer:15,event:'A NEW quiz question just appeared. Watch over your boy and start helping him understand it.',quiz:Q1}},
 {name:'出题-反意疑问句',o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:210,monMax:260,hp:84,mp:40,timer:11,event:'A NEW quiz question just appeared. Watch over your boy and start helping him understand it.',quiz:Q2}},
 {name:'被打-轻伤',   o:{chapter:'Chapter 1 · Grassland',enemy:'Grass Slime',monHP:62,monMax:80,hp:72,mp:30,timer:13,event:'The enemy Grass Slime just ATTACKED your boy for -11 HP (now 72/100).',quiz:Q1}},
 {name:'被打-重伤',   o:{chapter:'Chapter 2 · Lava Cave',enemy:'Rock Golem',monHP:90,monMax:140,hp:38,mp:22,timer:9,event:'The enemy Rock Golem just ATTACKED your boy for -14 HP (now 38/100). He is badly hurt — worry about him!',quiz:Q3}},
 {name:'被打-濒危',   o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:150,monMax:260,hp:22,mp:30,timer:6,event:'The enemy Frost Demon King (BOSS) just ATTACKED your boy for -18 HP (now 22/100). He is CRITICAL — panic and beg him to heal!',quiz:Q2}},
 {name:'怪兽蓄力',    o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:140,monMax:260,hp:30,mp:30,timer:5,event:'DANGER! The enemy Frost Demon King (BOSS) is CHARGING a special skill: Absolute Freeze! Protect your boy instinct — warn him what to expect!',quiz:Q2}},
 {name:'中毒',        o:{chapter:'Chapter 1 · Grassland',enemy:'Mushroom Imp',monHP:70,monMax:100,hp:55,mp:25,timer:12,poison:true,event:'Your boy got POISONED! He will lose 4 HP every few seconds for 3 ticks. Show your motherly worry!',quiz:Q1}},
 {name:'被冻结',      o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:120,monMax:260,hp:26,mp:20,timer:8,frozen:5,event:'The quiz area just got FROZEN for 5 seconds and the enemy timer keeps running! Warn your boy to stay calm!',quiz:Q2}},
 {name:'治疗成功',    o:{chapter:'Chapter 2 · Lava Cave',enemy:'Lava Giant (BOSS)',monHP:170,monMax:200,hp:63,mp:15,timer:10,event:'Your boy used a healing potion and recovered +29 HP (now 63/100). Show your motherly relief and joy!',quiz:Q3}},
 {name:'答对了',      o:{chapter:'Chapter 1 · Grassland',enemy:'Grass Slime',monHP:58,monMax:80,hp:90,mp:44,timer:14,event:'Your boy answered CORRECTLY and struck the enemy! Be a proud happy mom — praise him warmly!',quiz:Q1}},
 {name:'答错了',      o:{chapter:'Chapter 2 · Lava Cave',enemy:'Cave Bat',monHP:80,monMax:110,hp:60,mp:26,timer:12,wrongPicks:['"goes"'],event:'Your boy just picked a WRONG answer ("goes") and his attack missed! Be sad but supportive, then explain the key rule again in EASIER English. Never tell the right answer.',quiz:Q1}},
 {name:'击杀小怪',    o:{chapter:'Chapter 1 · Grassland',enemy:'Grass Slime',monHP:0,monMax:80,hp:70,mp:38,timer:15,event:'Your boy just defeated Grass Slime! Praise him proudly and tell him to rest before the next fight.'}},
 {name:'击杀BOSS',    o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:0,monMax:260,hp:41,mp:22,timer:11,event:'YOUR BOY JUST DEFEATED THE BOSS Frost Demon King (BOSS)!! Burst with motherly pride and joy! 🎉'}},
 {name:'心跳-安静',   o:{chapter:'Chapter 1 · Grassland',enemy:'Mushroom Imp',monHP:75,monMax:100,hp:88,mp:36,timer:11,event:'Quiet watching: your boy is still thinking about the quiz. Say something motherly — encourage him, remind the grammar topic, or warn about the enemy attack timer. Vary your tone.',quiz:Q1}},
 {name:'心跳-拖延',   o:{chapter:'Chapter 2 · Lava Cave',enemy:'Rock Golem',monHP:110,monMax:140,hp:52,mp:28,timer:4,event:'Quiet watching: your boy is still thinking about the quiz. Say something motherly — encourage him, remind the grammar topic, or warn about the enemy attack timer. Vary your tone.',quiz:Q3}},
 {name:'心跳-残血',   o:{chapter:'Chapter 3 · Frozen Throne',enemy:'Frost Demon King (BOSS)',monHP:100,monMax:260,hp:24,mp:32,timer:7,event:'Quiet watching: your boy is still thinking about the quiz. Say something motherly — encourage him, remind the grammar topic, or warn about the enemy attack timer. Vary your tone.',quiz:Q2}},
];

function ask(o){
  return new Promise(res=>{
    const body=JSON.stringify({model:LLM_MODEL,temperature:0.85,max_tokens:120,messages:[
      {role:'system',content:sys},
      {role:'user',content:digest(o)},
      {role:'assistant',content:'<think>\n\n</think>'}
    ]});
    const r=http.request({host:'127.0.0.1',port:1234,path:'/v1/chat/completions',method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},prs=>{
      let b='';prs.on('data',c=>b+=c);prs.on('end',()=>{
        try{const d=JSON.parse(b);const m=d.choices[0].message;
          res({raw:(m.content||'').trim()});}
        catch(e){res({raw:'',err:e.message});}
      });});
    r.on('error',e=>res({raw:'',err:e.message}));
    r.end(body);
  });
}

/* 4) 教学相关性分类（启发式） */
const TEACH_WORDS=/past|verb|tense|grammar|question|sentence|pattern|vocabular|means|remember|think about| irregular|negative|affirmative|plural|pronoun|auxiliary|tag|spelling|form of|study|lesson|english| rule|hint|clue|notice|look at|quiz/i;
const FLUFF_ONLY=/^(?!.*(past|verb|tense|grammar|question|sentence|pattern|vocabular|means|remember| irregular|negative|affirmative|plural|pronoun|auxiliary|tag|spelling|form of|study|lesson| rule|quiz)).*$/i;
function classify(line){
  const t=line.replace(/^\s*\[[a-z]+\]\s*/i,'');
  const hasTag=/^\s*\[[a-z]+\]/i.test(line);
  const teach=TEACH_WORDS.test(t);
  return {hasTag, teach, t};
}

 (async()=>{
  const out=[];
  for(const ev of EVENTS){
    const r=await ask(ev.o);
    const c=classify(r.raw);
    /* 泄题检测基于玩家实际看到的文本（过游戏同款打码管线） */
    const masked=c.t?maskLeaks(c.t, buildMaskOpts(ev.o.quiz, ev.o.quiz?ev.o.quiz.o:[])):'';
    const corr=ev.o.quiz?ev.o.quiz.correct:null;
    const leak=corr? masked.toLowerCase().includes(corr.toLowerCase()) : false;
    out.push({name:ev.name, raw:r.raw, err:r.err, mood:(r.raw.match(/^\s*\[([a-z]+)\]/i)||[])[1]||null,
              text:c.t, display:masked, teach:c.teach, leak});
    console.log('['+ev.name+'] '+(leak?'🔴泄题! ':'')+(masked||('ERR:'+r.err)));
  }
  const ok=out.filter(x=>x.raw&&!x.err);
  const withTag=ok.filter(x=>x.mood);
  const teachN=ok.filter(x=>x.teach).length;
  const leakN=ok.filter(x=>x.leak).length;
  const fs2=require('fs');
  const CACHE='D:/UserData/WorkBuddy-Cache/intermediate';
  fs2.mkdirSync(CACHE,{recursive:true});
  fs2.writeFileSync(CACHE+'/fairy-audit.json', JSON.stringify(out,null,1));
  console.log('\n===== 审计汇总 =====');
  console.log('事件数: '+out.length+'  成功应答: '+ok.length);
  console.log('心情标签合规: '+withTag.length+'/'+ok.length);
  console.log('含教学相关词: '+teachN+'/'+ok.length+' ('+Math.round(teachN/ok.length*100)+'%)');
  console.log('泄题(含正确答案原文): '+leakN+'/'+ok.length);
})();
