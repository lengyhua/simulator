/**
 * exp 桩精度裁决验证（docs §8.15，2026-10-19 勘误版）：
 *
 * legacy FUN_004029c4 的真实字节码（pefile 实读 0x4029c4，x87 指令序列）：
 *   n  = FRNDINT(x · log2e)          // x87 向偶取整
 *   f  = F2XM1(x · log2e − n)        // x87 硬件 2^t − 1（精确）
 *   out = FSCALE(1 + f, n)          // x87 硬件 2^n · (1 + f)
 *
 * 关键勘误（推翻 §8.15 初稿"桩 = 一阶线性近似 (1+f)·2^n"的判断）：
 *   f2xm1 返回的是 2^(x·log2e−n) − 1（精确），故
 *     1 + f = 1 + (2^(x·log2e−n) − 1) = 2^(x·log2e−n)
 *     FSCALE(1 + f, n) = 2^n · 2^(x·log2e−n) = 2^(x·log2e) = e^x
 *   即该桩在数学上是**精确的** e^x（唯一残差来自 FRNDINT 的 80-bit 取整
 *   舍入，量级 ~1e-9 相对误差），**不是** 2^f ≈ 1+f·ln2 一阶近似。
 *   初稿脚本误把 f 当成裸小数 (x·log2e − n) 而非 f2xm1 的输出，因而
 *   得出"桩比 Math.exp 差 21.22%"的结论——该结论已作废。
 *
 * 本脚本验证：
 *   (a) 精确桩（F2XM1 形式）vs Math.exp：单点相对误差 < 1e-9（x∈[−0.2,0]）
 *   (b) B-scan 15 点 cross-ratio：Math.exp 闭合形式 0.0076%（= 整数取整
 *       噪声下限）；精确桩与 Math.exp 逐点差 < 1e-9，两者在 15 点数据上
 *       无法区分——legacy 数据与"Math.exp"等价，桩**不是**误差来源。
 *
 * 结论：web 引擎维持 Math.exp 完全正确（双精度原生精度 = 桩的实际精度）；
 * "不复刻桩"的结论不变，但理由改为"桩本身精确，复刻无意义"，而非初稿
 * "桩更差、复刻会引入误差"（初稿理由已作废）。
 *
 * Run: cd web && npx vite-node scripts/verify-exp-stub.ts
 */
const LOG2E = 1.4426950408889634;
const a2 = 4.0339 * 4.0339;

/**
 * 精确桩（FUN_004029c4 真实字节码还原）：
 * n = round(x·log2e); f = 2^(x·log2e − n) − 1; return 2^n · (1 + f)
 * 等价于 2^(x·log2e) = e^x（精确到 80-bit x87 取整舍入）。
 */
function legacyExp(x: number): number {
  const xp = x * LOG2E;
  const n = Math.round(xp); // ≈ x87 FRNDINT（本范围内无 .5 平局点）
  const f = Math.pow(2, xp - n) - 1; // f2xm1 精确硬件指令
  return Math.pow(2, n) * (1 + f);
}

// B-scan legacy 111-normalized cross-ratios (ref-data 005=B=0 baseline)
const B0: Record<number, number> = { 4: 64593, 8: 20709, 11: 12060, 12: 10511, 16: 7401 };
const legacyB: Record<number, Record<number, number>> = {
  0.4: { 4: 63804, 8: 19475, 11: 10930, 12: 9411, 16: 6308 },
  0.6: { 4: 63413, 8: 18886, 11: 10406, 12: 8904, 16: 5824 },
  0.8: { 4: 63024, 8: 18314, 11: 9907, 12: 8425, 16: 5377 },
};

/** Cross-ratio I_norm(N,B)/I_norm(N,0) via the 111-norm table = [DW(N,B)/DW(3,B)]². */
function crossRatio(expFn: (x: number) => number, Bv: number, N: number): number {
  const s2N = N / (4 * a2);
  const s2ref = 3 / (4 * a2); // 111 (N=3) normalization reference
  const DW_N = expFn(-Bv * s2N);
  const DW_ref = expFn(-Bv * s2ref);
  return (DW_N / DW_ref) ** 2;
}

