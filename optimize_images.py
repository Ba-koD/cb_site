#!/usr/bin/env python3
"""Recompress the assembled site's PNGs losslessly, without their metadata.

Several item icons are 32x32 pixels yet about 80 KB each, because they carry
Photoshop/Adobe XMP metadata; PageSpeed counted about 600 KiB of it on the home
page (2026-11-09). Browsers need only the pixels, so each PNG is saved again
with its pixels, mode, palette and transparency, and nothing else. An sRGB tag
or gamma chunk is dropped (untagged images are drawn as sRGB anyway); any other
ICC profile is kept so no colour changes. A file is replaced only when the new
one decodes to exactly the same RGBA pixels and is smaller.

    python3 optimize_images.py build
"""
from pathlib import Path
import sys

from PIL import Image


def optimize(path):
    before = path.stat().st_size
    with Image.open(path) as im:
        im.load()
        original = im.convert('RGBA')
        clean = im.copy()
        icc = im.info.get('icc_profile')
        transparency = im.info.get('transparency')
    clean.info = {}
    options = {'optimize': True}
    if transparency is not None:
        options['transparency'] = transparency
    if icc and b'sRGB' not in icc[:200]:
        options['icc_profile'] = icc
    tmp = path.with_name(path.name + '.tmp')
    clean.save(tmp, format='PNG', **options)
    with Image.open(tmp) as check:
        same = check.convert('RGBA').tobytes() == original.tobytes()
    if same and tmp.stat().st_size < before:
        tmp.replace(path)
        return before, path.stat().st_size
    tmp.unlink()
    return before, before


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else 'build')
    total_before = total_after = changed = 0
    for path in sorted(root.rglob('*.png')):
        before, after = optimize(path)
        total_before += before
        total_after += after
        changed += after < before
    print(f'optimize_images: {changed} PNGs smaller, {total_before // 1024} KiB -> {total_after // 1024} KiB')


if __name__ == '__main__':
    main()
