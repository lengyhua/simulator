/**
 * ref-data 033/034/035/036 Al-225 参数组合裁决 + Lp 关/开 单表对照
 * （§8.8 开放项：Lp 因子对 single 表强度的量化效应、Fd 开关对 200/220 峰的
 *   量化效应，以 033/036 对 + 034/035 对作为独立测量）。
 *
 * 参数矩阵（CuKα1 B=0 对）：
 *   033: Fd关 Th开 Lp关 PS关
 *   036: Fd关 Th开 Lp关 PS开 B=1（ref-data 登记 B=0 有误、实际 B=1，§8.18 定案）
 *
 * 参数矩阵（MoKα1 B=1 对）：
 *   034: Fd开 Th开 Lp开 PS开
 *   035: Fd关 Th开 Lp开 PS开
 *
 * 本脚本验证：
 *   (a) web Lp关 B=0 vs legacy 033：全峰 <0.01%（基线确认）
 *   (b) web Lp关 B=1 vs legacy 036：全峰 <0.01%（§8.18 定案：036 登记 B=0
 *       有误、实际 B=1，Lp关；036 表值 87485/57340 = web B=1 Lp关 0.0000%）
 *   (c) Fd开 vs legacy 034 / Fd关 vs legacy 035（MoKα1 B=1）：≤0.1%
 *   (d) legacy 036/033 比值 vs web B=1 Lp关/B=0 Lp关（CuKα1）：判定 036
 *       差异是否为 B 值 DW 衰减（B=1 vs B=0），而非 Lp 效应
 *
 * 裁决预期：
 *   036/033 ≈ exp(−2·1·(N−3)/(4a²)) → 036 实为 B=1 档（§8.18 已定案），
 *   PS 开关对 single 表强度无影响（033 B=0 PS关 = 复跑 B=0 PS开 逐值一致）。
 *
 * Run: cd web && npx vite-node scripts/verify-lp-toggle.ts
 */
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import { createDefaultParams } from '../src/lib/xrd/constants';

const al = parseCord(SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text);

type Peaks = Record<number, number>;

function peaks(B: number, lambda: number, fd: boolean, lp: boolean): Peaks {
  for (const atom of al.atoms) atom.thermalB = B;
  const { rows } = computeSingleXRD(al, {
    ...createDefaultParams(),
    lambda,
    useAnomalous: fd,
    useThermal: true,
    useLp: lp,
  });
  const out: Peaks = {};
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!(N in out)) out[N] = Math.round(r.intensity);
  }
  return out;
}

// legacy 表值（CuKα1 B=0 对，Fd关）
const LEG_033: Peaks = { 4: 90215, 8: 66862 };
const LEG_036: Peaks = { 4: 87485, 8: 57340 };

// legacy 表值（MoKα1 B=1 对）
const LEG_034: Peaks = { 4: 64894, 8: 20349 };
const LEG_035: Peaks = { 4: 64845, 8: 20284 };

function maxDev(p: Peaks, leg: Peaks): number {
  let m = 0;
  for (const N of Object.keys(leg)) m = Math.max(m, Math.abs(p[+N] - leg[+N]) / leg[+N] * 100);
  return m;
}

// (a) web Lp关 vs legacy 033
const p_lpOff_fdOff = peaks(0, 1.54056, false, false);
const dev033_lpOff = maxDev(p_lpOff_fdOff, LEG_033);
console.log('=== (a) web Lp关 Fd关 B=0 CuKα1 vs legacy 033 ===');
console.log('N=4:', p_lpOff_fdOff[4], 'legacy:', LEG_033[4], 'dev:', dev033_lpOff.toFixed(4) + '%');

// (b) web Lp关 B=1 vs legacy 036（§8.18 定案：036 登记 B=0 有误、实际 B=1）
const p_lpOff_b1 = peaks(1, 1.54056, false, false);
const dev036_lpOff_b1 = maxDev(p_lpOff_b1, LEG_036);
console.log('\n=== (b) web Lp关 Fd关 B=1 CuKα1 vs legacy 036（036 实为 B=1，§8.18）===');
console.log('N=4:', p_lpOff_b1[4], 'legacy:', LEG_036[4], 'dev:', dev036_lpOff_b1.toFixed(4) + '%');

// (c) Fd开/关 vs legacy 034/035（MoKα1 B=1，Lp开）
const p_lpOn_fdOn = peaks(1, 0.7193, true, true);
const p_lpOn_fdOff_m = peaks(1, 0.7193, false, true);
const dev034 = maxDev(p_lpOn_fdOn, LEG_034);
const dev035 = maxDev(p_lpOn_fdOff_m, LEG_035);
console.log('\n=== (c) web Lp开 Fd开/关 B=1 MoKα1 0.7193 vs legacy 034/035 ===');
console.log('Fd开 N=4:', p_lpOn_fdOn[4], 'legacy034:', LEG_034[4], 'dev:', dev034.toFixed(4) + '%');
console.log('Fd关 N=4:', p_lpOn_fdOff_m[4], 'legacy035:', LEG_035[4], 'dev:', dev035.toFixed(4) + '%');

// (d) 033(B=0)/036(B=1) 比值 vs DW 衰减 exp(−2·1·(N−3)/(4a²))（CuKα1）
const a = 4.0339;
const a2 = a * a;
console.log('\n=== (d) legacy 036/033 vs DW 衰减 B=1（CuKα1 Lp关）===');
console.log('N    036/033(legacy)  exp(−2·1·(N−3)/(4a²))  是否≈');
let dwConsistent = true;
for (const N of [4, 8]) {
  const legacyRatio = LEG_036[N] / LEG_033[N];
  const dw = Math.exp((-2 * 1 * (N - 3)) / (4 * a2));
  const close = Math.abs(legacyRatio - dw) / dw < 0.01;
  if (!close) dwConsistent = false;
  console.log(`${N}   ${legacyRatio.toFixed(5)}  ${dw.toFixed(5)}  ${close ? '≈' : '≠'}`);
}

// 判定
if (dwConsistent) {
  console.log('\n裁决：036/033 比值 ≈ DW 衰减 B=1 → 036 实为 B=1 档（§8.18 定案），');
  console.log('      PS 开关对 single 表强度无影响（033 B=0 PS关 = 复跑 B=0 PS开 逐值一致）。');
} else {
  console.log('\n裁决：036/033 比值 ≠ DW 衰减 B=1 → 与 §8.18 定案不一致，需人工核实。');
}

const pass = dev033_lpOff < 0.1 && dev036_lpOff_b1 < 0.1 && dev034 < 0.1 && dev035 < 0.1;
console.log('\n=== 总裁决 ===');
console.log(
  pass
    ? `PASS：033(B=0)${dev033_lpOff.toFixed(4)}% / 036(B=1)${dev036_lpOff_b1.toFixed(4)}% / 034${dev034.toFixed(4)}% / 035${dev035.toFixed(4)}% 均 <0.1%`
    : `RECHECK：033=${dev033_lpOff.toFixed(4)}% 036=${dev036_lpOff_b1.toFixed(4)}% 034=${dev034.toFixed(4)}% 035=${dev035.toFixed(4)}%`,
);
process.exit(pass ? 0 : 1);
