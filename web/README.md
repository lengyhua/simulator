# CalcXRD Web 模块

原 `CalcXRD.exe`（XRD 理论数据仿真）的 Web 复刻：输入晶体结构（.cord），
计算并绘制粉末 XRD 图谱，导出原程序格式的 .xrd 文件。纯前端实现——
计算引擎为无副作用的 TypeScript，UI 为 React + Recharts。

## 快速开始

```bash
npm install        # 首次
npm run dev        # 开发服务器：http://localhost:5173/calc-xrd/（DEV 下首页在 /calc-xrd/，模块在 /calc-xrd/module）
npm run build      # 生产构建 → dist/（base 固定 /calc-xrd/）
npm run preview    # 本地预览生产构建
npm test           # vitest 全量测试（node 环境，纯函数 + store）
npm run typecheck  # tsc --noEmit
```

## 目录说明

```
src/
├── components/          # UI 组件（T09–T12）
│   ├── shell/           #   平台外壳（PlatformHeader / PlatformTab，复刻原页面）
│   ├── SamplePicker     #   预置样品下拉 + .cord 文件上传
│   ├── CrystalInput     #   晶体头参数表单（Name/System/SG/晶胞）
│   ├── AtomTable        #   原子表格编辑（增删/元素/Wyckoff/坐标/占位）
│   ├── SettingsPanel    #   计算参数（λ/q/复选框×4/B/扫描范围）
│   ├── XRDChart         #   结果曲线（Recharts，≤2000 点保峰降采样 + hkl 参考线）
│   └── HKLTable         #   离散衍射峰表（点击表头排序）
├── lib/
│   ├── xrd/             # 计算引擎（纯函数，T03–T07）
│   │   ├── crystal      #   .cord 解析/序列化（带行号错误）
│   │   ├── cronie(+data)#   IUCr Cronie f₀ 系数表（92 元素含离子态）
│   │   ├── wyckoff(+data)#  254 空间群 Wyckoff 位与位置展开
│   │   ├── structure_factor / lorentz / intensity / constants
│   │   ├── gaussian / pipeline / xrd_file / downsample
│   │   └── types        #   共享类型（Atom/Crystal/HKLReflection/XRDPattern/XrdParams）
│   └── draft-sync       # 表单草稿与 store 的按值同步（小数不断输）
├── store/
│   └── crystal-store    # Zustand：crystal/params/pattern/error + 全部 action
├── data/samples/        # 预置样品 .cord（?raw 打包，无运行时获取）
├── pages/               # HomePage（DEV 复刻首页）/ CalcXrdPage（模块页）
├── routes.tsx / App.tsx # 环境条件路由（DEV 首页+模块；PROD 根路径即模块）
└── styles/              # tokens.css（原程序取色）+ app.css（模块样式）

tests/fixtures/Al.xrd    # 原程序参考谱（T07/T12 验收基准，9701 数据行）
```

## 计算口径

- 结构因子 `F = Σ fⱼ·exp(2πi(hx+ky+lz))`，`fⱼ = f₀(s)·occ·exp(−B·s²)`，
  `s = sinθ/λ`；Wyckoff 位置展开后消光自然涌现。
- 强度 `I = K·Lp·|F|²·mult`，K=1，`Lp = (1+cos²2θ)/(sin²θ·cosθ)`（标准式），
  mult 为 Laue 群等价面数（含 Friedel 对去重）。
- 高斯展宽 `I(2θ) = Σ I_hkl·exp(−4ln2·(2θ−2θ₀)²/q²)`，默认 q=0.25°。
- 默认参数：λ=1.54056（Cu Kα）、Thermal 开 B=0.9、Lp 开、PeakShape 开、
  3–100°/0.01°。B=0.9 为对原程序参考谱的标定值（B=0 时高角峰系统性偏高
  至 +45%，法证分析见 `src/lib/xrd/lorentz.ts` docstring）。
- 与原程序的已知偏差均以测试注释/汇报归档：NaCl (020)/(220)=1.52（原程序
  3.25 的 mult 口径与之数学不兼容）；Mo Kα 111 峰位 17.52°（计划早期笔误
  17.2° 已更正）。

## 集成就绪契约（四条不变式，已逐条核验）

供将来原样嵌入 simulator 平台，web/ 侧零改动：

1. **base 一致** — `vite.config.ts` 的 `base = '/calc-xrd/'`，dev 与 prod 一致；
2. **产物自包含** — 构建产物全部落在 `web/dist/`（`dist/index.html` +
   `dist/assets/`），HTML/CSS/JS/字体资源 URL 均为 `/calc-xrd/...` 前缀
   （`grep -r "/static/" dist/` 为空）；
3. **标题回链** — 生产构建中页面标题链接为 `<a href="/">`（绝对路径指向
   平台主页，DEV 下为 SPA `<Link>`，同className 同视觉）；
4. **无运行时获取** — 预置样品 `.cord` 与字体全部经 ESM/`?raw` 打包进
   bundle（不依赖 `public/`），simulator 只需「serve `dist/index.html` +
   `dist/assets/`」两条路由即可工作。

核验记录（2026-10-16，build 后）：`dist/index.html` 三个资源引用均为
`/calc-xrd/assets/` 前缀；`dist/assets/index-*.css` 字体 URL 同前缀；
PROD chunk 中标题链接为 `href:"/"`；`dist/` 无 `/static/` 引用；
`npm run preview` 下 `/calc-xrd/` 与 SPA fallback 均 200。

## 远期 simulator 集成步骤（草稿，T14 完善；不改 simulator 任何文件）

1. simulator 侧加路由：GET `/calc-xrd/` → serve `web/dist/index.html`；
   GET `/calc-xrd/assets/*` → serve `web/dist/assets/*`（或经
   go-bindata/embed 将 `dist/` 打入二进制）。
2. 若 simulator 有路径前缀剥离 handler，先剥离 `/calc-xrd` 前缀再匹配
   上述两条路由。
3. 验证清单：首页卡片二入口跳转 `/calc-xrd/`；页面标题回首页；
   控制台无 404；四个预置样品均可计算并导出 .xrd。
4. 回滚：删除上述两条路由与嵌入资源即可，web/ 无需任何改动。

## 测试

```bash
npm test           # 116 个测试：计算引擎（消光/mult/Lp/Al.xrd 六峰/round-trip/
                   # 降采样/草稿同步）+ store 全 action 两路 + 默认参数口径
npm run typecheck  # strict 模式 0 错误
```

组件层无单元测试框架（本期约定：纯函数与 store 由 vitest 覆盖，组件交互
靠 dev/preview 手工走查），走查动线见计划 §5-T13。
