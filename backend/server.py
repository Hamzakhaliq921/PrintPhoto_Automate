"""
PhotoPrint Pro — rembg Server (Python 3.13 compatible, pymatting-free)
Run: python server.py
"""

import sys, os, types, io, base64, logging, time
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Stub pymatting so rembg doesn't crash on Python 3.13 ─────────────────────
for _m in ['pymatting','pymatting.alpha','pymatting.alpha.estimate_alpha_cf',
           'pymatting.alpha.estimate_alpha_sm','pymatting.foreground',
           'pymatting.foreground.estimate_foreground_ml',
           'pymatting.util','pymatting.util.util']:
    sys.modules[_m] = types.ModuleType(_m)

def _stub(*a, **kw): pass
for _m in sys.modules.values():
    if isinstance(_m, types.ModuleType) and 'pymatting' in (_m.__name__ or ''):
        _m.estimate_alpha_cf = _stub
        _m.estimate_foreground_ml = _stub
        _m.stack_images = _stub

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Load model ────────────────────────────────────────────────────────────────
MODEL_PATH = os.path.join(os.path.expanduser("~"), ".u2net", "u2net.onnx")
SESSION = None

log.info("Loading u2net model via onnxruntime...")
try:
    import onnxruntime as ort
    if not os.path.exists(MODEL_PATH):
        log.error(f"Model not found at {MODEL_PATH}")
        log.error("Run this to download it:")
        log.error("  pip install huggingface_hub")
        log.error("  python -c \"from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='danielgatis/rembg', filename='u2net.onnx', local_dir=r'C:\\Users\\TLS\\.u2net')\"")
    else:
        SESSION = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        log.info(f"Model loaded from {MODEL_PATH}. Server ready.")
except Exception as e:
    log.error(f"onnxruntime load failed: {e}")


def remove_background(pil_image: Image.Image) -> Image.Image:
    """Run u2net inference directly via onnxruntime."""
    if SESSION is None:
        raise RuntimeError("Model not loaded. Check server logs for download instructions.")

    orig_size = pil_image.size
    img = pil_image.convert("RGB").resize((320, 320))
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = (arr - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    arr = arr.transpose(2, 0, 1)[np.newaxis].astype(np.float32)

    input_name = SESSION.get_inputs()[0].name
    outputs = SESSION.run(None, {input_name: arr})
    mask = outputs[0].squeeze()

    # Normalize mask to 0-1
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)

    # Apply mask as alpha channel
    rgba = pil_image.convert("RGBA")
    alpha = Image.fromarray((mask * 255).astype(np.uint8), mode="L").resize(orig_size, Image.LANCZOS)
    rgba.putalpha(alpha)
    return rgba


# ── Routes ────────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return jsonify({"status": "ok", "model_loaded": SESSION is not None})


@app.route("/remove-bg", methods=["POST"])
def remove_bg():
    t0 = time.time()
    try:
        if request.content_type and "multipart" in request.content_type:
            if "image" not in request.files:
                return jsonify({"success": False, "error": "No image file"}), 400
            img_bytes = request.files["image"].read()
        elif request.is_json:
            data = request.get_json()
            b64 = data.get("image_base64", "")
            if not b64:
                return jsonify({"success": False, "error": "No image_base64"}), 400
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            img_bytes = base64.b64decode(b64)
        else:
            return jsonify({"success": False, "error": "Unsupported Content-Type"}), 415

      