"""course.osm: the real-course import: fetch a course from the map, convert it to a spec the game can build, place it on the town's land, and keep it in the library."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.osm", rung=2, title="Real-course import",
    purpose="Bring a real golf course in from the map (OpenStreetMap, with its ground height): find it by name or place, convert its features to a playable spec, lay it on the land, and keep it in the course library.",
    requires=[
        "The map servers are asked in turn, and a busy server is retried later (BUSY_STATUS, SERVER_TIMEOUT_MS).",
        "The import's ground height is land.height's (dem.ts, terrarium.ts): this node does not fetch it.",
        "Nominatim returns at most 10 hits (MAX_HITS).",
        "A course converted with no holes is refused with a warning, not built.",
        "A real course is attributed to OpenStreetMap contributors (OSM_CREDIT, OSM_LICENCE) and is never named after a real club in the fixtures (tests/golf-osm-course.test.ts).",
    ],
    below=["course.surfaces", "course.holes", "land", "land.height"],
    above=["course", "town", "ui"],
    dual="unverified: how a placed real course is undone (sell or bulldoze of its parcel) is not traced yet; the fetched answer stays in the library (kept.ts)",
    rules=["roads rebuild instantly: no manual ground rebuild", "town jams are the player's job"],
)
