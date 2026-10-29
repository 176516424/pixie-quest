# NCE 像素答题闯关 · 开发进度与思路

> 更新时间：2026-10-29 · 单文件 HTML 游戏，位于 `F:\.workbuddy\2026-10-28-22-04-47\pixel-battle-ui.html`

## 一、项目定位

把《新概念英语第一册》复习做成**像素风答题闯关游戏**：答对出招打怪、答错攻击落空被怪兽嘲笑，怪兽定时反击，三章地图先小怪后 Boss。题目全部抽自两份自制 A4 速查表 PDF（《动词速查表》《疑问句型速查表》，素材在 `D:\UserData\WorkBuddy-Cache\intermediate\pdf-read.XKY85a\`）。

## 二、技术方案

- **单文件 HTML**（`pixel-battle-ui.html`，无外部依赖）：CSS 像素边框 + Canvas 逐像素渲染精灵（字符画定义、`image-rendering: pixelated` 放大）
- **同源 Node 代理**（`llm-game-server.js`，端口 8797）：托管页面 + 把 `/llm` 请求转发到 LM Studio（`127.0.0.1:1234`）。为什么要代理：LM Studio 不给跨域 CORS，网页直连会被浏览器拦
- **本地 LLM 玩家**：Qwen3.5-9B @ LM Studio，真·读题作答，无任何答案标记

## 三、当前完成度（按界面区域）

| 模块 | 状态 | 说明 |
|---|---|---|
| 顶栏 | ✅ | 主角头像、HP/MP 条、4 格像素装备图标、3 个技能按钮（重击 MP20 / 火球 MP35 / 治疗 MP25） |
| 问题区 | ✅ | 难度徽章 ★/★★/★★★ + 出处标签 + 2×2 选项，选项随机洗牌 |
| 战斗区 | ✅ | 左勇者右怪兽、待机浮动、走前一步攻击、受击闪白+击退+飘伤害+屏幕震动、怪兽头顶简化血条 |
| 答错演出 | ✅ | 主角上前 → "打击失败！"灰字落空 → 怪兽蹦跳嘲笑（气泡"嘻嘻嘻~ 打不中！"） |
| 定时攻击 | ✅ | 怪兽每 11~15 秒出手一次（逐章递增），底部倒计时；LLM 思考时冻结计时 |
| 关卡地图 | ✅ | 三章：新手草原 → 熔岩洞穴 → 寒冰王座；每章 2 小怪 + 1 Boss，Boss 体型放大；进度存 localStorage（带异常保护） |
| 题库 | ✅ | **198 题，知识点级唯一**（`question-audit.js` 审计归零）：难度 1×60 / 2×90 / 3×48，全部带课号级出处。构成 = 手工精选题 + 58 个不规则动词运行时自动生成（过去式/过去分词/三形分类三考点；知识点归一化去重防变体措辞撞车；选项唯一性兜底防 show 式"规则化错误=正确答案"；ing 干扰项带双写/ee 规则） |
| 错题本 | ✅ | 答错自动收录（题干+正确答案+错误选项+出处+次数+日期）；答对同题自动"已掌握"移除并飘字；支持导出 Markdown 复习清单；地图页按钮实时显示数量 |
| LLM 玩家 | ✅ | 地图页按钮启动，真读题（`askLLM`），结算显示战绩；每题约 45~70 秒（CPU 跑 9B 的瓶颈） |
| 装备系统 | ✅ | 4 槽位 3 等级真加成：剑+攻（普攻/重击全额、火球 70%）、盾减伤、盔+回蓝、药+治疗。小怪 55% 掉 1~2 级、Boss 必掉 2~3 级；重复低级自动转 MP+10。掉落演出：飘字+气泡+装备槽白闪+金框徽章 |
| 怪兽技能 | ✅ | 小怪 25%/Boss 45% 概率施放，施放前 **4 秒可打断续力**（蓄能动画+倒计时条，答对出招打断：伤害+30% 且大招作废；大招落地后怪兽计时归位 3s，避免"吃了大招还连吃刀"）。小怪按主题：毒雾（DOT ☠）/火息（伤害+烧蓝）/冰息（冻结答题区 4 秒） |
| Boss 大招 | ✅ | 史莱姆王「酸液吞噬」（全屏绿光+抛物线酸弹+强毒 4 回合）；熔岩巨人「熔岩天降」（全屏橙光+6 颗陨石砸落+烧蓝 15+三连屏震）；冰霜魔王「绝对冰冻」（全屏蓝光+冰晶爆散+答题区冻结 6 秒且蓝框结霜，**冻结期怪兽计时不停**）。Boss 常驻红色脉动光环 |

## 四、关键实现思路（易忘的坑）

1. **关闭 Qwen3.5 推理**：`/no_think`、`chat_template_kwargs`、`reasoning_budget:0` 全部无效；唯一有效的是**预填空思考块**——消息末尾追加 `{role:'assistant', content:'<think>\n\n</think>'}`，模型以为思考已结束，直接输出答案
2. **状态空档期 BUG 防线**（已踩过 4 个同类坑）：击杀怪兽到新怪刷出的 900ms、Boss 死亡到切章之间，必须锁输入。`answer()` 三重守卫 `busy||gameOver||monHP<=0`；击杀瞬间立即禁用全部选项；下一题挪到新怪刷出之后再出
3. **Boss 通关自动进下一章**：非最终章 1.9 秒后 `startLevel(next)` 满血满蓝续关；最终章才弹结算
4. **选项洗牌**：题库统一 `a:0`，渲染时 `[0,1,2,3].sort(()=>Math.random()-.5)` 打乱
5. **localStorage 全部 try/catch**：沙箱 iframe 可能禁存储，否则 LLM 演示启动即崩
6. **CPU 无独显跑 9B**：瓶颈在 prompt 处理不在生成 token，关闭推理救不了速度，只能换小模型或冻结游戏计时

## 五、改进路线图（按优先级）

- ✅ ~~A. 扩题库 + 错题本~~（2026-10-28 完成：94 题）
- ✅ ~~B. 装备掉落 + Boss 专属技能 + 怪兽随机技能~~（2026-10-29 完成，含酷炫特效）
- ✅ ~~题库补全至全量~~（2026-10-29 完成：94 → 206 题。57 个不规则动词建 `VERB_DB` 数据表运行时生成三考点题目；疑问句型补齐碎片问句/who/why/选择疑问/请求建议/祈使反意等未覆盖大类。用户反馈"题目不全"后补齐）
- ✅ ~~数据与实验闭环~~（2026-10-29 晚完成：日志按 sid 落盘 + 索引；每条日志带 model/sysVer；`?nohint=1` 无提示对照组；题库/prompt 抽 `nce-shared.js` 共享模块，分析工具告别 eval）
- **C. LLM 提速**：LM Studio 换 qwen2.5-3b-instruct（非推理型，1~2 秒/题），改 `nce-shared.js` 里 `LLM_MODEL` 一处即可（游戏、日志、审计工具全部跟随）。已做铺垫：battlefield() 的 JUST HAPPENED 已后置到末尾（稳定前缀最大化），换模型后确认 LM Studio prefix caching 生效；预期 45~70s/题 → 5~10s/题
- **D. 复仇机制 + 动态怪兽节奏**：答错后 10 秒内答对下一题=双倍伤害；连答对怪兽攻击延后、连错提前
- **E. LLM 错题分布统计**：Qwen 玩完一章后统计它在哪类语法题上翻车（错题本已能支撑，206 题下更有统计意义）。用 `?ap=1` 与 `?ap=1&nohint=1` 各跑一趟即得干净因果口径
- **F. LLM 直播解说**：把模型对每题的判断理由打到气泡里

## 六、2026-10-29 晚 · 质量与实验闭环改造记录

**一档 bug 修复**：续力条填充公式分母 100→40（旧公式条从 60% 起跳）；选项洗牌换 Fisher-Yates（sort 随机比较有偏）；autopilot 字母解析改「answer/choice/pick: X」优先+裸字母兜底+no-pick（旧 `match(/[ABCD]/)` 抓首字母易错）；删除 loadLv/saveLv/fairyClearTimers/hintReadable 死代码；注释与文档里「10 秒续力/1 秒预警」全部纠正为实际的 **4 秒可打断续力**。

**二档数据闭环**：`/savelogs` 按 sid 落盘 `log-fairy-{sid}.json` / `log-player-{sid}.json` + `log-index.json` 索引（sid 做安全字符清洗，双标签页并发不再互相覆盖）；每条 fairy/player 日志带 `model` + `sysVer:2` + `nohint`；autopilot 支持 `?nohint=1` 对照组（不召唤精灵，测裸能力）；题库/VERB_DB/maskLeaks/精灵提示词抽成 UMD 模块 `nce-shared.js`，浏览器 `<script src>` 与 Node `require` 共用——analyze-session.js / fairy-audit.js 的 eval 提取全部移除。

**三档 LLM 工程**：battlefield() 的 `JUST HAPPENED` 后置到消息末尾（稳定前缀最大化，配合 LM Studio prefix caching）；精灵 TYPE STRATEGY 与勇者 sys prompt 都写入「分类题固定检查顺序」策略（先比后两形式是否相同，再比第一和第三——来自实验 §5 的唯一教学洞察）；心跳阈值 15s→30s（15s 实测 0 触发，事件 5~6s 一个永远被挤掉）。

**四档游戏性**：大招落地后 monTimer 归位 3s（续力期 monTimer 被减成负数，不归位会立即补普攻形成连招）；castMonsterSkill 加设计注释「技能动画不占用 busy，勇者可行动——非 bug 勿修」；底栏在续力期显示续力提示而非负数秒。

**五档顺手防御**：/llm、/savelogs 请求体上限 1MB（超限 413）。单文件拆分（原第 10 条）暂缓：nce-shared.js 已把最常改的数据拆出去了，`pixel-battle-ui.html` 降至约 1690 行，维护压力明显缓解。

## 6.5 2026-10-29 深夜 · 题库深度审计修复（question-audit.js 全项归零）

独立审计（`question-audit.js`，可直接 `node question-audit.js` 复跑）发现 7 项问题，已全部修复：

1. **show 过去式选项重复（🔴 判题死局）**：生成器对 ABC 动词的选项公式 `[past, ed(b), pp, ing(b)]` 中 `ed('show')='showed'` 恰等于真过去式，两个一样选项只认一个，LLM 玩家选另一个会被误判答错、污染实验数据。修复：生成器入库统一走 `pushU` 选项唯一性兜底（撞车换 `b+'es'` 再试，仍撞弃题）。show 题现为 `['showed','showes','shown','showing']`。
2. **「206 零重复」不实（10 组隐性重复）**：旧去重是题干精确匹配，"属于哪种变形"变体、"___"占位、括号注解全部绕过。修复：去重改知识点归一化键 `kp()`（动词+考点），手工变体措辞也能识别。
3. **9 处假词干扰项**：ing() 只做 -e 脱落，产出 runing/seing 等。修复：补 ee 保留 + 重读闭音节双写规则（DOUBLE 集合）。
4. **难度一致性**：同考点跨难度组随归一化去重归零；rise/fly/begin 过去分词手工放 d3 属刻意安排，已在题源注释标明防误改。
5. **begin 不在 VERB_DB**：已入库 `['begin','began','begun','ABC']`（VERB_DB 57→58 行），补齐过去式（d1 生成）与变形分类（d2 生成）两个缺口；其过去分词考点由手工 d3「中哪个是过去分词」题覆盖。
6. **双解风险**：shine 题的 `shined`（及物"擦亮"义合法过去式）、show 过去分词题的 `showed`（美式合法）、spell 题的 `spelled`（美式拼写）已分别换成原形干扰。
7. **统计口径**：`analyze-session.js` 的 qtype 与审计脚本 qtype2 统一（旧版把 6 道"属于哪种变形"变体错记进句型桶）。

**修复后口径**：总量 206 → **198**（10 组重复去重 -9 生成 + 手工 forget d2 过去分词题删除 1；begin 补 2 题），d1=60 / d2=90 / d3=48，VERB_DB 58 行。审计汇总全零：结构 0 / 语义重复 0 / VERB_DB 错误 0 / 答案错误 0（142 道动词题逐题核对）/ 假词 0 / 跨难度 0。

## 七、文件清单

| 文件 | 作用 |
|---|---|
| `pixel-battle-ui.html` | 游戏本体（页面逻辑单文件，题库/prompt 在共享模块；战斗纯逻辑在 src/game-core.js） |
| `nce-shared.js` | 共享数据源（UMD）：QUESTIONS（198 题，带稳定 id/knowledge 标签/动词题 explanation）/ VERB_DB（58 动词）/ maskLeaks / FAIRY_SYS / LLM_MODEL，浏览器与 Node 共用 |
| `src/game-core.js` | 战斗核心纯逻辑（UMD）：洗牌/字母解析/毒结算/续力条/守卫/题面快照，可注入 RNG，node:test 覆盖 |
| `server/server.js` | 同源代理 + 页面服务器（:8797），/savelogs 按 sid 落盘；环境变量配置 PORT/HOST/LLM_HOST/LLM_PORT/LLM_TIMEOUT_MS/LLM_MODEL_EXPECT/LOG_DIR；/llm 上游超时 504；健康检查校验所需模型 |
| `tools/analyze-session.js` | 会话日志分析（`node tools/analyze-session.js [player日志] [fairy日志]`，路径参数化） |
| `tools/audits/question-audit.js` | 题库深度审计（正确性/重复/拼写/难度/覆盖/双解） |
| `tools/audits/fairy-audit.js` | 精灵台词审计（`--out` 参数化输出，不再写死 D: 盘） |
| `tests/` | node:test 单元测试（game-core 纯逻辑 + 题库契约），`npm test` |
| `package.json` | 标准命令：start / test / audit / check |
| `docs/plan/refactor-plan-v26.md` | 渐进式改造计划 v26（阶段 1+2 已实施，状态表在内） |
| `D:\UserData\WorkBuddy-Cache\intermediate\pdf-read.*\` | 两份 PDF 的提取文本（出题素材） |
| 实验日志 | `log-fairy-{sid}.json` / `log-player-{sid}.json` + `log-index.json`（索引含 model/nohint 元信息；目录可用 LOG_DIR 配置） |
| 预览地址 | `http://127.0.0.1:8797/`（先 `npm start`） |

