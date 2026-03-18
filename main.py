import webview
import os
import sys
import platform
import threading
from app.api import Api, set_window

api      = Api()
SYSTEM   = platform.system()

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))

ICON_PATH = os.path.join(BASE_DIR, "visara-logo.icns") if SYSTEM == "Darwin" \
       else os.path.join(BASE_DIR, "visara-logo.ico")

# ── auto detect dev vs production ────────────────────────────────────
if getattr(sys, "frozen", False):
    UI_PATH = os.path.join(
        BASE_DIR, "UI", "dist", "vynce-standalone", "browser", "index.html"
    )
else:
    UI_PATH = "http://localhost:4200/"


def set_window_icon(window):
    if SYSTEM != "Windows":
        return
    try:
        import ctypes
        WM_SETICON      = 0x0080
        ICON_SMALL      = 0
        ICON_BIG        = 1
        LR_LOADFROMFILE = 0x0010

        user32 = ctypes.windll.user32

        hicon_small = user32.LoadImageW(None, ICON_PATH, 1, 16, 16, LR_LOADFROMFILE)
        hicon_big   = user32.LoadImageW(None, ICON_PATH, 1, 48, 48, LR_LOADFROMFILE)

        if hicon_small == 0 or hicon_big == 0:
            return

        hwnd = user32.FindWindowW(None, "Visara")
        if hwnd == 0:
            hwnd = user32.GetForegroundWindow()
        if hwnd == 0:
            return

        user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
        user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG,   hicon_big)
        user32.SetClassLongPtrW(hwnd, -14, hicon_big)

    except Exception as e:
        print(f"[icon] Exception: {e}")


def on_loaded():
    threading.Timer(1.5, lambda: set_window_icon(window)).start()


window = webview.create_window(
    "Visara",
    UI_PATH,
    js_api=api
)

# ── give api a reference to the window for native file dialogs ───────
set_window(window)

window.events.loaded += on_loaded

if SYSTEM == "Windows":
    webview.start(
        gui="edgechromium",
        http_server=True,
        private_mode=False,
        args=["--allow-file-access-from-files", "--disable-web-security"]
    )
else:
    webview.start(
        http_server=True,
        private_mode=False
    )