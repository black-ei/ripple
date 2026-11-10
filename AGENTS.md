# AGENTS.md — Ripple 工程代理指南

本文件面向在本仓库中工作的 AI/工程代理。用户文档见 [README.md](README.md)；本文件只写实现约束、操作规范和验证方式。

## 1. 项目是什么

Ripple 是一个单文件浏览器循环工作站：

- 打开页面 → 轻触中心 → 一小节倒数 → 录第一层 → 再轻触结束，声音变成循环
- 继续轻触中心也会先倒数一小节，再叠加，最多 5 层
- 点圆环静音；长按圆环进入删除确认
- 右上角：节奏胶囊、监听、导出 WAV、重置；节奏胶囊打开按需的节奏面板

线上地址：https://black-ei.github.io/ripple/
仓库：https://github.com/black-ei/ripple

## 2. 快速开始

```bash
node serve.mjs
# http://127.0.0.1:4173
```

测试：

```bash
node --test "tests/*.test.mjs"
```

> 不要直接双击 `index.html`。麦克风权限与 AudioWorklet 需要 HTTP/HTTPS 环境。

## 3. 文件地图

```
index.html                 Ripple 单文件应用（唯一应用代码）
assets/ripple.svg          favicon
serve.mjs                  零依赖静态服务器，端口 4173
tests/ripple.test.mjs      结构检查 + 内联脚本解析检查
docs/images/               README 截图
README.md                  用户文档
AGENTS.md                  本文件
```

`plugins/` 是工作区其他内容，已被 `.gitignore` 排除，不要修改或提交。

## 4. 不可破坏的产品约束

### 界面

- **一个画布、一个中心圆、同心环**。不要加时间线、混音器、轨道列表或新手引导；不要加常驻面板。唯一允许的按需表面是节奏胶囊展开的 transient rhythm sheet。
- 界面文案保持中文、短句、克制；不要加装饰性文案。
- 中心圆是唯一主按钮；辅助工具只放在右上角。节奏 sheet 是右上角节奏胶囊的展开，不是新的常驻工具。
- 保持黑色背景、低饱和彩色圆环、留白和安静的动效。
- 视觉节拍画在中心圆外圈，始终启用；不要把它做成需要开启的开关。

### 交互

| 操作 | 行为 |
| --- | --- |
| 轻触中心（idle） | 一小节倒数 → 开始第一层录音 |
| 轻触中心（recording） | 结束录音 |
| 轻触中心（playing） | 一小节倒数 → 开始叠加，已有层继续播放 |
| 轻触中心（overdubbing） | 结束叠加 |
| 轻触中心（counting） | 取消倒数，不产生新层 |
| 轻触圆环 | 静音 / 恢复该层 |
| 长按圆环 520ms | 进入该层删除确认，不立即删除 |
| 删除确认中轻触中心 | 确认删除该层 |
| 删除确认中按 `Esc` / 点其他位置 / 等 5 秒 | 取消删除 |
| 右上角 `[♩ BPM · 拍号]` | 打开节奏 sheet；sheet 里直接选速度、拍号、录音节拍器 |
| 节奏 sheet 打开时 | 点背景 / `完成` / `Esc` 关闭；焦点回到节奏胶囊 |
| 节奏 sheet 打开时按 `Space` / `E` / `1`–`5` | 不触发画布动作 |
| 节奏 sheet 的速度/拍号 | 只影响视觉节拍、下一次倒数和录音 click；counting / recording / overdubbing 期间禁用 |
| 节奏 sheet 的录音节拍器 关/开 | 默认关；只控制 recording / overdubbing 的 click；倒数始终可听；录音中途可切换 |
| 视觉节拍 | counting / recording / overdubbing / playing 始终显示；idle / processing 不显示 |
| 重置按钮 | 立即清空所有层，回到空白 |
| `Space` | 等同于中心动作；counting 时取消；删除确认时确认删除 |
| `Esc` | 关闭节奏 sheet、取消倒数或删除确认 |
| `E` | 导出 WAV |
| `1`–`5` | 静音对应层 |

倒数长度固定为一小节。4/4 四拍、3/4 三拍、6/8 六拍；重音层级 `levels`：`2` 强拍、`1` 次级、`0` 弱拍（6/8 第 4 拍为 `1`）。BPM 指每分钟脉冲数。录音节拍器默认关闭；倒数 click 始终可听；视觉节拍始终运行。倒数与录音 click 必须明显区分、听感柔和；录音结束即停止节拍器。速度/拍号在 counting / recording / overdubbing / processing / 删除确认期间禁用；录音 click 开关在 counting / recording / overdubbing 时仍可用。

### 已明确移除、不要擅自加回

- 顶栏撤销按钮
- 长按直接重录
- `Shift + 1–5` 重录
- 离线演示模式 / 试听演示 / 麦克风约束降级
- PWA、Service Worker、manifest
- 二次确认清空

删除确认就是当前的安全机制；没有撤销。若用户要求重新加入上述能力，先确认交互，再动代码。

### 删除语义

