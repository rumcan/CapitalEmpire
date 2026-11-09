"""town.growth.places: the iconic places (a town's landmarks and the places it places them on). The due-place rule is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: duePlaces (src/game/lots/iconic.ts:50) needs PlaceDef (iconic.ts:26, from iconic-places.json) and the placed set; findSite (iconic.ts:89) needs the SiteCtx and the lot list"


def due_places(pop, placed, knobs=None):
    """port todo: the iconic places due at a population that are not yet placed (Python port of duePlaces, src/game/lots/iconic.ts:50)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.growth.places", rung=3, title="Iconic places and anchors",
    purpose="Decide which iconic places a growing town is due, find each a site on its lots, and anchor the places' items to their lots.",
    requires=[
        "SITE_STEP = 2 tiles is the step of the site search (src/game/lots/iconic.ts:76).",
        "PLACE_MIN = 5 and PLACE_KEEP = 16 bound a place's items (src/game/lots/places.ts:19).",
        "ANCHORS are front, back, left, right, kerb and fence (src/game/lots/places.ts:11).",
    ],
    files=["src/game/lots/iconic.ts", "src/game/lots/places.ts", "src/game/lots/iconic-places.json"],
    dynamics=[
        Fn(name="duePlaces", at="src/game/lots/iconic.ts:50", does="the iconic places due at a population and not yet placed", sig="duePlaces(pop, placed, defs)"),
        Fn(name="findSite", at="src/game/lots/iconic.ts:89", does="finds a site for one iconic place on the lots", sig="findSite(def, ctx): PlacedPlace | null"),
        Fn(name="anchorOf", at="src/game/lots/places.ts:22", does="the anchor a lot point falls on: front, back, left, right, kerb or fence", sig="anchorOf(l, x, y)"),
        Fn(name="buildPlaces", at="src/game/lots/places.ts:119", does="builds the place rows from samples", sig="buildPlaces(samples): Places"),
    ],
    inputs=["the population", "the placed places", "the lots"],
    outputs=["the due places", "a site per place", "anchored items"],
    tests=["tests/iconic-places.test.ts", "tests/item-places.test.ts", "tests/ring-clear.test.ts"],
    below=["town.lots.cut", "town.lots.library"], above=["town.growth.city"],
    dual="MISSING: an iconic place once placed cannot be removed by the player: iconic.ts and places.ts have no remove or sell path",
    seams=["the place definitions (iconic-places.json)", "the lots the sites sit on (town.lots.cut)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=due_places, steer={"site_step": 2, "site_gap": 0.25, "place_min": 5, "place_keep": 16}, port=PORT,
    params={"pop": "int, the town's population", "placed": "list of placed place ids"},
)
