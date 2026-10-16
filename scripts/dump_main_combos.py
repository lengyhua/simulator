# -*- coding: utf-8 -*-
"""Dump ALL comboboxes under the main 'Calculate XRD' window (single-pass enumeration)."""
import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32

WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E
CB_GETCOUNT = 0x0146
CB_GETCURSEL = 0x0147
CB_GETLBTEXT = 0x0148
CB_GETLBTEXTLEN = 0x0149

EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
EnumChildProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def get_text(hwnd):
    n = user32.SendMessageW(hwnd, WM_GETTEXTLENGTH, 0, 0)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.SendMessageW(hwnd, WM_GETTEXT, n + 1, buf)
    return buf.value


def get_class(hwnd):
    buf = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buf, 256)
    return buf.value


def find_window(title_sub):
    found = []
    def cb(hwnd, _):
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if title_sub.lower() == buf.value.lower():
            found.append((hwnd, buf.value))
        return True
    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found


def dump_combo(hwnd):
    cnt = user32.SendMessageW(hwnd, CB_GETCOUNT, 0, 0)
    cur = user32.SendMessageW(hwnd, CB_GETCURSEL, 0, 0)
    print("  COMBO hwnd=%d text=%r count=%d cursel=%d" % (hwnd, get_text(hwnd), cnt, cur))
    for i in range(cnt):
        ln = user32.SendMessageW(hwnd, CB_GETLBTEXTLEN, i, 0)
        buf = ctypes.create_unicode_buffer(ln + 1)
        user32.SendMessageW(hwnd, CB_GETLBTEXT, i, buf)
        print("    item[%d] = %r%s" % (i, buf.value, "  <== CUR" if i == cur else ""))


kids = []
def collect(hwnd, _):
    kids.append(hwnd)
    return True


def main():
    for hwnd, title in find_window("Calculate XRD"):
        print("== window %r hwnd=%d" % (title, hwnd))
        del kids[:]
        # EnumChildWindows traverses the whole descendant tree in one pass
        user32.EnumChildWindows(hwnd, EnumChildProc(collect), 0)
        print("  descendants: %d" % len(kids))
        combos = 0
        for ch in kids:
            if "ComboBox" in get_class(ch):
                dump_combo(ch)
                combos += 1
        print("  comboboxes found: %d" % combos)


if __name__ == "__main__":
    main()
