# V28 阶段性验收报告（批次 A + C；批次 B = BLOCKED）

- 验收目录：`docs/acceptance/v28-acceptance-20261030-2129/`
- 被测 commit：`350b90d`（工作区干净，与 GitHub main 一致）
- 执行时间：2026-10-30 21:29–21:31（北京时间）
- 环境：详见 `environment.json`（LLM 上游 = 受控 mock 127.0.0.1:15990，全部结果带 `[mock]` 口径）

## 0. 结论

**V28 阶段性验收：批次 A 与批次 C 通过；批次 B（真实模型验收）BLOCKED；批次 D（真人研究）未开始。按 V28 计划第 6 节完成定义，V28 整体不得宣布完成**——批次 B 是硬门槛，本报告不构成 V28 整体完成结论。

## 1. 自动化检查（批次 A 项，commit 350b90d 复跑）

| 检查 | 结果 |
|---|---|
| `npm test` | 50/50 通过（v27 36 条 + v28 批次 C 新增 14 条） |
| `npm run check` | 27 段语法全过 |
| `npm run audit` | 题库审计六项问题 0 |

## 2. UI 全量回归：13/13 PASS（本轮新证据）

驱动：`driver-ui-v27.js`（含真实可见性断言：getComputedStyle + 祖先链隐藏检查 + getBoundingClientRect + elementFromPoint 中心命中）。结果：`driver-results.json`，原始日志：`commands-ui-driver.log`，截图 22 张（`screenshots/`）。

关键用例摘要：
- **UI-08**：真实第三章 Boss 战「冰霜魔王 👑BOSS」，计时轮转蓄力，精灵事件含打断指引（`sessions/ui08-frost-king-events.json`）
- **UI-09 / UI-10**：错题本 / 精灵日志弹窗真实可见（display、实际面积、无隐藏祖先、elementFromPoint 可命中）且可关闭——v27 整改后口径延续
- **UI-12**：恶意 HTML 注入按纯文本渲染，零执行
- **UI-13**：`?exp=none` 无 LLM 全流程可玩，0 控制台错误

## 3. 批次 C 教学闭环冒烟：12/12 PASS（本轮新证据）

驱动：`tools/acceptance/smoke-batchc.js`（三段式：默认模式 → static 模式 → 复习闭环）。结果：`smoke-batchc-results.json`，原始日志：`commands-smoke-batchc.log`。

覆盖点：T-01 模块加载；T-02 C1 诊断入库（类别+可审计 basis）；T-03/T-04 C3 结算讲解只在换题边界出现、换题即清；T-05 C2 学习者摘要进弱点列表；T-06 static 提示与重试解锁；T-07 first:miss→retry:ok 阶段事件分离；T-08 复习答对移出错题本；T-09/T-10 review:false / review:true 事件分离；T-11 清空=全新学习者（历史与统计归零）；T-12 全程 0 未捕获异常。

## 4. 证据完整性

- 全部截图、结果 JSON、原始日志均为本轮（2026-10-30T13:30Z）全新生成，无复用文件
- SHA-256 清单：`evidence-sha256.txt`
- **确定性截图标记**（V28 计划 §5 要求）：本包内 `ui01-map.png` ≡ `ui06-charge-cleared.png` ≡ `ui06-poison-cleared.png`（哈希相同），且与 v26/v27/基线包对应图字节一致。原因：这三张画面为无随机内容的确定性渲染。三例的 PASS 依据均为状态断言（driver-results.json 的 actual 字段），不依赖截图
- 关键证据（ui08-frost-king、ui09-wrongbook、ui10-fairylog、ui13-no-llm-flow）哈希全库唯一
- 历史遗留：v26 包内 `ui09≡ui13` 为已知旧假证据，仅存于 v26 包，未在本轮出现

## 5. 批次 B（真实模型验收）：BLOCKED

阻断原因（2026-10-30 21:28 复测确认）：
1. LM Studio GUI 未安装
2. `lms server start` 依然卡死（CLI 二进制存在但后端守护不工作）
3. `~/.lmstudio/models` 为 0 字节——本机无任何已下载模型权重

按 V28 计划约定：批次 B 在环境恢复前标 BLOCKED，**不得用 mock 补齐**。静态降级模式（exp 缺省 / `?exp=none` / `?exp=static`）不受影响，可正常发布使用。

解除条件：安装 LM Studio 桌面版 + 下载任一 Qwen 系列模型 + GUI 内启动服务。恢复后执行：120 条分层抽样真实请求/响应留档、双盲人工评审语言与教学事实质量、真实 p50/p95 延迟实测。

## 6. 未完成事项（明确不并入已完成结论）

- **批次 B**：真实模型的语言质量、教学事实质量、真实延迟——未验收
- **批次 D**：真人三组对照实验与延迟复习正确率——未开始（实验设计已另行产出：`docs/plan/v28-batch-d-experiment.md`）
- 本报告结论仅覆盖：管线功能、批次 C 四项功能的交互级验证、真实可见性与防注入回归

## 7. 交付物清单

| 文件 | 说明 |
|---|---|
| `report.md` | 本报告 |
| `environment.json` | 环境与 mock 口径声明 |
| `driver-ui-v27.js` | 驱动（含 no-proxy 补丁与真实可见性断言） |
| `driver-results.json` | UI 13/13 结果 |
| `commands-ui-driver.log` | UI 驱动原始日志 |
| `smoke-batchc-results.json` | 批次 C 冒烟 12/12 结果 |
| `commands-smoke-batchc.log` | 冒烟原始日志 |
| `screenshots/`（22 张） | 全用例截图 |
| `sessions/`（2 个） | UI-08 Boss 事件、UI-11 捕获请求 |
| `evidence-sha256.txt` | 全部证据 SHA-256 清单 |