- 删除非最后一层：保留 `loopLen`、`epoch` 和其他层，数组 `splice` 后其余层前移。
- 删除最后一层：调用 `resetLoop()`，回到 `idle`。
- 删除确认 5 秒超时自动取消；目标层在确认期间仍正常播放，确认后才淡出。
- 目标层加红色描边，中心显示红色 `×` + `LAYER N`；不要改回琥珀色或重录图标。

## 5. 音频架构

### 启动顺序（重要）

1. 先 `getUserMedia`
2. 只有麦克风成功后才创建 `AudioContext`
3. `resume()` 后再建立音频图

这样没有麦克风时不会创建 AudioContext，也不会触发 Chrome 的 autoplay 警告。不要改回“先创建 AudioContext 再请求麦克风”。

### 图与录音

- 输入：`MediaStreamAudioSourceNode` → `micGain` → `monitorGain` → `master`，同时 `micGain` → `recordBus`。
- 录音：优先 AudioWorklet `RippleRecorder`（Blob URL），失败时回退 `ScriptProcessorNode`。
- 监听默认开启，`monitorOn` 只影响监听，不影响录音。
- 主链路：`GainNode` → `DynamicsCompressorNode` → destination。
- 所有层的 buffer 长度等于 `loopN`。
- 节拍器：`clickBus → master`，倒数与录音节拍器各有一个分组 gain 接 `clickBus`。**绝不接 `recordBus`**，也不加入 `OfflineAudioContext` 导出图。停止/取消时把分组 gain 静音并断开，避免已排程的 click 漏响。
- 录音节拍器声音默认关闭（`metronomeSound = false`）。`beginCountIn()` 创建的 `metroGain` 初始 gain 为 `metronomeSound ? 1 : 0`；`finishCountIn()` 只有开关打开时才 `startMetronome()`，否则静音并断开 `metroGain`。倒数 `countGain` 始终为 1，不受开关影响。
- `setMetronomeSound()` 在倒数期间调整 `countIn.metroGain`；在 recording/overdubbing 期间打开时新建 gain 并从下一拍启动调度器，关闭时立即 `stopMetronome()`；空闲/播放时只记录偏好。开关不持久化。
- 倒数与录音落点全部用 `ac.currentTime` 排程；录音器在倒数开始时预滚，`record.start = recordStart`，`stopFirst/stopOverdub` 用 `recorder.extract(recordStart, end)` 丢弃倒数期间的前滚。不要用 `performance.now()` 或 `setTimeout` 决定发声/切片时刻。
- 录音节拍器用 40ms 间隔的 lookahead 排程（约 160ms 前瞻），重音按以循环 `epoch` 为 0 的拍网格 `offset` 计算；第一层 offset 为 0，叠加可能落在小节中间。停止录音时 `clearInterval` 并静音分组 gain。
- click 音色：倒数三角波，level 2/1/0 基频 520/620/740 Hz、时长 85/70/60ms；录音节拍器正弦，level 2/1/0 基频 880/1040/1240 Hz、时长 50/40/30ms。两者都加短噪声瞬态（bandpass）和低通；3ms 软起音、指数衰减。倒数与录音必须明显区分，重拍/次级/弱拍必须有层级。
- 视觉节拍不依赖声音调度器：`visualBeatGrid()` 用 countIn/record/epoch 作为锚点，`drawBeatRing()` 按 `levels` 和当前 `index` 绘制分段拍环。声音关闭时它仍然运行。

### 时间与相位

```text
beat    = 60 / BPM
bar     = 每小节拍数 × beat
recordStart = 倒数开始 + 一小节
loopLen = 第一层实际录音时长
phase   = ((now - epoch) / loopLen) mod 1
```

- 第一层决定循环长度，最长 30 秒，最短 0.6 秒；**不要量化** `loopLen`，倒数只决定录音起点。
- 叠加最短 0.12 秒。
- 第一层倒数结束后 `record.start = recordStart`，录音从该重拍切片；30 秒上限从 `recordStart` 起算，不包含倒数。
- 叠加倒数从以 `epoch` 为 0 的拍网格的下一拍开始，`recordStart = countStart + bar`，`record.phase = phaseAt(recordStart)`；现有预旋转逻辑不变。
- 叠加倒数的重音按 `offset` 计算，不假设倒数第一拍是小节重拍。
- 视觉拍环锚点：counting 用 `countIn.start`，recording/overdubbing 用 `record.start`，playing 用 `epoch`；使用当前 BPM/拍号的 `levels`。若第一层不是整拍，拍环与循环回绕可能不重合，不量化 `loopLen`。
- 叠加使用预旋转 buffer：把 PCM 从 `phaseStart * loopN` 写回循环时间轴，越界回绕。
- 播放时每个 `AudioBufferSourceNode` 使用相同 buffer 长度，并按当前相位设置 offset。

### 导出

`OfflineAudioContext` 重建所有未静音层，过与实时链路相同的压缩器，渲染成一个完整循环，再编码为 16-bit PCM WAV。不要导出倒数、录音、叠加或删除确认中的临时状态；节拍器与监听不进入离线图。

## 6. 代码约定

