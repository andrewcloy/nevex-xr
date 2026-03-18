# How To Rerun

## Environment

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_api_key_here"
$env:OPENAI_IMAGE_MODEL="gpt-image-1.5"
```

macOS/Linux shell:

```bash
export OPENAI_API_KEY="your_api_key_here"
export OPENAI_IMAGE_MODEL="gpt-image-1.5"
```

`OPENAI_IMAGE_MODEL` is optional. If omitted, the generation script defaults to `gpt-image-1.5` and falls back to `gpt-image-1` if needed.

## Full P0 rerun

From the pack root:

```powershell
cd 05_TOOLS
python -m pip install -r requirements.txt
python generate_openai_icons.py --priority P0
python build_preview_assets.py
python vectorize_if_available.py
```

## Rerun only failed assets

```powershell
cd 05_TOOLS
python generate_openai_icons.py --only-failed
python build_preview_assets.py
```

## Generate prompt-ready planned variants

This includes variants that are scaffolded in the manifests but not flagged for the first-pass queue:

```powershell
cd 05_TOOLS
python generate_openai_icons.py --priority P1 --include-planned
python build_preview_assets.py
```

## Alternate convenience runners

Windows:

```powershell
.\05_TOOLS\run_generate_icons.bat
```

macOS/Linux:

```bash
./05_TOOLS/run_generate_icons.sh
```

## Notes

- prompts live in `03_ASSETS/source_prompts`
- the full generation queue lives in `02_MANIFESTS/generation_manifest.json`
- generation logs write to `03_ASSETS/logs/generation_log.json`
- failed items are summarized in `06_HANDOFF/FAILED_ASSETS.md`
