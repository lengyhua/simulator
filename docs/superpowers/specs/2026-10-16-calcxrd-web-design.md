# CalcXRD Web 模块设计

> 日期: 2026-10-16
> 状态: 草案
> 关联项目: `D:\Projects\CalcXRD`（逆向分析）, `D:\Projects\simulator`（整合目标）

---

## 1. 背景与目标

### 1.1 背景

CalcXRD.exe 是一个 Delphi 7 32 位 Windows 桌面程序，用于计算 X 射线衍射（XRD）强度。逆向分析已完成，物理公式、数据文件格式、界面结构均已确认。

本项目目标：将 CalcXRD 的核心功能用 **Web 前端技术**重新实现，作为新的 `calc_xrd` 模块整合进 `simulator` 项目，替换原有 jQuery + Canvas 技术栈。

### 1.2 验证成果（来自 spike）

| 项目                          | 状态                               |
| ----------------------------- | ---------------------------------- |
| d→2θ 计算（Al/NaCl）        | ✅ 与理论完全一致                  |
| Fm-3m 消光规则                | ✅ 正确                            |
| 粉末强度 ∝ mult·Lp·\|F\|² | ✅ 标准 Lp + IUCr f₀ + 热因子 B≈0.9（Al 全谱 <2%，见 plans/2026-10-16-calcxrd-web-plan.md §7） |
| NaCl 双元素（f₀ 角度依赖）   | ✅ 确认需要角度相关 f₀            |
| `.xrd` 输出格式             | ✅ 完全掌握                        |
| FF.dat 字节布局               | ✅ 确认为 F′F″ 色散修正表        |
| 散射线 f₀ 来源               | ✅ 用 IUCr/CCRD 标准 Cronie 系数表 |

### 1.3 成功标准

- Web 端能输入晶体结构（`.cord` 格式），输出 2θ–强度曲线（`Al.xrd` 参考文件）
- Al 粉末 XRD 峰值与参考文件偏差 < 10%
- NaCl 双元素体系 f₀ 角度依赖正确（(020)/(220) 强度比 ≈ 3.25；2026-10-16 注：该截图基准与 Laue mult 数学不兼容，实际复现值 ≈1.5，详见 plan §8-4）
- 集成到 simulator，构建链路不变：`npm run build` → `dist/` → `go-bindata` → `go build` → `simulator.exe`

---

## 2. 技术栈

### 2.1 模块隔离原则（关键约束）

> **原有 jQuery 模块（`static/simulator/xrd_simulator/`）的 HTML/CSS/SVG/JS 完全不动。**
>
> 原因：原模块包含大量 SVG 动图控制（jQuery UI slider、anime.js 动画、按钮相对布局），任何布局改动都可能破坏元素相对位置。新 React 模块通过 iframe 或独立路由隔离，**不与原模块共享 DOM 树或 CSS 作用域**。

### 2.2 前端（新增，独立）

| 技术             | 版本   | 用途                           |
| ---------------- | ------ | ------------------------------ |
| React            | 18.x   | UI 框架                        |
| TypeScript       | 5.x    | 类型安全                       |
| Vite             | 5.x    | 构建工具                       |
| Recharts / D3.js | 最新版 | XRD 曲线渲染                   |
| Zustand          | 最新   | 状态管理（晶体参数、计算结果） |

### 2.3 集成方式（方案 A：并存，不改旧模块）

```
simulator/
├── static/                    ← 原有 jQuery 文件（完全不动，含 xrd_simulator/）
│   ├── home/
│   └── simulator/xrd_simulator/
├── src/                       ← 新增：React SPA（CalcXRD 新模块）
│   ├── main.tsx
│   ├── App.tsx
│   └── ...
├── vite.config.ts
├── package.json
└── simulator.go             ← 修改：新增 /calc-xrd 路由指向 dist/，原路由不变
```

**路由规则**（`simulator.go` 改动最小化）：

- `/` → 仍 serve `static/home/index.html`（原 Home 页，含模块选择入口）
- `/simulator/xrd_simulator/` → 仍 serve `static/simulator/xrd_simulator/`（原 jQuery 模块，**不变**）
- `/calc-xrd` → 新增：serve `dist/index.html`（React 新模块）

这样原有 SVG 动图、jQuery 布局、Canvas 渲染**完全隔离**，互不影响。

### 2.4 后端（现有 Go，改动最小）

`simulator.go` 新增一条路由：

```go
mux.HandleFunc("/calc-xrd", func(w http.ResponseWriter, r *http.Request) {
    // serve dist/index.html (from go-bindata embedded)
})
mux.HandleFunc("/calc-xrd/assets/", assetHandler) // JS/CSS hash files
```

`go-bindata` 打包命令改为同时打包 `static/...` 和 `dist/...`。

---

## 3. 模块结构

### 3.1 文件组织（在 `simulator/` 内新增）