## 八、复现/继续开发入口

1. 启动：`cd G:\code\pixie-quest && npm start` → 打开 `http://127.0.0.1:8797/`（仓库已迁至 G:\code\pixie-quest，GitHub: 176516424/pixie-quest）
2. 手玩：地图页点章节卡片；LLM 玩：`?ap=1`（有提示）/ `?ap=1&nohint=1`（无提示对照组）；`&fresh=1` 清空日志
3. 测试与审计：`npm test`（25 个用例）/ `npm run audit`（题库审计）/ `npm run check`（语法）
4. 改题：改 `nce-shared.js` 里的 `QUESTIONS`（格式 `{d:难度, s:'出处', q:'题干', o:[四个选项], a:0}`，id/knowledge/explanation 构建期自动补齐）或 `VERB_DB`（每行 `[原形,过去式,过去分词,分类]`，`buildVerbQuestions` 自动出三考点题并去重）；疑问句型素材全量在 `D:\UserData\WorkBuddy-Cache\intermediate\pdf-read.XKY85a\questions.md`
5. 改精灵人设/教学策略：改 `nce-shared.js` 的 `FAIRY_SYS`（游戏与审计工具同步生效）；改模型：同文件 `LLM_MODEL` 一处
6. 错题本数据：localStorage 键 `nce_battle_wrong`；关卡进度键 `nce_battle_progress`
7. 装备/技能数值：搜 `EQUIP_TIERS`（装备四槽三等级加成表）、`castMonsterSkill`（怪兽技能施放与特效，注意其「不占用 busy」是设计非 bug）
8. 战斗规则改动：优先改 `src/game-core.js` 纯函数并补测试——规则不碰 DOM，界面只渲染

