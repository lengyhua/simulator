#!/usr/bin/env python3
"""Al F′F″ on/off numeric cross-check (033 待办 #1).

Goal: decide which anomalous-dispersion formula CalcXRD.exe implements,
using ref-data/single-xrd controlled records.

Ground-truth data (measured legacy program output):
  005 = F′F″ off, Thermal on,  L-P on, PeakShape on, q=0.1, Occup=1, B=1
        111:100000  200:64593  220:20709  311:12060  222:10511  400:7401
  001 = F′F″ on,  Thermal on,  L-P on, PeakShape on, q=0.1, Occup=1, B=1
        111:100000  200:62638  220:17760  311:9431   222:7972   400:4964
  006..009 = F′F″ off, with Thermal/L-P/PS subsets, B=1

Model (docs/ghidra-reverse-findings §1/§2, B=1):
  I(hkl) = K · N_eff · Lp(2θ) · [f_eff · exp(−B·s²)]²
    N_eff = cubic multiplicity: N=3→8, 4→6, 8→12, 11→24, 12→8, 16→6
    Lp = (1+cos²2θ)/(sin²θ·cosθ)
    s² = sin²θ/λ², λ = 1.54056 (Cu Kα1)
    f₀(s) = Factor.dat 5-Gauss + c model (docs/data/factor_dat.csv, Al row)
    f_eff = off: f₀(s);  on: candidate dispersion formulas below

The per-peak ratio R = I(001)/I(005) cancels K·N_eff·Lp·DW, leaving
R = [f_on/hkl]² / [f_off/hkl]² = [f_eff_on(f₀(s),FP,FDP) / f₀(s)]²
— a clean discriminant between candidate dispersion formulas, independent
of the normalization scale.

Sources: FF.dat Al CuKα1 = F′=0.212 F″=0.246 (docs/data/ff_dat.csv,
verified against raw FF.dat bytes); Factor.dat Al a1..b5,c
(docs/data/factor_dat.csv); ground truth in ref-data/single-xrd/001..009.
"""
import csv, math, struct

LAMBDA = 1.54056
A = 4.0339

MULT = {3: 8, 4: 6, 8: 12, 11: 24, 12: 8, 16: 6}
PKS  = [(3,38.630,"111"),(4,44.900,"200"),(8,65.380,"220"),
        (11,78.590,"311"),(12,82.830,"222"),(16,99.600,"400")]
I005 = [100000,64593,20709,12060,10511,7401]
I001 = [100000,62638,17760, 9431, 7972, 4964]

# FF.dat Al CuKα1: read raw bytes directly (authoritative)
EXE = r"D:\Projects\CalcXRD\FF.dat"
FF  = open(EXE,"rb").read()
rec = 12*104  # Z=13 → record index 12 (0-based: Z-1)
vals = struct.unpack_from("<12d", FF, rec+8)
FP, FDP = vals[0], vals[1]   # CuKα1 f′, f″
print(f"FF.dat Al CuKα1 (raw bytes): F′={FP} F″={FDP}")

# Factor.dat Al record (a1..a5, b1..b5, c)
fact = list(csv.DictReader(open(r"docs/data/factor_dat.csv", encoding="utf-8")))
al = next(x for x in fact if x["species"]=="Al")
c = [float(al[k]) for k in ("a1","b1","a2","b2","a3","b3","a4","b4","a5","b5","c")]
AA = [c[0],c[2],c[4],c[6],c[8]]
BB = [c[1],c[3],c[5],c[7],c[9]]
CC = c[10]
print(f"Factor.dat Al: Σa+c={sum(AA)+CC:.4f}  (expected ≈13)")

def f0(s):
    return sum(a*math.exp(-b*s*s) for a,b in zip(AA,BB)) + CC

def Lp(t2):
    t = math.radians(t2)/2
    return (1+math.cos(2*t)**2)/(math.sin(t)**2*math.cos(t))

def s_of(t2):
    return math.sin(math.radians(t2)/2) / LAMBDA

# ---- candidate dispersion formulas ----
def f_eff_on(f0v, which):
    if which == "legacy-docs":    # f₀ + F′ + 0.5·F″²/(f₀+F″)  (findings §2.2, instruction-verified)
        return f0v + FP + 0.5*FDP*FDP/(f0v + FDP)
    if which == "legacy-help":    # f₀ + F′ + 0.5·F″²/(f₀+F′)  (help formula 5)
        return f0v + FP + 0.5*FDP*FDP/(f0v + FP)
    if which == "legacy-no-den":  # f₀ + F′ + F″ + 0.5·F′²     (033 buggy-disasm claim)
        return f0v + FP + FDP + 0.5*FP*FP
    if which == "no-den2":        # f₀ + F′ + 0.5·F′²          (033 alt, no F″ term)
        return f0v + FP + 0.5*FP*FP
    if which == "exact-complex":  # |f₀+F′+i·F″|               (docs §3 / web impl)
        return math.hypot(f0v + FP, FDP)
    raise ValueError(which)

