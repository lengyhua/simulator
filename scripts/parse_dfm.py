#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Delphi 二进制 DFM 资源解析器（CalcXRD.exe）
==========================================
从 .rsrc 中提取 RCDATA 资源，按 Delphi TWriter 的二进制格式解析成文本 DFM。

实测确定的格式（CalcXRD.exe 实证，非教科书假设）：
  RCDATA  = b'TPF0' + <类名> + <对象名> + <属性流> + 0x00
  子组件  = <类名> + <对象名> + <属性流> + 0x00     （平铺，无前缀字节）
  属性    = <名长><属性名> + <值标记> + <值数据>
  值标记  : 0x01 vaList   0x02 vaInt8  0x03 vaInt16 0x04 vaInt32 0x05 vaExtended(80位)
            0x06 vaString 0x07 vaIdent 0x08 vaFalse 0x09 vaTrue 0x0A vaBinary
            0x0B vaSet    0x0C vaLString 0x0D vaNil 0x0E vaCollection 0x0F vaSingle
            0x10 vaCurrency 0x11 vaDate 0x12 vaWString 0x13 vaInt64 0x14 vaUTF8String
  vaList  = 若干 <len><str> 项，以 0x00 结束（TStrings）
  字符串  = 1 字节长度 + 字节

用法: python scripts/parse_dfm.py [--all]
"""
import struct
import sys

EXE = r"D:\Projects\CalcXRD\CalcXRD.exe"

MARKERS = {
    0x01: "vaList", 0x02: "vaInt8", 0x03: "vaInt16", 0x04: "vaInt32",
    0x05: "vaExtended", 0x06: "vaString", 0x07: "vaIdent", 0x08: "vaFalse",
    0x09: "vaTrue", 0x0A: "vaBinary", 0x0B: "vaSet", 0x0C: "vaLString",
    0x0D: "vaNil", 0x0E: "vaCollection", 0x0F: "vaSingle", 0x10: "vaCurrency",
    0x11: "vaDate", 0x12: "vaWString", 0x13: "vaInt64", 0x14: "vaUTF8String",
}


def rva2off(rva, sections):
    for name, va, vsize, raddr, rsize in sections:
        if va <= rva < va + max(vsize, rsize):
            return raddr + (rva - va)
    return None


def parse_resource_dir(d, base_off, rva_base, sections, out):
    off = base_off
    chars, ts, mj, mn, nnamed, nid = struct.unpack_from("<IIHHHH", d, off)
    off += 16
    for i in range(nnamed + nid):
        nameid, offset = struct.unpack_from("<II", d, off)
        off += 8
        if offset & 0x80000000:
            sub_off = rva2off(rva_base + (offset & 0x7FFFFFFF), sections)
            if sub_off is not None:
                parse_resource_dir(d, sub_off, rva_base, sections, out)
        else:
            data_off = rva2off(rva_base + offset, sections)
            if data_off is None:
                continue
            drva, dsize, _, _ = struct.unpack_from("<IIII", d, data_off)
            foff = rva2off(drva, sections)
            if foff is not None:
                out.append((nameid, foff, dsize))


def looks_like_class(s):
    """Delphi 类名判别：T + 大写字母开头，长度 2..40。"""
    return (2 <= len(s) <= 40 and s[0] == "T" and s[1].isupper()
            and all(c.isalnum() or c == "_" for c in s))


class DFMReader(object):
    def __init__(self, data, pos=0):
        self.d = data
        self.p = pos

    def byte(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def string(self):
        n = self.byte()
        if n == 0xFF:
            n = struct.unpack_from("<I", self.d, self.p)[0]
            self.p += 4
        s = self.d[self.p:self.p + n]
        self.p += n
        return s.decode("latin-1", "replace")

    def value(self, out):
        m = self.byte()
        if m == 0x02:
            out.append("%d" % self.byte())
        elif m == 0x03:
            out.append("%d" % struct.unpack_from("<H", self.d, self.p)[0]); self.p += 2
        elif m in (0x04, 0x13):
            fmt = "<I" if m == 0x04 else "<q"
            out.append("%d" % struct.unpack_from(fmt, self.d, self.p)[0])
            self.p += 4 if m == 0x04 else 8
        elif m == 0x05:
            man, ex = struct.unpack_from("<QH", self.d, self.p); self.p += 10
            v = man * 2.0 ** (((ex & 0x7FFF) - 16383) - 63) * (-1.0 if ex & 0x8000 else 1.0)
            out.append("ext:%.12g" % v)
        elif m == 0x0F:
            out.append("%.12g" % struct.unpack_from("<f", self.d, self.p)[0]); self.p += 4
        elif m in (0x06, 0x0C, 0x14):
            out.append("'%s'" % self.string())
        elif m == 0x12:
            n = self.byte()
            out.append("'%s'" % self.d[self.p:self.p + n].decode("utf-16-le", "replace"))
            self.p += n
        elif m == 0x07:
            out.append(self.string())
        elif m == 0x08:
            out.append("False")
        elif m == 0x09:
            out.append("True")
        elif m == 0x00:
            out.append("NULL")
        elif m == 0x0D:
            out.append("nil")
        elif m == 0x0B:  # vaSet: <len><str>... 以 0x00 结束（无计数字节）
            items = []
            while self.p < len(self.d) and self.d[self.p] != 0x00:
                n = self.byte()
                items.append(self.d[self.p:self.p + n].decode("latin-1", "replace"))
                self.p += n
            self.p += 1
            out.append("[%s]" % ",".join(items))
        elif m == 0x01:  # vaList: <标记><值>... 以 0x00 结束
            items = []
            while self.p < len(self.d) and self.d[self.p] != 0x00:
                vv = []
                self.value(vv)
                items.append("".join(vv))
            self.p += 1
            out.append("(" + " ".join("'%s'" % s.strip("'") for s in items) + ")")
        elif m == 0x0A:  # vaBinary
            n = struct.unpack_from("<I", self.d, self.p)[0]; self.p += 4 + n
            out.append("<%d bytes>" % n)
        elif m == 0x0E:  # vaCollection
            items = []
            while self.p < len(self.d) and self.d[self.p] != 0x00:
                items.append(self.d[self.p:self.p + 1].hex())
                break
            self.p += 1
            out.append("<collection>")
        else:
            raise ValueError("bad marker 0x%02x at %d" % (m, self.p - 1))

    def read_body(self, indent, out):
        """读一个对象的属性流，直到对象结束。

        实证规则（CalcXRD.exe）：
          - 普通 0x00 = vaSet/vaList 值的结束符 → 继续读下一个属性
          - 0x00 后紧跟 0x00 或 EOF 或「T+大写」类名 → 本对象属性流结束
        """
        while True:
            if self.p >= len(self.d):
                return
            if self.d[self.p] == 0x00:
                save = self.p
                self.p += 1
                if self.p >= len(self.d):
                    return
                if self.d[self.p] == 0x00:
                    self.p += 1
                    return
                nxt = self.d[self.p]
                if 0 < nxt < 64:
                    s = self.d[self.p + 1:self.p + 1 + nxt].decode("latin-1", "replace")
                    if looks_like_class(s):
                        return
                # 0x00 是某个 set/list 值的结束符，继续读属性
                continue
            pname = self.string()
            out.append("%s  %s = " % (indent, pname))
            self.value(out)
            out.append("\n")


def parse_dfm(blob):
    """RCDATA = TPF0 + <根类名> + <根对象名> + <根属性流> + 子组件平铺序列。"""
    if len(blob) < 8 or blob[:4] != b"TPF0":
        return None
    r = DFMReader(blob, 4)
    out = []
    try:
        cls = r.string()
        name = r.string()
        out.append("object %s: %s\n" % (name, cls))
        r.read_body("", out)
        # 子组件：<类名><对象名><属性流> 平铺，直到 EOF
        guard = 0
        while r.p < len(blob) and guard < 5000:
            guard += 1
            if blob[r.p] == 0x00:
                r.p += 1
                continue
            save = r.p
            try:
                ccls = r.string()
                cname = r.string()
                if not looks_like_class(ccls):
                    raise ValueError("not a class: %r" % ccls)
                out.append("  object %s: %s\n" % (cname, ccls))
                r.read_body("    ", out)
                out.append("  end\n")
            except Exception:
                # 重同步：向后找下一个「T+大写」类名起点
                r.p = save + 1
                q = r.p
                found = False
                while q < len(blob) - 4:
                    n = blob[q]
                    if 0 < n < 40:
                        s = blob[q + 1:q + 1 + n].decode("latin-1", "replace")
                        if looks_like_class(s) and blob[q + 1 + n] < 40 and \
                                blob[q + 1 + n] > 0:
                            r.p = q
                            found = True
                            break
                    q += 1
                if not found:
                    break
        out.append("end\n")
        return "".join(out)
    except Exception:
        return None


def main():
    show_all = "--all" in sys.argv
    d = open(EXE, "rb").read()
    pe = struct.unpack_from("<I", d, 0x3C)[0]
    nsec = struct.unpack_from("<H", d, pe + 6)[0]
    optlen = struct.unpack_from("<H", d, pe + 20)[0]
    so = pe + 24 + optlen
    sections = []
    for i in range(nsec):
        o = so + i * 40
        nm = d[o:o + 8].rstrip(b"\x00").decode("latin-1")
        vs, va, rs, ra = struct.unpack_from("<IIII", d, o + 8)
        sections.append((nm, va, vs, ra, rs))
    rsrc = [s for s in sections if s[0] == ".rsrc"][0]
    leaves = []
    parse_resource_dir(d, rsrc[3], rsrc[1], sections, leaves)

    ok = 0
    for nameid, foff, dsize in leaves:
        blob = d[foff:foff + dsize]
        txt = parse_dfm(blob)
        if not txt:
            continue
        ok += 1
        print("\n" + "=" * 92)
        print("### RCDATA off=%s size=%d -> DFM (%d chars)" % (hex(foff), dsize, len(txt)))
        print("=" * 92)
        print(txt if show_all else txt[:12000])
    print("\n解析成功 %d / %d 个 RCDATA 资源" % (ok, len(leaves)))


if __name__ == "__main__":
    main()
