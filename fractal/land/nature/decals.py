"""land.nature.decals: the map decals laid over the base grass (map-decals.ts): nature, soil, grass, leaves and tufts, each with a count and a size."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.nature.decals", rung=3, title="Map decals",
    purpose="Dress the ground with decals before anything else: nature, soil, grass, leaves and tufts, each layer with its own count and size.",
    requires=[
        "DECAL_LAYERS lists the five layers (nature, soil, grass, leaves, tufts) with their count and size ranges.",
        "clampDecals keeps a saved decal file in range and fills the default layers (DEFAULT_DECALS).",
        "placeDecals places each layer over a box from a seed; drawDecals paints the placed decals with the decal art.",
    ],
    owns=["DECAL_LAYERS and DEFAULT_DECALS (map-decals.ts:33, :42)", "DRESS 8 (the base count)", "map-decals.json (the saved decal file)"],
    files=["src/game/map-decals.ts", "src/game/map-decals.json"],
    dynamics=[
        Fn(name="clampDecals", at="src/game/map-decals.ts:58", does="clamps a saved decal file and fills its defaults", sig="clampDecals(f): MapDecals"),
        Fn(name="placeDecals", at="src/game/map-decals.ts:82", does="places each decal layer over a box", sig="placeDecals(box, set)"),
        Fn(name="drawDecals", at="src/game/map-decals.ts:100", does="paints the placed decals with the decal art", sig="drawDecals(ctx, placed, art)"),
    ],
    inputs=["a box, the decal file and the decal art"], outputs=["placed decals and their paint"],
    tests=["tests/map-decals.test.ts", "tests/desert-litter.test.ts"],
    below=["land.living.base-grass"], above=["land.bake.worker"],
    dual="MISSING: placed decals are repainted from the file on each bake; the decal file is set back by its own save",
    seams=["the decal art comes from the art pipeline (the decals sheet)"],
    rules=["new art used everywhere", "no visible tiling", "no flat colour washes"],
    impl="describe",
)
