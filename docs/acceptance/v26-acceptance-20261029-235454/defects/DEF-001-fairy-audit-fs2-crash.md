# 缺陷 DEF-001 · 精灵审计脚本写结果时崩溃（fs2 未定义）

- 用例：CMD-06（npm run audit:fairy -- --out <file>）
- 级别：P1（标准第 10 节明示「精灵审计崩溃」属 P1）
- 轮次：v26-acceptance-20261029-235454（第 1 轮）
- 版本：commit a89ea9a9850adb61375d989dd9d06ed2c26a4d36

## 最小复现步骤

```bash
# LM Studio 在线、qwen/qwen3.5-9b 已加载
cd G:\code\pixie-quest
npm run audit:fairy -- --out any-path.json
# 16 个事件全部完成 LLM 应答后崩溃，退出码 1，结果文件未生成
```

## 实际值

```
G:\code\pixie-quest\tools\audits\fairy-audit.js:102
  fs2.mkdirSync(path.dirname(OUT),{recursive:true});
  ^
ReferenceError: fs2 is not defined
    at G:\code\pixie-quest\tools\audits\fairy-audit.js:102:3
```

- 退出码：1
- 16 个事件的 LLM 应答已在控制台完整打印（说明采集阶段正常）
- `--out` 指定的结果文件未生成

## 预期值

- 退出码 0；结果文件存在、JSON 可解析、16 个事件均有结果。

## 根因

v26 阶段 2 清理「D: 盘固定输出路径」时，删除了输出块内的 `const fs2=require('fs');`
局部声明，但残留了两处 `fs2.` 调用（`fairy-audit.js:102-103`）。
文件顶层本就有 `const fs=require('fs'), path=require('path'), http=require('http');`，
属改名遗漏，非逻辑缺陷。

## 修复

`tools/audits/fairy-audit.js:102-103`：`fs2.` → `fs.`（2 处）。
修复后由新一轮验收目录复测 CMD-06 及相关回归（CMD-01~05、DATA）。

## 原始证据

- 本包 `commands/npm-run-audit-fairy.log`（完整 stdout/stderr，含崩溃堆栈）
