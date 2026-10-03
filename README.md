# Conch's Blessing item codex

The UI is maintained here; the Pages workflow generates mod item data and copies
mod sprites from `Ba-koD/conch_blessing`. Vanilla references are versioned here
so English/Korean names, IDs and images are available together.

## Vanilla item data

`data/vanilla_items.json` stores collectible/trinket IDs, enum keys, English and
Korean names and pickup descriptions from the game's string tables, and sprite
paths. `assets/vanilla` contains the unmodified vanilla PNGs. Names use the game's
official translation, including names intentionally unchanged between languages.
Each record retains its original sprite path and role. When the extracted item
PNG is absent, the importer accepts only the matching enum's dedicated vanilla
HUD icon. Horizontal state sheets retain all pixels and display their first
32×32 state with CSS clipping.

Regenerate from a read-only extracted installation:

```sh
python import_vanilla_items.py --resources "/path/to/extracted_resources/resources" --enums "/path/to/game/resources/scripts/enums.lua"
python build_vanilla_js.py
```

The importer needs Pillow. It validates all names and sprites before copying.
Original vanilla names/art belong to The Binding of Isaac's creators; mod item
data and art come from Conch's Blessing. No other mod's implementation or art is
used for the vanilla catalog.

## Browser verification

Generate `items.js` from a mod checkout with `generate_items_js.py`, generate
`itemmap.js` with `build_id_pools.py`, and run `build_vanilla_js.py`. Copy the mod's
`resources/gfx/items` folders into the local preview and serve it over HTTP.
With Playwright and Chrome installed, run:

```sh
node tests/browser.cjs http://127.0.0.1:8766/
```

The check exercises composition/input events without replacing the focused
search node, caret retention, Korean/English matching, no-match/clear behavior,
all generated synergy images, upgrade images, localized evolution conditions,
pin/hover precedence, preview size/scrolling and desktop/mobile section order.

Magic Conch routes use the source registry's origin and answer flag for both
vanilla and mod origins. Separate evolution routes use the source locales'
explicit evolution lines containing `{own:KEY}` references (English `evolves
into` or Korean `진화`); their text remains the condition source of truth. An
origin declaration alone and downgrade descriptions do not establish evolution.
