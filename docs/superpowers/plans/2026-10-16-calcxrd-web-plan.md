# CalcXRD Web 模块实现计划（架构设计 + 任务分解）

> 日期: 2026-10-16
> 作者: 架构师 高见远
> 上游输入: `docs/superpowers/specs/2026-10-16-calcxrd-web-design.md`（设计 spec）、`CLAUDE.md`（逆向成果）
> 状态: 待评审
> 关联: `D:\Projects\CalcXRD`（本项目，逆向成果 + 数据文件）、`D:\Projects\simulator`（只读参考 + 远期集成目标）

---

## 1. 实现方案

### 1.1 项目位置与边界

**项目位置：`D:\Projects\CalcXRD\web\`**（采纳主理人建议，理由如下）

- CalcXRD 仓库已持有全部逆向成果与数据文件（`Wyckoff`、`WholeSG`、`FF.dat`、`Factor.dat`、`samples/`），新模块与其同库，数据转换脚本可直接引用，无需跨仓库相对路径。
- 与 `simulator/` 物理隔离：simulator 是**只读参考**（禁止修改/新增其中任何文件），新模块独立开发、独立构建，集成阶段只往 simulator 加路由，不回改 web/。
- 与 `docs/`、`samples/` 平级，仓库根目录结构保持「逆向资产 / 文档 / 新模块」三分层。

**边界约定：**

| 方向 | 规则 |
| --- | --- |
| web/ → simulator/ | 只读拷贝参考文件（见 1.3）；运行期**不依赖** simulator 任何路径 |
| simulator/ → web/ | 本期无任何写入；远期集成时 simulator.go 加路由 + htmlbind 打包 `web/dist/` |
| web/ → CalcXRD 仓库根 | 只读引用数据文件（`../Wyckoff`、`../WholeSG`、`../samples/`）用于一次性转换与测试夹具 |
| 与原 CalcXRD.exe | 无运行期关系；仅复刻其数据格式（.cord/.xrd）与计算口径 |

**集成就绪不变式（本期 build 产物必须满足，供将来原样嵌入 simulator）：**

1. `vite.config.ts` 的 `base = '/calc-xrd/'`，dev 与 prod 一致；
2. 构建产物全部落在 `web/dist/`（`dist/index.html` + `dist/assets/`），资源 URL 均为 `/calc-xrd/...` 前缀；
3. 生产构建中页面标题链接 `href="/"`（绝对路径，指向平台主页），不使用任何 `/static/...` 运行期引用；
4. 预置样品 `.cord` 与首页图片全部走 ESM/`?raw` 打包进 bundle（不依赖 `public/` 运行时获取），使将来 simulator 只需「serve `dist/index.html` + `dist/assets/`」两条路由即可工作，**web/ 侧零改动**。

### 1.2 目录结构（完整文件树）

```
D:\Projects\CalcXRD\web\
├── .gitignore                          # node_modules/ dist/ 等
├── README.md                           # 运行方式 + 集成就绪契约 + 远期 simulator 集成步骤（草稿，不改 simulator）
├── index.html                          # Vite SPA 入口（zh-CN，title=平台名）
├── package.json                        # 依赖声明（见 §6）
├── package-lock.json                   # npm install 生成，随仓库提交（锁定构建）
├── tsconfig.json                       # 主 TS 配置（strict，paths: @/* → src/*）
├── tsconfig.node.json                  # vite.config.ts 专用配置
├── vite.config.ts                      # base '/calc-xrd/' + react 插件 + @ 别名 + vitest 段
├── public\
│   └── favicon.svg                     # 站点图标（可选，data-URI 亦可）
├── scripts\
│   └── gen_wyckoff.py                  # 一次性脚本：解析 ../Wyckoff + ../WholeSG → src/lib/xrd/wyckoff_data.ts（Python stdlib， managed python 3.13 运行）
├── src\
│   ├── main.tsx                        # React 挂载 + 全局样式导入 + Router
│   ├── App.tsx                         # 布局骨架（header + 主内容区）
│   ├── routes.tsx                      # 路由表（DEV 注册首页路由，PROD 仅模块路由）
│   ├── config.ts                       # 环境派生常量：BASE_URL / HOME_HREF / IS_DEV（路由与链接策略唯一来源）
│   ├── vite-env.d.ts                   # /// <reference types="vite/client" />
│   │
│   ├── styles\
│   │   ├── tokens.css                  # 设计令牌 :root（从 XRD_simulator.css 提取的暗色变量，含保真度注释）
│   │   ├── reset.css                   # ← 拷贝自 simulator static/simulator/xrd_simulator/css/reset.css（逐字）
│   │   ├── fonts.css                   # ← 拷贝自 simulator .../css/fonts.css（逐字，url(../fonts/...) 相对路径保留）
│   │   ├── shell.css                   # platform 外壳样式（从 XRD_simulator.css 摘译：.platform-header/.platform-title-row/.logo/.platform-name/.tab-bar/.tab + 输入框 user-select 修正）
│   │   ├── home.css                    # ← 拷贝自 simulator static/home/css/home.css（逐字）
│   │   └── app.css                     # 模块主体样式（输入区/曲线/表格/按钮，新写，复用 tokens.css 变量）
│   │
│   ├── fonts\                          # ← 拷贝自 simulator .../fonts/（6 个 woff2：Inter×3 + JetBrains Mono×3，共 208K）
│   │   └── *.woff2
│   │
│   ├── pages\
│   │   ├── HomePage.tsx                # 复刻首页（三卡片；第二张 Link 到模块；lazy 加载，仅 DEV 路由注册）
│   │   └── CalcXrdPage.tsx             # 模块主页面（PlatformHeader + tab「XRD理论数据仿真」+ 主体）
│   │
│   ├── components\
│   │   ├── shell\
│   │   │   ├── PlatformHeader.tsx      # logo X + 标题链接（DEV: <Link>/ PROD: <a href="/">）+ tab-bar + 可选指令 pill
│   │   │   └── PlatformTab.tsx         # 单个 tab 按钮（active 态）
│   │   ├── SamplePicker.tsx            # 预置样品下拉（?raw 打包的 4 个 .cord）
│   │   ├── CrystalInput.tsx            # 晶体参数表单（Name/System/SG/a,b,c/α,β,γ）+ 文件上传
│   │   ├── AtomTable.tsx               # 原子表（Element/Wyckoff/x/y/z/Occ，可增删行）
│   │   ├── SettingsPanel.tsx           # λ 下拉 + q 输入 + 复选框×4（F′F″/Thermal/Lp/PeakShape）+ 扫描范围
│   │   ├── XRDChart.tsx                # Recharts 曲线（2θ–强度）+ 「导出 .xrd」按钮
│   │   └── HKLTable.tsx                # hkl 离散峰表（hkl/d/2θ/I/mult，可排序）
│   │
│   ├── lib\
│   │   ├── math.ts                     # clamp / deg↔rad / 数值工具
│   │   └── xrd\
│   │       ├── index.ts                # 模块出口（对 UI 层暴露统一 API）── 2026-10-16 定案不创建，按模块导入
│   │       ├── types.ts                # 共享类型（Crystal/Atom/HKLReflection/XRDPattern/XrdParams…）
│   │       ├── constants.ts            # 物理与默认值常量（λ 表、q 默认、扫描范围、K=1）
│   │       ├── crystal.ts              # .cord 解析/序列化（解析器）
│   │       ├── crystal.test.ts
│   │       ├── cronie.ts               # IUCr Cronie 系数表（92 元素含离子态）+ f₀(s) 计算
│   │       ├── cronie.test.ts
│   │       ├── wyckoff.ts              # Wyckoff 查询：getSite / expandPositions / multiplicity
│   │       ├── wyckoff_data.ts         # 【生成物，勿手改】254 群数据（由 scripts/gen_wyckoff.py 生成）
│   │       ├── wyckoff.test.ts
│   │       ├── structure_factor.ts     # F_hkl = Σ fⱼ·exp(2πi(hx+ky+lz))（含占位、热因子、消光自然涌现）
│   │       ├── structure_factor.test.ts
│   │       ├── lorentz.ts              # Lp = (1+cos²2θ)/(sin²θ·cosθ)
│   │       ├── intensity.ts            # I = K·Lp·|F|²·mult 与峰值归并
│   │       ├── gaussian.ts             # 高斯展宽：I(2θ) = Σ I_hkl·G(2θ−2θ_hkl; q)
│   │       ├── pipeline.ts             # 计算管线编排（输入 Crystal+params → XRDPattern）
│   │       ├── pipeline.test.ts        # ★ Al.xrd 全谱验收测试（峰位/峰强容差，见 §9）
│   │       └── xrd_file.ts             # .xrd 序列化/解析（导出兼容原程序 header；测试读夹具）
│   │
│   ├── data\
│   │   └── samples\
│   │       ├── Al.cord                 # ← 拷贝自仓库 samples/（?raw 打包）
│   │       ├── NaCl.cord               # ← 拷贝自仓库 samples/
│   │       ├── BaTiO3.cord             # ← 拷贝自仓库 samples/
│   │       ├── Po.cord                 # ← 拷贝自仓库 samples/
│   │       └── index.ts                # SAMPLE_CRYSTALS: { id, label, text }[]
│   │
│   ├── assets\
│   │   └── img\
│   │       ├── module-instrument.png   # ← 拷贝自 simulator static/home/img/（ESM import 打包）
│   │       ├── module-pattern.png      # ← 拷贝自 simulator static/home/img/
│   │       └── module-lattice.png      # ← 拷贝自 simulator static/home/img/
│   │
│   ├── store\
│   │   └── crystal-store.ts            # Zustand：crystal/params/pattern + loadCord/setParams/compute
│   │   └── crystal-store.test.ts
│   └── tests\
│       └── fixtures\
│           └── Al.xrd                  # ← 拷贝自仓库 samples/（pipeline 验收基准，9700 行）
```

### 1.3 要从 simulator 拷贝的参考文件清单

> simulator 为只读参考；下表为「拷贝到新项目」的白名单，拷贝后按需微调（微调点已注明），**不得反向修改 simulator**。

| # | 源（simulator，只读） | 目标（web/） | 处理方式 |
| --- | --- | --- | --- |
| 1 | `static/simulator/xrd_simulator/css/reset.css` | `src/styles/reset.css` | 逐字拷贝 |
| 2 | `static/simulator/xrd_simulator/css/fonts.css` | `src/styles/fonts.css` | 逐字拷贝（保留 `url(../fonts/...)` 相对路径，woff2 落到 `src/fonts/` 后自然解析） |
| 3 | `static/simulator/xrd_simulator/fonts/`（6 个 woff2） | `src/fonts/` | 整目录拷贝 |
| 4 | `static/simulator/xrd_simulator/css/XRD_simulator.css` 第 1–217 行（Token System + Platform Shell 段） | `src/styles/shell.css` + `src/styles/tokens.css` | **摘译**：保留 `:root` 令牌、`html/body` 基础、`.platform-header`/`.platform-title-row`/`.logo`/`.platform-name`/`.tab-bar`/`.tab`/`.tab.active`/`.tab:disabled`；舍弃 `#simulator-base`、`#top-instructions` 等仪器专有段（或改为可选类）；新增输入区专用修正（见下） |
| 5 | `static/home/css/home.css` | `src/styles/home.css` | 逐字拷贝（自包含，`--font-sans` 等变量在其自身 `:root` 定义） |
| 6 | `static/home/img/module-instrument.png` | `src/assets/img/module-instrument.png` | 拷贝，ESM import 打包（避免 `public/` 运行时依赖） |
| 7 | `static/home/img/module-pattern.png` | `src/assets/img/module-pattern.png` | 同上 |
| 8 | `static/home/img/module-lattice.png` | `src/assets/img/module-lattice.png` | 同上 |
| 9 | `static/home/index.html`（结构参考，非文件拷贝） | `src/pages/HomePage.tsx` | 复刻为 React 组件：`.home-page` > `header.home-header` + `main.module-grid` 三卡 + `footer.home-footer`；卡片二由 `<div>即将上线` 改为 `<Link to="/module">`（DEV 路由）；卡片一保留 `<a href="/static/simulator/xrd_simulator/XRD_simulator.html">`（嵌入后有效；standalone dev 下点击会 404，属预期，见 §8） |
| 10 | `static/simulator/xrd_simulator/XRD_simulator.html` 第 20–38 行（页面外壳参考） | `src/components/shell/PlatformHeader.tsx` | 复刻为组件：`#top-bar`（display:none 保留）+ `header.platform-header` > `.platform-title-row`（logo「X」+ 标题链接）+ `nav.tab-bar` 单 active tab「XRD理论数据仿真」；指令 pill 作为可选 prop |

