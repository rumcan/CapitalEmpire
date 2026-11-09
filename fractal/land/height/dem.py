"""land.height.dem: the real ground height of a downloaded course (golf/osm/dem.ts): the elevation tiles over the course and its skirt, fetched in the player browser."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.height.dem", rung=3, title="Elevation tiles for a downloaded course",
    purpose="Fetch the real ground under a map-data course: the elevation tiles that cover the course and a skirt round it, kept for the save.",
    requires=[
        "tilesOfCourse lists the tiles over the course box plus its skirt, at most DEM_MAX_TILES (25).",
        "fetchLand fetches the tiles through the player network with a gap of DEM_GAP_MS (250) between requests, and keeps them in the answer cache.",
        "A tile that cannot be fetched raises DemUnavailable; the course then keeps the game height.",
    ],
    owns=["DEM_GAP_MS and DEM_MAX_TILES (dem.ts:22-24)", "DemUnavailable (the error)"],
    files=["src/game/golf/osm/dem.ts"],
    dynamics=[
        Fn(name="tilesOfCourse", at="src/game/golf/osm/dem.ts:38", does="the elevation tile keys that cover a course and its skirt", sig="tilesOfCourse(spec, json, anyTurn = false)"),
        Fn(name="fetchLand", at="src/game/golf/osm/dem.ts:69", does="fetches and decodes the land tiles for a course, with progress text", sig="fetchLand(spec, json, d, o): Promise<...>"),
    ],
    inputs=["the course spec and its OSM json", "the network and the answer cache"], outputs=["the decoded land heights for the course (OsmHeight)"],
    tests=["tests/golf-osm-land.test.ts", "tests/ui-osm-land.test.ts"],
    below=["land.height.tiles"], above=["course"],
    dual="MISSING: fetched height is kept in the save; there is no undo for a download, only a new course import",
    seams=["the packed height goes into the course save (land.height.pack)", "land.ts (course-owned) lays it under the course"],
    rules=["performance is a hard gate"],
    impl="describe",
)