print("\n=== R(hkl) = I001/I005 predicted vs measured ===")
print(f"{'formula':16s} " + "  ".join(f"{lab:8s}" for _,_,lab in PKS) + "  maxΔ vs meas")
meas = [I001[i]/I005[i] for i in range(6)]
for which in ("legacy-docs","legacy-help","legacy-no-den","no-den2","exact-complex"):
    pred = [ (f_eff_on(f0(s_of(t2)),which)/f0(s_of(t2)))**2 for _,t2,_ in PKS ]
    maxd = max(abs(p-m) for p,m in zip(pred,meas))
    print(f"{which:16s} " + "  ".join(f"{p:8.4f}" for p in pred) + f"  {maxd:.4f}")
print(f"{'MEASURED':16s} " + "  ".join(f"{m:8.4f}" for m in meas))

print("\n=== Self-check: Factor.dat f₀ reproduces I005 (F′F″ off, B=1) ===")
print(f"{'peak':8s} {'f0(s)':8s} {'I_model':10s} {'I005':8s} {'dev%':7s}")
# K normalization: find K such that I_model(111) = 100000 (005 peak)
s111 = s_of(38.630)
K = 100000 / (MULT[3]*Lp(38.630)*math.exp(-s111*s111)**2*f0(s111)**2)
for i,(N,t2,lab) in enumerate(PKS):
    s = s_of(t2)
    Imod = K*MULT[N]*Lp(t2)*(f0(s)*math.exp(-s*s))**2
    dev = abs(Imod-I005[i])/I005[i]*100
    print(f"{lab:8s} {f0(s):8.4f} {Imod:10.1f} {I005[i]:8d} {dev:7.2f}")

print("\n=== DW (Thermal) effect isolated: I006 (Th off) vs I005 (Th on), both B=1 ===")
I006 = [100000,62480,17572, 9277, 7826, 4833]
print(f"{'peak':8s} {'I006/I005':10s} {'e^(-2s²)':10s}  {'exp(-2·B·s²) with B=1?'}")
for i,(N,t2,lab) in enumerate(PKS):
    s = s_of(t2)
    r = I006[i]/I005[i]
    dw = math.exp(-2*s*s)
    print(f"{lab:8s} {r:10.4f} {dw:10.4f}  {'≈' if abs(r-dw)<0.05 else '≠'}")

# ====================================================================
# x87 byte-level verification: FDIVP @ 0x47c83a / 0x478992
# Settle the denominator question definitively (docs §3.1 / findings §2.12).
# ====================================================================
EXE  = r"D:\Projects\CalcXRD\CalcXRD.exe"
B2   = open(EXE,"rb").read()
CODE_VA, CODE_RAW = 0x401000, 0x400
def raw_of(va):  return CODE_RAW + (va - CODE_VA)
def va_of(raw):  return CODE_VA + (raw - CODE_RAW)

REG_N = ["EAX","ECX","EDX","EBX","ESP","EBP","ESI","EDI"]

def addr_note(mod, rm, j):
    R = REG_N
    if 4 <= rm <= 6:
        sib = B2[j]; j += 1
        scale=(sib>>6)&3; idx=(sib>>3)&7; base=sib&7
        d = 0
        if mod==1: d=struct.unpack("<b",B2[j:j+1])[0]; j+=1
        elif mod==2: d=struct.unpack("<i",B2[j:j+4])[0]; j+=4
        elif mod==0 and base==5: d=struct.unpack("<I",B2[j:j+4])[0]; j+=4
        sf = ["","×1","×2","×4"][scale]
        note = f"[{R[base]} + {sf}{R[idx]} + {d:#x}]" if d else f"[{R[base]} + {sf}{R[idx]}]"
    else:
        if mod==0:
            if rm==5:
                d=struct.unpack("<I",B2[j:j+4])[0]; j+=4; note=f"[{d:#08x}]"
            else: note=f"[{R[rm]}]"
        elif mod==1:
            d=struct.unpack("<b",B2[j:j+1])[0]; j+=1; note=f"[{R[rm]}{d:+d}]"
        elif mod==2:
            d=struct.unpack("<i",B2[j:j+4])[0]; j+=4; note=f"[{R[rm]}{d:#08x}]"
    return note, j

