"""land.surfaces.edges: the edge of a painted surface (paint-edges.ts): a light feather and a bevel with shadow and light, from the sun at the upper right."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.surfaces.edges", rung=3, title="Painted surface edges",
    purpose="Give a painted edge a feather and a bevel, lit from the upper right, so a painted surface meets the ground without a hard line.",
    requires=[
        "edgeProfileOf picks the edge profile (crisp, flat, turf, raised, sunken or water) from the surface and its texture.",
        "sunFacing and edgeShade set the light and dark side of an edge from the sun direction (upper right).",
        "edgeImages returns the cut, light and dark edge images for a box; featherTiles sets the feather width from the zoom.",
    ],
    owns=["EDGE_LOOKS (paint-edges.ts:44)", "LIGHT_RGB, SHADE_RGB (the edge colours)", "AREA_SHADE (the area shadow tuning)"],
    files=["src/game/paint-edges.ts", "src/game/soft-edges.ts"],
    dynamics=[
        Fn(name="edgeProfileOf", at="src/game/paint-edges.ts:70", does="the edge profile of a surface and its texture", sig="edgeProfileOf(surface, tex, btex?)"),
        Fn(name="edgeField", at="src/game/paint-edges.ts:157", does="the distance field of a polygon edge over a box", sig="edgeField(pts, x0, y0, w, h, ...)"),
        Fn(name="edgeImages", at="src/game/paint-edges.ts:242", does="the cut, light and dark images of an edge", sig="edgeImages(f, look, feather)"),
    ],
    inputs=["a surface polygon, its texture and its edge look"], outputs=["edge images: cut, light, dark"],
    tests=["tests/paint-edges.test.ts", "tests/area-shadow.test.ts", "tests/cast-shadow.test.ts", "tests/joint-soft.test.ts", "tests/ext-course-snap.test.ts"],
    below=["land.surfaces.families"], above=["land.bake.layers", "land.bake.worker"],
    dual="MISSING: a drawn edge is repainted on the next bake; an edge profile is changed by setting it back",
    seams=["the sun direction is the one sun of the game (upper right, shadows 145 degrees)"],
    rules=["sun upper right, shadows 145 degrees", "highlights are textured", "no flat colour washes"],
    impl="describe",
)
