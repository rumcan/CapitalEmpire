"""course.design.snap: the snap of course pieces (fairway, green, tee, bunker, water, path, road) to the grid and the sun."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.design.snap", rung=3, title="Piece snap",
    purpose="Place a whole piece (a green, a bunker, a tee, a path) at the cursor, snapped to its neighbours and to the sun-facing bevel.",
    requires=[
        "A piece's angle is wrapped into one turn of the compass (wrapPaintAngle).",
        "Each piece kind has a default shape (defaultArchetypeForKind).",
    ],
    files=["src/game/ext/course-snap/index.ts"],
    dynamics=[
        Fn(name="computeSnapPiecePlacement", at="src/game/ext/course-snap/index.ts:300", does="the placement of one piece: its polygon, its texture and its props", sig="computeSnapPiecePlacement(opts: SnapPieceOptions): SnapPiecePlacement"),
        Fn(name="buildPiecePolygon", at="src/game/ext/course-snap/index.ts:231", does="the polygon of a piece of a kind at an anchor", sig="buildPiecePolygon(kind, anchor, angleDeg, ...)"),
        Fn(name="buildSunRightBevelPolygons", at="src/game/ext/course-snap/index.ts:184", does="the bevel rings lit from the sun at the upper right", sig="buildSunRightBevelPolygons(pts, elevationMode, ...)"),
    ],
    inputs=["a piece kind, an anchor and an angle", "the course's areas, roads and tees"], outputs=["a piece placement: polygon, texture, props"],
    tests=["tests/ext-course-snap.test.ts", "tests/ext-course-pieces.test.ts", "tests/golf-hole-terrain.test.ts"],
    below=["course.design.grid"], above=["course.design"],
    dual="remove the piece (the editor's undo stack)",
    impl="describe", steer={"sun_shadow_deg": 145},
)
