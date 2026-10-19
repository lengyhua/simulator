import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD } from '../src/lib/xrd/single_xrd';
import { SAMPLE_CRYSTALS } from '../src/data/samples';
import { createDefaultParams } from '../src/lib/xrd/constants';

/** 缺陷 #11 定案验证（M3 落地后）：legacy MoKα1 用笔误值 0.71930。
 *  ref-data 019（Al B=1, MoKα1）5 峰对照，0.71930 vs 0.70930。 */
const al = parseCord(SAMPLE_CRYSTALS.find((s) => s.id === 'al')!.text);
for (const atom of al.atoms) atom.thermalB = 1;

// ref-data 019_Al-225.md peaks (B=1, MoKα1, Fd/Th/Lp/PS on, q=0.1)
// 111=100000, 200=64894, 220=20349, 311=?, 222=?, 400=?
// 019 table: (200)=64894, (220)=20349 — need 311/222/400 values
const legacy: Record<number, number> = { 4: 64894, 8: 20349 };

function peaksAt(lambda: number): Record<number, number> {
  const { rows } = computeSingleXRD(al, {
    ...createDefaultParams(),
    lambda,
    useAnomalous: true,
    useThermal: true,
  });
  const out: Record<number, number> = {};
  for (const r of rows) {
    const N = r.h * r.h + r.k * r.k + r.l * r.l;
    if (!(N in out)) out[N] = Math.round(r.intensity);
  }
  return out;
}

console.log('=== 缺陷 #11 定案：MoKα1 = 0.71930 (legacy 笔误值) 实证 ===\n');
console.log('N    0.71930(web)  0.70930(web)  legacy(019)');
console.log('-'.repeat(40));
const pTypo = peaksAt(0.7193);
const pCorrect = peaksAt(0.7093);
let maxDevTypo = 0, maxDevCorrect = 0;
for (const N of [4, 8]) {
  const dTypo = Math.abs(pTypo[N] - legacy[N]) / legacy[N] * 100;
  const dCorrect = Math.abs(pCorrect[N] - legacy[N]) / legacy[N] * 100;
  maxDevTypo = Math.max(maxDevTypo, dTypo);
  maxDevCorrect = Math.max(maxDevCorrect, dCorrect);
  console.log(`${N}    ${pTypo[N]}  ${pCorrect[N]}  ${legacy[N]}  (typo dev ${dTypo.toFixed(4)}%, correct dev ${dCorrect.toFixed(4)}%)`);
}
console.log(`\nλ=0.71930 (legacy typo): max dev ${maxDevTypo.toFixed(4)}%`);
console.log(`λ=0.70930 (correct):     max dev ${maxDevCorrect.toFixed(4)}%`);
const pass = maxDevTypo < 0.1 && maxDevCorrect >= 0.1;
console.log(pass ? '\nPASS: 0.71930 显著更优，缺陷 #11 定案确认' : '\nFAIL: 需复核');
process.exit(pass ? 0 : 1);
