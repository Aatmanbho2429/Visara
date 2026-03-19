import os
import sys


def get_base_dir():
    if getattr(sys, "frozen", False):
        # --onefile: PyInstaller extracts everything to sys._MEIPASS temp folder
        return sys._MEIPASS
    # Dev: config.py lives at app/config.py → go up 2 levels to project root
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_data_dir():
    """
    Writable directory for faiss index, db, token — next to the .exe
    In frozen mode: use folder where exe lives (not temp _MEIPASS)
    In dev mode: use project root
    """
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


BASE_DIR  = get_base_dir()   # read-only bundled files (models, UI)
DATA_DIR  = get_data_dir()   # writable files (faiss, db, token)

FAISS_DIR  = os.path.join(DATA_DIR, "faiss")
MODEL_PATH = os.path.join(BASE_DIR, "models", "clip_vitb32.onnx")
DB_PATH    = os.path.join(FAISS_DIR, "meta.db")
INDEX_PATH = os.path.join(FAISS_DIR, "index.faiss")

IMAGE_EXTENSIONS          = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".psd", ".psb")
IMAGE_EXTENSIONS_FOR_FILE = "*.jpg *.jpeg *.png *.tiff *.tif *.psd *.psb"

BATCH_SIZE  = 64
NUM_WORKERS = 8
HASH_BYTES  = 65536
EMB_DIM     = 768

CLIP_MEAN = [0.48145466, 0.4578275,  0.40821073]
CLIP_STD  = [0.26862954, 0.26130258, 0.27577711]

MODEL_ENC_PATH = os.path.join(BASE_DIR, "models", "clip_vitb32.onnx.enc")
TOKEN_FILE     = os.path.join(os.path.expanduser("~"), ".visara_token")

SUPABASE_EDGE = "https://qpxvwdxuhgbthzbcppye.supabase.co/functions/v1"
APP_VERSION   = "1.1.6"
VERSION_URL   = "https://raw.githubusercontent.com/Aatmanbho2429/Visara/main/version.json"  # ← fixed repo name