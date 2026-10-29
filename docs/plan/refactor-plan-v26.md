# pixie-quest · 渐进式改造计划 v26

> 来源：2026-10-29 外部评审「总体建议」。本文档是开发要求的版固化版本，附执行状态跟踪。
> 首批落地范围（按评审建议）：**阶段 1 + 阶段 2**。阶段 3/4 待前两阶段验收后另立版本。

## 执行状态总览（随开发推进更新）

| 阶段 | 内容 | 状态 |
|---|---|---|
| 1 | 回归防线 + P0/P1 稳定性修复 | 🚧 本次实施 |
| 2 | 模块抽取（核心纯逻辑/服务器/工具） | 🚧 本次实施（全量 src/ 拆分暂缓，见下） |
| 3 | 错题本→学习闭环 | ⏸ 未开始（另立版本） |
| 4 | LLM 可插拔化 + 可访问性 | ⏸ 未开始（另立版本） |

### v26 实施明细

| 项 | 状态 | 说明 |
|---|---|---|
| package.json（start/test/audit/check） | ✅ | Node 内置 test runner，零运行时依赖 |
| 可注入随机数/时间的纯逻辑模块 | ✅ | `src/game-core.js`（UMD，浏览器+Node 共用） |
| 中毒最后一跳致死不结算 | ✅ | 死亡判定先于回合耗尽判定 |
| 冻结技能英文名缺失（SK_EN.freeze） | ✅ | 补 `Absolute Freeze` |
| 精灵打码用请求返回时的 curQ | ✅ | fairyEvent 入队即快照完整题面（题干+选项+正确项文本） |
| 模型输出直插 innerHTML | ✅ | fairy 气泡与日志渲染改 textContent/createElement |
| 返回地图残留状态 | ✅ | gotoMap 补 clearStatus；状态机口径注释 |
| 服务器配置化/上游超时/健康检查验模型/日志目录 | ✅ | 移至 `server/server.js`，环境变量配置 |
| 分析工具固定口径（/206、15s、D: 路径） | ✅ | 日志路径参数化、题数从数据读取、输出路径参数化 |
| 题目稳定 id + knowledge 标签 + 动词题 explanation | ✅ | 内容哈希 id，构建期统一赋值 |
| 全量 src/ 目录拆分（main/core/ui/services） | ⏸ | 暂缓：先以 game-core 纯逻辑验证测试路线，HTML 本体 1686 行一次性拆分风险高，安排在测试覆盖足够后的下一版本 |
| 错题本掌握度规则（不同场次 2 次） | ⏸ | 阶段 3 |
| 存档 version/迁移、错题复习模式 | ⏸ | 阶段 3 |
| 移动端/键盘/aria-live/prefers-reduced-motion | ⏸ | 阶段 4 |

---

## 一、总体方向

**不引入 React/Vue 重写。** 保留原生 JavaScript 与像素视觉，沿三个方向渐进改造：

1. 先稳定战斗状态和异步计时
2. 再拆分模块、补自动化测试
3. 最后强化学习闭环和 LLM 能力

目标：把项目从「功能丰富的单文件 Demo」改成「可维护、可测试、即使不开 LLM 也有教学价值的英语游戏」。

## 二、现状评估（评审时点）

已验证：题库 198 题、审计核心错误为 0、JS 语法全过、服务器与共享模块 200、工作区干净。

| 优先级 | 问题 | 证据 |
|---|---|---|
| P0 | 战斗状态与计时器耦合（全局变量、异步动画、多计时器交叉修改） | 换关/返回地图/死亡与击杀并发时易回归 |
| P0 | 中毒最后一跳死亡漏判（先减回合后判死） | poisonTick 回调分支顺序 |
| P1 | LLM 与战斗状态时序风险（打码依据请求返回时的 curQ 而非事件快照） | askFairy 打码名单 |
| P1 | 最终 Boss 技能英文名缺失（SK_EN 无 freeze，发给模型 undefined） | startCharge 事件文案 |
| P1 | 错题「掌握」规则过宽（答对一次即移除） | masterWrong |
| P1 | 教学依赖 LLM（未开精灵时答错无讲解无重试闭环） | answer() 分支 |
| P2 | 实验工具旧口径（/206、15s、固定 D: 路径） | analyze-session.js / fairy-audit.js |
| P2 | 工程化与可访问性不足（无 package.json/测试入口/使用说明；移动端/键盘/焦点/减动效缺失） | — |

## 三、目标结构（终态，渐进逼近）

