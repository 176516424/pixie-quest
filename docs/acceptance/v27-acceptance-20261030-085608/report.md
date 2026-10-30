# v27 第 1 批验收报告（整改复验版，2026-10-30）

- **验收对象**: pixie-quest v27 第 1 批（起点 `6dc64ae`，验收中修复 DEF-001/DEF-002；本次复验整改修复 DEF-003）
- **验收标准**: 用户提供的 v27 验收数据标准（5 节实际结果数据）+ 复核评审整改要求（6 条）
- **结论**: **整改复验后通过**（25/25 用例 PASS，0 FAIL，0 BLOCKED，P0/P1 未关闭缺陷 0）
- **整改历史**: 首轮报告（2026-10-30 上午）被复核评审判为**不通过**——UI-09/10/13 为假阳性（截图与 v26 完全相同 SHA-256，弹窗被隐藏父容器吞掉）、UI-08 证据对象实为 Grass Slime 而非冰霜魔王、环境描述矛盾。全部问题已整改并复验，详见第 6 节。

## 0. 整改落实对照（评审 6 条要求）

| # | 评审要求 | 落实 |
|---|---|---|
| 1 | 修复地图页两个弹窗的父容器问题 | ✅ `#wbwrap`/`#flwrap` 移出 `#gamescreen`，挂 body 层级（`pixel-battle-ui.html`，附注释）。缺陷记录 `defects/DEF-003-v27-popup-parent-hidden.md` |
| 2 | 驱动增加真实可见性断言 | ✅ `driver-ui-v27.js` 新增 `visInfo()/waitVisible()`：getComputedStyle display/visibility + 自底向上祖先链隐藏检查 + getBoundingClientRect 面积与视口内 + `elementFromPoint` 中心点命中（可交互性证明）。UI-09/10/12/13 全部改用 |
| 3 | 重新生成 UI-09/10/13 证据，禁止复用 | ✅ 22 张截图全部重新生成；ui09/ui10/ui13/ui08 截图 SHA-256 均已不同于 v26 旧图；弹窗真实可见已人工核验（错题本面板含题目/答案/按钮居中显示） |
| 4 | 统一 LM Studio 环境描述 | ✅ 全报告与 `driver-results.json` 统一为：**LM Studio 本次不可用，LLM 上游=受控 mock 127.0.0.1:15990**。旧 `commands/ui-driver.log`（v26 驱动产物，含「LM Studio 在线但未启用」矛盾表述）已由 `commands/ui-driver-v27.log` 取代 |
| 5 | 补真实冰霜魔王 UI-08 证据 | ✅ 真实进入第三章 Boss 战（怪物名「冰霜魔王 👑BOSS」），Boss 真实计时轮转后蓄力，事件含「Absolute Freeze」无 undefined；截图含续力条与精灵警告。旧 startCharge 注入证据撤回 |
| 6 | 真实模型与真人实验标为未完成 | ✅ 见第 5 节末尾与结论块——明确「未完成」，不并入已完成结论 |

## 1. 自动化检查结果

| 结果项 | 实测输出 | 通过标准 | 判定 |
|---|---|---|---|
| 单元测试 | tests=36 pass=36 fail=0 cancelled=0，退出码 0 | fail=0、exit=0 | ✅ |
| 语法检查 | 23 段全部通过，退出码 0 | 全部通过 | ✅ |
| 题库审计 | 198 题；结构 0 / 重复 0 / VERB_DB 0 / 答案 0 / 拼写 0 / 跨难度 0 | 核心错误均 0 | ✅ |
| 精灵审计 | 16 事件、应答 16/16、mood 合规 16/16、**泄题 0/16**、退出码 0、JSON 已生成 | 泄题 0、exit 0 | ✅ [mock] |

原始日志：`commands/npm-test.log`、`npm-run-check.log`、`npm-run-audit.log`、`npm-run-audit-fairy.log`、`sessions/fairy-audit.json`（均为 DEF-003 修复后最终代码所产）。

## 2. 核心功能验收结果（driver-ui-v27.js 整改版，13/13 PASS）

驱动：本验收包 `driver-ui-v27.js`（v26 驱动升级版），全部截图/日志/结果为本次全新生成。原始日志 `commands/ui-driver-v27.log`，逐条 `driver-results.json`。

| 用例 | 判定 | 实测要点 |
|---|---|---|
| UI-01 地图/进入 | PASS | node0 可进、其余锁定；无脚本错误 |
| UI-02 答对结算 | PASS | 命中回合伤害 20（18~26 单发区间）；MP +12；切题存活。口径：攻击 10% 被闪开为真实机制，驱动重试至命中以排除运气 |
| UI-03 答错记录 | PASS | 错题本 0→1 内容一致、攻击落空 |
| UI-04 连点/空档 | PASS | 每次答题尝试 gainXp 恰 1 次；空档 8 连点 canAnswer 守卫 8/8 拒绝 |
| UI-05 中毒致死 | PASS | HP=0、死亡浮层、输入锁定 |
| UI-06 返回地图清状态 | PASS | 毒/冻/续力全清零 |
| UI-07 续力计时 | PASS | 归位→普攻 2061ms（≥1900ms），无立即补刀 |
| **UI-08 冰霜魔王蓄力（真实 Boss）** | PASS | **真实第三章 Boss 战**：怪物名「冰霜魔王 👑BOSS」，Boss 真实计时（timer=11s）轮转后 45% 蓄力触发，精灵事件含「Absolute Freeze」与打断指引、无 undefined。注入仅限直达第三章（startLevel(2)+monsterIdx=2）、加速轮转（monTimer=1）与防意外死亡（heroHP=100），蓄力判定/事件/文案全走真实逻辑。证据：`screenshots/ui08-frost-king.png`、`ui08-frost-king-charge.png`（可见续力条+精灵警告）、`sessions/ui08-frost-king-events.json`。**旧证据（startCharge 注入、对象为 Grass Slime）撤回** |
| **UI-09 错题本入口** | PASS | **真实可见性**：display=flex、1258×702、无祖先隐藏、中心点 elementFromPoint 命中（面板同样命中）、计数/内容正确、关闭后 display=none 真实消失。**旧 PASS 撤回**（假阳性，DEF-003） |
| **UI-10 精灵日志入口** | PASS | 同上真实可见性断言全过；计数（1 条）/条目/心情统计正确。**旧 PASS 撤回**（DEF-003） |
| UI-11 事件题目快照 | PASS | 旧题事件跨题返回后 quiz 仍为旧题、答案打码 🚫 不泄原文 |
| UI-12 模型文本安全渲染 | PASS | `<img onerror>`/`<script>` 按纯文本显示，未创建元素未执行 |
| **UI-13 无 LLM 基础可玩** | PASS | 未召唤精灵全流程；**地图页错题本弹窗真实可见可关闭**（真实可见性断言）；0 控制台错误。**旧 PASS 撤回**（DEF-003）。环境口径：LLM 上游=受控 mock :15990，非 LM Studio |

