# pixie-quest v27 重构计划 — LLM 教学增强（可选增强器定位）

> 版本：v27 · 创建：2026-10-30 · 前置：v26（已验收通过，1e55da0）
> 定位原则：**LLM 是可选的教学增强器，不是战斗/答题流程的必要依赖**。
> 每项增强同时定义「实现边界」与「验收数据」，先协议后模型，先稳定后扩展。

## 0. 总纲：八项增强方向与优先级

| 优先级 | 增强方向 | 建议实现 | 核心验收指标 | 批次 |
|---|---|---|---|---|
| P0 | 分级教学提示 | 同一题按「知识点提醒 → 思考步骤 → 排除错误项」逐级提示，不直接给答案 | 泄题率、提示级别正确率、答错后重试表现 | 第 1 批 |
| P0 | 结构化输出 | LLM 只返回 `mood`/`hintLevel`/`teachingPoint`/`text`，校验后再渲染 | JSON 合规率、非法输出降级率、脚本注入数 | 第 1 批 |
| P0 | 无 LLM 降级 | 静态提示与 LLM 提示走同一接口；超时/异常自动回退 | LLM 不可用时核心流程通过率 100% | 第 1 批 |
| P1 | 错因诊断 | 按错误选项判断「三形混淆/句型误判/词义不清」再选提示策略 | 错因分类准确率、诊断与题目一致性 | 第 2 批 |
| P1 | 学习者画像 | 错题/重试/掌握度入上下文，只传当前所需结构化摘要 | 重复错误提示针对性、上下文长度、延迟 | 第 2 批 |
| P1 | 答后讲解 | 答前严格不泄题；答后才允许完整变形/解析，优先用题库 explanation | 答前泄题数、讲解事实准确率 | 第 2 批 |
| P2 | 题目辅助生产 | 离线生成候选题 → 结构校验 → 审计 → 双解检查 → 人工审核 → 稳定 ID 入库 | 审计通过率、双解题数、人工驳回率 | 第 3 批 |
| P2 | 精灵解说 | 合并低价值战斗事件；教学事件优先；普通夸奖走本地模板 | 每题请求数、重复台词率、教学相关率 | 第 3 批 |

## 1. 分级提示协议（第 1 批 · 已实现）

游戏侧决定 `hintLevel`，LLM 只负责组织语言——降低模型随机发挥，方便审计。

```
L1 知识点提醒   —— 只说明考查方向
L2 思考策略     —— 告诉学习者比较什么，不给答案
L3 针对错误项   —— 解释为什么当前选择不合理
L4 答后解析     —— 作答结束后才允许完整答案和规则（第 2 批启用）
```

结构化输出协议（LLM 提示通道统一格式）：

```json
{"mood":"worried","hintLevel":2,"teachingPoint":"irregular-past","text":"Compare the last two forms first. Are they identical?"}
```

- 权威实现：`src/hint-engine.js`（UMD，浏览器 `window.HINT_ENGINE` / Node `require`，零漂移）
- `validateHintOutput()`：mood 必须在白名单、hintLevel 必须 1-3、teachingPoint/text 非空，任一不符判非法
- `parseLLMHintOutput()`：容忍 ```json 包裹与前后杂文本；解析不出返回 null
- 非法输出降级链：结构化 JSON → 纯文本（v26 路径）→ 静态提示，全部落日志

## 2. 学习者状态摘要（第 1 批 · 简版实现）

不传完整错题本，只传结构化摘要（P1 画像的接口先立）：

```json
{"questionId":"q...","attempt":2,"wrongChoices":["goes"],"knowledge":["verb","irregular","past"],"allowedHintLevel":2}
```

`recentWeaknesses`/`masteredRecently` 字段协议保留，第 2 批填充。
事件题目快照沿用 v26（quizSnapshot）：题干、选项、正确答案、提示级别、打码名单来自同一次事件。

## 3. 请求调度（第 1 批 · 接口先立）

- 缓存键 `questionId|attempt|hintLevel`，命中直接复用（`hintCacheKey()`）
- 提示通道调用策略：L1/L2 提示允许静态模板直出（零请求）；L3 与个性化陪伴走 LLM
- 指标必录：`llmCallsPerQuestion`、`cacheHitRate`、`localFallbackRate`（autopilot 上报汇总事件）
- 忙碌合并事件（不只保留最新，防高危蓄力覆盖教学事件）：第 3 批

## 4. 实验设计（第 1 批 · 三组对照）

| 组 | 参数 | 精灵 | LLM | 答错行为 |
|---|---|---|---|---|
| 无提示组 | `?exp=none`（兼容 `?nohint=1`） | 不召唤 | 不调用 | 直接下一题（v26 原规则） |
| 静态提示组 | `?exp=static` | 不召唤 | 不调用 | 提示条显示静态分级提示，允许重试 |
| LLM 提示组 | `?exp=llm`（默认跑法） | 召唤 | 调用 | LLM 分级提示（失败降级静态），允许重试 |

- 无 `?exp` 参数时行为与 v26 完全一致（向后兼容，不破坏 v26 验收口径）
- 提示统一显示在 `#hintBar`（题目下方），来源标记：🧚 LLM / 📘 静态
- 日志字段扩展：`exp` / `hintLevel` / `hintSource`（llm / static / cache / llm→static）
- 采集指标：首答正确率、答错后重试正确率（延迟复习正确率留第 2 批复习机制后测）

