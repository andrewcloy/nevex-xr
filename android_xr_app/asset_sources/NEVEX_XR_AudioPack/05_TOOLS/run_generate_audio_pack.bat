@echo off
setlocal
cd /d "%~dp0"
python generate_audio_pack.py
python build_audio_preview.py
endlocal