```
simulator/
├── static/                    ← 原有 jQuery 文件（完全不动，含 xrd_simulator/）
│   ├── home/
│   └── simulator/xrd_simulator/
├── src/                       ← 新增：React SPA（CalcXRD 新模块，独立目录）
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   └── calc_xrd/
│   │       ├── index.tsx      ← CalcXRD 主页面（对应原 TFormCalc）
│   │       ├── CrystalInput.tsx  ← 晶体参数输入（Name/System/SG/Unit Cell/Atoms）
│   │       ├── XRDResult.tsx     ← 结果曲线 + 数据表格
│   │       └── Settings.tsx      ← λ/q/复选框
│   ├── lib/
│   │   ├── xrd/
│   │   │   ├── crystal.ts       ← .cord 文件解析
│   │   │   ├── structure_factor.ts  ← F_hkl 计算
│   │   │   ├── lorentz.ts         ← Lp 因子
│   │   │   ├── gaussian.ts        ← 高斯展宽
│   │   │   ├── intensity.ts       ← I = K·Lp·|F|²
│   │   │   ├── wyckoff.ts         ← 空间群 Wyckoff 位置表
│   │   │   └── cronie.ts          ← IUCr Cronie 系数表 + f₀ 计算
│   │   └── types.ts               ← 共享类型
│   └── store/
│       └── crystal-store.ts  ← Zustand 状态
├── simulator.go             ← 改动最小：新增 /calc-xrd 路由，原路由不变
├── go.mod
├── package.json             ← 新增
├── vite.config.ts           ← 新增（base: '/calc-xrd/'）
└── tsconfig.json            ← 新增
```

> **注意**：`vite.config.ts` 设 `base: '/calc-xrd/'`，使 React 模块的 JS/CSS 资源路径前缀为 `/calc-xrd/assets/...`，与原有 `/static/` 路径完全隔离。

### 3.2 计算管线（`lib/xrd/`）

```
.cord 输入
  ↓
crystal.ts  解析（Name/System/SG/a,b,c/atoms）
  ↓
structure_factor.ts  对每个 hkl：
    • 查 wyckoff.ts 取 Wyckoff 位置坐标
    • F_hkl = Σⱼ fⱼ·exp(2πi(hxⱼ+kyⱼ+lzⱼ))
    • fⱼ = cronie.ts: Σ aᵢ·exp(bᵢ·s²) + c，s = sinθ/λ
  ↓
lorentz.ts  Lp = (1+cos²2θ)/(sin²θ·sinθ)
  ↓
intensity.ts  I = K·Lp·|F|²（K=1）
  ↓
gaussian.ts  2θ 网格采样：I(2θ) = Σₕₖₗ I_hkl·Gaussian(2θ − 2θ_hkl; q)
  ↓
XRDResult.tsx  曲线渲染 + 表格输出
```

---

## 4. 数据文件

### 4.1 `.cord` 格式（解析器）

```
<Name>                    Al
<System>                  Cubic
<N>(SGSymbol)            225(Fm-3m)
<a> <b> <c>             4.0339 4.0339 4.0339
<α> <β> <γ>              90 90 90
<AtomCount>              1
<element> <wyckoff> <x> <y> <z> <occupancy> <multiplicity>
Al a 0 0 0 1 1
```

支持多原子（NaCl 示例）：

```
Na1+ a 0 0 0 1 1
Cl1- b 0.5 0.5 0.5 1 1
```

### 4.2 IUCr Cronie 系数表（`cronie.ts`）

从 IUCr 标准表（Cronie & Crank 1994 / Waasmaier-Kirfel 1995）提取，格式：

```ts
export const CRONIE_COEFFS: Record<string, { a: number[]; b: number[]; c: number }> = {
  'H':  { a: [3.016, -0.778, -0.631, -0.121], b: [0,0,0,0], c: 0.0036 },
  'Al': { a: [a1,a2,a3,a4], b: [b1,b2,b3,b4], c: 10.281 },
  // ... 共 92 个元素（H–U，含离子态）
};
```

**数据来源**：IUCr Acta Cryst A48 (1992) 标准 Cronie 表。Web 端硬编码，不依赖 FF.dat。

### 4.3 空间群 Wyckoff 位置表（`wyckoff.ts`）

把 `D:\Projects\CalcXRD\Wyckoff` 文本文件转换成 TypeScript 对象：

```ts
export const WYCKOFF: Record<number, WyckoffSite[]> = {
  225: [ // Fm-3m
    { symbol: 'a', multiplicity: 4, coords: [[0,0,0],[0.5,0.5,0],[0.5,0,0.5],[0,0.5,0.5]] },
    // ...
  ],
  // 254 个空间群
};
```

生成方式：一次性脚本解析 `Wyckoff` 文件，输出 `wyckoff_data.ts`。

---

## 5. UI 设计

> **约束**：CalcXRD 新模块的 UI 布局**参照原 CalcXRD.exe 截图**（`power-XRD截图.png`），但不修改 simulator 原有页面的任何布局。
>
> 原 `xrd_simulator` 模块的 SVG 动图控制（jQuery UI slider、anime.js 动画、按钮相对位置）**完全不动**——新模块通过 `/calc-xrd` 独立路由 + 独立 CSS 作用域隔离，不共享 DOM 树。

