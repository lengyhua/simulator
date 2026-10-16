# -*- coding: utf-8 -*-
"""Exact text extraction from the 'Search Factor and F',F'' dialog via Win32."""
import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32
psapi = ctypes.windll.psapi

WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E
CB_GETCOUNT = 0x0146
CB_GETCURSEL = 0x0147
CB_GETLBTEXT = 0x0148
CB_GETLBTEXTLEN = 0x0149
LB_GETCOUNT = 0x018B
LB_GETCURSEL = 0x0188
LB_GETTEXT = 0x0189
LB_GETTEXTLEN = 0x018A

EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def find_window(title_sub):
    found = []
    def cb(hwnd, _):
        n = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(n + 1)
        user32.GetWindowTextW(hwnd, buf, n + 1)
        if title_sub.lower() in buf.value.lower():
            found.append((hwnd, buf.value))
        return True
    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return found


def get_text(hwnd):
    n = user32.SendMessageW(hwnd, WM_GETTEXTLENGTH, 0, 0)
    buf = ctypes.create_unicode_buffer(n + 1)
    user32.SendMessageW(hwnd, WM_GETTEXT, n + 1, buf)
    return buf.value


def get_class(hwnd):
    n = 256
    buf = ctypes.create_unicode_buffer(n)
    user32.GetClassNameW(hwnd, buf, n)
    return buf.value


def dump_combo(hwnd, cls):
    print("  [%s] hwnd=%d text=%r" % (cls, hwnd, get_text(hwnd)))
    cnt = user32.SendMessageW(hwnd, CB_GETCOUNT, 0, 0)
    cur = user32.SendMessageW(hwnd, CB_GETCURSEL, 0, 0)
    print("    count=%d cursel=%d" % (cnt, cur))
    for i in range(cnt):
        ln = user32.SendMessageW(hwnd, CB_GETLBTEXTLEN, i, 0)
        buf = ctypes.create_unicode_buffer(ln + 1)
        user32.SendMessageW(hwnd, CB_GETLBTEXT, i, buf)
        print("    item[%d] = %r" % (i, buf.value))


def dump_listbox(hwnd, cls):
    cnt = user32.SendMessageW(hwnd, LB_GETCOUNT, 0, 0)
    cur = user32.SendMessageW(hwnd, LB_GETCURSEL, 0, 0)
    print("  [%s] hwnd=%d count=%d cursel=%d" % (cls, hwnd, cnt, cur))
    for i in range(cnt):
        ln = user32.SendMessageW(hwnd, LB_GETTEXTLEN, i, 0)
        buf = ctypes.create_unicode_buffer(ln + 1)
        user32.SendMessageW(hwnd, LB_GETTEXT, i, buf)
        mark = " <== SELECTED" if i == cur else ""
        if i < 30 or i == cur:
            print("    item[%d] = %r%s" % (i, buf.value, mark))


children = []


def enum_child(hwnd, _):
    children.append(hwnd)
    return True


def main():
    wins = find_window("Search Factor")
    print("matching windows:", wins)
    for hwnd, title in wins:
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        print("== hwnd=%d pid=%d title=%r" % (hwnd, pid.value, title))
        del children[:]
        user32.EnumChildWindows(hwnd, EnumWindowsProc(enum_child), 0)
        print("  child count: %d" % len(children))
        for ch in children:
            cls = get_class(ch)
            txt = get_text(ch)
            print("    child hwnd=%d class=%r text=%r" % (ch, cls, txt[:60]))
            if "ComboBox" in cls:
                dump_combo(ch, cls)
            elif "ListBox" in cls:
                dump_listbox(ch, cls)
            elif "SysListView" in cls or "TStringGrid" in cls or "Grid" in cls:
                print("    (grid - trying UIA separately)")


if __name__ == "__main__":
    main()
