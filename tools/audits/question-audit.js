'use strict';
/* 题库深度审计：正确性 / 隐性重复 / 干扰项拼写 / 难度一致性 / 结构完整性
 * 题库从 pixel-battle-ui.html 动态提取（与 analyze-session.js 同法，零漂移） */
const fs=require('fs'), path=require('path');
const DIR=__dirname;
/* 2026-10-29 重构后：题库唯一权威源在 nce-shared.js（UMD，Node 直接 require） */
const {LLM_MODEL, QUESTIONS, VERB_DB}=require('../../nce-shared.js');
const BANK=QUESTIONS;

/* ============ 权威参照表（标准英式不规则动词，NCE 口径） ============ */
const REF={};
[['cost','cost','cost','AAA'],['hurt','hurt','hurt','AAA'],['let','let','let','AAA'],
 ['put','put','put','AAA'],['read','read','read','AAA'],['set','set','set','AAA'],['shut','shut','shut','AAA'],
 ['come','came','come','ABA'],['run','ran','run','ABA'],
 ['bring','brought','brought','ABB'],['build','built','built','ABB'],['buy','bought','bought','ABB'],
 ['catch','caught','caught','ABB'],['feel','felt','felt','ABB'],['find','found','found','ABB'],
 ['get','got','got','ABB'],['have','had','had','ABB'],['hear','heard','heard','ABB'],
 ['keep','kept','kept','ABB'],['leave','left','left','ABB'],['lose','lost','lost','ABB'],
 ['make','made','made','ABB'],['mean','meant','meant','ABB'],['meet','met','met','ABB'],
 ['pay','paid','paid','ABB'],['say','said','said','ABB'],['sell','sold','sold','ABB'],
 ['shine','shone','shone','ABB'],['sit','sat','sat','ABB'],['sleep','slept','slept','ABB'],
 ['spell','spelt','spelt','ABB'],['spend','spent','spent','ABB'],['stand','stood','stood','ABB'],
 ['tell','told','told','ABB'],['think','thought','thought','ABB'],['understand','understood','understood','ABB'],
 ['win','won','won','ABB'],
 ['do','did','done','ABC'],['drink','drank','drunk','ABC'],['drive','drove','driven','ABC'],
 ['eat','ate','eaten','ABC'],['fall','fell','fallen','ABC'],['fly','flew','flown','ABC'],
 ['forget','forgot','forgotten','ABC'],['give','gave','given','ABC'],['go','went','gone','ABC'],
 ['grow','grew','grown','ABC'],['know','knew','known','ABC'],['rise','rose','risen','ABC'],
 ['see','saw','seen','ABC'],['speak','spoke','spoken','ABC'],['take','took','taken','ABC'],
 ['throw','threw','thrown','ABC'],['wear','wore','worn','ABC'],['write','wrote','written','ABC'],
 ['swim','swam','swum','ABC'],['show','showed','shown','ABC'],['begin','began','begun','ABC'],
].forEach(r=>REF[r[0]]=r.slice(1));

const out=[];
const say=(lvl,msg)=>{ out.push({lvl,msg}); console.log((lvl==='ERR'?'🔴':lvl==='WARN'?'🟡':lvl==='INFO'?'🔵':'✅')+' '+msg); };

/* ============ 0. 总量与分布 ============ */
console.log('===== 0. 总量与分布 =====');
console.log('总题数:', BANK.length);
const byD={}; BANK.forEach(q=>byD['d'+q.d]=(byD['d'+q.d]||0)+1);
console.log('按难度:', JSON.stringify(byD), '（文档宣称 d1=61 / d2=97 / d3=48）');

/* 更精确的题目类型分类（比 analyze-session.js 的多覆盖几种变体） */
function qtype2(q){
  if(/的过去式(是|拼写)？$/.test(q)) return '动词·过去式';
  if(/的过去分词是？$/.test(q)) return '动词·过去分词';
  if(/的三种形式是？$/.test(q)) return '动词·三形默写';
  if(/中哪个是过去分词？$/.test(q)) return '动词·认过去分词';
  if(/补全三形？$/.test(q)) return '动词·补全三形';
  if(q.includes('属于哪种')&&q.includes('变形')) return '动词·变形分类'; /* 兼容"变形/不规则变形"与全半角问号 */
  return '疑问句型/其他';
}
const byT={}; BANK.forEach(q=>{const t=qtype2(q.q);byT[t]=(byT[t]||0)+1;});
console.log('按类型(精确):', JSON.stringify(byT,null,1));

