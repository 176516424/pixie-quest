# DEF-002 (v27) — 打码名单不含干扰项原文，模型引用选项可穿透防线

- **级别**: P1（答前防泄题安全防线缺口）
- **发现阶段**: LLM 专项对抗性打码测试（刻意泄题文本 → maskLeaks → 泄题检测）
- **根因**: `src/game-core.js` 的 `buildMaskOpts()` 只把「正确答案 + 题干动词三形」加入打码名单。对抗样本 `"Options are: went / goed / gone / goes"` 经 maskLeaks 后 `goed`/`goes`（干扰项）原样展示——模型幻觉或被诱导时可在答前引用选项原文，违反 HINT_SYS 的 HARD RULES 且无兜底。
- **修复**: `buildMaskOpts()` 将全部选项原文纳入名单；同步单测断言（tests/game-core.test.js）；`tools/audits/fairy-audit.js` 的本地旧版 buildMaskOpts 一并替换为 game-core 同构实现，保持审计与线上管线一致。
- **复验**:
  - 对抗测试 4/4：maskLeaks 后正确答案泄露 0、干扰项引用 0（`sessions/hint-metrics.json` → maskDefense）
  - 全量回归：npm test 36/36、npm run check 22 段、npm run audit 六项核心错误 0
  - 120 样本正式采样：display 层泄题 0、干扰项引用 0
- **状态**: ✅ 已关闭（修复 + 单测 + 对抗复验）
