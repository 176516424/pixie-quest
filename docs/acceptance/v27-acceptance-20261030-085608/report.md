# v27 第 1 批验收报告（LLM 教学增强：分级提示协议 + 统一降级 + 三组实验）

- **验收对象**: pixie-quest v27 第 1 批（commit `6dc64ae` 起点 + 验收中修复 DEF-001/DEF-002）
- **验收标准**: docs/acceptance/…（用户提供的 v27 验收数据标准：5 节实际结果数据）
- **结论**: **通过**（25/25 用例 PASS，0 FAIL，0 BLOCKED，P0/P1 未关闭缺陷 0）
- **重要口径声明**: LM Studio 本次不可用（`lms server start` 卡死，GUI 未安装），LLM 相关指标全部使用**受控 mock 上游**（`tools/acceptance/mock-upstream.js`，OpenAI 兼容）。mock 验证的是**管线行为**（协议校验/降级链/打码防线/缓存/指标上报），不验证模型语言质量。真实模型复核列为后续事项。
- **教学效果口径声明**: 三组实验的学生作答概率由 `hash(qid|attempt)` 决定（与组别无关），提示增益为**公开声明的模拟参数**（L1 +0.15 / L2 +0.30 / L3 +0.45）。三组差异检验的是「提示通道的行为差异」，**不是真实学习效果**；首答正确率三组同为 45% 恰证明学生模型与组别解耦（这是实验设计正确性的证据，而非提示无效的证据）。真人实验（含延迟复习正确率）需后续开展。

## 1. 自动化检查结果

| 结果项 | 实测输出 | 通过标准 | 判定 |
|---|---|---|---|
| 单元测试 | tests=36 pass=36 fail=0 cancelled=0，退出码 0 | fail=0、exit=0 | ✅ |
| 语法检查 | 22 段全部通过，退出码 0 | 全部通过 | ✅ |
| 题库审计 | 198 题；结构 0 / 重复 0 / VERB_DB 0 / 答案 0 / 拼写 0 / 跨难度 0 | 核心错误均 0 | ✅ |
| 精灵审计 | 16 事件、应答 16/16、mood 合规 16/16、教学词 15/16（94%）、**泄题 0/16**、退出码 0、JSON 已生成 | 泄题 0、exit 0 | ✅ [mock] |

原始日志：`commands/npm-test.log`、`npm-run-check.log`、`npm-run-audit.log`、`npm-run-audit-fairy.log`、`sessions/fairy-audit.json`。

## 2. 核心功能验收结果（v26 驱动在 v27 代码上复跑，13/13 PASS）

| 用例 | 判定 | 实测要点 |
|---|---|---|
| UI-01 地图/进入 | PASS | node0 可进、1-11 锁定；无脚本错误 |
| UI-02 答对结算 | PASS | 单发 23 伤害、切题、存活 |
| UI-03 答错记录 | PASS | 错题本 0→1 内容一致、攻击落空 |
| UI-04 连点/空档 | PASS | 三连点 1 次结算；空档 8 连点被守卫 8/8 拒绝 |
| UI-05 中毒致死 | PASS | HP=0、死亡浮层、输入锁定 |
| UI-06 返回地图清状态 | PASS | 毒/冻/续力全清零 |
| UI-07 续力计时 | PASS | 归位→普攻 2119ms，无立即补刀 |
| UI-08 Absolute Freeze | PASS | 蓄力事件含该文案、无 undefined |
| UI-09/10 弹窗 | PASS | 错题本、精灵日志开合正常 |
| UI-11 旧题快照 | PASS | 跨题返回仍对应旧题、旧答案打码 |
| UI-12 文本安全渲染 | PASS | `<img onerror>`/`<script>` 纯文本显示、未执行 |
| UI-13 无 LLM 可玩 | PASS | 全流程无阻塞 |

## 3. LLM 专项结果（120 样本 = 40 题 × L1/L2/L3）

```json
{
  "sampleCount": 120,
  "preAnswerLeakCount": 0,
  "invalidOutputFallbackRate": 100,
  "llmUnavailableFallbackRate": 100,
  "finalOutputComplianceRate": 100,
  "rawStructuredJsonRate": 95,
  "questionMatchRate": 100,
  "teachingFactAccuracy": 100,
  "optionQuoteCount": 0,
  "maskDefenseRate": 100,
  "latencyP50Ms": 483,
  "latencyP95Ms": 703
}
```

