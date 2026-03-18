from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
SOURCE_DIR = ROOT / "03_ASSETS" / "png" / "glyph_icons"
OUTPUT_DIR = ROOT / "03_ASSETS" / "svg_attempts"
NOTE_PATH = ROOT / "03_ASSETS" / "logs" / "vectorize_log.txt"


def log(text: str) -> None:
    NOTE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with NOTE_PATH.open("a", encoding="utf-8") as handle:
        handle.write(text + "\n")


def run_command(command: list[str]) -> bool:
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
        return True
    except Exception as exc:
        log(f"command failed: {' '.join(command)} -> {exc}")
        return False


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    magick = shutil.which("magick")
    potrace = shutil.which("potrace")
    inkscape = shutil.which("inkscape")

    if not any([magick, potrace, inkscape]):
        log("No local vectorization tools detected. PNG assets remain the primary deliverable.")
        return 0

    generated = 0
    for png_path in sorted(SOURCE_DIR.glob("*.png"))[:12]:
        stem = png_path.stem
        pbm_path = OUTPUT_DIR / f"{stem}.pbm"
        svg_path = OUTPUT_DIR / f"{stem}.svg"

        if magick and potrace:
            ok = run_command([magick, str(png_path), "-threshold", "55%", str(pbm_path)])
            if ok:
                ok = run_command([potrace, str(pbm_path), "-s", "-o", str(svg_path)])
            if ok and svg_path.exists():
                generated += 1
                continue

        if inkscape:
            ok = run_command([inkscape, str(png_path), "--export-type=svg", "--export-filename", str(svg_path)])
            if ok and svg_path.exists():
                generated += 1

    if generated == 0:
        log("Vectorization attempted but no acceptable SVG outputs were created. Keep PNGs as primary assets.")
    else:
        log(f"Vectorization created {generated} SVG attempt files. Review quality before integration.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
