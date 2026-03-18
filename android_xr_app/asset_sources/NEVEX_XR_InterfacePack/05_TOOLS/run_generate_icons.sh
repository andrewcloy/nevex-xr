#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python -m pip install -r requirements.txt
python generate_openai_icons.py --priority P0
python build_preview_assets.py
python vectorize_if_available.py
