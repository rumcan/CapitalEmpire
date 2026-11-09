"""land.living.shine: the grass catches the sun (grass-shine.ts): a shine weight mask per texture group, its look and its gain by night and zoom."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.shine", rung=3, title="Grass shine",
    purpose="Make grass catch the camera shine: a textured gloss weight per grass kind, lit from the sun at the upper right.",
    requires=[
        "shineWeight gives the weight of a texture by its group and kind; SHINE_WEIGHTS holds the default weights.",
        "clampShineLook keeps the shine look in range; SHINE_LOOK is on with strength 0.8 and size 1.",
        "shineMaskPixels turns a source picture into the shine mask at SHINE_TEXEL (24) world units per texel.",
    ],
    owns=["SHINE_LOOK and SHINE_WEIGHTS (grass-shine.ts:42, :81)", "SHINE_KEY (the saved key, v2)", "SHINE_INSET and SHINE_ZOOM (the falloff)"],
    files=["src/game/grass-shine.ts"],
    dynamics=[
        Fn(name="shineWeight", at="src/game/grass-shine.ts:66", does="the shine weight of a texture by its group and kind", sig="shineWeight(tex, kind, w)"),
        Fn(name="clampShineLook", at="src/game/grass-shine.ts:84", does="clamps a saved shine look", sig="clampShineLook(s): ShineLook"),
        Fn(name="shineMaskPixels", at="src/game/grass-shine.ts:128", does="the shine mask pixels from a source picture", sig="shineMaskPixels(src, W, H, texel, ...)"),
    ],
    inputs=["a texture, its kind, the shine look and the source picture"], outputs=["shine weights and the shine mask"],
    tests=["tests/grass-shine.test.ts", "tests/custom-grass.test.ts", "tests/water-glint.test.ts"],
    below=["land.surfaces.assign"], above=["land.bake.worker", "render"],
    dual="setGrassShine(false) on the ground cache switches it off; the look is set back by its own setter",
    seams=["the shine look is saved with the surfaces file"],
    rules=["highlights are textured", "sun upper right, shadows 145 degrees", "performance is a hard gate"],
    impl="describe",
)
