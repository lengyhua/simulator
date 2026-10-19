#!/usr/bin/env python3
"""Linear x87 + E8 disassembly of FUN_0047c6a0 (CalcXRD.exe structure-factor
core). Confirms the exact F'/F'' correction and Lp post-processing instruction
sequence. Read-only: does not modify the binary.

Usage: python scripts/disasm_47c6a0.py
"""
import struct

EXE = r"D:\Projects\CalcXRD\CalcXRD.exe"
FUN_LO = 0x47c6a0
FUN_HI = 0x47ca77

# CODE section: VA 0x00001000, raw 0x00000400 → image VA 0x400000+0x1000 = 0x401000
CODE_RAW = 0x400
CODE_VA = 0x401000


def raw_of(va):
    return CODE_RAW + (va - CODE_VA)


DATA = open(EXE, "rb").read()
fstart = raw_of(FUN_LO)
fend = raw_of(FUN_HI)
body = DATA[fstart:fend]
n = len(body)
print(f"FUN_0047c6a0 body: raw {fstart:#08x}..{fend:#08x} = {n} bytes\n")

# ------------------------------------------------------------------ constants
for va in (0x47ca7c, 0x47ca80, 0x47ca84):
    off = raw_of(va)
    f32 = struct.unpack_from("<f", DATA, off)[0]
    print(f"  DAT_0x{va:08x} f32 = {f32!r}   raw = {DATA[off:off+4].hex(' ')}")

# ------------------------------------------------------------------ x87 decode
# Mnemonic tables (Intel SDM Vol. 2, x87):
T = {
    0xD8: {0: "FADD", 1: "FMUL", 4: "FSUB", 5: "FSUBR", 6: "FDIV", 7: "FDIVR"},
    0xDA: {0: "FCOMI", 1: "FCOM", 2: "FCOMP"},
    0xDB: {0: "FIADD", 1: "FICOM", 2: "FICOMP", 4: "FISUB", 5: "FISUBR", 6: "FIDIV", 7: "FIDIVR"},
    0xDC: {0: "FMUL", 1: "FCOM", 2: "FCOMP", 4: "FSUB", 5: "FSUBR", 6: "FDIV", 7: "FDIVR"},
    0xDE: {0: "FSUB", 4: "FSUBR", 6: "FDIV", 7: "FDIVR"},
    0xDF: {0: "FUCOMI", 1: "FUCOMP", 6: "FDIV", 7: "FDIVR"},
}


def x87_decode(b, mr, i):
    """Return (op, di_or_None, consumed)."""
    cls = b >> 4
    reg = (mr >> 3) & 7
    mod = mr >> 6
    rm = mr & 7
    di = None
    consumed = 2
    if mod in (0, 1, 2):
        di = struct.unpack_from("<i" if mod else "<I", body, i + 2)[0] & 0xFFFFFFFF
        consumed = 3 if mod == 1 else 5
    BASE = {0: "EAX", 1: "ECX", 2: "EDX", 3: "EBX", 4: "ESP", 5: "EBP", 6: "ESI", 7: "EDI"}
    opnd = None
    if mod in (0, 1, 2):
        # mod=00: rm=5 → [disp32 abs]; rm!=5 → [base] (32-bit, no SIB)
        # mod=01: [base + disp8]; mod=10: [base + disp32]
        if mod == 0 and rm != 5:
            opnd = f"[{BASE[rm]}]"
        elif mod == 1:
            opnd = f"[{BASE[rm]} + {di:+#08x}]"
        else:
            opnd = f"[{BASE[rm]} + {di:#08x}]"

    if b == 0xD9:
        if mod in (0, 1, 2):
            return (f"FLD m32 {opnd}" if opnd else "FLD m32", di, consumed)
        names = {0: "FLD1", 1: "FLDZ", 2: "FLDL2T", 3: "FLDPI",
                 4: "FLD ST(0)", 5: "FLD ST(1)", 6: "FLD m80", 7: "FLD m32",
                 8: "FXCH ST(0)", 9: "FXCH ST(1)"}
        return (names.get(reg, f"?D9 C{reg + 8:X}"), None, 2)

    if b == 0xDD:
        if mod == 3:
            if reg >= 4:
                return (f"{'FST' if reg == 4 else 'FSTP'} ST({reg - 4})", None, 2)
            return ("?DD/0" if reg == 0 else "?DD/1" if reg == 1 else f"?DD/{reg}", None, 2)
        op = "FST " if reg == 0 else ("FSTP " if reg == 1 else "?")
        return (f"{op}m32 {opnd}" if opnd else op, di, consumed)

    mnm = T.get(cls, {}).get(reg)
    if mnm is None:
        # DE/1, DE/5 mod=3 → FSTP ST(0)
        if b == 0xDE and reg in (1, 5) and mod == 3:
            return ("FSTP ST(0)", None, 2)
        return (f"?{b:02X}/{reg}", di, consumed)
    if mod == 3:
        dst = f"ST({reg - 4})" if reg >= 4 else "ST(0)"
        return (f"{mnm} ST(0),{dst}", None, 2)
    return (f"{mnm} ST(0),m32 {opnd}" if opnd else f"{mnm} ST(0)", di, consumed)


# ------------------------------------------------------------------ walk body
events = []  # (off, hexbytes, op, di)
i = 0
while i < n - 1:
    b = body[i]
    mr = body[i + 1]
    if b in (0xD8, 0xDA, 0xDB, 0xDC, 0xDD, 0xDE, 0xDF, 0xD9):
        op, di, consumed = x87_decode(b, mr, i)
        events.append((i, f"{b:02X} {mr:02X}", op, di))
        i += consumed
    else:
        i += 1

calls = []  # (off, target_image_va)
j = 0
while j < n - 4:
    if body[j] == 0xE8:
        rel = struct.unpack_from("<i", body, j + 1)[0]
        calls.append((j, FUN_LO + j + 5 + rel))
        j += 5
    else:
        j += 1
CALL = {0x4029b4: "fcos", 0x4029dc: "fsin", 0x4029ec: "fmod",
        0x4029c4: "FADD80", 0x427170: "Round"}

# ------------------------------------------------------------------ dump
def dump(lo, hi, label):
    print(f"\n=== {label}  (body off {lo}..{hi}) ===")
    mg = [(off, f"[X87] {op}") for off, hx, op, di in events if lo <= off < hi]
    mg += [(j, f"[E8 ] call {CALL.get(t, hex(t))}") for j, t in calls if lo <= j < hi]
    mg.sort(key=lambda x: x[0])
    for off, line in mg:
        print(f"  off {off:4d}: {line}")


dump(340, 470, "F' dispersion-correction branch")
dump(500, 983, "Lp / intensity post-processing loop")

# ------------------------------------------------------------------ FDIV audit
fdivs = [e for e in events if "FDIV" in e[2] or "FIDIV" in e[2]]
print(f"\nFDIV/FIDIV total in body: {len(fdivs)}")
for off, hx, op, di in fdivs:
    print(f"  off {off:4d}: {op}  di={di:#08x}" if di else f"  off {off:4d}: {op}")
