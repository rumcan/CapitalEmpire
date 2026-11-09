"""course.estates.placing: where the course goes on the town: the site that fits the town's classes, the sizes it can take, and the course's canonical site. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port placeCourse (src/game/golf/place.ts:70) with townAxis (place.ts:44): inputs the town's class grid (cls), a centre, the two ends and a seed; "
         "output a CoursePlan {dir, course, venue, carpark, drive} or null; the sizes are COURSE_SIZES (place.ts:14)")


def place_course(cls: list[int], centre: list[float], ends: list[list[float]], seed: int, knobs: dict | None = None):
    """the site of a course on the town (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.estates.placing", rung=3, title="Course site on the town",
    purpose="Find where the golf course goes on the town's land: a site with room for the course, the venue and the car park, facing one of four ways.",
    requires=[
        "The course's sizes are 300 x 450, 270 x 400 and 240 x 360 tiles (COURSE_SIZES), tried in that order.",
        "The venue is 40 x 24 tiles and the car park 20 x 16 (VENUE, PARK).",
        "A club's land is between 150 and 350 tiles (CLUB_MIN, CLUB_MAX).",
    ],
    files=["src/game/golf/place.ts"],
    dynamics=[
        Fn(name="placeCourse", at="src/game/golf/place.ts:70", does="finds the site of the course on the town", sig="placeCourse(cls, centre, ends, seed): CoursePlan | null"),
        Fn(name="townAxis", at="src/game/golf/place.ts:44", does="the town's axis from its centre", sig="townAxis(centre, n): {x0, y0, ax, ay}"),
        Fn(name="canonicalSite", at="src/game/golf/place.ts:122", does="the site rectangle of a plan, as its corners", sig="canonicalSite(p): {x0, y0, x1, y1}"),
    ],
    inputs=["the town's class grid", "a centre and two ends", "a seed"], outputs=["a course plan: direction, course, venue, car park, drive"],
    tests=["tests/golf-place.test.ts", "tests/golf-coursegen-fixes.test.ts"],
    below=["town"], above=["course.estates"],
    dual="a placed course is removed by its parcel (see course.estates.sale); the plan itself is recomputed",
    impl="native", fn=place_course, port=_TODO,
    steer={"course_sizes": [[300, 450], [270, 400], [240, 360]], "venue": [40, 24], "park": [20, 16], "club_min": 150, "club_max": 350},
)
