/**
 * ref-data 033/034/035/036 Al-225 参数组合裁决 + Lp 关/开 单表对照
 * （§8.8 开放项：Lp 因子对 single 表强度的量化效应、Fd 开关对 200/220 峰的
 *   量化效应，以 033/036 对 + 034/035 对作为独立测量）。
 *
 * 参数矩阵（CuKα1 B=0 对）：
 *   033: Fd关 Th开 Lp关 PS关
 *   036: Fd关 Th开 Lp关 PS开   ← 按 ref-data 登记，PS 对 single 表强度应无影响
 *
 * 参数矩阵（MoKα1 B=1 对）：
 *   034: Fd开 Th开 Lp开 PS开
 *   035: Fd关 Th开 Lp开 PS开
 *
 * 本脚本验证：
 *   (a) web Lp关 vs legacy 033：全峰 <0.01%（基线确认）
 *   (b) web Lp开 vs legacy 036：全峰 <0.01%（036 表值与 Lp开 口径一致；
 *       若 036 实际含 Lp 效应，Lp关 复算值会显著偏离 036，此时以 Lp开 为准）
 *   (c) Fd开 vs legacy 034 / Fd关 vs legacy 035（MoKα1 B=1）：≤0.1%
 *   (d) legacy 033 vs 036 差值 vs web Lp关 vs Lp开 比值：判定 036 是否
 *       实际含 Lp 效应（若 036/033 ≈ web Lp开/web Lp关，则 036 表值含 Lp，
 *       ref-data 登记「Lp关」有误，应更正为 Lp开）
 *
 * 裁决预期：
 *   若 036/033 ≈ web(Lp开)/web(Lp关)：036 ref-data 登记的「Lp关」是录入
 *   错误，036 实际 = Lp开 档，应更正 ref-data/036 参数行 Lp 列。
 *   若 036/033 ≈ 1：036 与 033 无差异，PS 开关对 single 表强度无影响
 *   （符合峰值归一 + Lp关 的口径），033/036 表值本应相同，差异说明
 *   两组是不同扫描条件（需查 2θ 窗口/网格参数）。
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

// (b) web Lp开 vs legacy 036
const p_lpOn_fdOff = peaks(0, 1.54056, false, true);
const dev036_lpOn = maxDev(p_lpOn_fdOff, LEG_036);
console.log('\n=== (b) web Lp开 Fd关 B=0 CuKα1 vs legacy 036 ===');
console.log('N=4:', p_lpOn_fdOff[4], 'legacy:', LEG_036[4], 'dev:', dev036_lpOn.toFixed(4) + '%');

// (c) Fd开/关 vs legacy 034/035（MoKα1 B=1，Lp开）
const p_lpOn_fdOn = peaks(1, 0.7193, true, true);
const p_lpOn_fdOff_m = peaks(1, 0.7193, false, true);
const dev034 = maxDev(p_lpOn_fdOn, LEG_034);
const dev035 = maxDev(p_lpOn_fdOff_m, LEG_035);
console.log('\n=== (c) web Lp开 Fd开/关 B=1 MoKα1 0.7193 vs legacy 034/035 ===');
console.log('Fd开 N=4:', p_lpOn_fdOn[4], 'legacy034:', LEG_034[4], 'dev:', dev034.toFixed(4) + '%');
console.log('Fd关 N=4:', p_lpOn_fdOff_m[4], 'legacy035:', LEG_035[4], 'dev:', dev035.toFixed(4) + '%');

// (d) 033/036 比值 vs Lp开/Lp关 比值
console.log('\n=== (d) legacy 036/033 vs web Lp开/Lp关（CuKα1 B=0）===');
console.log('N    036/033(legacy)  Lp开/Lp关(web)  是否≈');
let lpEffectConsistent = true;
for (const N of [4, 8]) {
  const legacyRatio = LEG_036[N] / LEG_033[N];
  const webRatio = p_lpOn_fdOff[N] / p_lpOff_fdOff[N];
  const close = Math.abs(legacyRatio - webRatio) / webRatio < 0.02;
  if (!close) lpEffectConsistent = false;
  console.log(`${N}   ${legacyRatio.toFixed(5)}       ${webRatio.toFixed(5)}   ${close ? '≈' : '≠'}`);
}

// 判定
if (lpEffectConsistent) {
  console.log('\n裁决：036 表值 ≈ 033 × Lp开/Lp关 比值 → 036 实际含 Lp 效应，');
  console.log('      ref-data/036 登记「Lp关」应为「Lp开」（录入错误），036 = Lp开 档。');
  console.log('      （PS 开关对 single 表强度无影响，符合峰值归一口径。）');
} else {
  console.log('\n裁决：036/033 比值 ≠ Lp开/Lp关 → 036 不是简单的 033+Lp开，');
  console.log('      可能 Lp关/PS开 组合本身产生差异，或两组是不同扫描参数。需人工核实。');
}

const pass = dev033_lpOff < 0.1 && dev036_lpOn < 0.1 && dev034 < 0.1 && dev035 < 0.1;
console.log('\n=== 总裁决 ===');
console.log(
  pass
    ? `PASS：033(Lp关)${dev033_lpOff.toFixed(4)}% / 036(Lp开)${dev036_lpOn.toFixed(4)}% / 034${dev034.toFixed(4)}% / 035${dev035.toFixed(4)}% 均 <0.1%`
    : `RECHECK：033=${dev033_lpOff.toFixed(4)}% 036=${dev036_lpOn.toFixed(4)}% 034=${dev034.toFixed(4)}% 035=${dev035.toFixed(4)}%`,
);
process.exit(pass ? 0 : 1);