### v27 第 1 批验收数据标准

| 用例 | 通过条件 |
|---|---|
| HINT-01 | staticHint 全题库循环：L1/L2/L3 文案均不含任何选项原文与正确答案（buildMaskOpts 名单零命中） |
| HINT-02 | validateHintOutput 非法输入（缺字段/超界 level/非法 mood/空 text）全部拒绝且给原因 |
| HINT-03 | parseLLMHintOutput 容忍裸 JSON / ```json 包裹 / 前后杂文本；非 JSON 返回 null |
| HINT-04 | allowedHintLevel(attempt) 单调有界 1-3；attempt≥3 后不再升级 |
| HINT-05 | buildHintContext 摘要字段齐全（questionId/attempt/wrongChoices/knowledge/allowedHintLevel） |
| HINT-06 | 缓存键稳定：同 (questionId,attempt,level) 同键，异参数异键 |
| HINT-07 | 浏览器实测：exp=static 无 LLM 答错显示静态提示并可重试；exp=llm LLM 提示渲染且 mood 徽章生效；LLM 断开自动降级静态 |
| HINT-08 | 现有 25 个单元测试 + 语法检查 + 题库审计全量回归通过（行为零回退） |

## 5. 实施顺序与执行状态

- 第 1 批：分级提示协议 + 结构化输出 / 统一接口 + 自动降级 / 三组实验与数据采集 ← **本批**
- 第 2 批：错因诊断、学习者画像（recentWeaknesses 填充）、答后讲解（L4 + explanation 优先）
- 第 3 批：离线题目生产管线、精灵解说合并、更复杂人设表现

## 执行状态

- [x] 计划文档落盘
- [x] `src/hint-engine.js` 纯逻辑模块（HINT_LEVELS/allowedHintLevel/buildHintContext/staticHint/validateHintOutput/parseLLMHintOutput/hintCacheKey/HINT_SYS）
- [x] `tests/hint-engine.test.js`（HINT-01~06）
- [x] HTML 集成：hintBar UI、答错流程接统一接口、askFairyHint 结构化输出、exp 三组参数、日志与指标字段
- [x] HINT-07 浏览器实测（CDP：static 组提示+重试 / llm 组结构化渲染 / 断链降级）
- [x] HINT-08 全量回归（npm test / check / audit）
- [x] 标记完成（commit 见 git log）

## 验收记录

- npm test：36 用例（原 25 + hint-engine 11）全过，fail=0
- npm run check：18 段语法全过（新增 hint-engine.js 等模块段）
- npm run audit：六项核心错误 0
- 浏览器实测（CDP + mock LLM 上游 :12340，4/4 PASS）：
  - HINT-07A exp=static：答错 → 📘 静态提示（文案零泄题）→ 错误项禁用、3 项可重试 → 重试答对流程继续
  - HINT-07B exp=llm：答错 → 🧚 LLM 结构化提示（hintSource=llm 落 player log，精灵日志含 HINT 条目）→ 零泄题
  - HINT-07C LLM 上游关闭：hintBar 自动降级 📘 静态提示，重试可用，无崩溃（核心流程不依赖 LLM）
  - HINT-07D exp=none：答错直接下一题，无提示条（v26 原行为保持）
- 实测中发现并修复：EXP=llm 但精灵未召唤时答错掉出全部分支 → answer 分支改为按 EXP==='llm' 判定，无论精灵在线与否统一走 getHint（在线 LLM、离线静态）
