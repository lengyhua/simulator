#!/usr/bin/env python3
"""Definitive test of which intensity model reproduces the MoKα1 Fd-on/off
pair (docs/archive/ref-data/Al-temp section 2 vs 3) for Al, B=1, Thermal/L-P/PS all on.

Ratio I_on/I_off(hkl) = [f_on(hkl)/f_off(hkl)]²  — DW/mult/Lp cancel
(both records have identical B, L-P, PeakShape; only F′F″ differs).
f_off = f0(s) · e^{−B·s²}
f_on  = f_eff_model(f0, Fp, Fdp) · e^{−B·s_on²}
"""
import csv, math, struct

LAMBDA_Mo = 0.71930   # MoKa1, legacy hardcoded value (docs §2.10 G6 typo kept)
A = 4.0339

# Measured MoKα1 pair (docs/archive/ref-data/Al-temp)
PKS = [(3,17.770,'111'),(4,20.540,'200'),(8,29.210,'220'),(11,34.400,'311'),
       (12,35.980,'222'),(16,41.790,'400'),(19,45.740,'331'),(20,47.000,'224')]
I_on  = [100000, 64894, 20349, 10801,  8939, 4505, 2848, 2465]  # Fd on
I_off = [100000, 64845, 20284, 10748,  8890, 4469, 2820, 2439]  # Fd off
meas_ratio = [o/f for o,f in zip(I_on, I_off)]
print(f"{'hkl':5s} {'2θ':8s} {'I_on':>8s} {'I_off':>8s} {'ratio':8s}")
for (N,t2,lab),o,f,r in zip(PKS, I_on, I_off, meas_ratio):
    print(f"{lab:5s} {t2:8.3f} {o:8d} {f:8d} {r:8.4f}")

# FF.dat Al MoKα1 column (pair2 in file order; docs §2.9 loader: ItemIndex 4→pair2)
FF = open(r"D:\Projects\CalcXRD\FF.dat","rb").read()
rec = 12*104
v = struct.unpack_from("<12d", FF, rec+8)
pair2 = (v[4], v[5])   # MoKa1 f′,f″
print(f"\nFF.dat raw Al pair2 (MoKa1 column): f′={pair2[0]} f″={pair2[1]}")
FP, FDP = pair2

# Factor.dat Al
fact = list(csv.DictReader(open(r"D:\Projects\CalcXRD\docs\data\factor_dat.csv", encoding="utf-8")))
al = next(x for x in fact if x["species"]=="Al")
coef = [float(al[k]) for k in ("a1","b1","a2","b2","a3","b3","a4","b4","a5","b5","c")]
aa = [coef[0],coef[2],coef[4],coef[6],coef[8]]
bb = [coef[1],coef[3],coef[5],coef[7],coef[9]]
cc = coef[10]
f0 = lambda s: sum(a*math.exp(-b*s*s) for a,b in zip(aa,bb)) + cc

s_of = lambda t2, lam: math.sin(math.radians(t2)/2)/lam

def models():
    m = {}
    m["off-pure"]   = lambda f0v, *_: f0v
    m["denom_fdp"]  = lambda f0v, *_: f0v + FP + 0.5*FDP*FDP/(f0v + FDP)      # docs §3.1
    m["denom_fp"]   = lambda f0v, *_: f0v + FP + 0.5*FDP*FDP/(f0v + FP)      # help formula 5
    m["noden_033"]  = lambda f0v, *_: f0v + FP + FDP + 0.5*FP*FP            # 033 (rejected)
    m["noden2"]     = lambda f0v, *_: f0v + FP + 0.5*FP*FP
    m["complex"]    = lambda f0v, *_: math.hypot(f0v + FP, FDP)
    return m

print("\n=== Model A: single s² (DW uses same s² in on and off paths) ===")
print(f"{'model':10s} " + " ".join(f"{lab:8s}" for N,t2,lab in PKS) + "  maxΔ")
for name, fn in models().items():
    pred = []
    for (N,t2,lab) in PKS:
        s = s_of(t2, LAMBDA_Mo)
        off = f0(s)
        on = fn(f0(s))
        pred.append((on/off)**2)
    d = max(abs(p-m) for p,m in zip(pred, meas_ratio))
    print(f"{name:10s} " + " ".join(f"{p:8.4f}" for p in pred) + f"  {d:.4f}")

print("\n=== Model B: s² = 1/(4d²) for DW (findings §2.3) but s=sinθ/λ for f₀/dispersion ===")
s14 = lambda N: 1.0/(A*A*N)
for name, fn in models().items():
    if name == "off-pure":
        continue
    pred = []
    for (N,t2,lab) in PKS:
        sl = s_of(t2, LAMBDA_Mo)
        off = f0(sl)*math.exp(-s14(N))
        on  = fn(f0(sl))*math.exp(-s14(N))
        pred.append((on/off)**2)
    d = max(abs(p-m) for p,m in zip(pred, meas_ratio))
    print(f"B {name:10s} " + " ".join(f"{p:8.4f}" for p in pred) + f"  {d:.4f}")

# Also sanity: which MoKα1 dispersion value gives the measured 111 anchor?
# 111 ratio=1.0000 exactly (100000/100000) is the normalization anchor — not informative.
# The real test peaks are 200..400 where ratios deviate from 1.
print("\nNote: 111 ratio is normalization-anchored at exactly 1.0000 in all records;")
print("discriminating peaks are 200/220/311/222/400/331/224 (above).")
