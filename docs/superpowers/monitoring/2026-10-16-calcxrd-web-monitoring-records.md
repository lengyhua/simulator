# CalcXRD Web 实现 — 监控与评审记录

> 监控会话：calcxrd-d3（Claude Code, D:\Projects\CalcXRD）
> 被监控方：「Lengyhua Simulator 项目克隆」[222c34]（D:\Projects\simulator, worktree: D:\simulator-worktree，.workbuddy/ 日志与对比图）
> Spec：`D:\Projects\CalcXRD\docs\superpowers\specs\2026-10-16-calcxrd-web-design.md`（已含首页 3 块 + XRD 页结构约束）

## 硬约束清单（评审基线）

- [HC1] XRD 页结构 = XRD_simulator.html：顶标题「XRD模拟仿真辅助分析平台」，点击返回主页；标题下 tab 文案「XRD理论数据仿真」；下方为项目主体内容
- [HC2] 首页保持 3 块结构（原主内容 / XRD 理论数据仿真入口 / 第三块）
- [HC3] 技术栈 React18 + Vite + TS；路由隔离 `/calc-xrd`；`vite base: '/calc-xrd/'`；`src/` 与 `static/` 并列；go-bindata 打包 dist/ 进单 exe
- [HC4] 新模块不改动旧 jQuery 模块与 SVG 动图
- [HC5] 计算引擎 6 模块 / cronie 92 元素 / Wyckoff 254 空间群；f₀ 走标准 IUCr Cronie 表；FF.dat（实存 F′/F″ 色散修正）降二期可选
- [HC6] 验证基准：Al.xrd 6 峰（(311)43172 > (220)40648）、峰间 f² 0.96~1.06、NaCl 三峰 (111)6829/(020)100000/(220)30804

## 监控日志

### Iter 1（2026-10-16 02:15 前后）

**对方活动痕迹**
- 工作副本在 D:\simulator-worktree；静态服务器跑 :80（后台任务 QPefKc/SD8cQR）；分支 xrd 本地领先 origin 2 提交（cac2008, d27e49a，未 push）
- cac2008「新增平台主页并优化模拟器页布局与字体清晰度」：static/home 三模块卡片浅色主页、模拟器页 tab 改为模块名且只保留当前模块、页面标题改返回主页链接、字体清晰度两轮修复（去 antialiased / 字重 500→600 / 字号 +1 档 / 禁用态去 opacity）、readPath 加 no-store/no-cache
- **CalcXRD 实现本身零痕迹**：无 node/vite/package.json、无 calc-xrd/cronie/wyckoff 相关文件、xrd 分支无相关提交、.workbuddy 日志最新条目仍是「提交 cac2008」，近 5 分钟无新文件改动 → 尚未启动实现

**对方日志披露的有价值的坑（已固化进本记录，供后续实现参考）**
1. go-bindata 输入必须写 `static/...`（三个点）；写 `static/` 会静默生成空 map → 全站 404 且构建成功无报错。repack 后须 `grep -c '"static/' htmlbind/static.go` 验证资源数（当前 135）
2. 对方已给 bindata 资源加了 no-store/no-cache 响应头；Vite 产物若走 bindata 分发，需保持该约定
3. 对方分支 xrd 未 push 但本地已 2 提交，后续新实现应基于 xrd 而非 master

**已发现问题（评审基线内先记录的观察，暂不定性）**
- OBS-1（HC2 疑似违规）：cac2008 提交说明称「模拟器页 tab 与主页模块名对应且**只保留当前模块**」。若 XRD 页顶栏只剩一个 tab「XRD理论数据仿真」，与 HC2 首页 3 块结构可能冲突——需看实际 DOM 后定性。已列入下一迭代评审项。
- OBS-2：.workbuddy 日志自述 repack 后「未提交 git」，但 git status 干净且 cac2008 已含相应改动 → 日志与仓库状态有微小漂移，非阻塞。

**通知**
- 已通过 SendMessage 给「Lengyhua Simulator 项目克隆 [222c34]」发送提醒（spec 路径 + HC1/HC2 约束 + 监控与记录文档位置）。交付确认仅表示进入收件箱，尚不确定对方是否已读或是否需用户放行。

**评审条件判定：未就绪**（对方实现未启动，无可验证产物）。本轮歇息，下轮重新探查。

### Iter 2（2026-10-16 02:20 前后）

