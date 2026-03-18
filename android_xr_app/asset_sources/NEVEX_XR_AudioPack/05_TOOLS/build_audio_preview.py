from __future__ import annotations

import json
import wave
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
ASSET_MANIFEST = json.loads((ROOT / "02_MANIFESTS" / "audio_asset_manifest.json").read_text(encoding="utf-8"))
PREVIEW_DIR = ROOT / "03_ASSETS" / "audio" / "preview"
PREVIEW_MANIFEST_PATH = ROOT / "04_PREVIEW" / "audio_preview_manifest.json"


def build_waveform_svg(wav_path: Path, svg_path: Path) -> None:
    with wave.open(str(wav_path), "rb") as wav:
        frames = wav.readframes(wav.getnframes())
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        frame_count = wav.getnframes()
        if sample_width != 2:
            raise ValueError("Expected 16-bit WAV input.")
        import struct
        samples = struct.unpack("<" + "h" * frame_count * channels, frames)
        mono = [samples[i] / 32768.0 for i in range(0, len(samples), channels)]

    width = 600
    height = 120
    step = max(1, len(mono) // width)
    points = []
    mid = height / 2
    for x in range(width):
        chunk = mono[x * step : min(len(mono), (x + 1) * step)]
        if not chunk:
            amp = 0.0
        else:
            amp = max(abs(v) for v in chunk)
        y_top = mid - amp * 42
        y_bottom = mid + amp * 42
        points.append((x, y_top, y_bottom))

    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="120" viewBox="0 0 600 120">',
        '<rect width="600" height="120" rx="12" fill="#06090E"/>',
        '<line x1="0" y1="60" x2="600" y2="60" stroke="#173042" stroke-width="1"/>',
    ]
    for x, y_top, y_bottom in points:
        lines.append(f'<line x1="{x}" y1="{y_top:.2f}" x2="{x}" y2="{y_bottom:.2f}" stroke="#5EE7FF" stroke-width="1"/>')
    lines.append("</svg>")
    svg_path.write_text("".join(lines), encoding="utf-8")


def main() -> int:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    sections = {}
    for asset in ASSET_MANIFEST["assets"]:
        wav_path = ROOT / asset["path"]
        svg_path = PREVIEW_DIR / (Path(asset["filename"]).stem + ".svg")
        if wav_path.exists():
            build_waveform_svg(wav_path, svg_path)
        rel_wav = "../" + wav_path.relative_to(ROOT).as_posix()
        rel_svg = "../" + svg_path.relative_to(ROOT).as_posix()
        sections.setdefault(asset["category"], []).append({
            "filename": asset["filename"],
            "category": asset["category"],
            "priority": asset["priority"],
            "trigger": asset["trigger"],
            "src": rel_wav,
            "waveform": rel_svg,
        })

    payload = {
        "sections": [
            {"title": category.title(), "items": items}
            for category, items in sections.items()
        ]
    }
    PREVIEW_MANIFEST_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
