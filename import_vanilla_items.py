#!/usr/bin/env python3
"""Import vanilla names and sprites from a read-only extracted Isaac installation.

python import_vanilla_items.py --resources /path/to/extracted_resources/resources \
    --enums /path/to/game/resources/scripts/enums.lua
The committed catalog/assets are used by Pages; CI never needs a game install.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET
from PIL import Image


def read_strings(resources):
    strings = {}
    for filename in ("stringtable.sta", "stringtable_pc.sta"):
        root = ET.parse(resources / filename).getroot()
        indexes = {x.get("name"): int(x.get("index")) - 1 for x in root.find("languages")}
        for key in root.iter("key"):
            values = [x.text or "" for x in key.findall("string")]
            names = {lang: values[indexes[name]] for lang, name in (("en", "English"), ("kr", "Korean"))
                     if 0 <= indexes.get(name, -1) < len(values) and values[indexes[name]]}
            strings.setdefault(key.get("name"), {}).update(names)
    return strings


def read_enums(path):
    text = path.read_text(encoding="utf-8")
    enums = {}
    for prefix, table, constant in (("C", "CollectibleType", "COLLECTIBLE"), ("T", "TrinketType", "TRINKET")):
        block = re.search(r"\b" + table + r"\s*=\s*\{([^}]+)\}", text, re.S)
        if not block:
            raise ValueError(f"Missing enum table: {table}")
        enums[prefix] = {}
        for name, number in re.findall(r"\b" + constant + r"_(\w+)\s*=\s*(\d+)", block.group(1)):
            if name not in ("NULL", "NUM_COLLECTIBLES", "NUM_TRINKETS"):
                enums[prefix].setdefault(int(number), name)
    return enums


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resources", required=True, type=Path)
    parser.add_argument("--enums", required=True, type=Path)
    args = parser.parse_args()
    destination = Path(__file__).resolve().parent
    strings, enums = read_strings(args.resources), read_enums(args.enums)
    files = {path.relative_to(args.resources).as_posix().lower(): path
             for folder in ("gfx/items", "gfx/ui") for path in (args.resources / folder).rglob("*.png")}
    entries, copies, missing = {}, [], []
    for item in ET.parse(args.resources / "items.xml").getroot():
        if item.tag not in ("active", "passive", "familiar", "trinket"):
            continue
        prefix = "T" if item.tag == "trinket" else "C"
        number = int(item.get("id"))
        if number not in enums[prefix]:
            continue
        name = item.get("name", "")
        names = strings.get(name.removeprefix("#"), {}) if name.startswith("#") else {"en": name, "kr": name}
        category = "trinkets" if prefix == "T" else "collectibles"
        relative = f"gfx/items/{category}/{item.get('gfx', '')}".lower()
        source = files.get(relative)
        role = "item"
        if source is None:
            # Some engine-rendered items have only their dedicated HUD icon in
            # the extracted files. Use the matching vanilla enum's HUD asset,
            # and retain its exact source/role in the catalog for review.
            source = files.get("gfx/ui/hud_" + enums[prefix][number].replace("_", "").lower() + ".png")
            role = "hud"
        if not names.get("en") or not names.get("kr") or source is None:
            missing.append(f"{prefix}:{number} {name}: names={list(names)}, sprite={source is not None}")
            continue
        gfx = f"assets/vanilla/{category}/{number}.png"
        description = item.get("description", "")
        descriptions = strings.get(description.removeprefix("#"), {}) if description.startswith("#") else {"en": description, "kr": description}
        entries[f"{prefix}:{number}"] = {"id": number, "enum": enums[prefix][number], "type": item.tag,
                                         "names": names, "descriptions": descriptions, "gfx": gfx,
                                         "spriteSource": source.relative_to(args.resources).as_posix(), "spriteRole": role}
        with Image.open(source) as image:
            if image.size != (32, 32):
                if image.height != 32 or image.width % 32:
                    raise ValueError(f"Unsupported item sprite sheet: {source}, {image.size}")
                # Preserve the original horizontal state sheet. Browser display
                # clips to its first native 32x32 state instead of squeezing it.
                entries[f"{prefix}:{number}"]["spriteFrame"] = {"width": 32, "height": 32, "x": 0, "y": 0}
        copies.append((source, destination / gfx))
    if missing:
        raise ValueError("Incomplete vanilla import:\n" + "\n".join(missing))
    catalog = {"source": {"name": "The Binding of Isaac: Repentance+", "files": ["items.xml", "stringtable.sta", "stringtable_pc.sta", "resources/scripts/enums.lua"],
                           "note": "Names are the game's English/Korean localization; sprites are unmodified extracted item PNGs."},
               "items": entries}
    (destination / "data").mkdir(exist_ok=True)
    (destination / "data/vanilla_items.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for source, target in copies:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    print(f"Imported {sum(k.startswith('C:') for k in entries)} collectibles and {sum(k.startswith('T:') for k in entries)} trinkets with English/Korean names and sprites.")
    print(f"Dedicated vanilla HUD icons: {sum(x['spriteRole'] == 'hud' for x in entries.values())}")


if __name__ == "__main__":
    main()