## 九、v26 改造记录（2026-10-29 深夜 · 渐进式改造阶段 1+2）

按外部评审计划实施（全文与状态表见 `docs/plan/refactor-plan-v26.md`）：

**阶段 1 稳定性**：修复中毒最后一跳致死漏判（死亡判定先于回合耗尽，结算走 `game-core.poisonTickStep`）；补 `SK_EN.freeze='Absolute Freeze'`（此前发给模型 undefined）；精灵打码改用**事件瞬间的完整题面快照**（`fairyEvent` 入队即 `quizSnapshot`，修掉"请求返回时题面已切走→给新题打码、旧题答案外泄"的时序风险）；模型输出不再进 innerHTML（气泡与日志渲染 textContent 化）；`gotoMap` 补 `clearStatus` 防残留计时器；`answer()` 守卫收敛为 `game-core.canAnswer`（状态机口径：map → battle → charging/transition → gameOver，非法状态拒绝输入）。

**回归防线**：`package.json`（start/test/audit/check 标准命令）；`src/game-core.js` 纯逻辑模块（UMD，RNG 可注入）；`tests/` 25 个 node:test 用例（洗牌均匀性/字母解析边界/毒结算死亡/续力条/守卫/快照/打码名单/题库契约）。

**阶段 2 整理**：服务器移至 `server/server.js` 并环境变量化，/llm 上游超时返回 504，/llmhealth 实际校验所需模型在列（?model= 可指定），日志目录 `LOG_DIR` 可配置且写失败返回 500；分析/审计工具移入 `tools/`，日志路径参数化，移除 `/206`、`15s`、`D:` 盘等机器专属硬编码；题目构建期统一赋稳定 id（内容哈希）+ knowledge 标签 + 动词题 explanation。

**暂缓项**（下一版本）：全量 src/ 拆分（待测试防线覆盖战斗主流程后进行）、错题本掌握度规则（阶段 3）、存档 version/迁移（阶段 3）、移动端/键盘/a11y（阶段 4）。