从 CalcXRD 仓库根拷贝（非 simulator）：

| # | 源 | 目标 | 用途 |
| --- | --- | --- | --- |
| 11 | `samples/{Al,NaCl,BaTiO3,Po}.cord` | `src/data/samples/` | 预置样品，`?raw` 打包 |
| 12 | `samples/Al.xrd` | `tests/fixtures/Al.xrd` | pipeline 验收基准 |
| 13 | `Wyckoff`、`WholeSG` | 不拷贝，由 `scripts/gen_wyckoff.py` 读取后生成 `src/lib/xrd/wyckoff_data.ts` | 生成物入库，避免运行期文件依赖 |

**shell.css 相对原 CSS 的必要修正（摘译而非逐字）：**

- 原 `html { user-select: none }` 会波及输入框：模块有大量表单输入，需追加 `input, textarea, select { user-select: text }`；
- 原 `html, body { overflow: hidden }`（仪器页整页不滚动）：模块主体内容高，需改为 header 固定、`#module-main` 区域 `overflow: auto`；
- 原 `body { display:flex; flex-direction:column }` 保留（header 置顶 + 主内容 flex:1）。

### 1.4 运行形态

**形态 A：standalone dev server（本期日常开发/演示）**

```bash
# 环境：managed node 22.22.2（禁止 npm install -g）
C:\Users\admin\.workbuddy\binaries\node\versions\22.22.2-6\node.exe C:\Users\admin\.workbuddy\binaries\node\versions\22.22.2-6\node_modules\npm\bin\npm-cli.js install   # 首次
… npm run dev        # http://localhost:5173/calc-xrd/
```

演示动线（本期验收要求）：`/calc-xrd/` 复刻首页 → 点第二张卡「XRD理论数据仿真」→ `/calc-xrd/module` 模块页 → 点标题「XRD模拟仿真辅助分析平台」→ 回 `/calc-xrd/` 首页。

**形态 B：嵌入 simulator（远期，用户放权后；本期只保证「集成就绪」）**

```
http://localhost/calc-xrd            → dist/index.html（React SPA，根路由 = 模块页）
http://localhost/calc-xrd/assets/*   → dist/assets/*（hash 化的 JS/CSS）
```

远期 simulator.go 改动（**草稿，仅文档化，本期不动 simulator**）：

```go
// 前缀剥离 handler：/calc-xrd/* → 查 htmlbind 资产 "dist/*"
mux.HandleFunc("/calc-xrd/", calcXrdHandler) // 内部: name := "dist" + strings.TrimPrefix(r.URL.Path, "/calc-xrd"); 目录则补 /index.html
```

go-bindata 打包命令追加 `web/dist/...`。因为所有资源都在 `/calc-xrd/` 命名空间内且 `public/` 运行期零依赖，上述两条即可工作，web/ 零改动。

### 1.5 路由与链接策略

| 环境 | URL | 渲染 | 标题链接行为 |
| --- | --- | --- | --- |
| DEV | `/calc-xrd/` | `HomePage`（复刻首页） | `<Link to="/">`（SPA 内导航 → `/calc-xrd/`） |
| DEV | `/calc-xrd/module` | `CalcXrdPage`（模块页） | 同上 |
| PROD | `/calc-xrd/` | `CalcXrdPage`（直接进模块，平台首页卡片二将来链到此处） | `<a href="/">`（整页导航到平台主页） |
| PROD | 其他 `/calc-xrd/*` | 重定向 `/calc-xrd/` | — |

实现要点（全部收敛在 `src/config.ts` + `src/routes.tsx`，业务组件不感知环境）：

```ts
// src/config.ts
export const IS_DEV = import.meta.env.DEV;                       // 编译期常量，prod 为 false
export const BASE_URL = import.meta.env.BASE_URL;               // '/calc-xrd/'
export const ROUTER_BASENAME = BASE_URL.replace(/\/$/, '');     // '/calc-xrd'
export const HOME_HREF = IS_DEV ? '/' : '/';                    // 标题链接目标（SPA 内 / 绝对路径）
export const MODULE_PATH = IS_DEV ? '/module' : '/';            // 模块路由
```

