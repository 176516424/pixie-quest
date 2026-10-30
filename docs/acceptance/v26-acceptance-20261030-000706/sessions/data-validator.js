// DATA-01 ~ DATA-05 终版数据校验器（第二轮验收）
// 用法: node data-validator.js > sessions/data-check.json
// 说明:
//  - VERB_DB 行结构为 [原形, 过去式, 过去分词, 变形类型]
//  - DATA-03 规则: 标签-答案一致性比对前先剥离中文括注「（...）」
//    (如 read 题「read（拼写不变）」语义答案是 read)；三形类型题
//    (答案为 AAA/ABB/ABC 等 8 类代号或「a — b — c」三形串) 不做动词形式比对
'use strict';
const path = require('path');
const shared = require(path.join(__dirname, '..', '..', '..', '..', 'nce-shared.js'));

const Q = shared.QUESTIONS || [];
const LEGAL = ['verb','irregular','past','question-pattern','pattern-family','past-participle','three-forms'];
const TYPE_CODES = new Set(['AAA','ABB','ABC','ABA','AAB','BAA','BBA','BAB']);
const strip = s => (s || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();

const pastForms = new Set(), ppForms = new Set(), allForms = new Set();
Object.values(shared.VERB_DB || []).forEach(f => {
  if (Array.isArray(f)) {
    allForms.add(f[0]); allForms.add(f[1]); allForms.add(f[2]);
    pastForms.add(f[1]); ppForms.add(f[2]);
  }
});

const isThreeFormsAnswer = ans => TYPE_CODES.has(ans) || /—/.test(ans);

// DATA-01/02
const dist = { 1: 0, 2: 0, 3: 0 };
Q.forEach(q => { if (dist[q.d] !== undefined) dist[q.d]++; });
const ids = Q.map(q => q.id);
const uniqueIds = new Set(ids);

// DATA-03
const d3Mm = [];
for (const q of Q) {
  const k = q.knowledge || [];
  const raw = (q.o && q.o[q.a] !== undefined) ? q.o[q.a] : q.answer;
  const ans = strip(raw);
  if (!k.length) d3Mm.push({ id: q.id, reason: 'no-knowledge' });
  for (const t of k) if (!LEGAL.includes(t)) d3Mm.push({ id: q.id, reason: 'illegal-tag:' + t });
  if (k.includes('past') && !pastForms.has(ans)) d3Mm.push({ id: q.id, reason: 'past-tag-mismatch', ans });
  if (k.includes('past-participle') && !ppForms.has(ans)) d3Mm.push({ id: q.id, reason: 'pp-tag-mismatch', ans });
  if (k.includes('irregular') && !allForms.has(ans) && !isThreeFormsAnswer(ans)) {
    d3Mm.push({ id: q.id, reason: 'irregular-mismatch', ans });
  }
}

// DATA-04
const verbQs = Q.filter(q => (q.knowledge || []).includes('verb'));
const d4Missing = verbQs.filter(q => !q.explanation || !q.explanation.trim());
const findQ = re => Q.find(q => re.test(q.q || ''));
const spot = {};
for (const v of ['go', 'buy', 'begin', 'wear']) {
  const row = Object.values(shared.VERB_DB || []).find(f => f[0] === v);
  const qPast = findQ(new RegExp('^' + v + ' 的过去式是'));
  const qPp = findQ(new RegExp('^' + v + ' 的过去分词是'));
  const qCls = findQ(new RegExp('^' + v + ' —.*属于哪种'));
  const qThree = findQ(new RegExp('^' + v + ' 的三种形式是'));
  spot[v] = {
    db: row ? [row[0], row[1], row[2], row[3]] : null,
    pastAnswerMatches: qPast ? strip(qPast.o[qPast.a]) === row[1] : null,
    ppAnswerMatches: qPp ? strip(qPp.o[qPp.a]) === row[2] : null,
    clsAnswerMatches: qCls ? strip(qCls.o[qCls.a]) === row[3] : null,
    threeFormsMatches: qThree ? strip(qThree.o[qThree.a]) === [row[0], row[1], row[2]].join(' — ') : null,
    explanationNonEmpty: verbQs.filter(q => (q.q || '').includes(v)).every(q => q.explanation && q.explanation.trim())
  };
}

const result = {
  generatedAt: new Date().toISOString(),
  rules: {
    bracketStripped: '比对前剥离中文括注（如 read（拼写不变）→ read）',
    threeFormsExempt: '三形类型题(答案为变形类型代号或三形串)不做动词形式一致性比对'
  },
  DATA01: { total: Q.length, d1: dist[1], d2: dist[2], d3: dist[3], expected: { total: 198, d1: 60, d2: 90, d3: 48 }, pass: Q.length === 198 && dist[1] === 60 && dist[2] === 90 && dist[3] === 48 },
  DATA02: { count: Q.length, unique: uniqueIds.size, allNonEmpty: ids.every(x => typeof x === 'string' && x.length > 0), pass: ids.every(x => x) && uniqueIds.size === Q.length },
  DATA03: { vocabulary: LEGAL, total: Q.length, mismatches: d3Mm.length, details: d3Mm.slice(0, 5), pass: d3Mm.length === 0 },
  DATA04: { verbTotal: verbQs.length, missingExplanation: d4Missing.length, spot, pass: d4Missing.length === 0 && Object.values(spot).every(s => s.db && s.pastAnswerMatches && s.clsAnswerMatches && s.explanationNonEmpty) }
};
console.log(JSON.stringify(result, null, 1));
