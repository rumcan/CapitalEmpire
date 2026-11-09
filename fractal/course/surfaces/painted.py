"""course.surfaces.painted: how the course uses the painted textures. The painted files are owned by land.surfaces (the lead's decision, 2026-11-09): this leaf owns none of them."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.surfaces.painted", rung=3, title="Painted textures (course use)",
    purpose="How the course's surface looks name and draw the painted textures that land.surfaces owns: a look picks a texture family by id, its scale and tone, and the course draws it.",
    requires=[
        "A course surface look names its texture by id, and land.surfaces resolves that id to a painted family (resolveFamily).",
        "A look's scale is between 0.25 and 4 and its tone between -0.6 and 0.6 (LOOK_RANGES), the same ranges the course looks are clamped to.",
    ],
    files=[],
    dynamics=[],
    inputs=["a course surface look (family id, version, scale, tint, tone)"], outputs=["the textures the course draws, resolved by land.surfaces"],
    tests=["tests/painted-families.test.ts", "tests/painted-tiles.test.ts", "tests/t311-painted-turn.test.ts"],
    below=["land.surfaces"], above=["course.surfaces", "render"],
    seams=["land.surfaces: the painted family, look and tile types (PaintedLook, TiledFamily) that the course looks reference"],
    dual="setPaintedSurfaces with the old file (owned by land.surfaces); the course keeps its look ids",
    impl="describe",
    steer={"scale_min": 0.25, "scale_max": 4, "tone_min": -0.6, "tone_max": 0.6},
)
