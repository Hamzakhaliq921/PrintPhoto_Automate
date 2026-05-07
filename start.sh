#!/usr/bin/env bash
set -e

echo ""
echo " ========================================="
echo "  PhotoPrint Pro — Local Setup"
echo " ========================================="
echo ""

# Check python3
if ! command -v python3 &>/dev/null; then
  echo "[ERROR] python3 not found. Install from https://python.org"
  exit 1
fi

cd "$(dirname "$0")/backend"

echo "[1/3] Installing Python dependencies..."
pip3 install -r requirements.txt

echo ""
echo "[2/3] Starting rembg server on http://localhost:5000"
echo "      (First run downloads the AI model ~170MB — one time only)"
echo ""
echo "[3/3] Open frontend/index.html in your browser"
echo ""
echo "  Press Ctrl+C to stop the server."
echo ""

python3 server.py