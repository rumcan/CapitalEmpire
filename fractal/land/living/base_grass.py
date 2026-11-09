"""land.living.base-grass: the map base grass (base-grass.ts): two pictures mixed in soft patches, with a tone, and the owner saved version (base-grass-saved.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.base-grass", rung=3, title="Base grass mix",
    purpose="Lay the map base grass: two grass pictures hex-mixed in soft patches, the second over the first where a low-frequency mask says so.",
    requires=[
        "DEFAULT_MIX has share 0.5, soft 0.12, patch 1, tone 0.1; clampMix keeps the mix in its RANGES.",
        "mixGrass blends the two pictures over a W by H canvas from the mix and the authored settings.",
        "withBaseGrass puts the owner saved base grass (base-grass.json and the two pictures) into a surfaces file.",
    ],
    owns=["DEFAULT_MIX and DEFAULT_SIDE (base-grass.ts:43-44)", "RANGES (base-grass.ts:46)", "base-grass.json (the saved mix)"],
    files=["src/game/base-grass.ts", "src/game/base-grass-saved.ts", "src/game/base-grass.json", "src/game/canvas2d.ts", "src/game/textures.ts"],
    dynamics=[
        Fn(name="clampMix", at="src/game/base-grass.ts:57", does="clamps a grass mix to its ranges", sig="clampMix(m): GrassMix"),
        Fn(name="mixGrass", at="src/game/base-grass.ts:88", does="blends the two base grass pictures in soft patches", sig="mixGrass(gA, gB, mix, W, H, authored)"),
        Fn(name="withBaseGrass", at="src/game/base-grass-saved.ts:12", does="puts the saved base grass into a surfaces file", sig="withBaseGrass(ar)"),
    ],
    inputs=["two grass pictures and a mix"], outputs=["the mixed base grass canvas"],
    tests=["tests/base-grass.test.ts", "tests/paint-presets.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.worker", "land.nature.decals"],
    dual="MISSING: a mix is replaced by the next save of the Ground tab; the previous mix is not kept (only the old look option is)",
    seams=["base grass is saved from the sprite studio Ground tab (base-grass.json)"],
    rules=["no flat colour washes", "no visible tiling", "new art used everywhere"],
    impl="describe",
)
