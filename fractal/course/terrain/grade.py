"""course.terrain.grade: the grade shading setting, and the crossing profile that carries a route over roads."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.terrain.grade", rung=3, title="Grade setting and crossing profile",
    purpose="The grade shading the player switches and sets, and the profile of a route over roads (the decks of its crossings).",
    requires=[
        "The grade strength is kept between 0 and 1.5 (GRADE_STRENGTH_MAX).",
        "The grade setting is kept under its own storage key (GRADE_KEY) and read back by loadGrade.",
    ],
    files=["src/game/grade.ts", "src/game/ext/grade/index.ts"],
    dynamics=[
        Fn(name="loadGrade", at="src/game/grade.ts:80", does="reads the grade setting from storage, or the default", sig="loadGrade(store): GradeSettings"),
        Fn(name="gradeFrame", at="src/game/grade.ts:96", does="the grade frame for the day's light, or null when off", sig="gradeFrame(g, night): GradeFrame | null"),
        Fn(name="crossingsOf", at="src/game/ext/grade/index.ts:81", does="where a route crosses a road, and the deck height there", sig="crossingsOf(route, roads)"),
        Fn(name="planProfile", at="src/game/ext/grade/index.ts:178", does="the profile of a route with its decks", sig="planProfile(...)"),
    ],
    inputs=["the saved grade setting", "a route and the roads it crosses"], outputs=["a grade frame", "a deck profile"],
    tests=["tests/grade.test.ts", "tests/ext-grade.test.ts"],
    below=["course.terrain.height"], above=["course.terrain"],
    dual="saveGrade (the setting goes back to its default with a reset)",
    impl="describe", steer={"strength": 1, "strength_max": 1.5, "edge_blur": False},
)