- `routes.tsx`：`IS_DEV` 时注册 `/` → HomePage、`/module` → CalcXrdPage；否则仅 `/` → CalcXrdPage + `*` → Navigate。HomePage 用 `React.lazy` 动态引入，prod 构建被 tree-shake，不进主 bundle。
- `PlatformHeader`：`IS_DEV ? <Link to={HOME_HREF}> : <a href={HOME_HREF} title="返回主页">`，两分支共用同一 className，视觉一致。
- BrowserRouter `basename={ROUTER_BASENAME}`；dev 下 `/calc-xrd/module` 刷新由 Vite SPA fallback 承接；prod 不注册 `/module`，无刷新死链。

### 1.6 与原 CalcXRD.exe 的控件对应

| 原程序控件（TFormCalc） | Web 组件 | 本期范围 |
| --- | --- | --- |
| `open`（打开 .cord） | `CrystalInput` 文件上传（`<input type=file>` + FileReader） | ✅ |
| `input`（手工输入） | `CrystalInput` + `AtomTable` 表单 | ✅ |
| `powder XRD` | 「计算粉末 XRD」按钮 | ✅ |
| `single XRD` | — | ⛔ 二期（TFormSingle，见 §8） |
| `Wyckoff symbol` 查询 | — | ⛔ 二期（wyckoff.ts 已预留 getSite） |
| `factors`（散射线查询） | — | ⛔ 二期（FF.dat 解码后） |
| `Lamda` 下拉 | `SettingsPanel` λ 下拉 | ✅ |
| `q` 输入 | `SettingsPanel` q 输入 | ✅ |
| 复选框×4 | `SettingsPanel`：Lp / Thermal / PeakShape 可用；F′F″ 禁用（Factor.dat 未解码，tooltip「二期」） | 部分 |
| 结果曲线 | `XRDChart`（Recharts） | ✅ |
| 结果表格 | `HKLTable` | ✅ |
| 保存 .xrd | `XRDChart`「导出 .xrd」 | ✅ |

---

## 2. 文件列表（相对路径 + 职责）

> 相对 `web/`。★ = 含验收测试；◆ = 拷贝/生成物。

### 配置与入口

| 文件 | 职责 |
| --- | --- |
| `index.html` | Vite SPA 入口：zh-CN、title「XRD模拟仿真辅助分析平台」、`<div id="root">`、`/src/main.tsx` |
| `package.json` | 依赖与脚本声明（dev/build/preview/test，见 §6） |
| `vite.config.ts` | `base:'/calc-xrd/'`、react 插件、`@`→`src` 别名、build.outDir=dist、vitest 段（node 环境） |
| `tsconfig.json` | strict + `jsx: react-jsx` + `moduleResolution: bundler` + `paths: {@/*}` + `types: [vite/client]` |
| `tsconfig.node.json` | vite.config.ts 的 node 侧配置 |
| `.gitignore` | `node_modules/`、`dist/`、`*.local` |
| `README.md` | 快速开始、目录说明、集成就绪契约、远期 simulator 集成步骤草稿 |
| `scripts/gen_wyckoff.py` ◆ | 一次性生成脚本：解析 `../Wyckoff`/`../WholeSG` → `src/lib/xrd/wyckoff_data.ts`（stdlib only） |

### 应用骨架

| 文件 | 职责 |
| --- | --- |
| `src/main.tsx` | 挂载 React、导入全局样式（reset/fonts/tokens/shell/home/app）、挂 Router |
| `src/App.tsx` | 布局骨架：`PlatformHeader` + 主内容区（`<Outlet>`/路由视图） |
| `src/routes.tsx` | 条件路由表（DEV 首页+模块 / PROD 仅模块）与懒加载 |
| `src/config.ts` | 环境派生常量（BASE_URL/HOME_HREF/MODULE_PATH/IS_DEV），路由与链接唯一来源 |
| `src/vite-env.d.ts` | vite/client 类型引用（`?raw`、`import.meta.env` 类型） |
| `src/pages/HomePage.tsx` | 复刻首页三卡片；卡片二 Link 到模块；DEV-only lazy |
| `src/pages/CalcXrdPage.tsx` | 模块主页：header + SamplePicker + CrystalInput/AtomTable + SettingsPanel + XRDChart/HKLTable |

### 外壳与样式

| 文件 | 职责 |
| --- | --- |
| `src/components/shell/PlatformHeader.tsx` | logo「X」+ 标题链接（DEV `<Link>`/PROD `<a href="/">`）+ 单 active tab + 可选指令 pill |
| `src/components/shell/PlatformTab.tsx` | tab 按钮（active/disabled 态） |
| `src/styles/tokens.css` ◆ | 暗色设计令牌（自 XRD_simulator.css `:root`：--surface-2/--border/--accent/--text/--text-dim/--text-faint/--surface 等） |
| `src/styles/reset.css` ◆ | 浏览器重置（simulator 逐字拷贝） |
| `src/styles/fonts.css` ◆ | Inter/JetBrains Mono @font-face（simulator 逐字拷贝） |
| `src/fonts/*.woff2` ◆ | 6 个字体子集（simulator 整目录拷贝） |
| `src/styles/shell.css` | platform 外壳类 + 输入区 user-select/滚动修正（XRD_simulator.css 摘译） |
| `src/styles/home.css` ◆ | 复刻首页样式（simulator home.css 逐字拷贝） |
| `src/styles/app.css` | 模块主体样式：参数区网格、曲线卡片、表格、按钮（复用 tokens 变量，不引入组件库） |

### 业务组件

| 文件 | 职责 |
| --- | --- |
| `src/components/SamplePicker.tsx` | 预置样品下拉（Al/NaCl/BaTiO3/Po），选中即加载对应 `.cord` 文本 |
| `src/components/CrystalInput.tsx` | 晶体参数表单（Name/System/SG 选择/a,b,c/α,β,γ）+ .cord 文件上传 + 「解析并回填」 |
| `src/components/AtomTable.tsx` | 原子表（Element/Wyckoff/x/y/z/Occ）增删改；元素列带常用元素/离子 datalist |
| `src/components/SettingsPanel.tsx` | λ 下拉、q 输入、复选框×4、扫描范围（起止/步长） |
| `src/components/XRDChart.tsx` ★ | Recharts 折线（2θ–强度，渲染降采样 ≤2000 点）+ 「导出 .xrd」 |
| `src/components/HKLTable.tsx` | hkl 离散峰表（hkl/d/2θ/I 归一化/mult，列排序） |

### 计算引擎 `src/lib/xrd/`（纯 TS，无 DOM/副作用）

| 文件 | 职责 |
| --- | --- |
| `index.ts`（不创建） | 经 2026-10-16 架构审查定案：不建 barrel 统一出口，「按模块导入」为既定风格（store/测试/UI 均从模块文件直入） |
| `types.ts` | 共享类型（见 §3.1） |
| `constants.ts` | λ 表（Cu/Mo/Cr/Co/Fe Kα）、默认 q、扫描范围 3–100°/0.01°、K=1、容差常量 |
| `crystal.ts` ★ | `.cord` 解析/序列化：逐行字段、Fortran 风格科学计数字（`4.03390000000000E+0000`）、错误带行号 |
| `cronie.ts` ★ | IUCr Cronie/Waasmaier-Kirfel 系数表（H–U 92 元素 + 常见离子态）+ `f0(element, s)`，`s = sinθ/λ` |
| `wyckoff.ts` ★ | `getSite` / `expandPositions`（按中心平移展开坐标表达式并代入 x,y,z）/ `multiplicityOf` / Laue 操作导出（供 mult 计算） |
| `wyckoff_data.ts` ◆ | 254 空间群数据：`{ "225(Fm-3m)": { centers, sites[] } }`（键为 WholeSG 全名，兼容 origin choice 重号） |
| `structure_factor.ts` ★ | `F_hkl = Σⱼ fⱼ·exp(2πi(hxⱼ+kyⱼ+lzⱼ))`；fⱼ = f₀(s)·occ·exp(−B·s²)；消光由位置展开自然涌现 |
| `lorentz.ts` | `Lp = (1+cos²2θ)/(sin²θ·cosθ)`（标准式；原程序 help 原文为 `(1+cos²2θ)/(sin2θ·sinθ)`，因 sin2θ=2sinθcosθ，与标准式仅差常数因子 2，被 K/I₀ 吸收，归一化后等价） |
| `intensity.ts` | `I_hkl = K·Lp·|F|²`（K=1）+ 峰表归并（等效 hkl 合并、mult 计算、归一化到 100） |
| `gaussian.ts` | 高斯展宽：`I(2θ) = Σ I_hkl·exp(−4ln2·(2θ−2θ_hkl)²/q²)`（q = FWHM，度）；PeakShape 关 = δ 棒谱 |
| `pipeline.ts` ★ | 管线编排：hkl 枚举（2θ ≤ max）→ d/2θ → F → Lp → I → 展宽 → `XRDPattern` |
| `xrd_file.ts` ★ | `.xrd` 序列化（兼容原程序 header 五行 + `2θ I` 行）/ 解析（读夹具） |
| `src/lib/math.ts` | clamp / deg↔rad / ` nearlyEqual` 工具 |

