# pixie-quest

NCE 像素答题闯关 —— 把《新概念英语第一册》复习做成像素风答题闯关游戏：答对出招打怪、答错攻击落空被怪兽嘲笑，三章地图先小怪后 Boss。内置本地 LLM 实验：真·读题作答的勇者 + 实时教学陪伴的精灵妈妈（Pixie）。

## 快速开始

```bash
npm start          # 启动服务器（默认 http://127.0.0.1:8797）
# 另开终端：
npm test           # 跑全部单元测试（node --test，零依赖）
npm run audit      # 题库深度审计（结构/重复/答案/拼写/覆盖）
npm run check      # 语法检查（全部 JS + HTML 内联脚本）
```

环境要求：Node ≥ 18。LLM 功能（精灵/自动驾驶）需本机 LM Studio 在 `127.0.0.1:1234` 提供 OpenAI 兼容接口；不开 LLM 照常可玩。

## 服务器配置（环境变量，均有缺省）

| 变量 | 缺省 | 说明 |
|---|---|---|
| `PORT` / `HOST` | 8797 / 127.0.0.1 | 监听地址 |
| `LLM_HOST` / `LLM_PORT` | 127.0.0.1 / 1234 | LM Studio 地址 |
| `LLM_TIMEOUT_MS` | 170000 | /llm 上游超时（超时返回 504） |
| `LLM_MODEL_EXPECT` | qwen | 健康检查的模型匹配口径 |
| `LOG_DIR` | 仓库根 | 实验日志落盘目录 |

## 游戏入口

- 手玩：`http://127.0.0.1:8797/` → 地图页点章节卡片
- LLM 自动驾驶（有精灵提示）：`http://127.0.0.1:8797/?ap=1`
- 无提示对照组：`http://127.0.0.1:8797/?ap=1&nohint=1`（不召唤精灵，测裸能力）
- 清空实验日志重跑：追加 `&fresh=1`

## 目录结构

```text
pixel-battle-ui.html   游戏本体（页面逻辑；题库/提示词在共享模块）
nce-shared.js          共享数据源 UMD：QUESTIONS(198 题带 id/knowledge/explanation)/VERB_DB(58 动词)/maskLeaks/FAIRY_SYS/LLM_MODEL
src/game-core.js       战斗核心纯逻辑（洗牌/字母解析/毒结算/续力/守卫），可注入 RNG
server/server.js       本地服务 + LM Studio 代理（配置化/超时/健康检查/日志目录）
tools/analyze-session.js          会话日志分析（路径参数化）
tools/audits/question-audit.js    题库深度审计
tools/audits/fairy-audit.js       精灵台词审计（--out 指定输出）
tests/                 node:test 单元测试（game-core + 题库契约）
docs/plan/             渐进式改造计划（v26 起步）
```

## 实验数据

自动驾驶日志按会话 sid 落盘：`log-fairy-{sid}.json` / `log-player-{sid}.json` + 索引 `log-index.json`（含 model/nohint 元信息）。分析：

```bash
node tools/analyze-session.js log-player-<sid>.json log-fairy-<sid>.json
```

题库改动只改 `nce-shared.js`（游戏、测试、审计工具自动跟随）。更多开发细节见 `NCE像素答题闯关-开发进度.md` 与 `docs/plan/refactor-plan-v26.md`。
