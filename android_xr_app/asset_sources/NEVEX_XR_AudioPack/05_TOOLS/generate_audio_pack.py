from __future__ import annotations

import argparse
import json
import math
import struct
import time
import wave
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
ASSET_MANIFEST_PATH = ROOT / "02_MANIFESTS" / "audio_asset_manifest.json"
GENERATION_MANIFEST_PATH = ROOT / "02_MANIFESTS" / "audio_generation_manifest.json"
FAILED_PATH = ROOT / "02_MANIFESTS" / "audio_failed_assets.json"
LOG_PATH = ROOT / "03_ASSETS" / "audio" / "logs" / "generation_log.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the NEVEX XR procedural audio pack.")
    parser.add_argument("--only-failed", action="store_true", help="Generate only previously failed assets.")
    parser.add_argument("--match", help="Generate only assets whose filename contains this substring.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing WAV files.")
    return parser.parse_args()


ARGS = parse_args()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


ASSET_MANIFEST = load_json(ASSET_MANIFEST_PATH)
GENERATION_MANIFEST = load_json(GENERATION_MANIFEST_PATH)
DEFAULTS = ASSET_MANIFEST["defaults"]
SAMPLE_RATE = int(DEFAULTS["sample_rate_hz"])


def read_failed_filenames() -> set[str]:
    if not FAILED_PATH.exists():
        return set()
    data = load_json(FAILED_PATH)
    return {item["filename"] for item in data.get("failed_assets", [])}


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def apply_envelope(samples: list[float], attack_ms: float = 4, release_ms: float = 22) -> list[float]:
    total = len(samples)
    if total == 0:
        return samples
    attack = max(1, int(SAMPLE_RATE * attack_ms / 1000.0))
    release = max(1, int(SAMPLE_RATE * release_ms / 1000.0))
    for i in range(min(attack, total)):
        samples[i] *= i / attack
    for i in range(min(release, total)):
        idx = total - 1 - i
        samples[idx] *= i / release
    return samples


def apply_soft_clip(x: float) -> float:
    return math.tanh(x * 1.35) / math.tanh(1.35)


def sine(freq: float, t: float) -> float:
    return math.sin(2 * math.pi * freq * t)


def triangle(freq: float, t: float) -> float:
    phase = (t * freq) % 1.0
    return 4 * abs(phase - 0.5) - 1


def soft_saw(freq: float, t: float) -> float:
    phase = (t * freq) % 1.0
    return (2 * phase - 1) * 0.6


def pan_gains(pan: float) -> tuple[float, float]:
    left = math.cos((pan + 1) * math.pi / 4)
    right = math.sin((pan + 1) * math.pi / 4)
    return left, right


def render_tone(
    duration_ms: int,
    freqs: list[float],
    amps: list[float] | None = None,
    waveform: str = "sine",
    attack_ms: float = 4,
    release_ms: float = 22,
    pan: float = 0.0,
    drift_hz: float = 0.0,
) -> tuple[list[float], list[float]]:
    total = max(1, int(SAMPLE_RATE * duration_ms / 1000.0))
    amps = amps or [1.0 for _ in freqs]
    left_gain, right_gain = pan_gains(pan)
    left: list[float] = []
    right: list[float] = []
    for i in range(total):
        t = i / SAMPLE_RATE
        v = 0.0
        for idx, freq in enumerate(freqs):
            freq_now = freq + drift_hz * math.sin(2 * math.pi * 0.7 * t)
            if waveform == "triangle":
                wave_v = triangle(freq_now, t)
            elif waveform == "soft_saw":
                wave_v = soft_saw(freq_now, t)
            else:
                wave_v = sine(freq_now, t)
            v += wave_v * amps[idx]
        v /= max(1, len(freqs))
        left.append(v * left_gain)
        right.append(v * right_gain)
    return apply_envelope(left, attack_ms, release_ms), apply_envelope(right, attack_ms, release_ms)


def mix_layers(layers: list[tuple[list[float], list[float]]], gain: float = 0.88) -> tuple[list[float], list[float]]:
    total = max(len(layer[0]) for layer in layers)
    left = [0.0] * total
    right = [0.0] * total
    for lch, rch in layers:
        for i, sample in enumerate(lch):
            left[i] += sample
        for i, sample in enumerate(rch):
            right[i] += sample
    peak = max(max(abs(x) for x in left), max(abs(x) for x in right), 1e-6)
    scale = gain / peak
    left = [apply_soft_clip(x * scale) for x in left]
    right = [apply_soft_clip(x * scale) for x in right]
    return left, right