### 数据与状态

| 文件 | 职责 |
| --- | --- |
| `src/data/samples/*.cord` ◆ | 4 个预置样品（仓库 samples/ 拷贝，`?raw` 打包） |
| `src/data/samples/index.ts` | `SAMPLE_CRYSTALS` 常量数组 |
| `src/assets/img/*.png` ◆ | 首页三卡插图（simulator home/img 拷贝，ESM 打包） |
| `src/store/crystal-store.ts` ★ | Zustand store：`crystal / params / pattern / error` + `loadCordText / setCrystal / setParams / compute / reset` |
| `tests/fixtures/Al.xrd` ◆ | Al 权威参考输出（验收基准，9700 行） |

---

## 3. 数据结构与接口

### 3.1 核心 TS 类型草图（`src/lib/xrd/types.ts`）

```ts
/** 一个原子占据（.cord 中的 element block） */
export interface Atom {
  element: string;      // 原始符号，可能含离子价：'Al' | 'Na1+' | 'O2-'
  wyckoff: string;      // Wyckoff 位字母：'a' | 'b' | ...
  x: number; y: number; z: number;   // 分数坐标
  occupancy: number;    // 0..1
  multiplicity: number; // .cord 声明值（原程序通常写 1）
}

/** 晶体结构（.cord 全量） */
export interface Crystal {
  name: string;
  system: string;                 // 'Cubic' | 'Tetragonal' | 'Orthohombic' | 'Hexagonal' | ...
  sgNumber: number;               // 225
  sgSymbol: string;               // 'Fm-3m'（不含编号与括号）
  sgKey: string;                  // '225(Fm-3m)'（wyckoff_data.ts 的查找键）
  a: number; b: number; c: number;                 // Å
  alpha: number; beta: number; gamma: number;      // 度
  atoms: Atom[];
}

/** 离散 hkl 反射 */
export interface HKLReflection {
  h: number; k: number; l: number;
  d: number;              // Å
  twoTheta: number;       // 度
  multiplicity: number;   // Laue 等效面数（含 Friedel 对）
  fRe: number; fIm: number;   // 结构因子（复数）
  intensity: number;      // 原始 I = K·Lp·|F|²·mult
  intensityNorm: number;  // 0..100（最强峰 = 100）
}

/** 连续图谱 */
export interface XRDPattern {
  twoTheta: number[];           // 网格（度），等 step
  intensity: number[];          // 强度（与网格等长）
  reflections: HKLReflection[]; // 离散峰表（表格/标注用）
  meta: {
    lambda: number;   // Å
    q: number;        // 高斯 FWHM（度）
    step: number;     // 网格步长（度）
    min: number; max: number;   // 扫描范围（度）
  };
}

/** 计算参数（UI 可控） */
export interface XrdParams {
  lambda: number;          // Å（默认 1.54056）
  q: number;               // 高斯 FWHM（度，默认见 constants.ts 标定值）
  thermalB: number;        // 温度因子 B（Å²，默认 0.9，§7 标定）
  useLp: boolean;          // Lp 因子开关（默认开）
  useThermal: boolean;     // 热因子开关（默认开；关 = B=0 模型，高角峰系统性偏高，§7）
  usePeakShape: boolean;   // true=高斯展宽；false=δ 棒谱
  // useAnomalous: F′F″ 修正（二期，Factor.dat 解码后启用；一期 UI 禁用）
  rangeMin: number; rangeMax: number; step: number; // 扫描范围（默认 3/100/0.01）
}

/** Wyckoff 位 */
export interface WyckoffSite {
  letter: string;    // 'a'
  mult: number;      // 4
  symm: string;      // 位对称 'm-3m' / '..m' / '1'
  ops: string[];     // 坐标表达式 ["(x,y,z)", "(-x,-y,-z)", ...]
}

/** 空间群数据（wyckoff_data.ts 的值类型） */
export interface SpaceGroupData {
  centers: string[];      // 中心平移 ["(0,0,0)+", "(0,1/2,1/2)+", ...]
  sites: WyckoffSite[];
}
```

### 3.2 计算模块接口签名

```ts
// crystal.ts —— .cord 解析器
export function parseCord(text: string): Crystal;           // 失败 throw ParseError（含行号）
export function serializeCord(c: Crystal): string;
export class CordParseError extends Error { line: number }

// cronie.ts —— 原子散射因子
export function f0(element: string, s: number): number;      // s = sinθ/λ；element 支持 'Al'/'Na1+'/'O2-'
export function hasElement(element: string): boolean;
// CRONIE_COEFFS: Record<string, { a: number[4]; b: number[4]; c: number }>

// wyckoff.ts —— Wyckoff 查询
export function getSite(sgKey: string, letter: string): WyckoffSite | undefined;
export function expandPositions(sgKey: string, letter: string, x: number, y: number, z: number): Vec3[];
  // Vec3 = [number, number, number]；按 centers × ops 展开、代入坐标、去重（容差 1e-6）
export function multiplicityOf(sgKey: string, letter: string): number;
export function laueOperations(sgKey: string): number[][];   // 旋转矩阵列表，每个为扁平 9 元素行主序数组（由 ops 提取，用于 mult 计算；2026-10-16 架构审查确认）

// structure_factor.ts
export interface SFOptions { lambda: number; thermalB: number; useThermal: boolean; }
export function structureFactor(c: Crystal, h: number, k: number, l: number, opts: SFOptions): { re: number; im: number };

// lorentz.ts
export function lorentzPolarization(twoThetaDeg: number): number;

// intensity.ts
export function peakIntensity(twoThetaDeg: number, f: { re: number; im: number }, opts: { useLp: boolean; k?: number }): number;
export function normalizeReflections(rs: HKLReflection[]): HKLReflection[]; // 最强峰 = 100

// gaussian.ts
export function gaussianBroaden(
  reflections: HKLReflection[],
  opts: { min: number; max: number; step: number; q: number }
): { twoTheta: number[]; intensity: number[] };

// pipeline.ts —— 编排
export function computeXRDPattern(crystal: Crystal, params: XrdParams): XRDPattern;

// xrd_file.ts
export function serializeXrd(crystal: Crystal, pattern: XRDPattern): string; // 兼容原程序 header
export function parseXrd(text: string): { twoTheta: number[]; intensity: number[] };
```

### 3.3 状态管理接口（`src/store/crystal-store.ts`，Zustand）

```ts
interface CrystalState {
  crystal: Crystal | null;
  params: XrdParams;                 // 默认值来自 constants.ts
  pattern: XRDPattern | null;
  error: string | null;              // 解析/计算错误的用户可读信息
  loadCordText(text: string): void;  // 解析 → setCrystal（失败置 error）
  setCrystal(c: Crystal): void;
  updateAtom(index: number, patch: Partial<Atom>): void;
  addAtom(): void; removeAtom(index: number): void;
  setParams(patch: Partial<XrdParams>): void;
  compute(): void;                   // crystal+params → pattern（try/catch → error）
  reset(): void;
}
```

### 3.4 类图

见 `docs/superpowers/plans/class-diagram.mermaid`（与本文 §3.4 同内容），要点：`Crystal ◆Atom`、`XRDPattern ◆HKLReflection`、`SpaceGroupData ◆WyckoffSite`；服务类 `CrystalParser / WyckoffTable / ScatteringFactor / StructureFactor / LorentzPolarization / GaussianBroadener / XRDPipeline / CrystalStore`，依赖方向 UI → Store → Pipeline → 各物理模块，计算层不依赖 UI/Store。

---

