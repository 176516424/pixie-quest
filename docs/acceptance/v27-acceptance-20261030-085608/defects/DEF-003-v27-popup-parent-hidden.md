# DEF-003-v27：错题本/精灵日志弹窗挂在隐藏父容器内，地图页不可见（评审发现，假阳性验收）

- **级别**: P1（用户在地图页完全无法使用两个弹窗——核心功能不可用）
- **状态**: ✅ 已修复并复验（本验收包 driver-ui-v27.js 13/13 PASS）
- **发现方式**: 复核评审指出 v27 验收包中 ui09/ui10/ui13 三张截图与 v26 对应截图 SHA-256 完全相同（9af30b4a…），画面只有地图没有弹窗；追查发现 v26 时代该三条 PASS 即为假阳性，v27 复跑继承了同一缺陷与同一假证据。

## 根因

- `pixel-battle-ui.html` 中 `#wbwrap`（错题本）与 `#flwrap`（精灵日志）原本位于 `#gamescreen` 内部；
- `#gamescreen{display:none}` 只在进入战斗时置 block，返回地图后为 none；
- 父元素 `display:none` 时所有后代不可渲染——弹窗自身是 `position:fixed` 也无济于事；
- 结果：地图页点「📖 错题本」「🧚 精灵日志」按钮，`.show` 类正常添加、文字正常写入，但用户什么都看不到。

## 验收防线缺口（同因）

v26 驱动对两条弹窗的断言只检查 `classList.contains('show')` 与文字内容，未检查真实渲染可见性，因此无法发现「状态对但看不见」。该缺口同时使 v26 验收的 UI-09/UI-10/UI-13 结论失效（v26 报告不再追溯修改，以本验收包为准）。

## 修复

1. **HTML**：`#wbwrap`/`#flwrap` 移出 `#game` 容器，挂到 body 层级（附注释说明原因）。
2. **驱动**：新增 `visInfo()`/`waitVisible()` 真实可见性断言：
   - `getComputedStyle` 的 display/visibility + 自底向上祖先链隐藏检查；
   - `getBoundingClientRect` 面积 > 2px 且落在视口内；
   - `document.elementFromPoint(中心点)` 必须命中弹窗自身或其后代（证明可被真实点击）。
3. **证据**：三张截图全新生成（SHA 已验证不同于 v26），内容经人工核验确实显示弹窗。

## 复验结果（driver-ui-v27.js）

- UI-09：弹窗 display=flex、1258×702、无祖先隐藏、中心点可命中，关闭后 display=none 真实消失；
- UI-10：同上，计数/条目/心情统计正确；
- UI-13：未召唤精灵全流程，地图页弹窗真实可见并可关闭，0 控制台错误。