| 门槛 | 要求 | 实测 | 判定 |
|---|---|---|---|
| 答前泄题数 | 0 | **0**（display/raw 双口径；经 maskLeaks 后） | ✅ |
| 非法输出/不可用降级率 | 100% | **100% / 100%**（6/6 非法样本安全降级；5/5 探针 502→静态兜底） | ✅ |
| 输出结构合规率 | ≥99%（其余全部安全降级） | **finalOutputComplianceRate=100%**（模型原始 JSON 合规率 95%，由 mock 混合配置决定，如实标注） | ✅ |
| 题目匹配率 | ≥98% | **100%**（teachingPoint 命中 knowledge） | ✅ |
| 教学事实准确率 | ≥95% | **100%**（规则判定：声称「过去式是 X」而 X≠答案计错；全样本留档人工复核） | ✅ |
| 对抗打码 | —（加测） | **100%**：4 条刻意泄题文本经 maskLeaks 后 0 泄露 | ✅ |

明细与原始样本：`sessions/hint-metrics.json`（120 条 rawHead 全留档）。

## 4. 三组对照实验结果（同种子 20261030 + 驱动侧固定 60 题，三组逐 qid 核对 0 分叉）

| 指标 | 无提示 (none) | 静态提示 (static) | LLM 提示 (llm) |
|---|---:|---:|---:|
| 样本数 | 60 | 60 | 60 |
| 首答正确率 | 45% | 45% | 45% |
| 无提示重试正确率 | N/A（v26 行为：答错直接下一题，重试 0 次） | — | — |
| 重试次数 | 0 | 33 | 33 |
| 重试解决率 | — | 100% | 100% |
| 平均延迟 | 0 | 0（纯本地） | p50=471ms / p95=677ms [mock] |

**请求开销（llm 组实测）**: `llmCallsPerQuestion=1.13`（68 次 / 60 题）、`cacheHitRate=0`（本实验键均不重复）、`localFallbackRate=0`（mock 可用时）。指标随 `/savelogs` tag v3 上报落盘。

**行为差异实证**: none 组答错→下一题（重试 0）；static 组 33 次重试全走 📘；llm 组 33 次重试全走 🧚（66 结构化 + 2 纯文本降级）。提示通道、降级链、指标上报三者的行为差异成立；**教学效果差异需真人实验**。

原始会话日志（汇总可重算）：`experiments/none-run.json`、`static-run.json`、`llm-run.json`、`summary.json`、`logdir/log-player-*.json`、`logdir/log-index.json`。

## 5. 缺陷与最终结论

验收中发现并修复 2 个真实缺陷（均已关闭）：

| ID | 级别 | 缺陷 | 修复与复验 |
|---|---|---|---|
| DEF-001 (v27) | P1 | exp=llm 未召唤精灵时 `getHint` 内 `fairyOn` 条件残留，LLM 永不调用 | 移除条件；重跑 llm 组 llmCalls 0→68 全 🧚 |
| DEF-002 (v27) | P1 | `buildMaskOpts` 不含干扰项原文，模型引用选项可穿透打码防线 | 全部选项入名单 + 单测断言 + fairy-audit 同构 + 对抗测试 4/4 归零 |

```text
PASS 数：25（CMD 4 + SRV 3 + UI 13 + LLM 1 + EXP 4）
FAIL 数：0
BLOCKED 数：0
P0/P1 未关闭缺陷数：0（DEF-001/DEF-002 均已修复关闭）
验收结论：通过
对应 commit：6dc64ae（起点）+ 本验收包提交（含 DEF-001/002 修复）
原始证据目录：docs/acceptance/v27-acceptance-20261030-085608/
```

### 范围外 / 后续事项
1. **真实模型复核**：LM Studio 恢复后用 qwen/qwen3.5-9b 重跑 hint-metrics 与 fairy 审计，验证语言质量与真实延迟（管线行为已由 mock 验证）。
2. **真人三组实验**：模拟学生参数（base 0.70/0.50/0.35，boost 0.15/0.30/0.45）需真人数据替换；补充「延迟复习正确率」指标。
3. v27 第 2 批：错因诊断、学习者画像填充、答后讲解（L4 + explanation 优先）。
