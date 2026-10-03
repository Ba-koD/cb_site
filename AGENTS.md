# cb_site

- This repository owns the Conch's Blessing codex UI and Pages workflow. Mod definitions and translations come from the checked-out `Ba-koD/conch_blessing` source through `generate_items_js.py`.
- Preserve a focused search input across filtering. During IME composition, wait for composition completion and update only the result rows; never recreate the detail panel per keystroke.
- Synergies are the last content section in item details, after effects, upgrade paths, facts, and link actions, on both desktop and mobile.
- Show Magic Conch origin/answer/result mappings for mod origins as well as vanilla origins. Evolution routes and their localized conditions are separate, derived only from explicit evolution statements with own-item references in source locales; neither an origin mapping nor a downgrade establishes evolution.
- Detail previews have a viewport-aware maximum height and internal scrolling, and shrink for short content on desktop and mobile. An explicitly pinned desktop item wins over hover/focus previews until unpinned or another item is selected; clicking its tile again unpins it.
- Vanilla item IDs, English/Korean names, and sprite paths belong in `data/vanilla_items.json`. `import_vanilla_items.py` reads extracted vanilla XML/string tables and installed enums without modifying the game files or another mod. Preserve native pixel sprites under `assets/vanilla`; do not invent Korean translations from enum names.
- `build_vanilla_js.py` validates the committed catalog/assets before export. Pages packages that export and the full vanilla asset directory. All vanilla references use their ID/type namespace to avoid collectible/trinket collisions.
- Before publishing, check generation against the current mod source, image/reference coverage, Korean composition events without input replacement, English/Korean search, desktop/mobile layout, and the Pages workflow result.
