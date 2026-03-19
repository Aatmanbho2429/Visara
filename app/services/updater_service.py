import os
import sys
import platform
import requests
import zipfile
import tempfile
import subprocess
from app.config import APP_VERSION, VERSION_URL

# ── Flag file — same location as token file (~/.visara_updated) ──────
UPDATE_FLAG_FILE = os.path.join(os.path.expanduser("~"), ".visara_updated")


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
            machine = platform.machine()

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


def was_just_updated() -> dict:
    """
    Call this on app start — returns update info if app was just updated.
    Deletes the flag file after reading so it only shows once.
    """
    print(f"[updater] Checking flag file: {UPDATE_FLAG_FILE}", flush=True)

    if not os.path.exists(UPDATE_FLAG_FILE):
        print("[updater] No flag file found", flush=True)
        return {"updated": False}

    try:
        with open(UPDATE_FLAG_FILE, "r") as f:
            version = f.read().strip()
        print(f"[updater] Flag found! Updated to v{version}", flush=True)
        os.remove(UPDATE_FLAG_FILE)
        print("[updater] Flag file deleted", flush=True)
        return {"updated": True, "version": version}
    except Exception as e:
        print(f"[updater] Flag read error: {e}", flush=True)
        return {"updated": False}


def _write_update_flag(version: str):
    """Write flag file before exiting — read on next launch."""
    try:
        with open(UPDATE_FLAG_FILE, "w") as f:
            f.write(version)
    except Exception:
        pass


def download_and_install(url: str, version: str, progress_cb=None):
    system = platform.system()
    suffix = ".exe" if system == "Windows" else ".zip"
    tmp    = os.path.join(tempfile.gettempdir(), f"Visara-{version}{suffix}")

    try:
        # ── Connect ───────────────────────────────────────────────────
        _notify(progress_cb, 0, "Connecting to server...")
        r = requests.get(url, stream=True, timeout=120)
        if r.status_code != 200:
            raise Exception(f"Download failed: HTTP {r.status_code}")

        total = int(r.headers.get("content-length", 0))
        done  = 0
        total_mb = round(total / (1024 * 1024), 1) if total else 0

        _notify(progress_cb, 0, f"Starting download ({total_mb} MB)...")

        # ── Download chunk by chunk ───────────────────────────────────
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(65536):   # 64KB chunks
                f.write(chunk)
                done += len(chunk)
                if total:
                    pct      = int(done / total * 100)
                    done_mb  = round(done  / (1024 * 1024), 1)
                    status   = f"Downloading... {done_mb} MB / {total_mb} MB"
                    _notify(progress_cb, pct, status)

        # ── Verify ────────────────────────────────────────────────────
        _notify(progress_cb, 99, "Verifying download...")
        if not os.path.exists(tmp) or os.path.getsize(tmp) < 1024:
            raise Exception("Downloaded file is empty or corrupted.")

        # ── Write flag + install ──────────────────────────────────────
        _notify(progress_cb, 100, "Applying update...")
        _write_update_flag(version)

        if system == "Windows":
            _install_windows(tmp)
        elif system == "Darwin":
            _install_macos(tmp)

    except requests.exceptions.ConnectionError:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass
        raise Exception("No internet connection. Please check your network.")
    except requests.exceptions.Timeout:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass
        raise Exception("Download timed out. Please try again.")
    except Exception as e:
        if os.path.exists(tmp):
            try: os.remove(tmp)
            except: pass
        raise


def _notify(progress_cb, pct: int, status: str):
    """Send progress update to Angular via callback."""
    print(f"[updater] {pct}% — {status}", flush=True)
    if progress_cb:
        try:
            progress_cb(pct, status)
        except Exception:
            pass


def _install_windows(new_exe: str):
    current_exe = sys.executable if getattr(sys, "frozen", False) \
                  else os.path.abspath(sys.argv[0])

    script = f"""@echo off
timeout /t 2 /nobreak >nul
copy /y "{new_exe}" "{current_exe}"
start "" "{current_exe}"
del "%~f0"
"""
    script_path = os.path.join(tempfile.gettempdir(), "visara_update.bat")
    with open(script_path, "w") as f:
        f.write(script)

    subprocess.Popen(
        ["cmd.exe", "/c", script_path],
        creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        close_fds=True
    )
    sys.exit(0)


def _install_macos(zip_path: str):
    from pathlib import Path

    tmp_dir = tempfile.mkdtemp()

    if getattr(sys, "frozen", False):
        exe      = sys.executable
        app_path = str(Path(exe).parent.parent.parent)
    else:
        print("[updater] macOS update skipped in dev mode", flush=True)
        return

    if not app_path.endswith(".app"):
        print(f"[updater] Unexpected app path: {app_path}", flush=True)
        return

    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(tmp_dir)

    new_app = next(
        (os.path.join(tmp_dir, f) for f in os.listdir(tmp_dir)
         if f.endswith(".app")),
        None
    )
    if not new_app:
        print("[updater] No .app found in zip", flush=True)
        return

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