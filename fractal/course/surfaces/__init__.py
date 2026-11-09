"""course.surfaces: what the course is made of: the finish that bands it, the looks of each surface, the painted textures, the grasses, the blobs and edges, and the cart-path bevel."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.surfaces", rung=2, title="Course surfaces",
    purpose="Paint the course's surfaces (fairway, rough, green, tee, bunker, water, waste, long grass) with textures, their finish and edges, and the cart-path bevel.",
    requires=[
        "The course's surface kinds are fairway, green, tee, rough, bunker, water, waste and longGrass (LOOK_KINDS).",
        "The painted surface groups are Golf, Map, Town, Living ground and Course walls (SURFACES).",
        "A lawn has 8 slots (LAWN_SLOTS), and a painted look defaults to the emerald-medium family (DEFAULT_LOOK).",
        "The grass plays are fairway, first cut, rough, long grass and fescue, with lengths 2 to 5 (PLAY_LENGTH).",
    ],
    below=["course.design", "course.terrain", "land"],
    above=["course", "render"],
    dual="each look or surface is replaced by the old look, kept as an option (new art used everywhere, the old look kept)",
    rules=["no flat colour washes", "highlights are textured", "no visible tiling", "new art used everywhere; the old look kept as an option"],
)
