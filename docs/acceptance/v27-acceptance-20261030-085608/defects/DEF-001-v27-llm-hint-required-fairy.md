# DEF-001 (v27) — exp=llm 未召唤精灵时 LLM 提示永不调用

- **级别**: P1
- **发现阶段**: 三组对照实验（exp=llm 组首轮 hintStats.llmCalls=0、全部提示来自静态）
- **根因**: `getHint()` 内部条件为 `EXP==='llm' && fairyOn`，与 answer 分支的修复（"无论精灵是否召唤成功统一走 getHint"）不一致。精灵召唤失败/未召唤时，LLM 组静默退化为静态提示，实验口径与"LLM 可选增强器"设计相悖。
- **修复**: pixel-battle-ui.html `getHint()` 移除 `fairyOn` 条件（exp=llm 即启用 LLM 通道，断链/非法输出仍自动降级静态；精灵只负责陪伴重讲）。
- **复验**: 修复后重跑 exp=llm 组 60 题：hintStats.llmCalls=68、提示来源 🧚 LLM ×68、静态兜底 0；原始日志 `experiments/llm-run.json`、`experiments/logdir/log-player-v27acc-llm-20261030.json`。
- **状态**: ✅ 已关闭（修复 + 回归验证）
