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
