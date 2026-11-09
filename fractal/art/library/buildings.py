"""art.library.buildings: the building, construction, golf and range picture rows appended to LIBRARY, described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.library.buildings", rung=3, title="Building pictures",
    purpose="Append the business, construction, golf kit, range and landscape pictures to the library.",
    requires=[
        "appendBusinesses, appendConstruction, appendGolf, appendKit, appendRangeArt and appendLandscapeArt each add their rows and atlas pages to LIBRARY.",
        "BUSINESS_THUMBS maps each business to its thumbnail (business-library.ts line 65).",
    ],
    owns=["the business, construction, golf and kit rows"],
    files=["src/game/business-library.ts", "src/game/construction-library.ts", "src/game/golf-library.ts", "src/game/business/art.ts", "src/game/golf/facility-art.ts", "src/game/golf/facility-models.ts", "src/game/golf/structure-art.ts"],
    dynamics=[
        Fn(name="appendBusinesses", at="src/game/business-library.ts:68", does="appends the business pictures and their pages", sig="appendBusinesses(library, pages)"),
        Fn(name="appendConstruction", at="src/game/construction-library.ts:12", does="appends the construction pictures", sig="appendConstruction(library, pages)"),
        Fn(name="appendGolf", at="src/game/golf-library.ts:16", does="appends the golf pictures", sig="appendGolf(library, pages)"),
        Fn(name="appendKit", at="src/game/golf-library.ts:21", does="appends the kit pictures", sig="appendKit(library)"),
    ],
    inputs=["the LIBRARY array and the page list"],
    outputs=["building rows in LIBRARY"],
    tests=["tests/construction.test.ts", "tests/ext-business-art.test.ts", "tests/landscaping-kit.test.ts", "tests/range-art.test.ts"],
    below=["art.library.index"], above=["art.library.index"],
    dual="MISSING: an appended row cannot be removed at runtime (saved indices)",
    rules=["new art used everywhere"],
    impl="describe",
)