def concat_segments(segments: list[tuple[list[float], list[float]]], gap_ms: int = 0) -> tuple[list[float], list[float]]:
    gap = int(SAMPLE_RATE * gap_ms / 1000.0)
    left: list[float] = []
    right: list[float] = []
    for idx, (lch, rch) in enumerate(segments):
        if idx > 0 and gap > 0:
            left.extend([0.0] * gap)
            right.extend([0.0] * gap)
        left.extend(lch)
        right.extend(rch)
    return left, right


def write_wav(path: Path, left: list[float], right: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for l_sample, r_sample in zip(left, right):
            li = int(clamp(l_sample, -1.0, 1.0) * 32767)
            ri = int(clamp(r_sample, -1.0, 1.0) * 32767)
            frames.extend(struct.pack("<hh", li, ri))
        wav.writeframes(bytes(frames))


def tone(duration: int, freqs: list[float], amps: list[float] | None = None, waveform: str = "sine", pan: float = 0.0) -> tuple[list[float], list[float]]:
    return render_tone(duration, freqs, amps=amps, waveform=waveform, pan=pan)


def style_render(style: str, duration_ms: int) -> tuple[list[float], list[float]]:
    if style == "soft_click":
        return mix_layers([
            tone(duration_ms, [1180], [1.0], "sine"),
            tone(max(45, duration_ms - 20), [760], [0.55], "triangle"),
        ], gain=0.52)
    if style == "back":
        return concat_segments([
            mix_layers([tone(42, [980], [1.0], "triangle")], gain=0.42),
            mix_layers([tone(58, [720], [1.0], "sine")], gain=0.4),
        ], gap_ms=6)
    if style == "focus":
        return render_tone(duration_ms, [860], amps=[0.75], waveform="triangle", drift_hz=18)
    if style == "toggle_on":
        return concat_segments([
            mix_layers([tone(48, [640, 960], [0.9, 0.35], "sine")], gain=0.45),
            mix_layers([tone(58, [820, 1220], [0.85, 0.3], "triangle")], gain=0.46),
        ], gap_ms=8)
    if style == "toggle_off":
        return concat_segments([
            mix_layers([tone(48, [830, 1180], [0.85, 0.3], "triangle")], gain=0.45),
            mix_layers([tone(58, [620, 900], [0.9, 0.33], "sine")], gain=0.46),
        ], gap_ms=8)
    if style == "confirm":
        return concat_segments([
            mix_layers([tone(58, [760, 1140], [0.9, 0.25], "triangle")], gain=0.5),
            mix_layers([tone(76, [980, 1460], [0.85, 0.22], "sine")], gain=0.5),
        ], gap_ms=10)
    if style == "dismiss":
        return concat_segments([
            mix_layers([tone(40, [920], [1.0], "triangle")], gain=0.42),
            mix_layers([tone(52, [680], [1.0], "sine")], gain=0.4),
        ], gap_ms=5)
    if style == "ready":
        return concat_segments([
            mix_layers([tone(140, [520, 780], [0.88, 0.26], "triangle")], gain=0.48),
            mix_layers([tone(160, [680, 1020], [0.84, 0.24], "sine")], gain=0.5),
            mix_layers([tone(170, [840, 1260], [0.8, 0.2], "sine")], gain=0.48),
        ], gap_ms=18)
    if style == "ready_limited":
        return concat_segments([
            mix_layers([tone(150, [500, 740], [0.9, 0.24], "triangle")], gain=0.48),
            mix_layers([tone(150, [460, 690], [0.9, 0.22], "sine")], gain=0.48),
            mix_layers([tone(140, [620, 930], [0.82, 0.2], "sine")], gain=0.45),
        ], gap_ms=16)
    if style == "ready_fault":
        return concat_segments([
            mix_layers([tone(150, [420, 660], [0.95, 0.24], "triangle")], gain=0.55),
            mix_layers([tone(120, [390, 620], [0.95, 0.24], "triangle")], gain=0.55),
            mix_layers([tone(180, [310, 540, 1280], [0.88, 0.3, 0.1], "soft_saw")], gain=0.6),
        ], gap_ms=22)
    if style == "boot":
        return concat_segments([
            mix_layers([tone(160, [420, 630], [0.82, 0.25], "triangle")], gain=0.45),
            mix_layers([tone(180, [560, 860], [0.82, 0.24], "triangle")], gain=0.47),
            mix_layers([tone(240, [760, 1140, 1520], [0.76, 0.2, 0.08], "sine")], gain=0.5),
        ], gap_ms=20)
    if style == "nightvision_activate":
        return concat_segments([
            mix_layers([tone(70, [240, 480], [0.82, 0.16], "triangle")], gain=0.38),
            mix_layers([tone(80, [340, 680], [0.84, 0.18], "triangle")], gain=0.4),
            mix_layers([tone(90, [500, 1000], [0.86, 0.18], "triangle")], gain=0.42),
            mix_layers([tone(100, [760, 1520], [0.86, 0.16], "soft_saw")], gain=0.44),
            mix_layers([tone(100, [1080, 2160], [0.82, 0.14], "sine")], gain=0.42),
            mix_layers([tone(40, [1480], [0.82], "triangle")], gain=0.36),
        ], gap_ms=8)
    if style == "shutdown":
        return concat_segments([
            mix_layers([tone(220, [760, 1120], [0.78, 0.22], "sine")], gain=0.44),
            mix_layers([tone(200, [540, 810], [0.78, 0.22], "triangle")], gain=0.42),
            mix_layers([tone(180, [390, 620], [0.82, 0.2], "triangle")], gain=0.42),
        ], gap_ms=14)
    if style == "reconnect":
        return concat_segments([
            mix_layers([tone(80, [780, 1170], [0.84, 0.22], "triangle")], gain=0.48),
            mix_layers([tone(120, [980, 1480], [0.82, 0.2], "sine")], gain=0.48),
        ], gap_ms=8)
    if style == "disconnect":
        return concat_segments([
            mix_layers([tone(110, [600, 920], [0.88, 0.2], "triangle")], gain=0.54),
            mix_layers([tone(150, [420, 680, 1320], [0.88, 0.25, 0.08], "soft_saw")], gain=0.58),
        ], gap_ms=12)
    if style == "detect_ping":
        return mix_layers([
            tone(duration_ms, [1320], [0.88], "sine"),
            tone(duration_ms, [1760], [0.16], "triangle"),
        ], gain=0.5)
    if style == "detect_high":
        return concat_segments([
            mix_layers([tone(70, [1240, 1860], [0.86, 0.2], "triangle")], gain=0.5),
            mix_layers([tone(90, [1460, 2190], [0.88, 0.18], "sine")], gain=0.52),
        ], gap_ms=10)
    if style == "lock":
        return concat_segments([
            mix_layers([tone(78, [1100, 1650], [0.88, 0.2], "triangle")], gain=0.52),
            mix_layers([tone(92, [1100, 1650], [0.88, 0.2], "triangle")], gain=0.55),
        ], gap_ms=20)
    if style == "lost":
        return concat_segments([
            mix_layers([tone(70, [1180], [0.8], "triangle")], gain=0.45),
            mix_layers([tone(90, [820], [0.9], "sine")], gain=0.45),
        ], gap_ms=8)
    if style == "prey_detect":
        return concat_segments([
            mix_layers([tone(72, [1020, 1530], [0.84, 0.18], "sine")], gain=0.46),
            mix_layers([tone(90, [1180, 1770], [0.82, 0.16], "triangle")], gain=0.47),
        ], gap_ms=12)
    if style == "prey_reacquire":
        return concat_segments([
            mix_layers([tone(65, [980], [0.82], "triangle")], gain=0.45),
            mix_layers([tone(70, [1180], [0.84], "triangle")], gain=0.46),
            mix_layers([tone(80, [1380], [0.85], "sine")], gain=0.47),
        ], gap_ms=10)
    if style == "anomaly_mark":
        return concat_segments([
            mix_layers([tone(64, [760, 1140], [0.86, 0.2], "triangle")], gain=0.45),
            mix_layers([tone(84, [920, 1380], [0.82, 0.18], "sine")], gain=0.47),
        ], gap_ms=8)
    if style == "waypoint_set":
        return concat_segments([
            mix_layers([tone(70, [740], [0.84], "triangle", pan=-0.12)], gain=0.44),
            mix_layers([tone(90, [930, 1395], [0.82, 0.18], "sine", pan=0.12)], gain=0.46),
        ], gap_ms=12)
    if style == "arrival":
        return concat_segments([
            mix_layers([tone(70, [720], [0.82], "triangle")], gain=0.42),
            mix_layers([tone(82, [980], [0.82], "triangle")], gain=0.44),
            mix_layers([tone(100, [1320, 1980], [0.8, 0.16], "sine")], gain=0.46),
        ], gap_ms=10)
    if style == "route_deviation":
        return concat_segments([
            mix_layers([tone(90, [520, 980], [0.9, 0.18], "triangle")], gain=0.58),
            mix_layers([tone(110, [470, 930, 1680], [0.9, 0.2, 0.08], "soft_saw")], gain=0.6),
        ], gap_ms=18)
    if style == "return_path":
        return concat_segments([
            mix_layers([tone(80, [640], [0.82], "triangle", pan=0.18)], gain=0.44),
            mix_layers([tone(110, [820, 1230], [0.82, 0.18], "sine", pan=-0.18)], gain=0.46),
        ], gap_ms=16)
    if style == "heading_adjust":
        return mix_layers([
            tone(duration_ms, [880], [0.84], "triangle", pan=0.18),
            tone(duration_ms, [1320], [0.14], "sine", pan=0.18),
        ], gain=0.44)
    if style == "photo":
        return concat_segments([
            mix_layers([tone(48, [1160], [0.88], "triangle")], gain=0.45),
            mix_layers([tone(68, [860], [0.88], "sine")], gain=0.44),
        ], gap_ms=4)
    if style == "record_start":
        return concat_segments([
            mix_layers([tone(70, [620], [0.9], "triangle")], gain=0.44),
            mix_layers([tone(90, [760, 1140], [0.82, 0.16], "sine")], gain=0.48),
        ], gap_ms=10)
    if style == "record_stop":
        return concat_segments([
            mix_layers([tone(78, [760, 1140], [0.82, 0.16], "sine")], gain=0.46),
            mix_layers([tone(82, [560], [0.9], "triangle")], gain=0.44),
        ], gap_ms=8)
    if style == "playback_open":
        return concat_segments([
            mix_layers([tone(70, [700], [0.82], "triangle")], gain=0.42),
            mix_layers([tone(100, [920, 1380], [0.8, 0.16], "sine")], gain=0.44),
        ], gap_ms=10)
    if style == "playback_select":
        return mix_layers([
            tone(duration_ms, [930], [0.84], "triangle"),
        ], gain=0.4)
    if style == "warning":
        return concat_segments([
            mix_layers([tone(110, [460, 920, 1440], [0.88, 0.22, 0.08], "soft_saw")], gain=0.58),
            mix_layers([tone(120, [520, 1040, 1560], [0.88, 0.22, 0.08], "soft_saw")], gain=0.58),
        ], gap_ms=26)
    if style == "critical":
        return concat_segments([
            mix_layers([tone(120, [340, 780, 1520], [0.94, 0.26, 0.1], "soft_saw")], gain=0.64),
            mix_layers([tone(120, [340, 780, 1520], [0.94, 0.26, 0.1], "soft_saw")], gain=0.64),
            mix_layers([tone(150, [300, 720, 1480], [0.96, 0.28, 0.1], "soft_saw")], gain=0.66),
        ], gap_ms=24)
    if style == "low_battery":
        return concat_segments([
            mix_layers([tone(100, [420, 840], [0.9, 0.22], "triangle")], gain=0.56),
            mix_layers([tone(120, [360, 720], [0.92, 0.22], "triangle")], gain=0.58),
        ], gap_ms=24)
    if style == "storage_near_full":
        return concat_segments([
            mix_layers([tone(90, [500, 980], [0.88, 0.18], "triangle")], gain=0.54),
            mix_layers([tone(110, [440, 880], [0.9, 0.18], "triangle")], gain=0.54),
        ], gap_ms=20)
    if style == "sensor_error":
        return concat_segments([
            mix_layers([tone(110, [360, 680, 1280], [0.94, 0.28, 0.1], "soft_saw")], gain=0.62),
            mix_layers([tone(110, [320, 620, 1220], [0.96, 0.28, 0.1], "soft_saw")], gain=0.64),
            mix_layers([tone(120, [300, 580, 1180], [0.96, 0.28, 0.1], "soft_saw")], gain=0.64),
        ], gap_ms=22)
    if style == "cal_complete":
        return concat_segments([
            mix_layers([tone(80, [760], [0.82], "triangle")], gain=0.42),
            mix_layers([tone(90, [980, 1470], [0.82, 0.18], "sine")], gain=0.45),
            mix_layers([tone(90, [1220, 1830], [0.8, 0.16], "sine")], gain=0.46),
        ], gap_ms=10)
    if style == "cal_fail":
        return concat_segments([
            mix_layers([tone(100, [520, 900], [0.9, 0.18], "triangle")], gain=0.56),
            mix_layers([tone(120, [420, 760, 1380], [0.9, 0.22, 0.08], "soft_saw")], gain=0.58),
        ], gap_ms=16)
    if style == "standby_enter":
        return concat_segments([
            mix_layers([tone(80, [620], [0.84], "triangle")], gain=0.42),
            mix_layers([tone(110, [430], [0.86], "sine")], gain=0.4),
        ], gap_ms=10)
    if style == "standby_exit":
        return concat_segments([
            mix_layers([tone(70, [430], [0.82], "triangle")], gain=0.4),
            mix_layers([tone(120, [620, 930], [0.82, 0.18], "sine")], gain=0.44),
        ], gap_ms=10)
    if style == "blackout_enter":
        return mix_layers([tone(duration_ms, [360], [0.8], "triangle")], gain=0.35)
    if style == "blackout_exit":
        return concat_segments([
            mix_layers([tone(70, [420], [0.82], "triangle")], gain=0.36),
            mix_layers([tone(90, [620], [0.82], "sine")], gain=0.4),
        ], gap_ms=8)
    raise ValueError(f"Unsupported style: {style}")


def asset_list() -> list[dict]:
    items = ASSET_MANIFEST["assets"]
    if ARGS.only_failed:
        failed = read_failed_filenames()
        items = [item for item in items if item["filename"] in failed]
    if ARGS.match:
        token = ARGS.match.lower()
        items = [item for item in items if token in item["filename"].lower()]
    return items


def generate_asset(asset: dict) -> tuple[bool, dict]:
    out_path = ROOT / asset["path"]
    if out_path.exists() and not ARGS.force:
        return True, {"status": "skipped_existing", "path": str(out_path), "error": None}
    left, right = style_render(asset["style"], int(asset["duration_ms"]))
    write_wav(out_path, left, right)
    return True, {"status": "generated", "path": str(out_path), "error": None}


def main() -> int:
    items = asset_list()
    results = []
    failed = []
    for asset in items:
        try:
            ok, meta = generate_asset(asset)
            results.append({
                "filename": asset["filename"],
                "category": asset["category"],
                "priority": asset["priority"],
                **meta,
            })
            print(f"[ok] {asset['filename']} -> {meta['status']}")
        except Exception as exc:
            failed.append({"filename": asset["filename"], "error": f"{type(exc).__name__}: {exc}"})
            results.append({
                "filename": asset["filename"],
                "category": asset["category"],
                "priority": asset["priority"],
                "status": "failed",
                "path": str(ROOT / asset["path"]),
                "error": f"{type(exc).__name__}: {exc}",
            })
            print(f"[fail] {asset['filename']} -> {exc}")

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps({
        "generated_at_unix": int(time.time()),
        "requested": len(items),
        "failed": len(failed),
        "results": results,
    }, indent=2), encoding="utf-8")
    FAILED_PATH.write_text(json.dumps({
        "generated_at_unix": int(time.time()),
        "failed_assets": failed,
        "rerun_command": 'cd "c:\\Users\\acloy\\Desktop\\NEVEX_XR_AudioPack\\05_TOOLS" && python generate_audio_pack.py --only-failed',
    }, indent=2), encoding="utf-8")
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
