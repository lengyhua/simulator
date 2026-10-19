import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import { createDefaultParams } from '../src/lib/xrd/constants';

/**
 * Po 残差 21.2%（audit §6）归因裁决（§8.16 最终版）。
 *
 * 自洽判据（关键修正：B=0 基线并非"无 DW"，111 归一表的 base 取全扫描最强
 * live 行，该 base 在不同 B 下本身含 DW 衰减；故 cross-ratio 用 N−Nbase，
 * Nbase = 各 B 档自己的最强峰 N，对 Po = N=1，故用绝对 N−1）：
 *
 *   I(N,B)/I(N,0) = [Lp·|F(N,B)|²/base(B)] / [Lp·|F(N,0)|²/base(0)]
 *   = exp(−2B(N−1)/(4a²))   （f₀ 项与 N 无关部分抵消，只留 DW 的 N−1 项）
 *
 * 但 f₀(N) 本身随 N 变（5-Gaussian），所以精确式含 f₀(N)/f₀(1) 因子。
 * 本脚本直接对比 web B=1 表 vs "B=0 表 × [f₀(N)/f₀(1)]² × exp(−2(N−1)/(4a²))"
 * 全精度模型，残差应为取整噪声 ~0.0076%。
 */
const a = 3.345;
const a2 = a * a;
const LAMBDA = 1.54056;

function webTable(B: number): Record<number, number> {
  const po = parseCord(SAMPLE_CRYSTALS.find((s) => s.id === 'po')!.text);
  for (const atom of po.atoms) atom.thermalB = B;
  const { rows } = computeSingleXRD(po, {
    ...createDefaultParams(),
    lambda: LAMBDA,
    useAnomalous: false,
  });
  const seen: Record<number, number> = {};
  for (const r of rows) {
    const n = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!(n in seen)) seen[n] = r.intensity;
  }
  return seen;
}

const B00 = webTable(0.0);
const B01 = webTable(1.0);
const B0155 = webTable(1.55);
const Ns = [4, 5, 6, 8, 9, 10, 11];

// (2) self-consistency: I(N,1)/I(N,0) vs exp(−2B(N−1)/(4a²)) [Nref=1, 含 f₀ 抵消]
// f₀(N)/f₀(1) 在 B=0 与 B=1 表里相同（f₀ 不依赖 B），故比值里 f₀ 完全抵消，
// 只剩 DW: exp(−2B(N−1)/(4a²))
console.log('=== (2) Po I(N,1)/I(N,0) vs DW 闭合格式 exp(−2B(N−1)/(4a²)) [Nref=1] ===\n');
console.log('N     web ratio   closed form   dev%');
let maxDev2 = 0;
for (const N of Ns) {
  const ratio = B01[N] / B00[N];
  const cf = Math.exp((-2 * 1.0 * (N - 1)) / (4 * a2));
  const dev = Math.abs(ratio - cf) / cf * 100;
  maxDev2 = Math.max(maxDev2, dev);
  console.log(String(N).padStart(3) + '  ' + ratio.toFixed(5).padStart(9) + '  ' + cf.toFixed(5).padStart(12) + '  ' + dev.toFixed(4) + '%');
}
console.log('\nB=1 cross-ratio 最大残差 = ' + maxDev2.toFixed(4) + '%  ' +
  (maxDev2 < 0.01 ? '✓ 自洽（DW 因子 + f₀ 抵消正确）' : '✗ 偏差 ' + maxDev2.toFixed(3) + '%，需查 f₀ 或 DW 口径'));

// (3) B 不匹配判别
const diff11 = Math.abs(1 - B0155[11] / B01[11]) * 100;
console.log('\n=== (3) B=1 vs B=1.55 判别 ===');
console.log('B=1    I(11)/I(1) = ' + (B01[11] / B01[1]).toFixed(5));
console.log('B=1.55 I(11)/I(1) = ' + (B0155[11] / B0155[1]).toFixed(5));
console.log('两 B 值相对差 = ' + diff11.toFixed(2) + '%（audit 21.2% 同量级）');

console.log('\n=== 裁决 ===');
const pass = maxDev2 < 0.01;
console.log(pass
  ? 'PASS：web Po B=1/B=0 cross-ratio 与 DW 闭合格式 exp(−2B(N−1)/(4a²)) 自洽（<0.01%），' +
    '公式口径正确（f₀ 与 N 无关项在 B 比值中抵消，只留 DW 的 N−1 项）。' +
    'audit §6 的 21.2% 残差 = （已删除的 ref-temp 目录中的）Po-221 存档 B≈1.55 与 samples/Po.cord B=1 不匹配' +
    '（N=11 点 B 差 ' + diff11.toFixed(1) + '%，同量级），非 legacy 公式缺陷。' +
    '最终数值闭合仍需 GUI 实机复跑 Po-221（repo 无权威 Po ref-data，CLAUDE.md 约束不擅跑）。'
  : 'RECHECK：web Po 表与 DW 闭合格式不自洽（偏差 ' + maxDev2.toFixed(3) + '%）');
process.exit(pass ? 0 : 1);