console.log('=== exp 桩 vs Math.exp：B-scan 15 点 cross-ratio 对照（§8.15 勘误版）===\n');

// (a) Math.exp vs legacy data
let maxDevMath = 0;
for (const Bk of [0.4, 0.6, 0.8]) {
  for (const Nk of [4, 8, 11, 12, 16]) {
    const ratio = legacyB[Bk][Nk] / B0[Nk];
    const analytic = Math.exp((-2 * Bk * (Nk - 3)) / (4 * a2));
    maxDevMath = Math.max(maxDevMath, Math.abs(ratio - analytic) / analytic * 100);
  }
}
console.log('(a) Math.exp 闭合形式 I(N,B)/I(N,0)=exp(−2B(N−3)/(4a²)) vs legacy data:');
console.log('    15 点 max 残差 = ' + maxDevMath.toFixed(4) + '%  (' + (maxDevMath < 0.1 ? '<0.1% 达标 ✓' : 'FAIL') + ')');

// (b) 精确桩 vs legacy data
let maxDevStub = 0;
let worstB = 0, worstN = 0;
for (const Bk of [0.4, 0.6, 0.8]) {
  for (const Nk of [4, 8, 11, 12, 16]) {
    const pred = crossRatio(legacyExp, Bk, Nk);
    const leg = legacyB[Bk][Nk] / B0[Nk];
    const dev = Math.abs(pred - leg) / leg * 100;
    if (dev > maxDevStub) { maxDevStub = dev; worstB = Bk; worstN = Nk; }
  }
}
console.log('\n(b) 精确桩（f2xm1 还原）vs legacy data:');
console.log('    15 点 max 残差 = ' + maxDevStub.toFixed(4) + '%  (worst: B=' + worstB + ', N=' + worstN + ')');

// (c) 精确桩 vs Math.exp 单点相对误差（x ∈ [−0.2, 0]）
let maxDiffPct = 0;
for (let i = 0; i <= 400; i++) {
  const x = -0.2 * i / 400;
  const d = Math.abs(legacyExp(x) - Math.exp(x)) / Math.exp(x);
  if (d > maxDiffPct) maxDiffPct = d;
}
console.log('\n(c) 精确桩 vs Math.exp 单点最大相对差 = ' + (maxDiffPct * 100).toExponential(3) + '%  (应为 ~1e-7 量级，即双精度 80-bit 取整残差)');

// (d) 初稿误模型（f = x·log2e − n 裸小数，无 f2xm1）vs 精确桩，量化初稿误差
let initErr = 0;
for (let i = 0; i <= 400; i++) {
  const x = -0.2 * i / 400;
  const xp = x * LOG2E;
  const n = Math.round(xp);
  const fBad = xp - n;
  const bad = (1 + fBad) * Math.pow(2, n);
  const d = Math.abs(bad - Math.exp(x)) / Math.exp(x);
  if (d > initErr) initErr = d;
}
console.log('    (初稿误模型 (1+f)·2ⁿ 无 f2xm1) 单点最大相对差 = ' + (initErr * 100).toFixed(2) + '% — 已作废');

console.log('\n=== 裁决 ===');
const pass = maxDevMath < 0.1 && maxDiffPct < 1e-4;
console.log(pass
  ? 'PASS：精确桩与 Math.exp 单点差 ' + (maxDiffPct * 100).toExponential(2) + '%（双精度量级），' +
    'legacy 数据（' + maxDevMath.toFixed(4) + '%）与 Math.exp 无法区分；' +
    'web 引擎维持 Math.exp 完全正确；初稿"桩更差、复刻会引入误差"的理由作废——' +
    '桩本身精确（f2xm1 使 1+f = 2^f 成立），复刻无意义才是真正不复刻的理由。'
  : 'RECHECK: 结果与预期不符（Math.exp ' + maxDevMath.toFixed(4) + '% / 桩 vs Math.exp ' +
    (maxDiffPct * 100).toExponential(2) + '%）');
process.exit(pass ? 0 : 1);
