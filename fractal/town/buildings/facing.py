"""town.buildings.facing: the house's facing to its street, its doors and garage, its flagged views, its fixes and its lettering. Best-facing is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: bestFacing (src/game/lots/house-facing.ts:42) needs the house pictures' views (preset-art.ts fourViews) and the lot frame; facingView (:33) and lotAnchors (:52) follow"


def best_facing(ids, f, knobs=None):
    """port todo: the house picture and facing that face the street best (Python port of bestFacing, src/game/lots/house-facing.ts:42)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.buildings.facing", rung=3, title="Facing, doors and fixes",
    purpose="Turn each house to face its street, put its doors and garage where they belong, and apply the owner's fixes and flags.",
    requires=[
        "FRONTAL is the set of pictures drawn straight on (src/game/lots/frontal.ts:4).",
        "doorsOf returns a house's door positions only for the houses in HOUSE_DOORS, else null (src/game/lots/house-doors.ts:31).",
        "turnsBetween gives the shortest turn between two of the eight facings (src/game/lots/house-facing.ts:23).",
    ],
    files=["src/game/lots/house-facing.ts", "src/game/lots/frontal.ts", "src/game/lots/house-doors.ts", "src/game/lots/flagged-views.ts",
        "src/game/lots/art-fix.ts", "src/game/lots/lettering.ts", "src/game/axis-foot.ts", "src/game/ext/frontage-snap/index.ts"],
    dynamics=[
        Fn(name="bestFacing", at="src/game/lots/house-facing.ts:42", does="the house and facing that face the street best", sig="bestFacing(ids, f: {q, n}): {id, facing}"),
        Fn(name="facingView", at="src/game/lots/house-facing.ts:33", does="the facing of one picture view against the street", sig="facingView(id, f, view = 0): Facing"),
        Fn(name="doorsOf", at="src/game/lots/house-doors.ts:31", does="a house's door positions, or null", sig="doorsOf(id): HouseDoors | null"),
        Fn(name="garageOf", at="src/game/lots/house-doors.ts:34", does="where a house's garage is: none, front or side", sig="garageOf(id, corner): 'none' | 'front' | 'side'"),
        Fn(name="markOf", at="src/game/lots/flagged-views.ts:224", does="the owner's flag on a picture view", sig="markOf(id): ViewMark | null"),
        Fn(name="fixedArt", at="src/game/lots/art-fix.ts:41", does="a picture's fixed footprint for a turn", sig="fixedArt(id, turns, k)"),
        Fn(name="hasLettering", at="src/game/lots/lettering.ts:34", does="whether a picture carries lettering", sig="hasLettering(id, name?): boolean"),
    ],
    inputs=["house picture ids", "the lot frame {q, n}", "a view index"],
    outputs=["the best house and facing", "doors and garage", "flags and fixes"],
    tests=["tests/house-drives.test.ts", "tests/lot-facing.test.ts", "tests/house-lots-have-houses.test.ts", "tests/straight-views.test.ts", "tests/iconic-places.test.ts", "tests/lettering.test.ts"],
    below=["town.buildings.classes"], above=["town.compose.lot"],
    dual="none stored: the facing is recomputed from the lot's frame; a re-composed lot turns its house again",
    seams=["the house's drive and path (town.compose.clean)"],
    rules=["a built house lot always has a house facing its street", "straight views are turned 8 degrees", "lit sprites are never mirrored"],
    impl="native", fn=best_facing, steer={"tolerance": 0.3}, port=PORT,
    params={"ids": "list of house picture ids", "f": "{q: int view, n: {x, y}} the lot frame"},
)