def x87_mnem2(first, reg, mod):
    if mod==3:
        T={0xDE:{0:"FSUB",1:"FADDP",4:"FSUBR",5:"FADDP",6:"FDIV",7:"FDIVP"},
           0xD8:{0:"FADD",1:"FMUL",4:"FSUB",5:"FSUBR",6:"FDIV",7:"FDIVR"},
           0xDC:{0:"FMUL",1:"FCOM",2:"FCOMP",4:"FSUB",5:"FSUBR",6:"FDIV",7:"FDIVR"},
           0xDB:{0:"FIADD",4:"FISUB",6:"FIDIV"},
           0xDF:{6:"FDIV",7:"FDIVP"},
           0xDD:{0:"FST",1:"FSTP"}}
        m=T.get(first,{}).get(reg)
        if m is None:
            if first==0xD9 and 4<=reg<=7: return f"FLD ST({reg-4})"
            if first==0xD9 and reg in (8,10,12): return "FLD m32"
            return f"?{first:02X}/3/{reg}"
        dst=f"ST({reg-4})" if reg>=4 else "ST(0)"
        return f"{m} ST(0),{dst}" if first not in (0xDE,) else m
    if first==0xD9:
        if reg in (8,10,12): return "FLD m32"
        return f"?D9/m/{reg}"
    if first==0xDB:
        if reg==4: return "FISUB m16"
        if reg==0: return "FIADD m16"
        if reg==6: return "FIDIV m16"
        return f"?DB/m/{reg}"
    if first==0xDD:
        if reg==1: return "FSTP m32"
        if reg==0: return "FST m32"
        return f"?DD/m/{reg}"
    T={0xD8:{0:"FADD m32",1:"FMUL m32",4:"FSUB m32",5:"FSUBR m32",6:"FDIV m32",7:"FDIVR m32"},
       0xDC:{0:"FMUL m32",1:"FCOM m32",2:"FCOMP m32",4:"FSUB m32",5:"FSUBR m32",6:"FDIV m32",7:"FDIVR m32"},
       0xDE:{},
       0xDF:{6:"FDIV m32",7:"FDIVP m32"}}
    m=T.get(first,{}).get(reg)
    return m if m else f"?{first:02X}/m/{reg}"

def x87_scan(va_lo, va_hi, label):
    lo,hi = raw_of(va_lo), raw_of(va_hi)
    print(f"\n=== {label}  (VA {va_lo:#08x}..{va_hi:#08x}, {hi-lo} bytes) ===")
    print("  entering with ST(0)=f₀ (per docs §2.2 stack trace)")
    i = lo
    while i < hi:
        b=B2[i]; mr=B2[i+1]
        if b in (0xD8,0xD9,0xDB,0xDC,0xDD,0xDE,0xDF):
            mod=mr>>6; reg=(mr>>3)&7; rm=mr&7
            mn=x87_mnem2(b,reg,mod)
            note,j = (addr_note(mod,rm,i+2) if mod in (0,1,2) else ("", i+2))
            sib=""
            if mod in (0,1,2) and 4<=rm<=6:
                s=B2[i+2]; sc=(s>>6)&3; ix=(s>>3)&7; ba=s&7
                sib=f"  SIB scale={sc} idx={REG_N[ix] if sc else '-'} base={REG_N[ba]}"
            print(f"  VA {va_of(i):#08x}: {b:02X} {mr:02X}  {mn:16s} {note}{sib}")
            i=j
        elif b==0xE8:
            rel=struct.unpack_from("<i",B2,i+1)[0]
            print(f"  VA {va_of(i):#08x}: E8 call → 0x{va_of(i)+5+rel:#08x}")
            i+=5
        else:
            i+=1

x87_scan(0x47c7f2, 0x47c842, "single FUN_0047c6a0 F′/F″ branch (byte-level re-verification)")
x87_scan(0x47894a, 0x4789d8, "powder FUN_004787f8 F′/F″ branch (byte-level re-verification)")

# Constant 0.5f check
for va, lab in ((0x47ca84,"single 0.5f"),(0x478d18,"powder 0.5f")):
    r=raw_of(va)
    print(f"\n  {lab} @ 0x{va:08x}: {B2[r:r+4].hex(' ')}  f32={struct.unpack_from('<f',B2,r)[0]!r}")