## 4. 程序调用流程

### 4.1 计算管线（.cord → XRD 图谱）

见 `docs/superpowers/plans/sequence-diagram.mermaid`，主流程：

```
.cord 文本
  → CrystalParser.parseCord            （字段校验、科学计数解析、sgKey 组装）
  → XRDPipeline.compute(crystal, params)
      ├─ hkl 枚举：h≥k≥l≥0 且 2θ(hkl) ≤ rangeMax（d 由一般三斜晶胞公式计算，见 §7）
      ├─ 逐 hkl：
      │    ├─ WyckoffTable.expandPositions(sgKey, letter, x,y,z) → 全部等效位置
      │    ├─ ScatteringFactor.f0(element, s=sinθ/λ)（角度相关；乘 occ 与 exp(−B·s²)）
      │    ├─ StructureFactor: F = Σ fⱼ·exp(2πi(hxⱼ+kyⱼ+lzⱼ))    （F≈0 ⇒ 系统消光，无需查表）
      │    ├─ LorentzPolarization.lp(2θ)（useLp 开关）
      │    └─ I = K·Lp·|F|²·mult（mult 由 Laue 操作作用于 (h,k,l) 去重计数）
      ├─ 等效 hkl 归并 + 归一化（最强峰 = 100）
      └─ GaussianBroadener.broaden(reflections, {q, range, step})（usePeakShape=false 时输出 δ 棒谱）
  → XRDPattern { twoTheta[], intensity[], reflections[], meta }
  → CrystalStore.pattern（订阅）→ XRDChart / HKLTable 渲染
```

关键公式（实现口径，全部集中在计算模块）：

- `1/d² = (1/V²)[h²b²c²sin²α + k²a²c²sin²β + l²a²b²sin²γ + 2hk·abc²(cosα·cosβ−cosγ) + 2hl·ab²c(cosα·cosγ−cosβ) + 2kl·a²bc(cosβ·cosγ−cosα)]`，`V = abc√(1−cos²α−cos²β−cos²γ+2cosα·cosβ·cosγ)`（该一般三斜形式已用 4885 组随机晶胞数值验证，与倒易基矢直接计算一致到 1e-12；立方情形退化为 d=a/√(h²+k²+l²)）
- `2θ = 2·arcsin(λ/(2d))`（λ/(2d) > 1 时该 hkl 不出现）
- `fⱼ = f₀(sinθ/λ)·occⱼ·exp(−B·(sinθ/λ)²)`
- `Lp = (1+cos²2θ)/(sin²θ·cosθ)`（标准式；原程序 help 原文 `(1+cos²2θ)/(sin2θ·sinθ)`，sin2θ=2sinθcosθ，差常数因子 2 被 K/I₀ 吸收——2026-10-16 核验 RTF 原文，`sin2θ` 曾被误读为 `sin²θ`，已证伪）
- `I_hkl = K·Lp·|F|²`（K=1）
- 展宽 `I(2θ) = Σ I_hkl·exp(−4ln2·(2θ−2θ_hkl)²/q²)`

### 4.2 UI 事件流

见 `sequence-diagram.mermaid` 第二部分：首页→模块→回首页（DEV）；上传/选择样品→解析→回填表单；改参数→store→compute→图表/表格刷新；导出 .xrd。

---

## 5. 任务列表（有序，含依赖与验收标准）

> 粒度 = 单个工程师一次性可完成；P0 = 关键路径。预估延续 spec P1–P8 口径。

### T01 项目基础设施【P0】

- **Source Files**: `web/` 全部配置与入口：`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json`、`tsconfig.node.json`、`index.html`、`.gitignore`、`src/main.tsx`、`src/App.tsx`、`src/routes.tsx`、`src/config.ts`、`src/vite-env.d.ts`、`src/lib/math.ts`
- **Dependencies**: 无
- **内容**: 脚手架 + 构建配置（base `/calc-xrd/`、`@` 别名、vitest 段）+ 路由骨架（DEV/PROD 条件路由占位页）+ `npm install` 锁定
- **验收标准**:
  1. `npm run dev` 起服务，`http://localhost:5173/calc-xrd/` 返回占位页，`/calc-xrd/module` 可访问；
  2. `npm run build` 产出 `dist/index.html`，其中 JS/CSS 引用均为 `/calc-xrd/assets/…`；
  3. `npm test`（vitest）可运行（允许 0 用例通过）；
  4. `npx tsc --noEmit` 零错误。

### T02 平台外壳 + 复刻首页【P0】

- **Source Files**: `src/components/shell/PlatformHeader.tsx`、`src/components/shell/PlatformTab.tsx`、`src/styles/tokens.css`、`src/styles/reset.css`、`src/styles/fonts.css`、`src/styles/shell.css`、`src/styles/home.css`、`src/fonts/*.woff2`、`src/assets/img/*.png`、`src/pages/HomePage.tsx`、`src/pages/CalcXrdPage.tsx`（外壳部分）
- **Dependencies**: T01
- **内容**: 按 §1.3 清单拷贝/摘译；PlatformHeader 复刻 XRD_simulator.html 第 20–38 行结构（logo X + 标题链接 + 单 active tab「XRD理论数据仿真」）；HomePage 复刻 home/index.html 三卡片
- **验收标准**:
  1. dev 下 `/calc-xrd/` 渲染三卡片首页，徽章/插图/排版与 simulator 首页同构（同 CSS 类名、同字体链）；
  2. 点卡片二进入 `/calc-xrd/module`；模块页顶部为 platform-header（logo + 标题 + active tab）；
  3. 模块页点标题回 `/calc-xrd/`（DEV 为 SPA 导航，无整页刷新感）；
  4. prod build 后：根路由直接渲染模块页；标题为 `<a href="/">`；HomePage 不在主 bundle（构建产物无 home 页面代码，可用 `grep home.css dist/assets` 反证——home.css 不应出现）；
  5. 暗色令牌（--surface-2/--accent/--text 等）与 XRD_simulator.css 取值一致。

### T03 .cord 解析器 + 共享类型【P0】

- **Source Files**: `src/lib/xrd/types.ts`、`src/lib/xrd/crystal.ts`、`src/lib/xrd/crystal.test.ts`、`src/data/samples/*.cord`、`src/data/samples/index.ts`
- **Dependencies**: T01
- **内容**: 按 §3.1 类型实现 `.cord` 解析（逐行、Fortran 科学计数、sgKey 组装、离子价符号原样保留）；4 个样例拷贝 + `?raw` 导出
- **验收标准**:
  1. Al/NaCl/BaTiO3/Po 四个 `.cord` 全部解析成功，字段逐项与文件一致（Al: a=4.0339、sgKey='225(Fm-3m)'、1 原子 Wyckoff 'a'；NaCl: 2 原子 'Na1+'/'Cl1-'）；
  2. 畸形输入（缺行/非数字/原子数为 0）抛出带行号的 `CordParseError`；
  3. `serializeCord(parseCord(text))`  round-trip 语义等价。

### T04 Cronie f₀ 系数表【P0】

- **Source Files**: `src/lib/xrd/cronie.ts`、`src/lib/xrd/cronie.test.ts`
- **Dependencies**: T01
- **内容**: IUCr 标准 Cronier/Waasmaier-Kirfel 系数表硬编码（H–U 92 中性元素）+ `f0(element, s)`；离子态（Na1+/Cl1-/O2-/Ba2+/Ti4+ 等）经 `normalizeElement` 归一化到中性元素系数（s=0 精确、s<2 Å⁻¹ 近似好的文档化策略；FF.dat 独立离子系数属二期）
- **验收标准**:
  1. 每个中性元素 `f0(el, 0)` 与该元素原子序数 Z 误差 < 0.5（如 Al≈13、Na≈11、Cl≈17）；
  2. 抽查 ≥10 个元素在中 s 值（如 s=0.1/0.3/0.5 Å⁻¹）与 IUCr 官方表数值一致（容差 1e-3）；
  3. 未知元素 `hasElement` 返回 false，`f0` 抛明确错误；
  4. ⚠️ spec 中 `CRONIE_COEFFS` 的 H/Al 示例值为占位符，**必须以 IUCr 官方表（International Tables Vol. C Table 6.1.1.4 / Waasmaier & Kirfel 1995）为准重新录入**（见 §8）。

### T05 Wyckoff 数据生成 + 查询模块【P0】

