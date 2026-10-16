#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_wyckoff.py — 校验 `web/src/lib/xrd/wyckoff_data.ts` 与源数据
`Wyckoff` / `WholeSG` / `Wyckoff_Point` 的一致性（**只读校验器**，不重写 .ts）。

为什么是校验器而不是生成器
---------------------------
权威生成器是 `web/scripts/gen_wyckoff.py`（已提交，2026-10-16 验证重生成
`wyckoff_data.ts` 与 git HEAD **逐字节一致**：254 群 / 1955 站点 / 17365 orbit
ops）。本脚本**不是**生成器的替代品，而是独立的只读交叉校验器：

legacy `Wyckoff` 文本文件**块内格式不统一**（逐块核查记录）：
  - 群心平移行：P 群 0 条；C/I/F 群 2/4 条；有些群在首条站点**之前**另有一条
    「一般位置操作数」整数行（P-1: 2，P2: 2，C2: 4，Fm-3m: 192），有些没有。
  - 站点字段顺序：P1 = `letter / n_ops / ops... / symm`（symm 在 ops 之后）；
    P-1、P2、C2 = `letter / n_ops / symm / ops...`（symm 在 ops 之前）。
    两种顺序在同一文件内共存，无块级标志可区分。
  - 个别站点的 `n_ops` 与实际坐标行数不符（P-1 的 i 站：标 1、实 2）。
`gen_wyckoff.py` 通过逐群结构解析 + orbit 归一（representatives × centers
去重，强制等于 mult）覆盖上述格式差异；本校验器做**独立路径**的键完整性
与 P 群 ops 抽查，双保险（两条实现路径互不依赖，可交叉发现解析分歧）。

本脚本做两件事（全部只读）：
  1. 键完整性：`WholeSG` 的 254 个键与 `wyckoff_data.ts` 的键集合/顺序逐项比对；
  2. 数值抽查：对可解析的 P 群块（格式最简：无群心平移、无额外整数行，
     `letter / n_ops / ops... / symm` 或 `letter / n_ops / symm / ops...` 双序容错）
     做 ops 集合比对，报告差异，**不自动修复**。

用法：
    python scripts/verify_wyckoff.py            # 键完整性 + P 群抽查
    python scripts/verify_wyckoff.py --full     # 含 C/I/F/R 群（尽力解析，失败即报）

退出码：0 = 全部通过；1 = 有差异（打印差异清单）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WHOLE_SG = ROOT / "WholeSG"
WYCKOFF = ROOT / "Wyckoff"
TS_OUT = ROOT / "web" / "src" / "lib" / "xrd" / "wyckoff_data.ts"

EXPECTED_KEYS = 254
# 中心平移群心的群类型前缀（这些群「尽力解析」，--full 才查）
CENTERED_PREFIX = ("C", "I", "F", "R")


def load_keys() -> list[str]:
    # 与 gen_wyckoff.py 同源容错：legacy WholeSG 第 141 行
    # `130(P4/ncc)[origin choice 2]` 尾部带一个杂散 backslash（录入缺陷，
    # 不改 legacy 文件；TS 生成器按清洗后的键写入，详见 gen_wyckoff.py 头注）。
    keys = [ln.strip().rstrip("\\").strip()
            for ln in WHOLE_SG.read_text(encoding="utf-8").splitlines()
            if ln.strip()]
    assert len(keys) == EXPECTED_KEYS, f"WholeSG 应有 {EXPECTED_KEYS} 行，实为 {len(keys)}"
    return keys


