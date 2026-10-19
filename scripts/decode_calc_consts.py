#!/usr/bin/env python3
"""decode_calc_consts.py — 从 CalcXRD.exe 直接解码 Ghidra 反汇编中引用的浮点常量。

用法:
    python decode_calc_consts.py 0x478d0c f32 [0x478d10 f32 ...]
    python decode_calc_consts.py --dump 0x478d00 0x50      # 原始字节转储

背景: Ghidra 反汇编显示 `FLD extended double ptr [0x00478d28]` 等指令,
但反编译器不展开常量值; 本脚本按 PE 节表把 VA 映射回文件偏移直接读取,
支持 Delphi 的 float(4B) / double(8B) / Extended(10B, 80 位 x87)。
"""
import struct as st
import sys

EXE = "CalcXRD.exe"


def load(exe=EXE):
    d = open(exe, "rb").read()
    e = st.unpack_from("<I", d, 0x3C)[0]
    assert d[e:e + 4] == b"PE\0\0"
    coff = e + 4
    nsec = st.unpack_from("<H", d, coff + 2)[0]
    optsz = st.unpack_from("<H", d, coff + 16)[0]
    opt = coff + 20
    imgbase = st.unpack_from("<I", d, opt + 28)[0]  # PE32
    secs = []
    for i in range(nsec):
        o = opt + optsz + i * 40
        name = d[o:o + 8].rstrip(b"\0").decode()
        vsize, vaddr, rawsize, rawptr = st.unpack_from("<IIII", d, o + 8)
        secs.append((name, imgbase + vaddr, vsize, rawptr, rawsize))
    return d, secs


def va2off(secs, va):
    for name, vaa, vsize, rawptr, rawsize in secs:
        if vaa <= va < vaa + max(vsize, rawsize):
            return rawptr + (va - vaa)
    return None


def f32(d, secs, va):
    o = va2off(secs, va)
    assert o is not None, hex(va)
    return st.unpack_from("<f", d[o:o + 4])[0]


def f64(d, secs, va):
    o = va2off(secs, va)
    assert o is not None, hex(va)
    return st.unpack_from("<d", d[o:o + 8])[0]


def ext80(d, secs, va):
    """80 位 x87 Extended: 1 符号 + 15 指数 + 64 位显式整数尾数"""
    o = va2off(secs, va)
    assert o is not None, hex(va)
    b = d[o:o + 10]
    mant = st.unpack("<Q", b[:8])[0]
    exp = st.unpack("<H", b[8:10])[0]
    if exp == 0 and mant == 0:
        return 0.0
    sign = -1.0 if exp & 0x8000 else 1.0
    return sign * mant * 2.0 ** ((exp & 0x7FFF) - 16383 - 63)


def main():
    d, secs = load()
    args = sys.argv[1:]
    if args and args[0] == "--dump":
        va = int(args[1], 0)
        n = int(args[2], 0)
        o = va2off(secs, va)
        print("raw %08x..%08x: %s" % (va, va + n, d[o:o + n].hex()))
        return
    if not args:
        # 默认: FUN_00478d48 粉末装箱/Lp 段的常量池
        args = [
            "0x478d0c f32", "0x478d10 f32", "0x478d14 f32",
            "0x478d28 e80", "0x478d34 f32", "0x478d38 e80", "0x478d44 f32",
        ]
    for a in args:
        va_s, kind = a.split()
        va = int(va_s, 0)
        if kind == "f32":
            v = f32(d, secs, va)
        elif kind == "f64":
            v = f64(d, secs, va)
        elif kind == "e80":
            v = ext80(d, secs, va)
        else:
            raise SystemExit("bad kind " + kind)
        o = va2off(secs, va)
        n = {"f32": 4, "f64": 8, "e80": 10}[kind]
        print("%-10s %-4s = %-24r raw=%s" % (va_s, kind, v, d[o:o + n].hex()))


if __name__ == "__main__":
    main()
