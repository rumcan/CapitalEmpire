"""land.surfaces.families: the painted ground families (painted-families.ts), their tiled sets (painted-tiles.ts) and the picture URLs (painted-grass-art.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.surfaces.families", rung=3, title="Painted families and tile sets",
    purpose="Know each painted ground family: its palette, its picture at each of three detail levels, and its tile set for the zoom bands.",
    requires=[
        "resolveFamily picks a family's level pictures for a look (family, version, scale); LOOK_RANGES bounds the scale and tone.",
        "familyWeights blends the near, mid and far levels for a zoom L.",
        "bandAt and nextBand pick the tile band for a zoom, with hysteresis so the band does not flicker.",
        "tilePermutation shuffles tile picks per family and band so no tile repeats in a visible pattern.",
    ],
    owns=["FAMILIES (painted-families.ts:45, from the registry json)", "TILES and ANCHORS (painted-tiles.ts:81-85, from the manifest json)"],
    files=["src/game/painted-families.ts", "src/game/painted-families.json", "src/game/painted-tiles.ts", "src/game/painted-tiles.json", "src/game/painted-grass-art.ts"],
    dynamics=[
        Fn(name="resolveFamily", at="src/game/painted-families.ts:76", does="the level pictures for a look", sig="resolveFamily(look): ResolvedFamily"),
        Fn(name="familyWeights", at="src/game/painted-families.ts:109", does="the blend weights of the near, mid and far levels at zoom L", sig="familyWeights(r, L)"),
        Fn(name="bandAt", at="src/game/painted-tiles.ts:114", does="the tile band for a zoom", sig="bandAt(z: number): number"),
        Fn(name="tilePermutation", at="src/game/painted-tiles.ts:165", does="the shuffle of tile picks for a family and band", sig="tilePermutation(familyId, band, n = 4)"),
        Fn(name="paintedUrl", at="src/game/painted-grass-art.ts:17", does="the picture URL of a painted file", sig="paintedUrl(file): string | null"),
    ],
    inputs=["a look (family, version, scale, tint, tone) and a zoom"], outputs=["level pictures, blend weights, tile picks"],
    tests=["tests/painted-families.test.ts", "tests/painted-tiles.test.ts", "tests/painted-grass-lod.test.ts", "tests/tile-cache.test.ts", "tests/painted-tiles-prep.test.ts"],
    below=[], above=["land.surfaces.ground", "land.surfaces.assign", "land.bake.layers"],
    dual="MISSING: a family is a picture set on disk; a look change is undone by setting the old look back (no separate undo)",
    seams=["the family registry and tile manifest come from the art pipeline (the json files)"],
    rules=["no visible tiling", "new art used everywhere", "no flat colour washes"],
    impl="describe",
)
