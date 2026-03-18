from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
THEME = json.loads((ROOT / "02_MANIFESTS" / "theme_tokens.json").read_text(encoding="utf-8"))
ASSET_MANIFEST = json.loads((ROOT / "02_MANIFESTS" / "asset_manifest.json").read_text(encoding="utf-8"))
PREVIEW_PATH = ROOT / "04_PREVIEW" / "preview_manifest.json"
CONTACT_DIR = ROOT / "03_ASSETS" / "png" / "contact_sheets"
PLACEHOLDER_DIR = ROOT / "03_ASSETS" / "png" / "placeholders"


def make_placeholder(name: str, family: str) -> Path:
    PLACEHOLDER_DIR.mkdir(parents=True, exist_ok=True)
    path = PLACEHOLDER_DIR / f"{name}__{family}.png"
    if path.exists():
        return path

    image = Image.new("RGBA", (1024, 1024), (6, 9, 14, 255))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((96, 96, 928, 928), radius=180, outline=(94, 231, 255, 100), width=6)
    draw.rounded_rectangle((200, 200, 824, 824), radius=140, outline=(31, 167, 255, 80), width=4)
    font = ImageFont.load_default()
    draw.text((240, 460), f"{name}\n{family}", fill=(234, 247, 255, 255), font=font, spacing=8)
    image.save(path)
    return path


def build_sections() -> list[dict]:
    sections = []
    for family, title, folder in [
        ("glyph", "Glyph Icons", ROOT / "03_ASSETS" / "png" / "glyph_icons"),
        ("tile", "Tile Icons", ROOT / "03_ASSETS" / "png" / "tile_icons"),
        ("panel", "Panel Assets", ROOT / "03_ASSETS" / "png" / "panels"),
    ]:
        items = []
        for asset in ASSET_MANIFEST["assets"]:
            if family not in asset["families"]:
                continue
            candidate = folder / f"{asset['name']}.png"
            if not candidate.exists():
                candidate = make_placeholder(asset["name"], family)
            rel = candidate.relative_to(ROOT / "04_PREVIEW").as_posix() if str(candidate).startswith(str(ROOT / "04_PREVIEW")) else "../" + candidate.relative_to(ROOT).as_posix()
            items.append(
                {
                    "name": asset["name"],
                    "family": family,
                    "category": asset["category"],
                    "src": rel,
                }
            )
        sections.append({"title": title, "items": items})
    return sections


def build_contact_sheet(family: str, source_dir: Path, output_path: Path) -> None:
    names = sorted({p.stem for p in source_dir.glob("*.png")})
    if not names:
        return
    tile_size = 220
    cols = 4
    rows = (len(names) + cols - 1) // cols
    image = Image.new("RGBA", (cols * tile_size + 40, rows * tile_size + 80), (6, 9, 14, 255))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((20, 20), f"NEVEX XR {family} contact sheet", fill=(234, 247, 255, 255), font=font)

    for idx, name in enumerate(names):
        x = 20 + (idx % cols) * tile_size
        y = 50 + (idx // cols) * tile_size
        draw.rounded_rectangle((x, y, x + 196, y + 196), radius=24, outline=(94, 231, 255, 90), width=2)
        asset = Image.open(source_dir / f"{name}.png").convert("RGBA")
        asset.thumbnail((160, 160))
        px = x + (196 - asset.width) // 2
        py = y + 10
        image.alpha_composite(asset, (px, py))
        draw.text((x + 8, y + 176), name, fill=(143, 169, 186, 255), font=font)

    image.save(output_path)


def main() -> int:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    build_contact_sheet("glyph", ROOT / "03_ASSETS" / "png" / "glyph_icons", CONTACT_DIR / "glyph_contact_sheet.png")
    build_contact_sheet("tile", ROOT / "03_ASSETS" / "png" / "tile_icons", CONTACT_DIR / "tile_contact_sheet.png")
    preview = {
        "theme": THEME,
        "sections": build_sections(),
    }
    PREVIEW_PATH.write_text(json.dumps(preview, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