## 3. LLM 专项结果（120 样本 = 40 题 × L1/L2/L3）

```json
{"sampleCount": 120, "preAnswerLeakCount": 0, "optionQuoteDisplayCount": 0,
 "invalidOutputFallbackRate": 100, "llmUnavailableFallbackRate": 100,
 "finalOutputComplianceRate": 100, "rawStructuredJsonRate": 88,
 "questionMatchRate": 100, "teachingFactAccuracy": 100,
 "maskDefenseRate": 100, "latencyP50Ms": 483, "latencyP95Ms": 703,
 "averageLlmCallsPerQuestion": 1.13, "cacheHitRate": 4.5}
```

- 口径：`preAnswerLeakCount` 按**最终展示文本**（经 maskLeaks 打码）判定，命中正确答案/其他选项/目标动词三形任一计 1；模型原始输出中的泄露另列 raw 维度（同为 0）。对抗性测试（4 条刻意泄题文本）经打码后 0 泄露。
- `rawStructuredJsonRate=88%` 为模型原始 JSON 合规率（mock 按真实模型分布注入 12% 非法输出）；验收标准「合规率 ≥99%」按**降级后最终输出合规率**口径 = 100%（12% 非法输出全部经纯文本/静态兜底安全降级），两层数据均如实列出。

**限制声明（不得据此宣布完成）**：以上验证的是**mock 管线行为**（协议校验/降级链/打码防线/缓存/指标上报）。真实模型的语言质量与教学事实质量、真实 LM Studio 延迟——**未完成，未验收**。

## 4. 三组对照实验结果（同种子 + 固定 60 题逐 qid 零分叉）

| 指标 | 无提示 | 静态提示 | LLM 提示 |
|---|---:|---:|---:|
| 样本数 | 60 | 60 | 60 |
| 首答正确率 | 45.0% | 45.0% | 45.0% |
| 无提示重试正确率 | —（无重试） | 33/33 = 100% | 33/33 = 100% |
| 平均/p95 延迟（提示条） | 0 | 0（纯本地） | p50 483ms / p95 703ms |

- 三组首答同为 45% 证明学生作答概率与组别解耦（实验设计正确性证据）。提示增益为**公开声明的模拟参数**（L1 +0.15 / L2 +0.30 / L3 +0.45）。
- llm 组 `llmCallsPerQuestion=1.13`、提示来源 🧚 66 结构化 + 2 纯文本降级、缓存命中 4.5%。
- 原始会话日志全入包（`experiments/logdir/`、`experiments/{none,static,llm}-run.json`、`summary.json`），汇总可重算。

**限制声明**：**真实学生的学习效果（首答/重试/延迟复习正确率）未完成**——需真人实验，本数据不构成教学效果证据。

## 5. 缺陷与最终结论

| 缺陷 | 级别 | 状态 |
|---|---|---|
| DEF-001 getHint 残留 fairyOn 条件 | P1 | ✅ 已修复关闭（首轮验收发现） |
| DEF-002 buildMaskOpts 不含干扰项 | P1 | ✅ 已修复关闭（首轮验收发现） |
| **DEF-003 弹窗挂在隐藏父容器内，地图页不可见（含 v26 起假阳性验收）** | **P1** | ✅ **本次评审发现，已修复并真实可见性复验关闭**（`defects/DEF-003-v27-popup-parent-hidden.md`） |

```text
PASS 数：25    FAIL 数：0    BLOCKED 数：0
P0/P1 未关闭缺陷数：0    验收结论：通过（整改复验后）
对应 commit：6dc64ae（起点）→ 181141d（首轮修复+验收包）→ 本次整改提交（DEF-003 修复 + 整改驱动 + 本验收包更新）
原始证据目录：docs/acceptance/v27-acceptance-20261030-085608/
  驱动：driver-ui-v27.js（整改版，含真实可见性断言）· 日志 commands/ui-driver-v27.log
  截图：screenshots/（22 张全新，ui09/ui10/ui13/ui08 SHA-256 已验证不同于 v26）
```

## 6. 未完成事项（明确不并入已完成结论）

1. **真实模型复核**：LM Studio 本次不可用。真实模型的语言质量、教学事实准确率、真实 p50/p95 延迟——未验收。
2. **真人三组实验**：延迟复习正确率、提示真实增益——未开展。现有实验数据为学生模型模拟，参数已公开。
3. v27 第 2 批（错因诊断、学习者画像、答后讲解）——未开始。
