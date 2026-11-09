"""land.height.pack: the height grid packed for a save (golf/osm/terrarium.ts packGrid and unpackGrid): quantised, base64, and the source credit."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.height.pack", rung=3, title="Packed height for a save",
    purpose="Keep the real height in the save small and exact enough: quantised to PACK_Q metres, base64, with its source and credit.",
    requires=[
        "packGrid quantises a HeightGrid to PACK_Q (0.01 m) and packs it; unpackGrid reverses it.",
        "packStepOf picks the pack step from the smoothing sigma (between 8 and 48 samples).",
        "demSourceOf reads which DEM source a header names; DEM_CREDIT_DEFAULT is the fallback credit.",
    ],
    owns=["PACK_Q (terrarium.ts:234)", "HeightPack and OsmHeight (the save shapes)", "DEM_TILES_CREDIT (the credit line)"],
    files=[],
    dynamics=[
        Fn(name="packGrid", at="src/game/golf/osm/terrarium.ts:238", does="packs a height grid for a save (quantised, base64)", sig="packGrid(g, unit = PACK_Q): Promise<HeightPack>"),
        Fn(name="unpackGrid", at="src/game/golf/osm/terrarium.ts:257", does="unpacks a saved height grid", sig="unpackGrid(p): Promise<HeightGrid>"),
        Fn(name="demSourceOf", at="src/game/golf/osm/terrarium.ts:306", does="names the DEM source from a header", sig="demSourceOf(header): DemSource"),
    ],
    inputs=["a HeightGrid or a saved HeightPack"], outputs=["a HeightPack or a HeightGrid"],
    tests=["tests/golf-osm-land.test.ts", "tests/ext-course-height-land-light.test.ts"],
    below=["land.height.tiles"], above=["course", "core"],
    dual="unpackGrid reverses packGrid; a loaded save keeps its pack (a new save overwrites it)",
    seams=["the save (core) stores the pack; land.ts (course-owned) unpacks it under the course"],
    rules=["performance is a hard gate"],
    impl="describe",
)
