import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCord } from '../src/lib/xrd/crystal';
import { computeSingleXRD, formatSingleXrdRow } from '../src/lib/xrd/single_xrd';
import { createDefaultParams } from '../src/lib/xrd/constants';

/** 复现用户场景：默认参数 + samples/Al.cord → single XRD 表，与 legacy 对照。 */
const text = readFileSync(resolve(process.cwd(), 'src/data/samples/Al.cord'), 'utf-8');
const al = parseCord(text);
const params = createDefaultParams();
console.log('默认参数:', JSON.stringify({
  lambda: params.lambda,
  useLp: params.useLp,
  useThermal: params.useThermal,
  useAnomalous: params.useAnomalous,
  dispersionForm: params.dispersionForm,
  rangeMin: params.rangeMin,
  rangeMax: params.rangeMax,
}, null, 0));

const { header, rows } = computeSingleXRD(al, params);
console.log(`\n共 ${rows.length} 行\n`);
console.log(header);
console.log('');

// legacy 原程序输出（用户提供）：按 2θ 族的代表值
const legacy: Record<number, { twoTheta: number; intensity: number }> = {
  3: { twoTheta: 38.630, intensity: 100000 },
  4: { twoTheta: 44.900, intensity: 62638 },
  8: { twoTheta: 65.380, intensity: 17760 },
  11: { twoTheta: 78.590, intensity: 9431 },
  12: { twoTheta: 82.830, intensity: 7972 },
  16: { twoTheta: 99.600, intensity: 4964 },
};

console.log('N    web(2θ/I)            legacy(2θ/I)        I偏差');
console.log('-'.repeat(64));
let maxDev = 0;
for (const r of rows) {
  const N = r.h * r.h + r.k * r.k + r.l * r.l;
  const lg = legacy[N];
  if (!lg) continue;
  const dev = (Math.abs(Math.round(r.intensity) - lg.intensity) / lg.intensity) * 100;
  maxDev = Math.max(maxDev, dev);
  console.log(
    `${String(N).padStart(2)}  ${r.twoTheta.toFixed(3)}/${String(Math.round(r.intensity)).padStart(6)}` +
    `        ${lg.twoTheta.toFixed(3)}/${lg.intensity}` +
    `        ${dev.toFixed(4)}%`,
  );
}
console.log(`\n最大强度偏差: ${maxDev.toFixed(4)}%`);

// 用户附件文件中的异常行（禁反射 I=0）在当前引擎下是否存在？
const zeroRows = rows.filter((r) => Math.round(r.intensity) === 0);
console.log(`I=0 行数: ${zeroRows.length}（当前引擎 0.01 过滤后应为 0）`);

// 导出格式抽样（验证 2 位 Round）
console.log('\n导出格式抽样:');
for (const r of rows.slice(0, 2)) console.log(formatSingleXrdRow(r));
process.exit(0);
