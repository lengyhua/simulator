# CalcXRD.exe 反汇编结论（字节级）

> **本文件只保留结论与依据。** 按日期追加的取证过程、试算、被推翻的中间结论
> 已归档到 [`archive/ghidra-reverse-findings-process.md`](archive/ghidra-reverse-findings-process.md)。
>
> **项目定案总表（按物理主题组织）见 [`SETTLED.md`](SETTLED.md)** —— 新读者从那里开始。
> 本文保留的是「字节级证据在哪」这部分，供复核与二次逆向时查阅。

**方法**：Ghidra 12.1.4 headless + Java postScript（`ghidra-out2/*.java`），函数覆盖
54.4%→73.6%（FillGaps），4547 函数可检索；关键段落另用 capstone 5.0.7 直读字节复核。

**VA→file offset = `VA − 0x400C00`**（CODE 段 VA=0x1000 / RawOff=0x400）。
⚠ 不是 `VA − 0x400000` —— 曾因此得出无意义指令（2026-10-19 修正）。

---

## 1. 结论索引（G1–G12）

| # | 结论 | 字节级证据 |
|---|---|---|
| G1 | `Lp = (1+cos²2θ)/(sin²θ·cosθ)`，θ° = bin/200 | 粉末 0x478c25–0x478cfe + single 0x47c97e–0x47ca77；`FLD 2.0; FMUL θ; CALL fcos`×2 实锤 cos(2θ)；常量 1.0@0x478d14、2.0@0x478d10、π@0x478d38、180@0x478d44 |
| G2 | \|F\|² < **0.01** 直接清零，装箱前统一过滤 | extended 常量 0.01@0x478d28；0x478ad6–0x478b09；single 同阈值 0x47c648 |
| G3 | 色散实公式 `f₀+f′+0.5·f″²/(f₀+f″)`，**分母 f₀+f″**（非 help 的 f₀+F′） | 双路径同构：粉末 0x47894a–0x47899a + single 0x47c7f2–0x47c842；FDIVP@0x478992/0x47c83a；0.5f@0x478d18/0x47ca84；0x47c833 `DC 84 C3 60 39 00` FMUL 定分母槽为 f″ |
| G4 | **DW 乘在整个 f_eff 之后**（含色散项），全程实数标量 | single 0x47c885–0x47c8b4（`FLD B; FCHS; FMUL s²; CALL exp(0x4029c4); FMUL f_eff; FMUL occ`）+ 粉末同构；定稿点 0x47c8a9 |
| G5 | 选 FeKa1/FeKa 时色散读 **Co Kα1/Co Kα2 列** | FUN_0047907c `switch(ItemIndex)`：0→CuKa1、1→CuKa2、2→CoKa1、3→CoKa2、4→MoKa1、5→MoKa2 |
| G6 | **MoKa1 = 0.71930 笔误**硬编码（6 个 λ 均为 switch 内联 double） | FUN_00477d7c / FUN_0047c0bf 的 λ switch |
| G7 | 粉末图谱**无 1000 归一化**；1000.0f@0x47987c 实为网格线间距 | FUN_0047961a |
| G8 | single 表**无 100000 归一化**（全二进制搜不到该常量） | 全二进制常量扫描 + FUN_0047c0bf |
| G9 | 高斯核 **σ = q（度）**，399 点、峰顶 i=200、归一到 10000 | FUN_00479450 全汇编；200.0@0x479584、0.01@0x479588、2π@0x479594、10000.0@0x4795a0 |
| G10 | 枚举 h/k/l ∈ [−N..N]，N=f(2a/λ)；12000 上限；按 d **降序**；mult 隐含于逐条列举 | 0x478229–0x4782a7、0x478660–0x478743 |
| G11 | 2θ = **Single(Round(2θ·1000)/1000)**，报表取 2 位；装箱 0.01°/bin；窗 0.01°–100° | **字节级实读** 0x47875c–0x4787b5，见 §2；100.0@0x478d34 |
| G12 | 无峰形分支 `Pattern[Round(2θ×100)] += \|F\|²` **无范围检查** → >100° 越界写 | 0x478bcd–0x478c23 |

---

## 2. 2θ 量化（G11）字节级全迹

