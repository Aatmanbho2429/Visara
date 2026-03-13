import json
import os
import platform
import subprocess
from app.config import IMAGE_EXTENSIONS_FOR_FILE
from app.core.progress import get_progress
from app.services import search_service, sync_service
from app.services import folder_status_service
from app.services import auth_service, updater_service
from app.core import database as db

# ── pywebview window reference — set from main.py after window is created ──
_window = None

def set_window(win):
    global _window
    _window = win


class Api:

    # ── selectFile — uses pywebview native dialog (no tkinter, no crash) ──
    def selectFile(self):
        if _window is None:
            return ""
        file_types = (
            "Image Files (*.jpg;*.jpeg;*.png;*.tiff;*.tif;*.bmp;*.webp;*.psd;*.psb)",
        )
        result = _window.create_file_dialog(
            dialog_type=10,          # OPEN_DIALOG
            allow_multiple=False,
            file_types=file_types
        )
        if result and len(result) > 0:
            return result[0]
        return ""

    # ── selectFolder — uses pywebview native dialog (no tkinter, no crash) ──
    def selectFolder(self):
        if _window is None:
            return ""
        result = _window.create_file_dialog(
            dialog_type=50           # FOLDER_DIALOG
        )
        if result and len(result) > 0:
            return result[0]
        return ""

    # ── Auth ───────────────────────────────────────────────────────────────

    def login(self, email: str, password: str):
        result = auth_service.login(email, password)
        return json.dumps(result.to_dict())

    def validateLogin(self):
        result = auth_service.validate_saved_token()
        return json.dumps(result.to_dict())

    def logout(self):
        auth_service.logout()
        return json.dumps({"success": True})

    def requestDeviceReset(self, email: str, reason: str):
        result = auth_service.request_device_reset(email, reason)
        return json.dumps(result)

    # ── Updates ────────────────────────────────────────────────────────────

    def checkForUpdate(self):
        result = updater_service.check_for_update()
        return json.dumps(result)

    def downloadUpdate(self, url: str, version: str):
        from threading import Thread
        from app.core.progress import set_progress
        def cb(pct):
            set_progress(done=pct, total=100, phase="updating")
        Thread(
            target=updater_service.download_and_install,
            args=(url, version, cb),
            daemon=True
        ).start()
        return json.dumps({"success": True, "message": "Downloading..."})

    # ── Search & Sync ──────────────────────────────────────────────────────

    def start_search(self, query_image: str, folder_path: str, top_k):
        return search_service.search(query_image, folder_path, int(top_k))

    def get_progress(self):
        return json.dumps(get_progress())

    def openFilePath(self, path):
        path   = os.path.abspath(path)
        folder = os.path.dirname(path)
        system = platform.system()
        try:
            if system == "Darwin":
                subprocess.run(["open", "-R", path])
            elif system == "Windows":
                subprocess.run(["explorer", "/select,", path])
            elif system == "Linux":
                subprocess.run(["xdg-open", folder])
        except Exception:
            pass
        return True

    def get_folder_statuses(self):
        return json.dumps(folder_status_service.get_folder_statuses())

    def sync_folder(self, folder_path: str):
        from app.services.sync_service import sync_folder
        from app.core import indexer
        from app.services.search_service import BaseResponse

        response = BaseResponse()
        index    = indexer.load_index()

        sync_folder(index, folder_path, response)
        indexer.save_index(index)

        response.message = (
            "Sync completed with errors" if response.data["errors"]
            else "Sync completed successfully"
        )
        response.code = 207 if response.data["errors"] else 200
        return json.dumps(response.__dict__, indent=2)

    def get_thumbnail(self, path: str) -> str:
        import base64
        import io
        from app.utils.image_loader import load_image_fast

        try:
            img = load_image_fast(path)
            img.thumbnail((400, 400))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
            return f"data:image/jpeg;base64,{b64}"
        except Exception as e:
            return "error"

    def getDeviceId(self):
        from app.services.license_service import get_device_id
        return get_device_id()

    def get_activity_log(self):
        con = db.get_connection()
        try:
            entries = db.get_activity_log(con)
            return json.dumps(entries)
        finally:
            con.close()