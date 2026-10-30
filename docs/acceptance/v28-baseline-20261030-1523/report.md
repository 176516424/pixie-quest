# V28 批次 A 基线复验报告（2026-10-30）

## 0. 定位与范围

V28 计划（`docs/plan/refactor-plan-v28.md`）批次 A 的 A1/A2（弹窗父容器修复、真实可见性断言、证据重生成）已在 v27 整改 commit `39c8658` 落地。本包为**批次 A 基线复验**：在最新代码 `d9858f8` 上按 A3 要求做全量回归确认，不新增功能代码。

- 验收对象: pixie-quest @ `d9858f8`（工作区干净，无未提交改动）
- 驱动: `driver-ui-v27.js`（v27-rectified 版，本包副本新增 `--no-proxy-server` 启动参数，见 §3 环境差异）
- 结论: **批次 A 基线确认通过** —— 三件套退出码全 0，UI 13/13 PASS，真实可见性断言全过

## 1. 自动化检查（A3 必过回归）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `npm test` | 36 tests / 36 pass / 0 fail | 0 |
| `npm run check` | 语法检查 23 段全部通过 | 0 |
| `npm run audit` | 结构 0 / 语义重复 0 / VERB_DB 0 / 答案错误 0 / 拼写干扰 0 / 跨难度 0 | 0 |

（`npm run audit:fairy` 需 LLM 上游，本机 LM Studio 不可用，属批次 B 范围，未列入本批门槛。）

## 2. UI 全量回归（13/13 PASS）

执行时间: `2026-10-30T07:33:04Z`（driver-results.json）。全部证据本次生成于本目录，无文件复用。

关键用例摘录（完整数据见 `driver-results.json`）：

- **UI-08 真实冰霜魔王**: 怪物名「冰霜魔王 👑BOSS」，Boss 真实计时轮转后蓄力，精灵事件含「Absolute Freeze」打断指引、无 undefined（`sessions/ui08-frost-king-events.json`）。
- **UI-09 错题本**: 真实可见性全过 —— display=flex、1258×702、无祖先隐藏、中心点 elementFromPoint 命中=true、面板可命中；关闭后 display=none。
- **UI-10 精灵日志**: 同上真实可见性断言全过，计数/条目/心情统计正确。
- **UI-13 无 LLM 基础可玩**: 未召唤精灵全流程，地图/答题/结算/错题本弹窗真实可见可关闭，0 控制台错误。
- **UI-12 渲染安全**: 模型文本含 `<img onerror>` 与 `<script>`，气泡与日志均按纯文本显示、未创建元素、未执行（__pwned 空）。

## 3. 环境口径（统一）

- **LM Studio: 不可用**（GUI 未安装，`lms server start` 卡死）。LLM 上游 = **受控 mock `127.0.0.1:15990`**（OpenAI 兼容，模型名 `mock-qwen3.5-9b`）。服务探活: `GET /llmhealth → {"ok":true,"hasModel":true}`。
- 游戏服务: `PORT=8797 LLM_HOST=127.0.0.1 LLM_PORT=15990 node server/server.js`。
- Node v22.22.2 / Windows / Chrome headless=new（CDP :9337）。
- **环境差异记录**: 本机 shell 存在系统代理 `HTTP_PROXY=127.0.0.1:64364` 且 `NO_PROXY` 为空，headless Chrome 会把 127.0.0.1 请求交给代理导致错误页。本包驱动副本在 Chrome 启动参数中新增 `--no-proxy-server`（仅影响驱动自身的浏览器启动，不改游戏代码）。v27 验收时该代理不存在，故当时无需此参数。

## 4. 失败轮透明记录（未提交、已全部丢弃后重跑）

1. **第 1 轮（0/13，~2s）**: 游戏服务作为后台 shell 子进程启动，shell 结束时被连带终止；加上系统代理问题，Chrome 打开错误页（localStorage SecurityError 是错误页的典型表现，不是游戏缺陷）。
2. **第 2 轮（9/13，1m40s）**: 服务存活但未设 `LLM_PORT=15990`，LLM 请求打到默认 1234 死端口 → UI-08/10/11「精灵召唤」超时；UI-12 受 UI-11 残留精灵队列状态影响断言失败。
3. **第 3 轮（13/13，1m05s）**: 修复服务环境变量 + 驱动加 `--no-proxy-server` + 清空全部产物后全量重跑。本报告只基于第 3 轮结果。

## 5. 证据清单与确定性截图标记

- 截图 22 张、sessions 3 个、`driver-results.json`、`commands-ui-driver.log`（含 DRIVER_EXIT=0）。
- **字节一致标记**（依 V28 计划 §5 要求明确标注）: `ui01-map.png`、`ui06-charge-cleared.png`、`ui06-poison-cleared.png` 与 v26/v27 包对应文件 SHA-256 相同。原因：这三幅画面内容完全确定（地图无随机元素、状态清除覆盖层文案固定），非复用旧文件——本包截图全部由本次驱动即时生成（时间戳可证）。**这三例的 PASS 依据是驱动状态断言**（章节锁状态、HP/poison/frozenUntil/charging 数值），不以截图为通过依据。其余 19 张与本仓库历史包均不同。
- v26 包内 `ui13≡ui09`（`9af30b4a…`）为已撤回的历史假证据，仅存在于 v26 目录，未在本包出现。

## 6. 未完成事项（不并入本批结论）

- 批次 B（真实 LM Studio 验收）: 阻断于 LM Studio 环境恢复。恢复前静态/mock 管线结论维持，不宣称真实 LLM 验收完成。
- 批次 C（错因诊断 / 学习者摘要 / L4 答后讲解 / 延迟复习）: 未开始。
- 批次 D（真人三组对照、延迟复习效果）: 未开始。
