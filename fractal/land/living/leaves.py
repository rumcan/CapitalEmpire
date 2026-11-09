"""land.living.leaves: the fallen leaves baked into the ground (leaf-fall.ts layLeaves, leaf-atlas.ts leafAtlasAt): piles, drifts, scatters, leaf pictures."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.leaves", rung=3, title="Fallen leaves",
    purpose="Lay fallen leaves on the ground: piles, drifts and scatters on the backyards and the town, with a density the player sets.",
    requires=[
        "LEAF_DENSITY_DEFAULT is 1 and LEAF_DENSITY_MAX is 2; clampLeafDensity keeps the setting in range.",
        "leafPictures makes the leaf pictures once; PIC_COUNT is the number of pictures in the atlas.",
        "layLeaves lays the leaves over a box from its sources (casters, roads) at a density, and leafSignature says when to redo it.",
    ],
    owns=["LK leaf kinds (PILE, DRIFT, SCATTER, SMALL)", "MOOD and LEAF_TINTS (leaf-fall.ts:37-40)", "LEAF_DENSITY_DEFAULT and LEAF_DENSITY_MAX (leaf-fall.ts:18-19)"],
    files=["src/game/leaf-fall.ts", "src/game/leaf-atlas.ts", "src/game/roof-dust.ts"],
    dynamics=[
        Fn(name="layLeaves", at="src/game/leaf-fall.ts:148", does="lays the fallen leaves over a box at a density", sig="layLeaves(box, src, density): Float32Array"),
        Fn(name="leafPictures", at="src/game/leaf-fall.ts:76", does="makes the leaf pictures for the atlas", sig="leafPictures(): Float32Array[]"),
        Fn(name="leafAtlasAt", at="src/game/leaf-atlas.ts:26", does="draws the leaf atlas at a zoom level", sig="leafAtlasAt(L, sheet, pick, desert?)"),
    ],
    inputs=["a box, the leaf sources (casters, roads) and a density"], outputs=["leaf placements and the leaf atlas picture"],
    tests=["tests/leaf-fall.test.ts", "tests/desert-litter.test.ts"],
    below=["land.living.influence"], above=["land.bake.worker", "land.themes.litter"],
    dual="setLeafDensity on the ground cache sets the density back; a leaf placement is recomputed on each bake",
    seams=["the casters and roads come from town and course"],
    rules=["no visible tiling", "town jams are the player's job", "performance is a hard gate"],
    impl="describe",
)