```text
pixie-quest/
├── package.json / README.md / index.html(pixel-battle-ui.html)
├── src/
│   ├── game-core.js          # ✅ v26：纯逻辑（洗牌/解析/毒结算/续力），可注入 RNG
│   ├── core/ …               # ⏸ 下一版本：game-state/combat/scheduler/questions
│   ├── content/ …            # ⏸
│   ├── services/ …           # ⏸
│   └── ui/ …                 # ⏸
├── server/server.js          # ✅ v26：配置化 + 超时 + 健康检查验模型 + 日志目录
├── tools/                    # ✅ v26：analyze-session / audits（question-audit、fairy-audit）
├── tests/game-core.test.js   # ✅ v26：node:test
├── nce-shared.js             # ✅ 保留单一题库源；v26 起题目带稳定 id/knowledge/explanation
└── docs/plan/                # ✅ v26：本计划与后续版本规划
```

核心原则：**战斗规则不直接操作 DOM，界面只负责渲染和派发动作。** v26 先用 game-core 建立该原则的测试样板，全量拆分在测试防线稳固后进行。

## 四、阶段 1：回归防线 + 稳定性（v26 实施）

- [x] package.json：`npm start` / `npm test` / `npm run audit` / `npm run check`
- [x] Node 内置测试（node:test），零运行时依赖
- [x] 随机数可注入（shuffle4(rng)），Miss/掉落/倒计时路径可确定性复现
- [x] 修复：中毒最后一跳致死不结算
- [x] 修复：SK_EN.freeze 缺失
- [x] 修复：精灵打码改用事件时题目快照
- [x] 修复：模型输出 textContent 化（气泡 + 日志渲染）
- [x] 修复：gotoMap 补 clearStatus，杜绝残留计时器动作
- [x] 状态机口径注释：`map → battle → charging/transition → gameOver`，非法状态拒绝输入（answer 三重守卫 + 冻结判定）

## 五、阶段 2：模块抽取与服务器整理（v26 实施）

- [x] 服务器移至 server/server.js；PORT/LLM_HOST/LLM_PORT/LOG_DIR 环境变量化
- [x] /llm 上游超时 + 明确 504 错误响应
- [x] /llmhealth 校验所需模型在列（?model= 指定，缺省用 LLM_MODEL_EXPECT）
- [x] 日志目录可配置 + 写入错误处理（失败返回 500）
- [x] 模型输出与日志展示 textContent 化
- [x] analyze-session.js：日志路径参数化；题数从题库数据读取（移除 /206 硬编码）
- [x] fairy-audit.js：输出路径参数化（移除 D: 盘固定路径）
- [x] 题目增加稳定 id（内容哈希）与 knowledge 标签；动词题自动生成 explanation
- ⏸ 全量 src/ 拆分与题目句型题 explanation：下一版本（见执行状态表）

## 六、阶段 3：错题本 → 学习闭环（未开始）

要点（原文要求保留）：题目增 explanation/hint；无 LLM 时提供静态提示与同题重试；错题本按题目 id 记录；「答对一次即掌握」改为不同场次间隔答对 2 次；错题复习模式优先高错误率与久未复习题；存档 version/校验/迁移。

## 七、阶段 4：LLM 可插拔化与体验优化（未开始）

要点（原文要求保留）：LLM 调用失败不影响答题与通关；统一请求/超时/取消/错误处理；结构化输出校验 mood/text；小模型 A/B 用数据决策；移动端布局/键盘选项/焦点管理/aria-live/prefers-reduced-motion；音效、解说、复仇机制放在最后。

## 八、v26 验收标准（✅ 2026-10-29 全部通过）

- [x] 题库审计核心错误保持 0（`npm run audit`：结构 0 / 重复 0 / VERB_DB 0 / 答案 0 / 假词 0 / 跨难度 0）
- [x] game-core 纯逻辑测试通过，19 个用例覆盖洗牌均匀性/字母解析边界/毒结算死亡/续力条/守卫判定
- [x] 全部 JS 语法检查通过（`npm run check`，10 段含 HTML 内联脚本）
- [x] 服务器冒烟：页面 200 / 共享模块 200 / game-core 200 / 健康检查验模型（返回 models 列表）/ 超限 413 / 按 sid 落盘 + 索引 / 路径穿越防护
- [x] 分析工具无固定题数、无固定 D: 路径，支持路径参数（analyze 双日志参数、fairy-audit --out）
- [x] 题库 id 唯一（内容哈希）、动词题带 explanation（题库契约测试 6 例）
- [x] 文档与实际入口一致（开发进度.md 文件表与入口已更新，新增 README.md）

**测试汇总：25/25 通过（node --test）。暂缓项（阶段 3/4 与全量 src/ 拆分）见执行状态总览。**
