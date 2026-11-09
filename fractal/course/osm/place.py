"""course.osm.place: lay a converted real course on the town's land: the plan of its placement, the grid it cuts, the land it needs and the start of the game with it. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port planPlace (src/game/golf/osm/place.ts:339) with its cover and cut helpers (place.ts:125, :162, :173): inputs a PlaceWorld "
         "(lots, road segments, the land's cover rectangles), the rotated spec and a PlacePose {x, y, deg}; output a PlacePlan with its goes-phrase, price lines "
         "and the cover; the grid cut is placegrid.ts placeDiff (placegrid.ts:33); the start is start.ts planOsmGame (start.ts:93)")


def plan_place(world: dict, spec: dict, pose: dict, knobs: dict | None = None):
    """the plan of a real course on the land (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.osm.place", rung=3, title="Real-course placing",
    purpose="Put a converted real course on the town's land: plan where it sits and which lots and roads it covers, cut its grid into the map, and start a game on it.",
    requires=[
        "A real course is placed at a pose: a point and a turn (PlacePose).",
        "The course's land keeps a margin of 4 tiles from the town's edge (PLACE_EDGE).",
        "The town keeps 26 tiles at most of its lots when a course is placed (TOWN_KEEP).",
    ],
    files=[
        "src/game/golf/osm/place.ts",
        "src/game/golf/osm/placegrid.ts",
        "src/game/golf/osm/placer.ts",
        "src/game/golf/osm/land.ts",
        "src/game/golf/osm/start.ts",
    ],
    dynamics=[
        Fn(name="planPlace", at="src/game/golf/osm/place.ts:339", does="the plan of a placement at a pose", sig="planPlace(world, rotated, pose, build...)"),
        Fn(name="placeDiff", at="src/game/golf/osm/placegrid.ts:33", does="the cells a placement changes in the grid", sig="placeDiff(g, scratch, cover, clearHoles?, wet?)"),
        Fn(name="RealPlacer", at="src/game/golf/osm/placer.ts:79", does="the placer the game uses for a real course (its host and view)", sig="class RealPlacer"),
        Fn(name="landOfHeight", at="src/game/golf/osm/land.ts:44", does="the land of a course from its height tiles", sig="landOfHeight(h): Promise<OsmLand>"),
        Fn(name="planOsmGame", at="src/game/golf/osm/start.ts:93", does="the start of a game on a real course: the side and the scale that fit", sig="planOsmGame(spec, map?): OsmStart | null"),
    ],
    inputs=["a converted spec", "a pose", "the town's world (lots, roads)"], outputs=["a placement plan", "grid cells to change", "a start"],
    tests=["tests/golf-osm-place.test.ts", "tests/golf-osm-placer.test.ts", "tests/golf-osm-land.test.ts", "tests/ui-osm-land.test.ts"],
    below=["course.osm.convert", "course.osm.fetch", "town"], above=["course.osm"],
    dual="a placed real course is removed by its parcel's sell (not traced here: see course.osm dual)",
    impl="native", fn=plan_place, port=_TODO,
    steer={"place_edge": 4, "town_keep": 26, "green_pad": 3, "green_feather": 5, "tee_pad": 2, "tee_feather": 4, "skirt_t": 320, "window_t": 200},
)
