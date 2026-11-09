"""course.osm.fetch: the map fetch: query the map servers for a course and find it by name (network: not runnable headless). The ground height is land.height's (dem.ts, terrarium.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.osm.fetch", rung=3, title="Map fetch",
    purpose="Ask the map servers for a course by its name or its map reference, politely: one request at a time, with a retry when a server is busy.",
    requires=[
        "The Overpass servers are tried in order, with timeouts of 130 s, 60 s, 45 s and 45 s (OVERPASS_SERVERS, SERVER_TIMEOUT_MS).",
        "A busy or down server is reported as ServerBusy or ServerDown with its message (BUSY_MESSAGE, DOWN_MESSAGE).",
        "A nominatim answer is kept for 7 days (ANSWER_TTL_MS).",
    ],
    files=[
        "src/game/golf/osm/overpass.ts",
        "src/game/golf/osm/nominatim.ts",
        "src/game/golf/osm/polite.ts",
        "src/game/golf/osm/query.ts",
        "src/game/golf/osm/find.ts",
    ],
    dynamics=[
        Fn(name="runOverpass", at="src/game/golf/osm/overpass.ts:152", does="sends one query to the servers in turn and returns the answer", sig="runOverpass(query, net, opt)"),
        Fn(name="courseQuery", at="src/game/golf/osm/overpass.ts:108", does="the Overpass query that fetches one course", sig="courseQuery(src: OsmRef, radius = 1200): string"),
        Fn(name="NominatimClient", at="src/game/golf/osm/nominatim.ts:84", does="the name search client, with its cache", sig="class NominatimClient"),
        Fn(name="realNet", at="src/game/golf/osm/polite.ts:17", does="the real network the fetches use", sig="realNet: Net"),
        Fn(name="parseCourseQuery", at="src/game/golf/osm/query.ts:33", does="reads what the player typed: a name, a map reference or a link", sig="parseCourseQuery(input): CourseQuery"),
        Fn(name="search", at="src/game/golf/osm/find.ts:46", does="the search of a name: the golf hits and the anchors", sig="search(text, d, signal?, onStep?)"),
    ],
    inputs=["what the player typed", "a map reference"], outputs=["the Overpass answer", "hits and anchors"],
    tests=["tests/golf-osm-find.test.ts", "tests/golf-osm-mirrors.test.ts", "tests/golf-osm-course.test.ts", "tests/ui-osm-land.test.ts"],
    below=["course.osm.library", "land.height"], above=["course.osm"],
    dual="none: a fetch changes nothing in the game; its answer is kept (kept.ts) or dropped",
    impl="describe", steer={"max_hits": 10, "answer_ttl_days": 7, "radius_m": 1200},
)
