"""land.themes.litter: the desert litter (desert-litter.ts): sand, stones, brush, straw and the desert leaf sheet, drawn once per ground."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.themes.litter", rung=3, title="Desert litter",
    purpose="Scatter the desert litter on the ground in place of the green leaves: sand grains, stones, brush, straw and dry tufts.",
    requires=[
        "DESERT_LITTER_SCALE is 1.7 and DESERT_FALL_SCALE 1.15; the litter palettes are the SAND, STONE, BRUSH, SAGE and STRAW colours.",
        "desertLeafSheet draws the desert leaf sheet once; desertMapDecals and desertLotDecals draw the decal sheets from it.",
        "The drawing helpers (pebble, sandClump, twig, tumbleweed and the rest) take a random source, so the same seed draws the same litter.",
    ],
    owns=["SAND, STONE, BRUSH, SAGE, STRAW palettes (desert-litter.ts:18-30)", "DESERT_LITTER_SCALE and DESERT_FALL_SCALE (desert-litter.ts:34)"],
    files=["src/game/desert-litter.ts"],
    dynamics=[
        Fn(name="desertLeafSheet", at="src/game/desert-litter.ts:202", does="draws the desert leaf sheet", sig="desertLeafSheet(grain = false): Cnv"),
        Fn(name="desertMapDecals", at="src/game/desert-litter.ts:253", does="draws the desert map decal sheet", sig="desertMapDecals(): Cnv"),
        Fn(name="desertLotDecals", at="src/game/desert-litter.ts:242", does="draws the desert lot decal sheet", sig="desertLotDecals(): Cnv"),
    ],
    inputs=["a grain flag and the random source"], outputs=["the desert decal and leaf sheets"],
    tests=["tests/desert-litter.test.ts", "tests/soft-edges.test.ts", "tests/desert-sand.test.ts"],
    below=["land.living.leaves", "land.nature.patches"], above=["land.bake.worker", "land.nature.decals"],
    dual="MISSING: a drawn sheet is redrawn each run; the green leaves come back when the desert toggle is off",
    seams=["the litter replaces the leaves on roads and the map (owner 2026-11-08)"],
    rules=["no visible tiling", "no flat colour washes", "new art used everywhere"],
    impl="describe",
)
