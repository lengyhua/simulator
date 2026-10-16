# -*- coding: utf-8 -*-
"""Capture all CalcXRD-related top-level windows with unique filenames."""
import ctypes
from ctypes import wintypes
from datetime import datetime
import os
import re
import sys

from PIL import Image, ImageGrab
from pywinauto import Desktop

from pathlib import Path

OUT_DIR = str(Path(__file__).resolve().parent / "tmp" / "peek")  # 自己的临时目录（git 已忽略），勿写 ref-temp/
user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32

PW_CLIENTONLY = 0x00000001
PW_RENDERFULLCONTENT = 0x00000002


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD), ("biWidth", wintypes.LONG), ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD), ("biBitCount", wintypes.WORD), ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD), ("biXPelsPerMeter", wintypes.LONG), ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD), ("biClrImportant", wintypes.DWORD),
    ]


def print_window_capture(hwnd, flags):
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    width, height = rect.right - rect.left, rect.bottom - rect.top
    if width <= 0 or height <= 0:
        return None, "empty rect"
    hDC = user32.GetWindowDC(hwnd)
    memDC = gdi32.CreateCompatibleDC(hDC)
    bmp = gdi32.CreateCompatibleBitmap(hDC, width, height)
    old = gdi32.SelectObject(memDC, bmp)
    ok = user32.PrintWindow(hwnd, memDC, flags)
    bi = BITMAPINFOHEADER()
    bi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bi.biWidth = width
    bi.biHeight = -height
    bi.biPlanes = 1
    bi.biBitCount = 32
    bi.biCompression = 0
    buf = ctypes.create_string_buffer(width * height * 4)
    lines = gdi32.GetDIBits(memDC, bmp, 0, height, buf, ctypes.byref(bi), 0)
    img = Image.frombuffer("RGBA", (width, height), buf, "raw", "BGRA", 0, 1)
    gdi32.SelectObject(memDC, old)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(memDC)
    user32.ReleaseDC(hwnd, hDC)
    if lines == 0:
        return None, "GetDIBits failed"
    # blank check: if fully transparent/black, treat as failure
    extrema = img.convert("L").getextrema()
    if extrema == (0, 0):
        return None, "blank capture (PrintWindow ok=%s)" % bool(ok)
    return img, "PrintWindow ok=%s size=%dx%d" % (bool(ok), width, height)


def screen_capture(hwnd):
    rect = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    if rect.right - rect.left <= 0 or rect.bottom - rect.top <= 0:
        return None, "empty rect"
    try:
        img = ImageGrab.grab(bbox=(rect.left, rect.top, rect.right, rect.bottom), all_screens=True)
        return img, "screen grab %dx%d" % (img.width, img.height)
    except Exception as e:
        return None, "screen grab failed: %s" % e


def slugify(t):
    s = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "_", t).strip("_")
    return s[:40] or "win"


def main():
    desk = Desktop(backend="win32")
    key = sys.argv[1].lower() if len(sys.argv) > 1 else None
    targets = []
    for w in desk.windows():
        try:
            t = w.window_text()
        except Exception:
            continue
        if not t or not t.strip():
            continue
        tl = t.lower()
        if key:
            if key in tl:
                targets.append((w.handle, t))
        elif ("calcxrd" in tl or "xrd" in tl or "wyckoff" in tl
                or "difraction" in tl or "diffraction" in tl or "help window" in tl):
            targets.append((w.handle, t))

    print("candidate windows: %d" % len(targets))
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    for h, t in targets:
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
        rect = wintypes.RECT()
        user32.GetWindowRect(h, ctypes.byref(rect))
        iconic = user32.IsIconic(h)
        visible = user32.IsWindowVisible(h)
        print("hwnd=%d pid=%d visible=%s minimized=%s rect=(%d,%d)-(%d,%d) title=%r"
              % (h, pid.value, bool(visible), bool(iconic),
                 rect.left, rect.top, rect.right, rect.bottom, t))
        if iconic or rect.right - rect.left <= 0:
            print("   skip capture (minimized or zero-size)")
            continue
        img = None
        info = ""
        for flags in (PW_RENDERFULLCONTENT, 0, PW_CLIENTONLY):
            img, info = print_window_capture(h, flags)
            if img is not None:
                info = "pw(flags=%d): %s" % (flags, info)
                break
        if img is None:
            img, info2 = screen_capture(h)
            if img is not None:
                info = "fallback " + info2
        if img is None:
            print("   capture FAILED (%s)" % info)
            continue
        out = os.path.join(OUT_DIR, "calcxrd-%s-%s.png" % (ts, slugify(t)))
        img.save(out)
        print("   saved %s [%s]" % (out, info))


if __name__ == "__main__":
    main()
