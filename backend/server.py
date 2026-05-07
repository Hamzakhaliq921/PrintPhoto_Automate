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