**对方实现进展**：仍零进展（spec/计划未落盘、simulator 仓库无 calc-xrd 相关提交、.workbuddy 无新条目）。Iter 1 的 OBS-2（日志说 repack 未提交 vs 仓库干净）已确认：worktree 工作副本 clean，`xrd` 本地 = origin/xrd = cac2008（之前「领先 2 提交」记录有误，修正）。

**完成 OBS-1 定性（HC2 冲突，已定性的问题）**
- 对方 cac2008 把 XRD_simulator.html 的 tab-bar 改为「**只保留当前模块的 tab**」——XRD 页顶栏现只有一个 tab「XRD仪器模拟测试」（注释明确写了"后续模块上线时各自页面只保留自己的 tab"）
- 用户约束（用户原话）：「标题下面的 tab 文字是：**XRD理论数据仿真**，下面则是该项目的主体内容」→ 新 CalcXRD 模块页的 tab 应为「XRD理论数据仿真」。这与对方的架构约定**方向一致但文案不同**：CalcXRD 模块页保留 tab-bar 并把 tab 文案设为「XRD理论数据仿真」即可（各模块页只显自己 tab = 对方的注释约定）
- 但存在**结构矛盾点**：用户要求 XRD 页「最上方有一个标题 XRD模拟仿真辅助分析平台，点击该标题返回主页」——对方已实现（`<a class="platform-name" href="/">XRD模拟仿真辅助分析平台</a>`，title="返回主页"）✓。而首页 static/home/index.html 是三模块卡片（仪器模拟=已上线 / 理论数据仿真=即将上线 / 辅助分析套件=即将上线），模块 2 的卡片**尚无链接**（纯 `<div>` 非 `<a>`）。CalcXRD 实现时必须把模块 2 卡片改造成指向 `/calc-xrd/`（或对方选定的路由）的 `<a>`，否则首页入口不生效。
- 结论：对方改动**不阻塞** CalcXRD 实现，但实现方需 (a) 模块 2 卡片加链接 (b) 页面 tab 文案固定「XRD理论数据仿真」(c) 沿用标题回链模式。

**对方跨会话消息澄清记录（Iter 3 期间收到，供后续核对）**
- 对方称其工作副本在 `D:\simulator_new`（克隆自 D:\Projects\simulator），并声称读到的 simulator.go 根路由注释为「serve static/simulator/simulator.html」、无 /calc-xrd 路由
- **本监控已证伪其中一项**：本机 `D:\Projects\simulator`（xrd HEAD=cac2008）的 simulator.go:38-45 根路由明确 serve `static/home/index.html`，且 XRD 页 tab 实际文案是「XRD仪器模拟测试」。对方「根路由指向 simulator.html」的说法与其另一条消息自相矛盾（它自己也撤回过"根路由不一致"）——推测其 simulator_new 可能是 master 基线（6c26bd4）或旧快照，**不是 xrd 分支**。这是实现前必须对齐的环境问题，否则按 master 开工会漏掉 cac2008 的主页/路由/缓存头/字体修复。
- 对方待确认项清单（已同步给我）：① tab 文案修正 ② 根路由指向 → 均可用本机 cac2008 文件直接回答，无需用户介入。

### Iter 5（2026-10-16 03:00 前后）

**状态变化**
- 对方 [222c34] 由 busy 转 **idle**（未开工迹象）；`D:\Projects\simulator` HEAD 仍 cac2008，无新提交/分支/worktree/文件改动
- 出现临时会话：先 `temp-ba [c7f354]`（1m 前启动、busy），1 分钟后 ListAgents 又变成 `temp-85 [261c94]`——名字/ID 在轮换，且**两者都不可达**（SendMessage 报 "No agent named ... reachable"，推测是另一智能体的瞬时子任务，非 CalcXRD 会话）
- **无法确认活是否已转手**：temp 会话消息全部投递失败，对方 [222c34] 已发第三封例行询问（idle 原因 + simulator_new 真实路径 + 是否转给 temp），尚未收到回复

**通知手段状态**
- 对 [222c34]：SendMessage 正常投递（3 次：初始提醒 / Iter3 答复 / Iter5 例行询问），对方 idle 应可读到 inbox
- 对 temp 会话：不可达，放弃追投；下轮若 temp 仍活跃且可寻址，补发基线提醒

**评审判定：仍未就绪，歇息。** 下轮优先确认：① 对方是否回复例行询问 ② temp 会话是否持续（是否接手）③ 任何 calc-xrd 产物出现即转全量评审