- **Source Files**: `scripts/gen_wyckoff.py`、`src/lib/xrd/wyckoff_data.ts`、`src/lib/xrd/wyckoff.ts`、`src/lib/xrd/wyckoff.test.ts`
- **Dependencies**: T01
- **内容**: Python 脚本解析 `../Wyckoff`（254 块，键用 WholeSG 全名如 `"201(Pn-3)[origin choice 1]"`）生成 TS 数据；`wyckoff.ts` 实现 getSite/expandPositions/multiplicityOf/laueOperations
- **验收标准**:
  1. `wyckoff_data.ts` 含全部 254 群，字段结构符合 §3.1；
  2. 抽查：`225(Fm-3m)` 位 a 的 mult=4、ops=4 条；`221(Pm-3m)` 位 b 中心 (½,½,½)；
  3. `expandPositions('225(Fm-3m)','a',0,0,0)` 返回 4 个面心位置 (0,0,0)/(½,½,0)/(½,0,½)/(0,½,½)；
  4. `expandPositions('225(Fm-3m)','l',x,y,z)` 计数 = 192（centers×ops 展开去重）；
  5. `laueOperations('225(Fm-3m)')` 导出 48 个旋转矩阵（m-3m 阶）；
  6. 脚本可用 managed python 重跑且输出确定（diff 干净）。

### T06 计算引擎核心（F/Lp/I）【P0】

- **Source Files**: `src/lib/xrd/structure_factor.ts`、`src/lib/xrd/structure_factor.test.ts`、`src/lib/xrd/lorentz.ts`、`src/lib/xrd/intensity.ts`、`src/lib/xrd/constants.ts`
- **Dependencies**: T03, T04, T05
- **内容**: 结构因子（含位置展开、占位、热因子）、Lp、强度与 mult 计算（Laue 操作去重）
- **验收标准**:
  1. Fm-3m 消光：Al 的 (100)/(110)/(210)/(211)/(221)/(300) 等混合奇偶 hkl 的 |F| < 1e-6·|F(111)|；
  2. Al (111)：|F| = 4·f₀(s)（4 个面心同位相），数值手算复核一致；
  3. 热因子：f = f₀·exp(−B·s²) 仅当 useThermal 且 B>0 时生效；Al 六峰在 B=0.9 下全谱强度偏差 ≤2%（标定见 §7）；
  4. NaCl (020)/(220)：实测 ≈1.4–1.6（B=0.9），截图基准 3.25 与 Laue mult 数学不兼容（分析见 §8-4），断言实测值并注释；
  5. mult 抽查：立方 (100)=6、(110)=12、(111)=8、(220)=12、(311)=24、(400)=6；
  6. Lp(2θ=0)→ 有界（θ→0 时按数值下限处理不发散），Lp(45°) 与手算一致。

### T07 高斯展宽 + 管线编排 + Al.xrd 验收【P0】

- **Source Files**: `src/lib/xrd/gaussian.ts`、`src/lib/xrd/pipeline.ts`、`src/lib/xrd/pipeline.test.ts`、`src/lib/xrd/xrd_file.ts`、`tests/fixtures/Al.xrd`
- **Dependencies**: T06
- **内容**: 管线编排（hkl 枚举→d/2θ→F→Lp→I→归并→归一化→展宽）+ `.xrd` 序列化/解析 + **对照 Al.xrd 的验收测试**
- **验收标准**（对照 `tests/fixtures/Al.xrd`，λ=1.54056、a=4.0339、q 取标定默认值）:
  1. 六个峰 2θ 误差 **< 0.01°**（理论值见 §9 附录，预期 ≤0.005°）；
  2. 各峰相对强度偏差 **< 10%**（默认参数 Thermal 开、B=0.9；实测预期 ≤2%，标定见 §7。若 B=0 高角峰系统性偏高至 +45%，属预期——原程序参考谱含默认热因子）；
  3. 无虚假峰：除 6 个 FCC 允许峰外谱面无 >1% 的峰；
  4. `serializeXrd` 输出 header 与原程序五行格式一致（Name/Lamda/范围/Data Number/Full Scall + `2θ I` 行），行数 = (max−min)/step + 1；
  5. `parseXrd(serializeXrd(...))` round-trip 通过。

### T08 状态管理（Zustand）【P1】

- **Source Files**: `src/store/crystal-store.ts`、`src/store/crystal-store.test.ts`
- **Dependencies**: T03, T07
- **内容**: store 实现（crystal/params/pattern/error + 全部 action），默认参数（λ=1.54056、q=0.25、3–100°/0.01°、Lp 开、PeakShape 开、**Thermal 开 B=0.9**、F′F″ 禁用）
- **验收标准**:
  1. 单测覆盖：loadCordText（成功/失败两路）、updateAtom/addAtom/removeAtom、setParams、compute（Al 全流程产出 pattern）、reset；
  2. 参数变更后 compute 重算且 pattern.meta 反映新 λ/q；
  3. 解析错误时 `error` 非空且 `pattern` 不被污染（保持上一次成功结果或清空，行为确定并写入测试）。

### T09 晶体输入 UI【P1】

- **Source Files**: `src/components/CrystalInput.tsx`、`src/components/AtomTable.tsx`、`src/components/SamplePicker.tsx`、`src/styles/app.css`（输入区部分）
- **Dependencies**: T02, T08
- **内容**: 参数表单 + 原子表 + 文件上传 + 预置样品下拉，全部接 store
- **验收标准**:
  1. 上传 `Al.cord`（或选预置 Al）后表单完整回显（Name/System/SG/a,b,c/α,β,γ + 1 行原子）；
  2. 编辑 a=4.0494 后点计算，峰位随 Bragg 定律移动（111 从 38.63° → ≈38.47°）；
  3. 增删原子行、改元素/Wyckoff/坐标均同步 store；
  4. 非法 .cord 上传显示带行号的错误提示，不崩溃；
  5. 表单在暗色外壳下视觉协调（复用 tokens 变量）。

### T10 参数设置 UI【P1】

- **Source Files**: `src/components/SettingsPanel.tsx`、`src/styles/app.css`（设置区部分）
- **Dependencies**: T02, T08
- **内容**: λ 下拉（Cu/Mo/Cr/Co/Fe Kα）、q 输入、复选框×4（Lp/Thermal/PeakShape 可用；F′F″ 禁用 + tooltip「二期」；**Thermal 勾选时展开 B 输入框，默认 0.9**）、扫描范围
- **验收标准**:
  1. 控件与原程序 TFormCalc 一一对应（§1.6 表）；
  2. 切换 λ=0.70930（Mo）后重算，峰位整体左移（Al 111 → ≈17.52°，实测值；计划原笔误 17.2° 已修正）；
  3. 关 PeakShape 输出 δ 棒谱（表格有值、曲线为离散竖线）；
  4. 关 Lp 后强度比变化符合无 Lp 预期（Al (111)/(200) 比趋近 mult 比 8:6 修正后的 |F|² 比）；
  5. 关 Thermal 后高角峰升高（Al 400 约 +45%，即 B=0 与 B=0.9 之差），验证热因子开关生效；
  6. 所有变更即时同步 store 并触发重算。

### T11 结果曲线 UI + .xrd 导出【P1】

- **Source Files**: `src/components/XRDChart.tsx`、`src/lib/xrd/xrd_file.ts`（导出部分）
- **Dependencies**: T08
- **内容**: Recharts LineChart（2θ 0–范围上限 vs 强度；渲染降采样 ≤2000 点；峰位参考线/悬浮提示）+ 「导出 .xrd」按钮（Blob 下载）
- **验收标准**:
  1. 曲线与 store.pattern 数值一致（抽样点比对容差 1e-6）；
  2. Al 图谱在视觉上复现 Al.xrd 六峰形貌（峰位/相对高度）；
  3. 空态（无 crystal）与错误态有明确占位，不白屏；
  4. 导出的 `.xrd` 可被 `parseXrd` 读回且与屏幕一致；
  5. 9700 点全谱渲染交互不卡顿（帧操作响应 < 1s）。

### T12 hkl 表格 UI【P1】

- **Source Files**: `src/components/HKLTable.tsx`
- **Dependencies**: T08, T11
- **内容**: 离散峰表（hkl/d/2θ/I(归一化)/mult），列排序，与曲线联动（可选高亮）
- **验收标准**:
  1. Al 的表 6 行与 §9 附录参考值一致（2θ < 0.01°、I 归一化偏差 < 10%）；
  2. 表头点击可按 2θ/I 排序；
  3. 空态/错误态占位；
  4. 表格数值格式统一（d 4 位小数、2θ 2 位、I 2 位）。

