import os
import sys
import platform
import requests
import zipfile
import tempfile
import subprocess
from app.config import APP_VERSION, VERSION_URL


def _parse_version(v):
    return tuple(int(x) for x in v.strip().split("."))


def check_for_update() -> dict:
    try:
        if not VERSION_URL:
            return {"available": False}

        r      = requests.get(VERSION_URL, timeout=5)
        data   = r.json()
        latest = data["version"]

        if _parse_version(latest) > _parse_version(APP_VERSION):
            system  = platform.system()
            machine = platform.machine()  # 'arm64' or 'x86_64'

            if system == "Windows":
                url = data["windows"]["url"]
            elif machine == "arm64":
                url = data.get("macos_arm", {}).get("url") or data.get("macos", {}).get("url", "")
            else:
                url = data.get("macos_intel", {}).get("url") or data.get("macos", {}).get("url", "")

            return {
                "available":     True,
                "version":       latest,
                "release_notes": data.get("release_notes", ""),
                "url":           url
            }

        return {"available": False}

    except Exception:
        return {"available": False}


def download_and_install(url: str, version: str, progress_cb=None):
    system = platform.system()
    suffix = ".exe" if system == "Windows" else ".zip"
    tmp    = os.path.join(tempfile.gettempdir(), f"Visara-{version}{suffix}")

    # ── Download with progress ────────────────────────────────────────
    r     = requests.get(url, stream=True, timeout=120)
    total = int(r.headers.get("content-length", 0))
    done  = 0

    with open(tmp, "wb") as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
            done += len(chunk)
            if progress_cb and total:
                progress_cb(int(done / total * 100))

    if system == "Windows":
        _install_windows(tmp)
    elif system == "Darwin":
        _install_macos(tmp)


def _install_windows(new_exe: str):
    """
    Visara.exe is a plain PyInstaller exe — not an InnoSetup installer.
    We replace the current exe using a batch script that runs after app exits.
    """
    current_exe = sys.executable if getattr(sys, "frozen", False) \
                  else os.path.abspath(sys.argv[0])

    # Batch script: wait for app to exit → replace exe → relaunch
    script = f"""@echo off
timeout /t 2 /nobreak >nul
copy /y "{new_exe}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
    script_path = os.path.join(tempfile.gettempdir(), "visara_update.bat")
    with open(script_path, "w") as f:
        f.write(script)

    # Run batch detached then exit app
    subprocess.Popen(
        ["cmd.exe", "/c", script_path],
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        close_fds=True
    )
    sys.exit(0)


def _install_macos(zip_path: str):
    from pathlib import Path

    tmp_dir = tempfile.mkdtemp()

    # ── Resolve current .app path safely ─────────────────────────────
    if getattr(sys, "frozen", False):
        # Running as .app bundle: exe is inside Contents/MacOS/
        exe      = sys.executable
        app_path = str(Path(exe).parent.parent.parent)  # → Visara.app
    else:
        # Dev mode — not a bundle, skip
        print("[updater] macOS update skipped in dev mode", flush=True)
        return

    # Safety check — must end with .app
    if not app_path.endswith(".app"):
        print(f"[updater] Unexpected app path: {app_path}", flush=True)
        return

    # ── Extract zip ───────────────────────────────────────────────────
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(tmp_dir)

    # ── Find .app inside extracted folder ─────────────────────────────
    new_app = next(
        (os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir)
         if f.endswith(".app")),
        None
    )
    if not new_app:
        print("[updater] No .app found in zip", flush=True)
        return

    print(f"[updater] Replacing {app_path} with {new_app}", flush=True)

    # ── Shell script: runs after app exits ────────────────────────────
    script = f"""#!/bin/bash
sleep 2
rm -rf "{app_path}"
if [ $? -ne 0 ]; then
    echo "Failed to remove old app" >> /tmp/visara_update.log
    exit 1
fi
cp -R "{new_app}" "{app_path}"
chmod -R 755 "{app_path}"
xattr -cr "{app_path}"
open "{app_path}"
rm -rf "{tmp_dir}" "{zip_path}"
rm -f "$0"
"""
    script_path = os.path.join(tempfile.gettempdir(), "visara_update.sh")
    with open(script_path, "w") as f:
        f.write(script)

    os.chmod(script_path, 0o755)
    subprocess.Popen(
        ["bash", script_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    sys.exit(0)