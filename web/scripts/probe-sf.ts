/**
 * 探针 v2：直接读 Al.cord 文本（避开 samples/index.ts 的 ?raw 导入链），
 * 调用 structureFactor 打印 Al (400) 在 B=0.8 / CuKa1 下的 re/im/|F|²。
 * 手工预期（s²=0.24582, D=0.821477, f₀=5.736578, f′=0.212, f″=0.246, Σcosφ=4）：
 *   M2 复数式 DW只乘f0 : re=19.69796 im=0.98400 |F|^2=388.98
 *   M3 反汇编直读      : re=19.56418 im=0.00000 |F|^2=382.76
 *   M4 现行web标量式   : re=19.56664 im=0.00000 |F|^2=382.85
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCord } from '../src/lib/xrd/crystal';
import { structureFactor } from '../src/lib/xrd/structure_factor';
import type { Crystal } from '../src/lib/xrd/types';

const alText = readFileSync(resolve(process.cwd(), 'src/data/samples/Al.cord'), 'utf8');
const crystal: Crystal = parseCord(alText);
for (const atom of crystal.atoms) atom.thermalB = 0.8;

const s = 1 / (2 * 1.0085); // (400) d=1.0085
console.log('atoms:', JSON.stringify(crystal.atoms));
console.log('sgKey:', crystal.sgKey, ' a=', crystal.a);

for (const form of ['legacy', 'complex'] as const) {
  const f = structureFactor(crystal, 4, 0, 0, {
    lambda: 1.54056,
    useThermal: true,
    useDispersion: true,
    dispersionMode: 'fidelity',
    dispersionForm: form,
    s,
  });
  const f2 = f.re * f.re + f.im * f.im;
  console.log(
    `dispForm=${form}: re=${f.re.toFixed(5)} im=${f.im.toFixed(5)} |F|^2=${f2.toFixed(3)}`,
  );
}
console.log('--- 手工预期 ---');
console.log('M2 复数式 DW只乘f0 : re=19.69796 im=0.98400 |F|^2=388.98');
console.log('M3 反汇编直读      : re=19.56418 im=0.00000 |F|^2=382.76');
console.log('M4 现行web标量式   : re=19.56664 im=0.00000 |F|^2=382.85');