### T13 模块页面集成 + 端到端验收【P0】

- **Source Files**: `src/pages/CalcXrdPage.tsx`、`src/App.tsx`、`src/routes.tsx`、`src/styles/app.css`（收尾）、`README.md`
- **Dependencies**: T09, T10, T11, T12
- **内容**: 组装模块主页（header + 样品/输入/设置 + 曲线/表格双栏）；全链路手工走查；README 定稿
- **验收标准**:
  1. `npm run dev` 完整动线：首页 → 卡片二 → 模块 → 上传 Al.cord → 计算 → 曲线+表格 → 导出 .xrd → 点标题回首页；
  2. `npm run build` + `npm run preview`（或任意静态服务器以 `/calc-xrd/` 挂载 dist/）下：根路径即模块页、标题 `href="/"`、资源全部 `/calc-xrd/assets/`、无 console 错误；
  3. NaCl/BaTiO3/Po 三个预置样品均可计算且无 NaN/Infinity；
  4. `npx tsc --noEmit` + `npm test` 全绿；
  5. 集成就绪清单（§1.1 四条不变式）逐条核验通过并记录在 README。

### T14 集成就绪验证 + 集成文档（simulator 侧草稿）【P2】

- **Source Files**: `README.md`（集成章节）、`docs/superpowers/plans/2026-10-16-calcxrd-web-plan.md`（本文件，如收尾更新）
- **Dependencies**: T13
- **内容**: 将远期 simulator 集成步骤落档（simulator.go 前缀剥离 handler 草稿、go-bindata 追加 dist/ 的命令草稿、验证清单）；**不修改 simulator 任何文件**
- **验收标准**:
  1. 文档含可直接执行的 simulator 侧改动草稿与回滚说明；
  2. 验证 `web/` 全部源码无 `simulator` 路径硬编码（`grep -ri simulator src/` 仅剩注释/文档）；
  3. 主理人 review 通过。

---

## 6. 依赖包清单（package.json）