### 5.1 页面布局（仿原 CalcXRD 主窗口截图）

```
┌─────────────────────────────────────────────────────┐
│ [Crystal Input Panel]  [λ 下拉] [q 输入] [复选框×4] │  ← Settings.tsx
├─────────────────────────────────────────────────────┤
│  [晶体参数：Name/System/SG/a,b,c/α,β,γ]             │  ← CrystalInput.tsx
│  [原子表格：Element/Wyckoff/x/y/z/Occ/B]            │
├────────────────────────────┬────────────────────────┤
│  [XRD 曲线图]             │  [hkl 数据表格]          │  ← XRDResult.tsx
│  (2θ vs 强度)              │  hkl | d | 2θ | I       │
└────────────────────────────┴────────────────────────┘
```

- 左区：曲线（Recharts LineChart，2θ 0°~180°）
- 右区：可滚动表格（单晶模式显示 hkl/d/2θ/I）
- 顶部：参数输入区

### 5.2 与原程序的对应关系

| 原 CalcXRD 控件             | Web 组件                                     |
| --------------------------- | -------------------------------------------- |
| `open` 按钮（打开 .cord） | 文件上传（`<input type=file>`）            |
| `input` 按钮（手工输入）  | 表单（CrystalInput）                         |
| `powder XRD` 按钮         | "计算粉末 XRD" 按钮                          |
| `single XRD` 按钮         | "计算单晶" 按钮                              |
| `Wyckoff symbol` 按钮     | 空间群查询面板                               |
| `factors` 按钮            | 散射线查询面板（可选，二期）                 |
| `Lamda` 下拉框            | 波长选择（Cu/Mo/Cr...）                      |
| `q` 输入框                | 高斯峰宽输入                                 |
| 4 个复选框                  | 4 个 Checkbox（F′F″/Thermal/Lp/PeakShape） |
| 结果曲线                    | Recharts LineChart                           |
| 结果表格                    | HTML 表格                                    |

---

## 6. 计算精度说明

### 6.1 当前精度水平

| 场景                      | 精度   | 说明                         |
| ------------------------- | ------ | ---------------------------- |
| Al 单元素，标准模型       | <2%    | 标准 Lp + IUCr f₀ + B=0.9，六峰最大偏差 1.5% |
| NaCl 双元素，角度相关 f₀ | ~5%    | 用 IUCr 标准表；(020)/(220)=3.25 截图基准不可复现（开放项，见 plan §8-4） |
| 峰值强度绝对值            | ~10%   | 标准表 vs 原程序厂商系数差异 |
| 峰位（2θ）               | 0.01° | 精确                         |
| 消光规则                  | 精确   |                              |

### 6.2 二期改进路径

- 解析 `Factor.dat`（F′F″ 色散修正）→ 逐点复刻原程序
- 解析 `FF.dat` 的 a/b 系数列 → 与 IUCr 标准系数做一致性验证

---

## 7. 实现顺序

| 阶段 | 内容                                                        | 预估 |
| ---- | ----------------------------------------------------------- | ---- |
| P1   | 搭 React 骨架 + Vite 构建 + go-bindata 集成验证             | 1h   |
| P2   | `crystal.ts`：.cord 解析 + Al/NaCl 测试用例               | 1h   |
| P3   | `cronie.ts`：IUCr 系数表 + f₀ 计算 + 验证 f₀(0)=Z       | 1h   |
| P4   | `structure_factor.ts` + `lorentz.ts` + `intensity.ts` | 2h   |
| P5   | `gaussian.ts` + 完整管线跑通 Al.xrd（对照参考文件）       | 1h   |
| P6   | `wyckoff.ts`：254 个空间群数据生成脚本 + 单元测试         | 1h   |
| P7   | UI（CrystalInput / Settings / XRDResult）                   | 2h   |
| P8   | 集成进 simulator 构建链路 + 端到端测试                      | 1h   |

**总计约 10h**（不含二期 FF.dat 精确解码）。

---

## 8. 风险与开放问题

| 风险                                                 | 影响             | 缓解                                   |
| ---------------------------------------------------- | ---------------- | -------------------------------------- |
| IUCr 标准系数与原程序厂商系数有出入                  | 绝对强度差 5~10% | 不影响定性；二期用 FF.dat 精确复刻     |
| `Factor.dat` 解码（F′F″）未完全验证              | F′F″ 修正缺失  | 二期处理；当前用标准 F′F″ 表（IUCr） |
| Wyckoff 文本文件 → TS 转换脚本                      | 数据格式转换     | 一次性脚本，人工抽查验证               |
| 现有 jQuery 模块（xrd_simulator）与新 React 模块共存 | 代码风格不一致   | 保留旧模块至单独迁移完；新模块独立     |
