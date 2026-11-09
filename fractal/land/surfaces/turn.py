"""land.surfaces.turn: a painted texture laid through a pattern transform (painted-turn.ts): the course texture's offset, angle and scale, and the chunk frame."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.surfaces.turn", rung=3, title="Painted texture transform",
    purpose="Turn a painted texture to the course's direction and scale, so the picture lies the way the surface was drawn.",
    requires=[
        "texTransform builds the affine transform from an offset, an angle and a scale (degrees and units as the Paint tool stores them).",
        "paintedLay takes the chunk frame and the transform and returns the layout of the painted tiles for the chunk.",
        "inv and mul compose and invert the affine transforms, so a chunk box maps back to texture space.",
    ],
    owns=["Aff (the six-number affine transform)", "IDENT (painted-turn.ts:12)"],
    files=["src/game/painted-turn.ts"],
    dynamics=[
        Fn(name="texTransform", at="src/game/painted-turn.ts:29", does="the affine transform of a painted texture from its offset, angle and scale", sig="texTransform(o, a, sc)"),
        Fn(name="paintedLay", at="src/game/painted-turn.ts:52", does="the painted tile layout of one chunk through a transform", sig="paintedLay(c, G, scale, tiled, need?)"),
    ],
    inputs=["a chunk frame and a course texture transform"], outputs=["the painted layout for the chunk"],
    tests=["tests/t311-painted-turn.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.layers", "land.bake.worker"],
    dual="MISSING: a transform is recomputed on each bake; a turn is changed by setting the old angle back",
    seams=["the course texture settings (CourseTex) come from the course surfaces"],
    rules=["no visible tiling", "straight views turned 8 degrees"],
    impl="describe",
)
