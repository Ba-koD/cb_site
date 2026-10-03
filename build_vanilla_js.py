#!/usr/bin/env python3
"""Validate the committed vanilla catalog and export it for the browser."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    items = json.loads((ROOT / "data/vanilla_items.json").read_text(encoding="utf-8"))["items"]
    seen = set()
    for key, item in items.items():
        identity = (key.split(":")[0], item["enum"])
        assert identity not in seen, f"Duplicate vanilla enum: {identity}"
        seen.add(identity)
        assert item["names"]["en"] and item["names"]["kr"], f"Missing localized name: {key}"
        path = (ROOT / item["gfx"]).resolve()
        assert path.is_relative_to(ROOT / "assets/vanilla") and path.is_file(), f"Missing/invalid sprite: {key}"
    (ROOT / "vanilla_items.js").write_text("// Generated from data/vanilla_items.json by build_vanilla_js.py\nwindow.VANILLA_ITEMS = "
                                         + json.dumps(items, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"Validated and exported {len(items)} vanilla item references.")


if __name__ == "__main__":
    main()
