"""course.surfaces.grasses: the grass plays (fairway, first cut, rough, long grass, fescue), the customer's own grasses, and the course paint of each area."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.surfaces.grasses", rung=3, title="Grasses and course paint",
    purpose="The grasses a golfer plays on (and the player's own custom grasses), and the paint that lays each course area with its surface and texture.",
    requires=[
        "The grass plays are fairway, firstCut, rough, longGrass and fescue (GRASS_PLAYS), each with a length between 2 and 5 (PLAY_LENGTH).",
        "A custom grass's name is at most 24 characters (GRASS_NAME_MAX).",
        "Stripes are laid only on the fairway and first cut (stripesOk).",
    ],
    files=["src/game/golf/grasses.ts", "src/game/golf/paintcourse.ts", "src/game/tyre-tracks.ts"],
    dynamics=[
        Fn(name="newGrass", at="src/game/golf/grasses.ts:76", does="a new custom grass slot with a family and a play", sig="newGrass(k, family, n = k): CustomGrass"),
        Fn(name="ownTex", at="src/game/golf/grasses.ts:63", does="reads a 'own:' texture id back to its play and family", sig="ownTex(tex): {play, family} | null"),
        Fn(name="courseAreas", at="src/game/golf/paintcourse.ts:52", does="the course areas of a laid layout, with their surface textures", sig="courseAreas(l: CourseLayout, stats?): Omit<PaintArea,'id'>[]"),
        Fn(name="clipToBox", at="src/game/golf/paintcourse.ts:34", does="clips a polygon to a box", sig="clipToBox(pts, x0, y0, x1, y1): number[]"),
    ],
    inputs=["a grass play and a family", "a course layout"], outputs=["custom grass slots", "course areas"],
    tests=["tests/custom-grass.test.ts", "tests/golf-paintcourse.test.ts", "tests/golf-range-desert.test.ts", "tests/kit.test.ts"],
    below=["course.surfaces.painted"], above=["course.surfaces", "course.holes"],
    dual="a custom grass can be removed; its areas fall back to the built-in surface",
    impl="describe", steer={"grass_name_max": 24, "play_length": {"fairway": 2, "firstCut": 3, "rough": 3, "longGrass": 4, "fescue": 5}},
)