```json
{
  "name": "calc-xrd-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "recharts": "^2.12.7",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "typescript": "~5.5.4",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

**版本策略与选型理由：**

| 包 | 策略 | 理由 |
| --- | --- | --- |
| react/react-dom `^18.3.1` | 锁 18 主版本 | spec 已定；Recharts 2.x 对 18 兼容最稳，暂不追 19 |
| typescript `~5.5.4` | 锁 5.5 patch | 与 Vite 5 生态匹配；`~` 防 minor 漂移 |
| vite `^5.4.8` | spec 基线 | managed node 22 兼容（要求 ^18.0.0 \|\| >=20）；Vite 6/7 亦可但无收益 |
| @vitejs/plugin-react `^4.3.2` | 跟随 Vite 5 | React Fast Refresh + JSX runtime |
| recharts `^2.12.7` | 锁 2.x | 声明式 React 图表，2θ–强度折线 + 参考线 + Tooltip 开箱即用；D3 备选——仅当需要高度定制峰标注/交互时再引入，避免双栈 |
| zustand `^4.5.5` | 锁 4.x | 最小样板状态管理，无 Provider；store 即 §3.3 |
| react-router-dom `^6.26.2` | 锁 6.x | 两路由 + DEV/PROD 条件路由 + 未来子面板（Wyckoff/factors 查询页）；自研 state 切换会丢失深链与刷新语义 |
| vitest `^2.1.2` | 与 Vite 同配置 | 引擎测试为纯 TS，`environment: 'node'` 即可，无需 jsdom；`vitest/config` 合并在 vite.config.ts |

**有意不选（对 spec 默认栈的偏离，记录理由）：**

- **不选 MUI / Tailwind**：页面外壳必须逐字复刻 simulator 现有设计令牌（`.platform-header`、`.tab-bar`、home.css 卡片），引入组件库/原子 CSS 会与其令牌和类名冲突，保真度反而下降；纯 CSS 拷贝 + tokens.css 是最高保真路径。
- **不选 D3**：Recharts 覆盖本期全部图表需求。
- **不选 Redux/MobX**：Zustand 足够。
- **不选 jsdom/testing-library**：本期测试集中在计算引擎（纯函数）与 store，组件视觉验收靠 dev 手工走查（T13）。
- **无后端依赖**：全部计算在浏览器；远期集成只涉及 Go 静态服务，不新增 npm 包。

---

## 7. 共享知识（跨文件约定）

**命名规范**

- 组件文件 `PascalCase.tsx`；库/工具 `camelCase.ts`；测试与被测同目录同名 `*.test.ts`；常量 `UPPER_SNAKE_CASE`；类型/接口 `PascalCase`；CSS 类名沿用 simulator 既有命名（`platform-header`、`module-card` 等），新增用 kebab-case。
- 路径别名 `@/` → `src/`（vite + tsconfig 双配）；禁止跨层深相对路径（`../../..`）。

**常量唯一来源**

- 全部物理/默认常量在 `src/lib/xrd/constants.ts`：λ 表（Cu Kα 1.54056、Mo Kα 0.70930、Cr Kα 2.28970、Co Kα 1.78897、Fe Kα 1.93604，单位 Å）、`K = 1`、扫描范围 `3°–100°`、`step = 0.01°`、q 默认值（标定值，见下）。
- 组件内禁止散落魔法数字；UI 默认值一律取 constants.ts。

**q 标定（2026-10-16 GUI 实测定案）**

- ✅ 已执行原程序（pywinauto 驱动 CalcXRD.exe）确认：UI 默认 **q = 0.10**，且 help 公式 (6) `f(x)=exp(−(x−u)²/2q²)/(q·√2π)` 表明 **q 是高斯 σ（不是 FWHM）**；FWHM = 2.355q ≈ 0.2355°，与 Al.xrd 剖面实测 FWHM ≈ 0.24° 及逐点形状（±0.01° 处比值 = exp(−0.005)）精确吻合。
- 实现口径：`gaussian = exp(−(2θ−2θ₀)²/(2q²)) / (q·√2π)`，**默认 q = 0.10（σ，度）**。此前「q=0.25 FWHM 口径」为误读，废弃。

**B（热因子）标定（2026-10-16 GUI 实测修订）**

- ✅ GUI 执行确认：原子表有独立 **B 列，默认 B = 1**（即 §7-B 的 `.cord` 第 7 字段，此前 CLAUDE.md 误记为 multiplicity）；`Thermal factor` 复选框默认勾选。**B 是逐原子参数（Bⱼ），不是全局 UI 参数**。
- Debye–Waller 逐原子：`exp(−Bⱼ·sin²θ/λ²)`。B=1（真值口径）时六峰偏差 ≤2.5%（下表 B=1.0 行），满足 <10% 验收；此前「全局 B=0.9」是对剖面比值的最优拟合值（差异疑来自热因子指数约定/f₀ 细节），不再作为默认。
- 实测（项目 cronie 表 + 标准 Lp + Laue mult，六峰归一化对参考表）：

  | B (Å²) | 200 | 220 | 311 | 222 | 400 | 最大偏差 |
  | --- | --- | --- | --- | --- | --- | --- |
  | 0 | +2.9% | +15.0% | +25.4% | +29.2% | +45.4% | 45.4% |
  | 0.5 | +1.3% | +6.5% | +10.9% | +12.5% | +19.0% | 19.0% |
  | 0.8 | +0.4% | +1.7% | +3.0% | +3.6% | +5.6% | 5.6% |
  | 0.9 | +0.1% | +0.2% | +0.5% | +0.7% | +1.5% | 1.5% |
  | **1.0** | **−0.2%** | **−1.4%** | **−1.9%** | **−2.0%** | **−2.5%** | **2.5%** |

- 结论：**默认 Thermal 开、B 取 .cord 原子表第 7 字段（样例均为 1）**；UI 的原子表暴露 B 可编辑列（与原程序一致）。
- 佐证：GUI 实测 Al (111)/(200) = 152557/71693 = **2.128**；本引擎 B=1 口径与之偏差 <0.3%。
- 教训存档：spike 时期「常数 f₀ + legacy Lp」模型（六峰 3.5%）系双重误差相消的巧合——误把 help 公式 `sin2θ` 读作 `sin²θ` 后，cotθ 角分布恰好 mimic 热衰减，常数 f₀ 又抵消 IUCr f₀ 衰减。该模型已废弃，勿回退。

**精度与容差（验收阈值）**

| 项 | 阈值 | 依据 |
| --- | --- | --- |
| 峰位 2θ | **< 0.01°**（预期 ≤0.005°） | Al.xrd 六峰理论 vs 参考最大偏差 0.0051°（222） |
| 相对峰强 | **< 10%/峰**（默认 Thermal 开、逐原子 B=1；预期 ≤2.5%） | §7 实测：B=1.0 时六峰偏差 ≤2.5%；B=0 时高角峰 +2.9%→+45.4%（原程序参考谱含默认热因子） |
| NaCl 相对峰强（GUI 实测基准） | I/I₀ = 91/1000/616/19/187/78/9/196/137（111/200/220/311/222/400/331/420/422，a=5.62，Na@4a B=1、Cl@4b B=1） | 2026-10-16 GUI List 实测；替代旧「截图 3.25」基准（该基准来自未知设置，废弃） |
| f₀(0) vs Z | < 0.5 | Cronie 表自检 |
| 浮点比较 | 1e-9 相对 / 1e-12 绝对 | 纯函数测试 |

**数据与格式约定**

- 角度：内部一律 deg 存储，计算时转 rad；输出 `2θ` 2 位小数、`d` 4 位小数、`I` 2 位小数。
- `.xrd` 导出兼容原程序 header 五行（注意原程序 header 写 `0.001` 而实际行距为 `0.01`，以实际行距为准）；`Data Number = (max−min)/step`。
- 无后端、无网络请求；全部状态在内存 + Zustand。
- 元素符号原样保留离子价（`Na1+`、`O2-`）；cronie 查找失败即报错，不静默回退。

**代码风格**

- TS strict，禁止 `any`（测试夹具除外）；计算模块为纯函数：无 DOM、无 I/O、无全局可变状态（`wyckoff_data.ts`/`CRONIE_COEFFS` 为冻结常量表）。
- UI 与计算分离：组件只调 `pipeline.computeXRDPattern` / store，不直接触动物理公式。
- 错误：解析错误带行号（`CordParseError`）；计算错误 throw 带上下文；UI 统一捕获展示，不弹原生 alert。
- `user-select`：原仪器页 `html { user-select: none }` 不适用于表单，shell.css 已加输入框修正，新增样式不得再全局禁用选择。
- 生成物（`wyckoff_data.ts`）入库提交，禁止手改；改动只能重跑 `scripts/gen_wyckoff.py`。

**环境命令（团队统一）**

- node：`C:\Users\admin\.workbuddy\binaries\node\versions\22.22.2-6\node.exe`（npm 用同发行版 `node_modules\npm\bin\npm-cli.js`）；**禁止 `npm install -g`**。
- python（一次性脚本）：`C:\Users\admin\.workbuddy\binaries\python\versions\3.13.12\python.exe`。
- 常用：`npm run dev` / `npm run build` / `npm test` / `npm run typecheck`。

---

## 8. 待明确事项（需用户/主理人后续拍板）

1. ~~**q 默认值**~~ **已定（2026-10-16 GUI 实测）**：原程序 UI 默认 q = 0.10，q 为高斯 σ（help 公式 6），FWHM≈0.2355°。见 §7 q 标定。
2. ~~**Thermal B 默认值**~~ **已定（2026-10-16 GUI 实测）**：B 为 .cord/原子表逐原子字段（默认 1），Thermal 默认勾选。见 §7 B 标定。原全局 B=0.9 裁定废止（保留作历史拟合记录）。
3. **Cronie 系数表数值**：spec §4.2 的 `CRONIE_COEFFS` 示例值（H/Al）与 IUCr 官方表不符（占位符）。需工程师从官方表（International Tables Vol. C, Table 6.1.1.4；Waasmaier & Kirfel, Acta Cryst A51, 416, 1995）录入 92 元素 + 离子态；离子态覆盖范围（哪些价态）需定。
4. ~~**NaCl (020)/(220) ≈ 3.25 基准不可复现**~~ **已被 GUI 实测取代（2026-10-16）**：本次 GUI 执行（已知设置：a=5.62、Na@4a/Cl@4b 均 B=1、四选项全开、q=0.10）得到确定性 NaCl 基准 I/I₀ = 91/1000/616/19/187/78/9/196/137（111/200/220/311/222/400/331/420/422）。旧截图 3.25 基准因设置未知而废弃，验收一律以 GUI 实测表为准（§7 精度表）。
5. **单晶模式（single XRD / TFormSingle）**：本期不做（§1.6 标 ⛔）。确认二期排期。
6. **首页卡片一在 standalone dev 下 404**：复刻首页卡片一保留指向 `/static/simulator/xrd_simulator/XRD_simulator.html`（嵌入后有效；dev 下该路径不存在）。确认可接受，或改为 dev 下渲染为不可点卡片。
7. **Al.xrd header 矛盾**：header 写 `3.000,100.000, 0.001` 但实际行距 0.01、9700 行。导出格式以实际行距为准；是否需要逐字节复刻 header（含疑似笔误）待确认。
8. **「Full Scall = 10000」语义**：Al.xrd 原始峰值 152557 ≠ 10000，疑为显示量程而非数据归一。导出 `.xrd` 写原始强度值（与参考文件一致）——确认。
9. **F′F″ 复选框一期禁用**：Factor.dat 未完全解码，复选框渲染为禁用 + tooltip「二期」。确认交互（禁用 vs 隐藏）。
10. **空间群重号（origin choice）**：`Wyckoff` 文件中 48/50/59… 等编号出现两个块（origin choice 1/2），数据以 WholeSG 全名为键。若用户输入 `201(Pn-3)` 不带 origin 后缀，需约定默认取 choice 1——确认。

---

## 9. 附录：Al.xrd 验收基准（T07/T12 直接使用）

输入：`Al.cord`（Cubic、`225(Fm-3m)`、a=b=c=4.0339 Å、α=β=γ=90°、1×Al @ a(0,0,0)occup=1 **B=1**）；λ = 1.54056 Å；扫描 3°–100°，步长 0.01°；**原程序默认设置（GUI 实测）：F′F″ 开、Thermal 开（B 取原子表）、L-P 开、PeakShape 开、q=0.10（σ）**；参考 `samples/Al.xrd`（Data Number = 9700，原始峰值 152557 @ 38.63°）。

**GUI 实测峰高（List 面板，Intensity = 剖面峰值本身，I/I₀ 千分比口径）**：

| hkl | d (Å) | 2θ 理论 | 2θ GUI | Intensity (GUI) | I/I₀ (GUI) | I/I₀（归一 %） |
| --- | --- | --- | --- | --- | --- | --- |
| 111 | 2.32897 | 38.6272° | 38.63° | 152557 | 1000 | 100.00 |
| 200 | 2.01695 | 44.9033° | 44.90° | 71693 | 470 | 47.00 |
| 220 | 1.42620 | 65.3799° | 65.38° | 40648 | 266 | 26.64 |
| 311 | 1.21627 | 78.5903° | 78.59° | 43172 | 283 | 28.30 |
| 222 | 1.16449 | 82.8251° | 82.82° | 12165 | 80 | 7.97 |
| 400 | 1.00848 | 99.6019° | 99.60° | 5681 | 37 | 3.72 |

- 峰位最大偏差 0.0051°（222）——**< 0.01° 阈值可达**。
- List 的 Intensity 即 `.xrd` 剖面峰值（38.63° 剖面值 152557 = List 152557，逐点验证）；峰形为高斯 σ=q=0.10（38.62/38.64 处 151883/151709 ≈ exp(−0.005)×峰值）。
- 强度比为 |F|²·mult·Lp·exp(−B·s²) 的合成结果；B=1（GUI 真值）口径下六峰偏差 ≤2.5%（§7 标定表）。⚠️ spike 时期「常数 f₀ + sin³θ Lp」的 2.9% 系双重误差相消的巧合，已废弃勿回退（§7 教训存档）。
- 参考谱除上表六峰外无 >1% 的峰（FCC 消光：(100)/(110)/(210)/(211)/(221)/(300)/(310)/(320)/(321) 等均为 0）。

---

## 附：图表文件

- 类图：`docs/superpowers/plans/class-diagram.mermaid`
- 时序图（计算管线 + UI 事件流）：`docs/superpowers/plans/sequence-diagram.mermaid`