- 唯一应用代码在 `index.html`：内联 CSS + 原生 JavaScript。
- 不引入框架、构建步骤、包管理器依赖、外部字体或 CDN。
- 唯一外部文件是 `assets/ripple.svg` favicon；应用运行时不要增加外部资源。
- UI 文案中文；变量、函数、注释英文。
- 所有颜色通过现有 CSS 变量与 `COLORS` 数组；`rgba()` helper 只接受十六进制色值。
- Canvas 的 dpr 上限为 2；保持 `prefers-reduced-motion` 分支。
- 保持 `window.__RIPPLE__` 调试接口可用，新增状态时同步更新 `state`。
- 尊重 `aria-live`、按钮 `aria-label`、键盘操作和移动端安全区。
- 改中文文案时优先使用 `edit`/`write` 工具，保持 UTF-8；不要用 PowerShell `Set-Content` 直接改中文文件（历史上会破坏编码）。

## 7. 修改流程

1. 先读相关代码和 README，确认是否与产品约束冲突。
2. 只做用户要求的改动；不要顺手重构、加功能或改视觉。
3. 修改后运行 `node --test "tests/*.test.mjs"`。
4. 音频/交互改动要用真实浏览器验证：
   - 假麦克风：`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
   - 第一层与叠加都出现一小节倒数；4/4 / 3/4 / 6/8 的拍数与时长正确
   - 倒数中再点中心 / `Space` / `Esc` 取消，不产生新层；叠加取消后层数不变
   - 节奏胶囊打开 sheet；`完成` / 背景 / `Esc` 关闭；焦点回到胶囊；sheet 打开时全局快捷键不触发画布
   - sheet 里切速度/拍号后，胶囊文本、视觉拍环段数和下一次倒数更新；录音/叠加中速度/拍号禁用
   - 录音节拍器默认关；录音中打开/关闭 `metronomeSound` / `metronome` 同步；倒数 click 不受影响
   - 4/4 / 3/4 / 6/8 视觉拍环 4/3/6 段；counting/recording/overdubbing/playing 有，idle/processing 无
   - 录音 2 层、点环静音、长按删除确认、中心确认、取消、重置
   - `window.__RIPPLE__.state` 中 `countIn`、`metronomeSound`、`metronome`、`visualBeat`、`record.start` 与状态一致
   - WAV 导出返回 RIFF/WAVE 且字节数正确；节拍器不在导出图
   - 390×844 与 320px 宽度移动端布局；顶部只四个控件
   - 无麦克风路径：错误提示正确，不创建 AudioContext，不进入倒数
5. 清理临时脚本、profile、根目录截图，再提交。
6. 涉及用户可见行为时同步更新 `README.md` 和截图。

## 8. 验证清单

- [ ] `node --test "tests/*.test.mjs"` 通过（当前 2 项）
- [ ] `http://127.0.0.1:4173` 返回 200
- [ ] 控制台无 error；预期麦克风失败只有一条 `console.warn`
- [ ] 第一层与叠加都先倒数；4/4 / 3/4 / 6/8 的拍数正确
- [ ] 倒数中取消后 `mode` 回到 `idle` / `playing`，层数不变
- [ ] 节奏 sheet 打开/关闭、`Esc`、背景、焦点返回；打开时全局快捷键被屏蔽
- [ ] 视觉拍环在 counting / recording / overdubbing / playing 存在，idle / processing 为 null
- [ ] `metronomeSound` 默认 false；录音时 `metronome` 为 false；打开后为 true，关闭后为 false
- [ ] 录音/叠加期间速度/拍号禁用，录音节拍器开关可用
- [ ] 2 层现场：点环静音、长按进入删除确认、中心确认删除
- [ ] 取消删除后层数不变
- [ ] 重置后 `idle` / 0 层
- [ ] WAV 头为 `RIFF` / `WAVE`，离线图不含 click
- [ ] 移动端 390×844 无溢出、无遮挡；320px 顶部四个控件不换行
- [ ] 拒绝麦克风后 `audioState` 为 null，不进入倒数
- [ ] 没有临时文件被 `git add`

## 9. 部署

- GitHub Pages 从 `main` 分支根目录部署。
- 修改提交并 `git push origin main` 后，Pages 会自动重建。
- 验证线上版本：

```bash
curl -s https://black-ei.github.io/ripple/ | grep -E 'rhythmBtn|rhythmSheet|drawBeatRing|setMetronomeSound|LONG_PRESS_MS'
```

不要改 Pages 源、不要新增部署工作流，除非用户明确要求。

## 10. 禁止事项

- 不要提交 `plugins/`、`.ripple-*`、`fake-mic.wav`、根目录 `ripple-*.png`、临时测试脚本。
- 不要提交 token、cookie、GitHub 凭证或任何密钥。
- 不要 `git push --force`、改写历史、删除用户分支。
- 不要把 `index.html` 拆成多文件或引入构建链。
- 不要用外部网络请求、分析脚本、远程字体或第三方 UI 库。
- 不要在未确认交互的情况下重新加入撤销、重录、演示模式或 PWA。
- 不要声称“音频听起来正常”；代理无法听音，只验证状态、缓冲区和导出结构。
