"""course.surfaces.looks: the look of each surface (texture, scale, angle, tone, mowing), kept per hole, per facility and for the property."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.surfaces.looks", rung=3, title="Surface looks and look book",
    purpose="What each surface looks like: its texture and how it is set, kept in a look book with one set per owner (the property, each hole, putting, chipping).",
    requires=[
        "The look book owners are 'property', 'putting', 'chipping' and each hole as h1, h2 and so on (holeOwner, FACILITY_OWNERS).",
        "A look changes when one of its LOOK_FIELDS changes (lookChanged): a change to the mowing counts as a change.",
        "The surface bands follow SURFACE_BAND: a green's band is the fringe, a fairway's and tee's the first cut, a bunker's the lip.",
    ],
    files=["src/game/course-look.ts", "src/game/golf/looks.ts"],
    dynamics=[
        Fn(name="courseTexOf", at="src/game/course-look.ts:16", does="the course texture of a look", sig="courseTexOf(st: LookStyle): CourseTex"),
        Fn(name="surfaceBands", at="src/game/course-look.ts:61", does="the collar and band textures of the brushes", sig="surfaceBands(b: BrushLooks)"),
        Fn(name="puckBandOf", at="src/game/course-look.ts:76", does="the band the cursor puck shows for a surface", sig="puckBandOf(kind, b, fin, border?)"),
        Fn(name="holeOwner", at="src/game/golf/looks.ts:25", does="the look-book owner of a hole", sig="holeOwner(n: number): LookOwner"),
        Fn(name="lookWhat", at="src/game/golf/looks.ts:40", does="the name of what a surface look is for", sig="lookWhat(kind, owner): string"),
    ],
    inputs=["the look book", "a surface kind and an owner"], outputs=["a look per surface", "textures for the bands and the puck"],
    tests=["tests/course-owner-fixes.test.ts", "tests/ext-course-round.test.ts", "tests/ext-course-grid-wiring.test.ts", "tests/t256-hole-paint.test.ts", "tests/t311-painted-turn.test.ts"],
    below=["course.surfaces.painted"], above=["course.surfaces", "course.design"],
    dual="the look book keeps the old look: a changed look is one undo step (the editor's undo stack)",
    impl="describe", steer={"owners": ["property", "putting", "chipping"]},
)
