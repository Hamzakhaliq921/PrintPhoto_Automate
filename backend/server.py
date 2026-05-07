"""
PhotoPrint Pro — rembg Server (Python 3.13 compatible, pymatting-free)
Run: python server.py
"""

import sys, os, types, io, base64, logging, time
import numpy as np
from PIL import Image
from flask import Flask, request, jsonify
from flask_cors import CORS