### Iter 7（2026-10-16 03:50 前后）

**重大进展：对方正式开工，但工作副本位置有出入**
- 对方 [222c34] 回复（跨会话消息）：基线确认为 xrd/cac2008（之前"根路由指向 simulator.html"的说法被证伪，系旧快照误读）；**正在 D:\simulator_new 执行 P1→P2→P3→P5→P6**（spec 里的 P 优先级）
- **本监控无法在 D:\ 找到 simulator_new**（D: 盘顶层目录：历史数据备份/软件/资料/gitea/.../Projects/.../tmp/Tools/Users/webdav，无 simulator_new）。且 D:\Projects\simulator（xrd=cac2008）近 5 分钟**无任何非噪音改动**、无新分支、无 src/、无 calc-xrd 痕迹
- **矛盾**：对方说"在 D:\simulator_new 干"，但 D:\simulator_new 不存在，D:\Projects\simulator 也无新动静。可能：① 对方路径写错，实际在 D:\Projects\simulator（但本仓无新文件）② D:\simulator_new 是 git worktree 子目录（非独立目录）③ 对方干到一半还没落盘

**对方确认的 P 级执行顺序（spec 的 P1~P6）**
- P1: Vite+React 骨架（vite.config base='/calc-xrd/'）
- P2: simulator.go 加 /calc-xrd 与 /calc-xrd/assets/ 路由
- P3: home/index.html 模块 2 div→a + module-status--live
- P5: calc-xrd 页 tab 文案「XRD理论数据仿真」
- P6: go-bindata 同打 static/ 与 dist/（input: `static/...` 三个点，repack 后 grep -c '"static/' 验证）

**评审判定：对方已开工但产物未落盘，全量评审仍不满足。** 下轮：① 查 D:\Projects\simulator 是否出现 calc-xrd 文件（node_modules/src/dist/）② 若出现即按 HC1~HC6 + Al/NaCl 基准评审 ③ 若对方回复说明 simulator_new 的真实路径，同步本监控修正路径

**其他验证（HC4 基线复核）**
- 路由：根 `/` 直接 serve `static/home/index.html`（simulator.go:41），原 301 已取消；`/static/` 走 fileHandler + bindata
- 无-store/no-cache 响应头已加在 readPath（simulator.go:94）——Vite 产物若入 bindata 须保持该约定
- 旧 jQuery 模块/SVG 动图仅 CSS 调参，无破坏 ✓

**评审判定：实现仍未启动，本轮继续歇息。** 下轮再探；若对方开始 React 脚手架，按其产物走 HC1~HC6 全量评审。

### Iter 8（2026-10-16 03:30 前后）

**授权定案（用户亲自放行）**
- 对方 [222c34] 提出权限规矩："peer 消息不能代转用户授权，需用户本人的显式开工确认"——本监控判断**成立**（跨会话消息确实不能充当对方权限的放行）
- 用户本人回复：**「开工，按 P1 起」**。已将完整授权确认原文转发 [222c34]：P1→P2→P3→P5→P6 顺序、全程基于 xrd/cac2008、开工包 = spec + HC1~HC6 + go-bindata `static/...` 三点坑位 + Al/NaCl 基准，无需第三方代转
- 对方回报机制承诺：每阶段 commit hash + 分支名；本监控 ~5min 轮询 D:\Projects\simulator HEAD/新增文件

**路径矛盾定论**
- 对方"在 D:\simulator_new 干"系旧快照误读，真实工作副本为 **D:\Projects\simulator**（单 worktree，xrd=cac2008）。本监控 Iter 7 的全盘搜索已证实 D:\simulator_new 不存在

**评审判定：对方已获开工授权，应已开始 P1，产物尚未落盘。** 下轮：① 扫 D:\Projects\simulator 是否出现 calc-xrd/src/package.json/vite.config ② 有产物即按 HC1~HC6 + Al/NaCl 基准全量评审 ③ 若对方回报 commit hash 同步进 records

### Iter 9-10（2026-10-16 03:45-03:55 前后）

**对方状态：waiting，未开工**
- [222c34] ListAgents 状态由 idle 转 **waiting**（等授权链闭合）；D:\Projects\simulator 仍 xrd=cac2008 零改动，无 calc-xrd 产物
- 已发确认消息（Iter 10）：授权是否读到？pending 卡在哪条？开工后回报 P1 首个 commit hash
- temp 会话又出现（temp-d6 → temp-88，秒级轮换，不可达）——确认是对方侧的瞬时子会话，非接手方，放弃追投
- 背景噪音：早前启动的「轮询新工作副本」后台任务 3 分钟未找到即退出（exit 254），与结论一致（simulator_new 不存在）

