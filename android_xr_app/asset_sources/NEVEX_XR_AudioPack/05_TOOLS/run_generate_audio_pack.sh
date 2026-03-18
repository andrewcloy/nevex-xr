#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python generate_audio_pack.py
python build_audio_preview.py
