'use strict';
/* game-core 纯逻辑回归测试（node --test，零依赖）
   覆盖 v26 验收标准：洗牌均匀性/字母解析边界/毒结算死亡/续力条/守卫判定/快照/打码名单 */
const test=require('node:test');
const assert=require('node:assert');
const C=require('../src/game-core.js');

/* 可注入 rng：确定性复现（计划要求「为随机数提供可注入实现」） */
function seqRng(values){
  let i=0;
  return ()=>values[i++ % values.length];
}

/* ---------- 洗牌 ---------- */
test('shuffle4 返回 0..3 的排列（元素不丢不重）', ()=>{
  for(let k=0;k<200;k++){
    const out=C.shuffle4();
    assert.deepStrictEqual([...out].sort(),[0,1,2,3]);
  }
});
test('shuffle4 rng 注入可确定性复现', ()=>{
  const a=C.shuffle4(seqRng([0,0.5,0.9]));
  const b=C.shuffle4(seqRng([0,0.5,0.9]));
  assert.deepStrictEqual(a,b);
});
test('shuffle4 大样本位置分布大体均匀（无固定偏好）', ()=>{
  const pos=[0,0,0,0];
  for(let k=0;k<4000;k++){
    const out=C.shuffle4();
    out.forEach((v,i)=>{ if(v===0) pos[i]++; });
  }
  /* 均匀时每格约 1000；sort 随机比较法的偏差会显著超过这个窗口 */
  pos.forEach(p=>assert.ok(p>700&&p<1300,'位置分布异常: '+pos));
});

/* ---------- 字母解析 ---------- */
test('parsePick：明确表达优先（answer/choice/pick + 大小写/全角冒号）', ()=>{
  assert.strictEqual(C.parsePick('The answer is: C'),'C');
  assert.strictEqual(C.parsePick('answer B'),'B');
  assert.strictEqual(C.parsePick('my choice：d'),'D');
  assert.strictEqual(C.parsePick('I pick a'),'A');
});
test('parsePick：裸独立字母兜底', ()=>{
  assert.strictEqual(C.parsePick('B'),'B');
  assert.strictEqual(C.parsePick('B. went'),'B');
  assert.strictEqual(C.parsePick('I think B is right'),'B');
});
test('parsePick：抓不到字母返回 null（no-pick 口径）', ()=>{
  ['went','','I am not sure','I think it is went','about',null,undefined].forEach(t=>{
    assert.strictEqual(C.parsePick(t),null,'输入 '+JSON.stringify(t)+' 应为 null');
  });
});

/* ---------- 中毒结算 ---------- */
test('poisonTickStep：普通一跳扣血减回合', ()=>{
  const r=C.poisonTickStep({hp:50,turns:3,dmg:4});
  assert.deepStrictEqual(r,{hp:46,turns:2,dead:false,done:false});
});
test('poisonTickStep：最后一跳耗尽回合不误判死亡', ()=>{
  const r=C.poisonTickStep({hp:50,turns:1,dmg:4});
  assert.deepStrictEqual(r,{hp:46,turns:0,dead:false,done:true});
});
test('poisonTickStep：最后一跳致死必须报 dead（P0 回归）', ()=>{
  const r=C.poisonTickStep({hp:3,turns:1,dmg:4});
  assert.strictEqual(r.hp,0);
  assert.strictEqual(r.dead,true,'最后一跳致死时 dead 必须为 true');
  assert.strictEqual(r.done,false);
});
test('poisonTickStep：中途致死同样报 dead', ()=>{
  const r=C.poisonTickStep({hp:2,turns:5,dmg:9});
  assert.strictEqual(r.dead,true);
});
test('poisonTickStep：HP 下限为 0 不出现负数', ()=>{
  const r=C.poisonTickStep({hp:1,turns:3,dmg:99});
  assert.strictEqual(r.hp,0);
});

/* ---------- 续力条 ---------- */
test('chargeFillPct：4 秒从 0% 到 100%', ()=>{
  const until=10000;
  assert.strictEqual(C.chargeFillPct(until,until-4000),0);
  assert.strictEqual(C.chargeFillPct(until,until-2000),50);
  assert.strictEqual(C.chargeFillPct(until,until),100);
});
test('chargeFillPct：越界钳制在 [0,100]', ()=>{
  assert.strictEqual(C.chargeFillPct(10000,10001),100);
  assert.strictEqual(C.chargeFillPct(10000,5000),0);
});

/* ---------- 大招后计时归位 ---------- */
test('afterSkillMonTimer：负数/小值归位到 3s，大值保留', ()=>{
  assert.strictEqual(C.afterSkillMonTimer(-4),3);
  assert.strictEqual(C.afterSkillMonTimer(1),3);
  assert.strictEqual(C.afterSkillMonTimer(11),11);
  assert.strictEqual(C.afterSkillMonTimer(undefined),3);
});

/* ---------- answer 守卫 ---------- */
test('canAnswer：出招中/已结束/换怪空档/冻结 拒绝输入', ()=>{
  const now=Date.now();
  assert.strictEqual(C.canAnswer({busy:false,gameOver:false,monHP:80}),true);
  assert.strictEqual(C.canAnswer({busy:true, gameOver:false,monHP:80}),false);
  assert.strictEqual(C.canAnswer({busy:false,gameOver:true, monHP:80}),false);
  assert.strictEqual(C.canAnswer({busy:false,gameOver:false,monHP:0}),false);
  assert.strictEqual(C.canAnswer({busy:false,gameOver:false,monHP:80,frozenUntil:now+5000}),false);
  assert.strictEqual(C.canAnswer({busy:false,gameOver:false,monHP:80,frozenUntil:now-1}),true);
});

/* ---------- 题面快照与打码名单 ---------- */
test('quizSnapshot：拷贝题面并抽出正确项文本', ()=>{
  const q={q:'go 的过去式是？',o:['went','goed','gone','goes'],a:0};
  const s=C.quizSnapshot(q);
  assert.deepStrictEqual(s,{q:'go 的过去式是？',o:['went','goed','gone','goes'],correct:'went'});
  s.o.push('mutation');          /* 快照必须与原题隔离 */
  assert.strictEqual(q.o.length,4);
});
test('quizSnapshot：非法输入返回 null', ()=>{
  assert.strictEqual(C.quizSnapshot(null),null);
  assert.strictEqual(C.quizSnapshot({q:'x',o:['a'],a:'0'}),null);
});
test('buildMaskOpts：正确项 + 题干动词全变形进入名单', ()=>{
  const snap={q:'buy — ___ · bought 属于哪种不规则变形？',o:['ABB','AAA','ABC','ABA'],correct:'ABB（过去式=过去分词）'};
  const opts=C.buildMaskOpts(snap,[['buy','bought','bought','ABB'],['go','went','gone','ABC']]);
  assert.ok(opts.includes('ABB（过去式=过去分词）'));
  assert.ok(opts.includes('bought'));
  assert.ok(!opts.includes('went'),'go 不在题干里，不应进入名单');
});
test('buildMaskOpts：空快照返回空名单（兜底不炸）', ()=>{
  assert.deepStrictEqual(C.buildMaskOpts(null,[['go','went','gone','ABC']]),[]);
});