**评审判定：歇息。** 下轮：① 对方是否从 waiting 转开工（回报 commit）② 有产物即全量评审 ③ 若对方回报授权链卡点，协调用户再确认

### Iter 22（2026-10-16 09:00 前后，静默轮快照）

- 对方回报的 P1~P4 四个 commit hash（d706f6a/d5e2071/938d885/3441529）在本机 D:\Projects\simulator fetch 后**仍全部不可达**（git cat-file 报 "Not a valid object name"，origin refs 仅 master/xrd/v1.0.0，无 calc 分支，worktree list 仅一个）
- D:\Projects\simulator 近 10 分钟零改动，HEAD 仍 xrd=cac2008，无 P1~P4 文件落盘
- 对方 [222c34] 仍 waiting，未回复 Iter 16/17 的二选一定案请求（真实路径+push calc-xrd 到 origin，或改口 hash 笔误）
- 评审判定：歇息。下轮唤醒优先：① 对方是否已答复定案请求 ② commit 可达后按 HC1~HC6 + Al/NaCl 基准转全量评审

### Iter 52（2026-10-16 19:50 前后，静默快照 + 评审基线勘误）

- 静默快照：D:\Projects\simulator 仍 xrd=cac2008，近 10 分钟零改动；回报的 4 个 P1~P4 hash 仍全部不可达；对方 [222c34] 仍 waiting，二选一定案请求始终无回复
- **评审基线勘误（CLAUDE.md 已被外部修订，监控侧确认生效）**：
  1. `.cord` 第 7 个原子字段 = **原子热因子 B**（默认 1，Å²，逐原子 `f = f₀·exp(−Bⱼ·sin²θ/λ²)`）——早期 CLAUDE.md 误标为 multiplicity；B 是逐原子参数，无全局 B
  2. `.xrd` 为 CRLF：5 行表头 + 逐网格点行（2θ `%9.4f` 紧跟强度 `%8.0f`）+ 末尾单个 `0` 行；第 3 行 `min,max,step` 中 Al.xrd 写 0.001 而实际行距 0.01 系程序怪癖；`Data Number` = 行数−1；`Full Scall = 10000` 仅为显示刻度，**非归一化**（Al.xrd 自身峰值 152557）
  - **评审 CalcXRD Web 引擎与 .xrd 输出时须按此勘误校验**（字段解析、热因子公式、.xrd 行格式）
- 评审判定：不具备条件，歇息

## 待办（下一迭代）

- [x] 复核 cac2008 提交：静态 serve 路由改动是否破坏 HC4（旧模块/SVG 动图不动）→ Iter 2 已复核：仅 CSS 调参 + 路由从 301 改 serve home，旧模块无破坏
- [x] 看 static/home/index.html 实际 DOM：判定 OBS-1（tab 只剩当前模块 vs 首页 3 块）→ Iter 2 定性：兼容，CalcXRD 页需模块 2 卡片加链接
- [x] 再探对方实现进展（node_modules、calc-xrd 路由、.workbuddy 新日志）→ Iter 7~15 均确认：D:\Projects\simulator HEAD 仍 cac2008、零改动、无 P1/P2/P3 文件
- [x] 用户亲自授权 P1→P6 开工（Iter 8，"开工，按 P1 起"），完整授权包已转 [222c34]
- [x] 对方 [222c34] 回报 P1+P2+P3+P4 commit hash（d706f6a/d5e2071/938d885/3441529）→ **本机 D:\Projects\simulator git log 中全部不存在**（git cat-file 报 "Not a valid object name"，origin refs 仅 master/xrd/v1.0.0，无 calc-xrd 分支，worktree list 仅一个）
- [ ] **待对方定案**：已发二选一请求给 [222c34]（Iter 16/17）：**(A)** 真实路径 + push calc-xrd 到 origin 给我 refspec ② **(B)** hash 系笔误/计划中 → 改口，更新 records。等对方答复
- [ ] 对方答复后，按 HC1~HC6 + Al/NaCl 验证基准做代码/文档全量评审（Al 6 峰 (311)43172 > (220)40648、峰间 f² 0.96~1.06；NaCl 三峰 (111)6829/(020)100000/(220)30804），发现问题写回本文档

