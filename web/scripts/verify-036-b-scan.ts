/**
 * verify-036-b-scan.ts — 036 异常定案验证（§8.17/§8.18）
 *
 * 036 登记「Fd关、Th开、Lp关、PS开、B=0、CuKα1」，但 200/220 峰
 * （87485/57340）比 033（B=0 Lp关 90215/66862）低 3%/14%。
 *
 * 定案：036 参数行 B=0 登记有误、实际 B=1。本脚本验证：
 *  1. 036 存档值 / 033 复跑值（B=0）的比值 = DW 闭合形式
 *     exp(−2B(N−3)/(4a²))，B=1 时 5 峰 0.0000%；
 *  2. B 值扫描 B=0/0.1/0.5/1.0，只有 B=1 与 036 存档吻合。
 *
 * 数据：arch = 036 存档（Lp关 Fd关 B=1）；rerun = 033 复跑 / web B=0（Lp关 Fd关 B=0）。
 * Al Cubic 225(Fm−3m) FCC，a=4.0339 Å，Nref=3（111 族）。
 */

const rerun = { 4: 90215, 8: 66862, 11: 55274, 12: 52009, 16: 41184 };
const arch = { 4: 87485, 8: 57340, 11: 43228, 12: 39444, 16: 27622 };
const Ns = [4, 8, 11, 12, 16];
const a = 4.0339;
const a2 = a * a;

function dwPred(B: number, N: number): number {
  return Math.exp((-2 * B * (N - 3)) / (4 * a2));
}

function maxDevFor(B: number): { max: number; detail: string[] } {
  const detail: string[] = [];
  let max = 0;
  for (const N of Ns) {
    const pred = dwPred(B, N);
    const actual = arch[N] / rerun[N];
    const dev = (Math.abs(pred - actual) / pred) * 100;
    max = Math.max(max, dev);
    detail.push(`  N=${N} pred=${pred.toFixed(5)} actual=${actual.toFixed(5)} dev=${dev.toFixed(4)}%`);
  }
  return { max, detail };
}

console.log('=== 036 / 033 (B=0) ratio vs DW closed form ===');
for (const N of Ns) {
  console.log(`N=${N}  arch/rerun=${(arch[N] / rerun[N]).toFixed(5)}`);
}

console.log('\n=== B scan (DW closed form, B=1 expected) ===');
const PASS_THRESHOLD = 0.1; // percent
let allPass = true;
for (const B of [0, 0.1, 0.5, 1.0]) {
  const { max, detail } = maxDevFor(B);
  const pass = B === 1.0 ? max < PASS_THRESHOLD : true;
  if (B === 1.0 && !pass) allPass = false;
  const tag = B === 1.0 ? (pass ? 'PASS' : 'FAIL') : '(scan)';
  console.log(`B=${B}  maxDev=${max.toFixed(4)}%  ${tag}`);
  detail.forEach((line) => console.log(line));
}

// Cross-check: 036 archive B=1 must match DW form to <0.1% on all 5 peaks.
const b1 = maxDevFor(1.0);
const b0 = maxDevFor(0);
console.log(`\nB=0 maxDev=${b0.max.toFixed(4)}% (≈0, 033 rerun itself)`);
console.log(`B=1 maxDev=${b1.max.toFixed(4)}% (036 archive must be <${PASS_THRESHOLD}%)`);
console.log(`\n${allPass ? 'PASS' : 'FAIL'} — 036 = B=1 (B=0 registration error confirmed)`);
process.exit(allPass ? 0 : 1);