```
fld  [ebx+0x3fa8]                    ; λ
fdiv [0x4787e4 = 2.0]
fdiv [ebx+esi*8+0x27228]             ; / d  → sinθ
call 0x427170                        ; ArcSin(x) = ArcTan2(x, Sqrt(1−x²))
                                     ;   fsqrt@0x42718f, fpatan@0x4271b9
fmul [0x4787e4 = 2.0]                ; ×2
fld  [0x4787d0 = π]; fdivp           ; /π
fmul [0x4787dc = 180.0]              ; → 度
fmul [0x4787f4 = 1000.0]             ; → 毫度
call 0x402a10                        ; Round → Int64 (fistp qword)
fild qword; fdiv [0x4787f4 = 1000.0] ; 回除
fstp dword [ebx+esi*4+0x3e92c]       ; ★ 存为 Single（32 位）
```

**连带口径**：报表 d 由该报表角反算；Lp、\|F\|²·mult、高斯峰中心**全部在报表角上求值**。
因高斯核在中心取 1，0.01° 网格最大值 = 报表 I。→ `pipeline.ts` `legacyPowderReportAngle()`。

---

## 3. 其他关键例程地址

| 例程 | 地址 | 说明 |
|---|---|---|
| ArcSin | 0x427170 | `ArcTan2(x, √(1−x²))` |
| Round → Int64 | 0x402a10 | `fistp qword` |
| exp | 0x4029c4 | 精确 `f2xm1` range-reduction，等价于 `e^x`（残差 ~1e-14） |
| λ switch | FUN_00477d7c / FUN_0047c0bf | 6 个内联 double |
| 色散列 switch | FUN_0047907c | ItemIndex → FF.dat 列（含 G5 错配） |
| 高斯核生成 | FUN_00479450 | 399 点 / 归一 10000 |
| 粉末装箱 | FUN_0047961a | `scale=(画布高−60)/max` |
| `.xrd` 写出 format | VA 0x47a6e0 | `%9.4f%8d` |
| FF.dat 缺失处理 | Self+0x398 虚方法 `vtable+0xC8` | = **置灰**（`Enabled:=False`），非取消勾选 |
| Wyckoff 三段解析 | FUN_0047b960 / FUN_0047bb3c | 解析 `(x,y,z)` 为 3 个 double；**不在强度计算链** |

---

## 4. 数值取证速查

| 结论 | 数值依据 |
|---|---|
| MoKa1 笔误影响几何 | λ=0.71930 时 Al 全谱峰值残差 ≤0.005%；λ=0.70930 残差 0.152%（ref-data 019） |
| q = σ = 0.10° | `samples/Al.xrd` 首峰 2θ=38.630 实测 FWHM = 0.2355° → σ = FWHM/2.3548 |
| DW M3 形式 | Al B 扫描 35 点 ≤0.006%，闭合形式 0.000% |
| RTF 报表同式 | `001-Al.rtf` 三行对照残差 4.3e-8（= 报表 %.9f 截断） |
| Ce 缺陷外部校验 | IUCr CIF `dispersion_imag_cu` Ce f″=9.648 ↔ FF.dat 9.67 |
| Er 缺陷外部校验 | IUCr CIF Er f″=3.937 ↔ FF Kα₂ 3.948（Δ0.011），Kα₁ 9.943 差 5.995 |
| 岩盐计相位 | `docs/archive/ref-data/single-xrd/025_NaCl-225.md`：111 族 = 6829（最弱）、200 = 100000 |
| 导出落盘 | headless Edge + CDP：`Al.xrd` 184417 B，`downloadProgress state:"completed"` |

---

## 5. 不再维护于此的内容

以下内容已移出本文，需要时查对应位置：

- 定案总表（按主题） → [`SETTLED.md`](SETTLED.md)
- 按日期的取证过程、§8.1–§8.27 全部叙述 → [`archive/ghidra-reverse-findings-process.md`](archive/ghidra-reverse-findings-process.md)
- 参数/数据资产索引 → [`DATA-REFERENCE.md`](DATA-REFERENCE.md)
- 公式 LaTeX → [`formulas.md`](formulas.md)
- 缺陷保真清单 → [`SETTLED.md`](SETTLED.md) §7
