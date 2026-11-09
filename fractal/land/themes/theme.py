"""land.themes.theme: the desert theme (desert-theme.ts): the desert look of the surfaces and lawns, the class of each library item, and the desert picks."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.themes.theme", rung=3, title="Desert theme",
    purpose="Make the map a desert: every surface gets its desert look, and the library items are sorted into desert classes.",
    requires=[
        "DESERT_KEY is the saved toggle; setDesertSurfaces (painted-surfaces-live.ts:28) turns it on and off.",
        "desertSurfaces maps a surfaces file to the desert look; oldSand keeps the old sand.",
        "desertClassOf sorts a library item into a desert class, or null when it is not a desert item.",
    ],
    owns=["DESERT_KEY (desert-theme.ts:22)", "DESERT_GROUND, DESERT_LAWN and DESERT_DUNE (the looks)", "DESERT_POOLS (the item pools)"],
    files=["src/game/desert-theme.ts"],
    dynamics=[
        Fn(name="desertSurfaces", at="src/game/desert-theme.ts:66", does="maps a surfaces file to the desert look", sig="desertSurfaces(f, o)"),
        Fn(name="desertClassOf", at="src/game/desert-theme.ts:81", does="the desert class of a library item, or null", sig="desertClassOf(it): DesertClass | null"),
        Fn(name="desertPick", at="src/game/desert-theme.ts:112", does="the desert item picked at a point", sig="desertPick(item, x, y, scale)"),
    ],
    inputs=["a surfaces file and a library item"], outputs=["the desert surfaces, classes and picks"],
    tests=["tests/desert-theme.test.ts", "tests/desert-sand.test.ts", "tests/desert-start.test.ts", "tests/golf-range-desert.test.ts"],
    below=["land.surfaces.assign", "land.living.influence"], above=["town", "course", "ui"],
    dual="the toggle set back (setDesertSurfaces(false)) restores the normal surfaces; the normal look is kept",
    seams=["the desert toggle is saved under DESERT_KEY (capitalempire.desertTheme)"],
    rules=["new art used everywhere", "no flat colour washes", "no visible tiling"],
    impl="describe",
)