/* ============ 1. 结构完整性 ============ */
console.log('\n===== 1. 结构完整性 =====');
let structN=0;
BANK.forEach((q,i)=>{
  const tag='['+(i+1)+'] '+q.q.slice(0,40);
  if(!q.q||!q.s) say('ERR',tag+' 题干/出处为空');
  if(![1,2,3].includes(q.d)) say('ERR',tag+' 难度非法 d='+q.d);
  if(!Array.isArray(q.o)||q.o.length!==4) say('ERR',tag+' 选项数≠4');
  if(typeof q.a!=='number'||q.a<0||q.a>3) say('ERR',tag+' 答案索引非法 a='+q.a);
  const set=new Set(q.o.map(x=>String(x).toLowerCase()));
  if(set.size!==4) say('ERR',tag+' 选项重复(不区分大小写): '+JSON.stringify(q.o));
  const ans=String(q.o[q.a]).toLowerCase();
  const same=q.o.filter(x=>String(x).toLowerCase()===ans).length;
  if(same!==1) say('ERR',tag+' 正确答案在选项中出现 '+same+' 次');
  if(((q.q.match(/"/g)||[]).length%2)!==0) say('WARN',tag+' 引号不成对');
  if(q.q.includes('  ')) say('WARN',tag+' 连续空格');
  if(/？？/.test(q.q)) say('WARN',tag+' 连续问号');
});
if(!out.filter(x=>x.lvl==='ERR'||x.lvl==='WARN').length) say('INFO','结构检查全部通过');
else console.log('结构问题数:', out.filter(x=>x.lvl==='ERR').length, 'ERR /', out.filter(x=>x.lvl==='WARN').length, 'WARN');
const structErr=out.filter(x=>x.lvl==='ERR'||x.lvl==='WARN').length; out.length=0;

/* ============ 2. 重复检测（精确 + 语义归一） ============ */
console.log('\n===== 2. 重复检测 =====');
/* 2a. 精确重复 */
const seen={};
BANK.forEach((q,i)=>{ (seen[q.q]=seen[q.q]||[]).push(i); });
Object.entries(seen).forEach(([q,idx])=>{ if(idx.length>1) say('ERR','精确重复 '+idx.length+' 次: '+q); });

/* 2b. 动词题按知识点分组（抓「同一考点、不同措辞」的隐性重复） */
function kp(q){ /* knowledge point key */
  let m;
  if(m=q.match(/^([a-z]+) 的过去式/)) return '过去式:'+m[1];
  if(m=q.match(/^([a-z]+) 的过去分词是/)) return '过去分词:'+m[1];
  if(m=q.match(/^([a-z]+) 的三种形式/)) return '三形:'+m[1];
  if(m=q.match(/^([a-z]+) — [a-z]+ · ([a-z]+) 中哪个是过去分词/)) return '过去分词:'+m[1];
  if(m=q.match(/^([a-z]+) — [a-z]+ · ___ 补全三形/)) return '补全三形:'+m[1];
  if(m=q.match(/^([a-z]+) — [a-z]+ · [a-z]+ 属于哪种/)) return '分类:'+m[1];
  if(m=q.match(/^([a-z]+) — ___ · ([a-z]+) 属于哪种/)) return '分类:'+m[1];
  return null; /* 非动词题走文本归一 */
}
const groups={};
BANK.forEach((q,i)=>{
  const k=kp(q.q)|| ('文本:'+q.q.replace(/（[^）]*）/g,'').replace(/属于哪种变形/,'属于哪种不规则变形').replace(/\s+/g,'').trim());
  (groups[k]=groups[k]||[]).push({i,q,d:q.d});
});
let dupN=0;
Object.entries(groups).forEach(([k,arr])=>{
  if(arr.length>1){
    dupN++;
    say('ERR','语义重复 ×'+arr.length+' ['+k+']');
    arr.forEach(x=>console.log('    #'+(x.i+1)+' [d'+x.d+'] '+x.q.q+'  选项:'+JSON.stringify(x.q.o)+' a='+x.q.a));
  }
});
if(!dupN) say('INFO','无语义重复');

/* ============ 3. VERB_DB 正确性 ============ */
console.log('\n===== 3. VERB_DB 逐行核对权威表 =====');
let vErr=0;
VERB_DB.forEach(([b,p,pp,c])=>{
  const r=REF[b];
  if(!r){ say('ERR','VERB_DB 动词不在参照表: '+b); vErr++; return; }
  if(r[0]!==p||r[1]!==pp||r[2]!==c){ say('ERR','VERB_DB 错误: '+JSON.stringify([b,p,pp,c])+' 应为 '+JSON.stringify([b,...r])); vErr++; }
  if(p===pp&&c!=='ABB'&&c!=='AAA') say('WARN','VERB_DB 分类可疑(过去式=过去分词却标 '+c+'): '+b);
  const actual=(b===p&&p===pp)?'AAA':(b===pp?'ABA':(p===pp?'ABB':'ABC'));
  if(actual!==c){ say('ERR','VERB_DB 分类自相矛盾: '+b+' 数据为 '+c+' 按三形推导为 '+actual); vErr++; }
});
if(!vErr) say('INFO','VERB_DB '+VERB_DB.length+' 行全部与权威表一致');
/* 权威表有而 VERB_DB 缺席的动词 → 生成器不会为其出题，只能靠手工题覆盖 */
const notInVdb=Object.keys(REF).filter(b=>!VERB_DB.some(v=>v[0]===b));
notInVdb.forEach(b=>say('WARN','动词 "'+b+'" 不在 VERB_DB：无生成的过去式/分类题，仅手工题覆盖（begin 现仅有过去分词+补全三形两题）'));

/* ============ 4. 每道动词题的答案正确性 ============ */
console.log('\n===== 4. 动词题答案逐题核对 =====');
let aErr=0, aN=0;
BANK.forEach((q,i)=>{
  const tag='['+(i+1)+'] '+q.q;
  let m, expect=null;
  const clsExpect=code=>String(q.o[q.a]).replace(/（.*$/,'').trim()===code; /* 分类题答案带括号注释，比对三字母码 */
  if(m=q.q.match(/^([a-z]+) 的过去式/)){ expect=REF[m[1]]&&REF[m[1]][0]; }
  else if(m=q.q.match(/^([a-z]+) 的过去分词是/)){ expect=REF[m[1]]&&REF[m[1]][1]; }
  else if(m=q.q.match(/^([a-z]+) — ([a-z]+) · ([a-z]+) 属于哪种/)){
    const r=REF[m[1]]; expect=(r&&r[0]===m[2]&&r[1]===m[3])?{cls:r[2]}:'⚠三形不符';
  }
  else if(m=q.q.match(/^([a-z]+) — ___ · ([a-z]+) 属于哪种/)){
    const r=REF[m[1]]; expect=(r&&r[1]===m[2])?{cls:r[2]}:'⚠三形不符';
  }
  else if(m=q.q.match(/^([a-z]+) — ([a-z]+) · ___ 补全三形/)){
    const r=REF[m[1]]; expect=(r&&r[0]===m[2])?r[1]:'⚠三形不符';
  }
  else if(m=q.q.match(/^([a-z]+) — ([a-z]+) · ([a-z]+) 中哪个是过去分词/)){
    const r=REF[m[1]]; expect=(r&&r[0]===m[2]&&r[1]===m[3])?r[1]:'⚠三形不符';
  }
  else if(m=q.q.match(/^([a-z]+) 的三种形式是/)){
    const r=REF[m[1]];
    if(r) expect=m[1]+' — '+r[0]+' — '+r[1];
  }
  if(expect==null) return;
  aN++;
  if(String(expect).startsWith('⚠')){ say('ERR',tag+' 题干给出的三形与权威表矛盾 '+expect); aErr++; return; }
  if(typeof expect==='object'){ if(!clsExpect(expect.cls)){ say('ERR',tag+' 分类错误: 库里='+q.o[q.a]+' 应为='+expect.cls); aErr++; } return; }
  const got=String(q.o[q.a]);
  if(got!==String(expect)&&!got.startsWith(String(expect))){ say('ERR',tag+' 答案错误: 库里="'+got+'" 应为="'+expect+'"'); aErr++; }
});
console.log('动词题核对:', (aN-aErr)+'/'+aN, '通过');
if(!aErr) say('INFO','全部动词题答案正确');

/* ============ 5. 干扰项拼写（-ing / -ed 规则） ============ */
console.log('\n===== 5. 干扰项拼写质量 =====');
/* 游戏内 ing() 只做 -e 脱落，不做辅音双写 / ee 保留 → 产生假词 */
const BAD_ING={see:'seing',begin:'begining',get:'geting',let:'leting',put:'puting',run:'runing',
               set:'seting',shut:'shuting',sit:'siting',swim:'swiming',win:'wining'};
const BAD_ED={}; /* ed() 对库内动词无双写问题（单音节 CVC 动词加 -ed 均不需双写） */
let badList=[];
BANK.forEach((q,i)=>{
  q.o.forEach(o=>{
    if(Object.values(BAD_ING).includes(o)) badList.push({i:i+1,q:q.q,opt:o});
    if(Object.values(BAD_ED).includes(o)) badList.push({i:i+1,q:q.q,opt:o});
  });
});
if(badList.length){
  say('WARN','发现 '+badList.length+' 处「不符合拼写规则的 -ing 干扰项」（违反设计原则"干扰项要像真错"）:');
  badList.forEach(b=>console.log('    #'+b.i+' ['+b.opt+'] '+b.q));
}else say('INFO','干扰项拼写全部符合规则');

/* ============ 6. 难度一致性 ============ */
console.log('\n===== 6. 难度一致性 =====');
let dCon=0;
Object.entries(groups).forEach(([k,arr])=>{
  if(arr.length<2) return;
  const ds=[...new Set(arr.map(x=>'d'+x.d))];
  if(ds.length>1){ say('WARN','同一考点跨难度: ['+k+'] → '+ds.join(' & ')); dCon++; }
});
/* 生成器难度映射核查 */
BANK.forEach((q,i)=>{
  let m;
  if(m=q.q.match(/^([a-z]+) 的过去分词是/)){
    const r=REF[m[1]]; if(!r) return;
    const expectD=r[2]==='ABC'?2:3;
    if(q.d!==expectD) say('WARN','['+(i+1)+'] '+q.q+' 过去分词题难度 d'+q.d+'，生成器规则(ABC→d2/ABB·ABA→d3)为 d'+expectD+'（若为手工刻意安排可忽略）');
  }
  if(q.q.includes('属于哪种')&&q.q.includes('变形')){
    const cls=q.o[q.a].slice(0,3);
    if(['AAA','ABA','ABB','ABC'].includes(cls)){
      const expectD=(cls==='AAA'||cls==='ABA')?3:2;
      /* 手工题可有意放别的难度，只提示 */
      if(q.d!==expectD) say('WARN','['+(i+1)+'] '+q.q.slice(0,44)+' 答案类='+cls+' 生成器惯例 d'+expectD+'，实际 d'+q.d+'（若为手工刻意安排可忽略）');
    }
  }
});

/* ============ 7. 双解风险（选项里有另一个合法答案） ============ */
console.log('\n===== 7. 双解风险 =====');
const KNOWN_AMBIG=[
  {q:/shine 的过去式/, note:'"shined" 是 shine（及物=擦亮）的合法过去式，与 shone（发光）并存，单选题有双解风险'},
  {q:/show 的过去分词|show 的三种形式/, note:'show 的过去分词 showed/shown 两可（NCE 取 shown，但 showed 亦正确）'},
  {q:/spell 的过去式/, note:'"spelled" 是美式合法拼写（NCE 英式取 spelt），题库把 spelled 当干扰项，可接受但需知晓'},
  {q:/\bget\b/, note:'get 的过去分词 gotten（美）/got（英），NCE 取 got，ok'},
];
KNOWN_AMBIG.forEach(k=>{
  BANK.forEach((q,i)=>{ if(k.q.test(q.q)) say('INFO','['+(i+1)+'] '+q.q.slice(0,40)+' → '+k.note); });
});

/* ============ 8. 生成器覆盖审计（57 动词 × 3 考点） ============ */
console.log('\n===== 8. 生成器覆盖 =====');
const cover={};
VERB_DB.forEach(([b,p,pp,c])=>cover[b]={past:false,pp:false,cls:false});
BANK.forEach(q=>{
  let m;
  if(m=q.q.match(/^([a-z]+) 的过去式/)) cover[m[1]]&&(cover[m[1]].past=true);
  if(m=q.q.match(/^([a-z]+) 的过去分词是/)) cover[m[1]]&&(cover[m[1]].pp=true);
  if(m=q.q.match(/^([a-z]+) — [a-z]+ · [a-z]+ 中哪个是过去分词/)) cover[m[1]]&&(cover[m[1]].pp=true);
  if(m=q.q.match(/^([a-z]+) — [a-z]+ · [a-z]+ 属于哪种/)) cover[m[1]]&&(cover[m[1]].cls=true);
  if(m=q.q.match(/^([a-z]+) — ___ · [a-z]+ 属于哪种/)) cover[m[1]]&&(cover[m[1]].cls=true);
});
const lacking=Object.entries(cover).filter(([b,v])=>{
  const r=REF[b];
  const need={past:true, pp:r[0]!==r[1], cls:true};
  return !v.past&&!v.pp&&!v.cls || (need.pp&&!v.pp);
});
Object.entries(cover).forEach(([b,v])=>{
  const r=REF[b];
  const miss=[];
  if(!v.past) miss.push('过去式');
  if(r[0]!==r[1]&&!v.pp) miss.push('过去分词');
  if(!v.cls) miss.push('分类');
  if(miss.length) console.log('  ⚠ '+b+' 缺: '+miss.join('、'));
});
if(!lacking.length) console.log('57 动词考点覆盖检查完毕（上方无 ⚠ 即全覆蓋）');

console.log('\n===== 汇总 =====');
console.log('结构问题:', structErr, '| 语义重复组:', dupN, '| VERB_DB 错误:', vErr, '| 动词题答案错误:', aErr,
  '| 拼写不良干扰项:', badList.length, '| 跨难度同考点:', dCon);
