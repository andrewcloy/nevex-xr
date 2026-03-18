from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

from openai import OpenAI


TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
MANIFEST_PATH = ROOT / "02_MANIFESTS" / "generation_manifest.json"
LOG_PATH = ROOT / "03_ASSETS" / "logs" / "generation_log.json"
FAILED_PATH = ROOT / "06_HANDOFF" / "FAILED_ASSETS.md"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate NEVEX XR icons with OpenAI Images API.")
    parser.add_argument("--priority", choices=["P0", "P1"], help="Limit generation by priority.")
    parser.add_argument("--family", choices=["glyph", "tile", "panel"], help="Limit generation by family.")
    parser.add_argument("--only-failed", action="store_true", help="Regenerate only assets listed as failed in the last log.")
    parser.add_argument("--include-planned", action="store_true", help="Include manifest entries not flagged for the first-pass queue.")
    parser.add_argument("--match", help="Only generate assets whose asset_name contains this substring.")
    parser.add_argument("--limit", type=int, help="Stop after N generation attempts.")
    parser.add_argument("--force", action="store_true", help="Regenerate even if output file already exists.")
    return parser.parse_args()


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def load_previous_failed() -> set[str]:
    if not LOG_PATH.exists():
        return set()
    data = json.loads(LOG_PATH.read_text(encoding="utf-8"))
    failures = data.get("summary", {}).get("failed_variant_keys", [])
    return set(failures)


def variant_key(item: dict) -> str:
    return f"{item['asset_name']}::{item['family']}"


def filter_variants(variants: list[dict], args: argparse.Namespace) -> list[dict]:
    records = list(variants)
    if not args.include_planned and not args.only_failed:
        records = [v for v in records if v.get("generate_now", False)]
    if args.priority:
        records = [v for v in records if v["priority"] == args.priority]
    if args.family:
        records = [v for v in records if v["family"] == args.family]
    if args.match:
        records = [v for v in records if args.match.lower() in v["asset_name"].lower()]
    if args.only_failed:
        failed = load_previous_failed()
        records = [v for v in records if variant_key(v) in failed]
    if args.limit is not None:
        records = records[: args.limit]
    return records


def resolve_models() -> list[str]:
    env_model = os.getenv("OPENAI_IMAGE_MODEL")
    if env_model:
        return [env_model]
    return ["gpt-image-1.5", "gpt-image-1"]


def decode_and_save(b64_data: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(base64.b64decode(b64_data))


def generate_one(client: OpenAI, item: dict) -> tuple[bool, dict]:
    prompt = item["prompt"]
    output_path = ROOT / item["output_path"]
    if output_path.exists() and not ARGS.force:
        return True, {
            "status": "skipped_existing",
            "output_path": str(output_path),
            "model": None,
            "attempts": 0,
            "error": None,
            "prompt": prompt,
        }

    background = "transparent"
    quality = os.getenv("OPENAI_IMAGE_QUALITY", "medium")
    last_error = None

    for model in resolve_models():
        for attempt in range(1, 4):
            try:
                result = client.images.generate(
                    model=model,
                    prompt=prompt,
                    size="1024x1024",
                    quality=quality,
                    output_format="png",
                    background=background,
                )
                image = result.data[0]
                if not getattr(image, "b64_json", None):
                    raise RuntimeError("No image data returned from OpenAI Images API.")
                decode_and_save(image.b64_json, output_path)
                return True, {
                    "status": "generated",
                    "output_path": str(output_path),
                    "model": model,
                    "attempts": attempt,
                    "error": None,
                    "prompt": prompt,
                }
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                time.sleep(2 + attempt)
        # Try next fallback model if present.

    return False, {
        "status": "failed",
        "output_path": str(output_path),
        "model": resolve_models()[0],
        "attempts": 3,
        "error": last_error,
        "prompt": prompt,
    }


def write_failed_markdown(failed_items: list[dict]) -> None:
    lines = ["# Failed Assets", ""]
    if not failed_items:
        lines += ["No failures recorded in the latest generation run.", ""]
    else:
        lines += ["The following variants failed during the latest generation run:", ""]
        for item in failed_items:
            lines.append(f"- `{item['asset_name']}::{item['family']}`")
        lines.append("")
    lines += [
        "Rerun only failures with:",
        "",
        "```powershell",
        "cd 05_TOOLS",
        "python generate_openai_icons.py --only-failed",
        "```",
        "",
    ]
    FAILED_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set.", file=sys.stderr)
        return 1

    manifest = load_manifest()
    variants = filter_variants(manifest["variants"], ARGS)
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    client = OpenAI(api_key=api_key)

    results = []
    succeeded = 0
    failed = []

    for item in variants:
        ok, meta = generate_one(client, item)
        record = {
            "asset_name": item["asset_name"],
            "family": item["family"],
            "priority": item["priority"],
            "category": item["category"],
            "variant_key": variant_key(item),
            **meta,
        }
        results.append(record)
        if ok:
            succeeded += 1
            print(f"[ok] {record['variant_key']} -> {record['status']}")
        else:
            failed.append(record)
            print(f"[fail] {record['variant_key']} -> {record['error']}")
        time.sleep(float(os.getenv("OPENAI_IMAGE_DELAY_SECONDS", "0.4")))

    summary = {
        "requested": len(variants),
        "succeeded_or_skipped": succeeded,
        "failed": len(failed),
        "failed_variant_keys": [item["variant_key"] for item in failed],
        "models_tried": resolve_models(),
    }
    payload = {
        "generated_at_unix": int(time.time()),
        "summary": summary,
        "results": results,
    }
    LOG_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_failed_markdown(failed)
    return 0 if not failed else 2


ARGS = parse_args()

if __name__ == "__main__":
    raise SystemExit(main())