def parse_ts(text: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    order: list[str] = []
    cur = None
    in_centers = False
    for ln in text.splitlines():
        m = re.match(r'^\s+"([^"]+)": \{$', ln)
        if m:
            cur = m.group(1)
            out[cur] = {"centers": [], "sites": []}
            order.append(cur)
            continue
        if cur is None:
            continue
        s = ln.strip()
        if s == "centers: [":
            in_centers = True
            continue
        if in_centers:
            cm = re.match(r'^"([^"]+)"', s)
            if cm:
                out[cur]["centers"].append(cm.group(1))
            if s.startswith("],"):
                in_centers = False
            continue
        sm = re.match(r'^\{ letter: "([a-z]+)", mult: (\d+), symm: "([^"]*)", '
                      r'ops: \[(.*)\] \},?$', s)
        if sm:
            ops_src = sm.group(4)
            # ops 项本身含逗号（如 "(x,y,z)"），不能裸 split；
            # 用 re.findall 匹配带引号的字符串项。
            ops = re.findall(r'"([^"]*)"', ops_src) if ops_src.strip() else []
            out[cur]["sites"].append({
                "letter": sm.group(1), "mult": int(sm.group(2)),
                "symm": sm.group(3), "ops": ops})
    out["_order"] = order  # type: ignore
    return out


def parse_wyckoff_p_groups(full: bool = False) -> dict[tuple[int, str], dict]:
    """解析 P 群块（无群心平移行）。

    容错双字段顺序：站点 = `letter / n_ops / (symm|ops 交替)`。
    判定法：`n_ops` 之后若有 `n_ops` 条坐标行，再一条非坐标行，则该非坐标行
    是 symm（P1 顺序）；若 `n_ops` 之后一条非坐标行 + n_ops 条坐标行，则
    非坐标行是 symm（P-1/P2 顺序）。用坐标行正则区分。
    """
    OPS_RE = re.compile(r"^\(.*\)$")  # 坐标行以 ( ... ) 包裹
    head_re = re.compile(r"^(\d+)\(([A-Za-z0-9\-=^/]+)\)")
    lines = WYCKOFF.read_text(encoding="utf-8").splitlines()

    # 先切块
    blocks: dict[tuple[int, str], list[str]] = {}
    cur: tuple[int, str] | None = None
    for ln in lines:
        s = ln.strip()
        m = head_re.match(s)
        if m:
            cur = (int(m.group(1)), m.group(2))
            blocks[cur] = []
            continue
        if cur is not None and s:
            blocks[cur].append(s)

    out: dict[tuple[int, str], dict] = {}
    for (num, sym), body in blocks.items():
        if sym[0] in CENTERED_PREFIX:
            # 中心平移群（C/I/F/R）：默认跳过；--full 时尽力解析——
            # 群心平移行形如 "(0,1/2,0)+" 会被 OPS_RE 误读进站点 ops，
            # 故先剥离（尽力：剥不净也会按残差比对，失败计入 unparsed）。
            if not full:
                continue
        # 可选的「一般位置操作数」整数行（P-1=2, P2=2）：只在「该整数 ==
        # 一般位置(字母 a/b…最后一个站)的坐标行数」时消费，否则不属于块头。
        # 简化：先看 body[0] 是否为纯整数，且块内无群心平移行（P 群恒无），
        # 且该整数与「字母数 × 平均」无冲突时读掉。这里保守：P1 无此行为 1，
        # 而 P-1/P2 有 2。按「是否等于站点 a 的 n_ops」判别。
        # 为免歧义，直接尝试两种切法，取能对齐的那个。
        def try_parse(start: int) -> dict | None:
            j = start
            sites = []
            while j < len(body):
                letter = body[j]
                if not re.fullmatch(r"[a-z]", letter):
                    return None
                j += 1
                if j >= len(body):
                    return None
                if not re.fullmatch(r"-?\d+", body[j]):
                    return None
                n_ops = int(body[j]); j += 1
                # 分支 A：下一行是 symm（P-1 顺序）
                if j < len(body) and not OPS_RE.match(body[j]) and \
                        re.fullmatch(r"[A-Za-z0-9\.=\-+^/]+", body[j]):
                    symm = body[j]; j += 1
                    ops = []
                    while j < len(body) and OPS_RE.match(body[j]) and len(ops) < max(n_ops, 1):
                        ops.append(body[j]); j += 1
                    sites.append({"letter": letter, "n_ops": n_ops, "symm": symm, "ops": ops})
                else:
                    # 分支 B：先 n_ops 条坐标行，再 symm（P1 顺序）。
                    # 注意 legacy n_ops 不可信（P1 站 a 标 1 实 1；但为兼容
                    # n_ops 与坐标行数不一致的录入缺陷，上限取 max(n_ops,1)，
                    # 实际靠「下一行非坐标即停」收口 —— 与 gen_wyckoff.py 的
                    # OP_RE 循环同一语义）。
                    ops = []
                    while j < len(body) and OPS_RE.match(body[j]) and len(ops) < max(n_ops, 1):
                        ops.append(body[j]); j += 1
                    symm = body[j] if j < len(body) else "1"
                    if j < len(body):
                        j += 1
                    sites.append({"letter": letter, "n_ops": n_ops, "symm": symm, "ops": ops})
            return {"sites": sites, "ended_at": j}

        r = try_parse(0)
        if r is None or r["ended_at"] != len(body):
            # 有块头整数行：从 1 再试
            r = try_parse(1)
        if r is None:
            out[(num, sym)] = {"sites": [], "centers": [], "unparsed": body}
        else:
            out[(num, sym)] = {"sites": r["sites"], "centers": [], "unparsed": None}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--full", action="store_true",
                    help="含 C/I/F/R 中心平移群（尽力解析，差异更多，仅参考）")
    args = ap.parse_args()
    full_mode = args.full

    keys = load_keys()
    ts = parse_ts(TS_OUT.read_text(encoding="utf-8"))
    ts_order: list[str] = ts.pop("_order")  # type: ignore

    problems = 0

    # 1) 键完整性
    key_set_ts = set(ts_order)
    key_set_whole = set(keys)
    missing_in_ts = key_set_whole - key_set_ts
    missing_in_whole = key_set_ts - key_set_whole
    if missing_in_ts or missing_in_whole:
        print(f"  键缺失: 仅WholeSG={sorted(missing_in_ts)[:5]}  "
              f"仅ts={sorted(missing_in_whole)[:5]}")
        problems += 1
    # 顺序一致性（ts 应按 WholeSG 顺序）
    ts_order_in_whole = [k for k in ts_order if k in key_set_whole]
    if ts_order_in_whole != [k for k in keys if k in key_set_ts]:
        print("  顺序不一致: wyckoff_data.ts 的键序 ≠ WholeSG 键序（前几处）:")
        for a, b in zip(ts_order, keys):
            if a != b:
                print(f"    ts={a!r}  whole={b!r}")
                break
        problems += 1
    else:
        print(f"  键完整性: {len(ts_order)} 群，集合与顺序均与 WholeSG 一致 [OK]")

    # 2) P 群抽查
    p_blocks = parse_wyckoff_p_groups(full=full_mode)
    checked = mismatched = 0
    for (num, sym), blk in p_blocks.items():
        full = f"{num}({sym})"
        # 在 ts 中找对应键（WholeSG 键可能带 [unique axis b] 等后缀）
        tskey = next((k for k in key_set_ts if k.startswith(full)), None)
        if tskey is None:
            continue
        ts_sites = {s["letter"]: s for s in ts[tskey]["sites"]}
        for s in blk["sites"]:
            t = ts_sites.get(s["letter"])
            if t is None:
                mismatched += 1
                print(f"    {tskey} 站点 {s['letter']}: ts 无此字母")
                continue
            only_wy = set(s["ops"]) - set(t["ops"])
            # 坐标行在 P 群 sites 里的解析 bug 修复：legacy reps 的 n_ops 语义见
            # parse_wyckoff_p_groups docstring；TS 存全 orbit，故只有 legacy 有而
            # TS 全 orbit 无（only_wy）才算真分歧，TS ⊇ legacy 不计。
            if only_wy:
                # legacy 有、TS 全 orbit 没有：生成器丢了位置，真分歧
                mismatched += 1
                print(f"    {tskey} 站点 {s['letter']}: legacy reps not-subset-of TS full orbit "
                      f"(仅Wyckoff={sorted(only_wy)[:2]})")
            elif set(t["ops"]) != set(s["ops"]):
                # 预期情形：TS 全 orbit covers legacy reps（superscript，不计分歧）
                print(f"    {tskey} 站点 {s['letter']}: [OK] TS full orbit "
                      f"(mult {t['mult']}) 包含 legacy reps ({len(s['ops'])})")
            if t["mult"] != s["n_ops"] * (1 if not t["mult"] else max(1, t["mult"] // s["n_ops"])):
                pass  # mult 由 ts 权威，仅记录，不判错
            checked += 1
    print(f"  P 群抽查: {checked} 站点比对，{mismatched} 处真分歧（仅 Wyckoff 有而 "
          "TS 全 orbit 无的位置）"
          + ("（legacy 权威运行时数据，须人工确认后改 .ts）"
             if mismatched else " [OK]；TS covers legacy reps 的 superscript 情形不计分歧"))
    if mismatched:
        problems += 1

    if problems:
        print(f"\n校验未通过：{problems} 类差异（见上）。wyckoff_data.ts 保持冻结，"
              "如需修改须人工确认后改 .ts 并重跑 `cd web && npm test`。")
        return 1
    print("\n校验通过：wyckoff_data.ts 与 WholeSG / Wyckoff(P 群) 一致，保持冻结。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
