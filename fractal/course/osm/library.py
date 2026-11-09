"""course.osm.library: the course library: the kept courses (fetched answers and converted specs) in memory or in the browser's IndexedDB."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.osm.library", rung=3, title="Course library",
    purpose="Keep the courses the player has fetched, so a course is not fetched twice: a record of its answer and its spec, kept in the browser's store.",
    requires=[
        "A course record holds its source reference, its JSON and its spec; the store is an IndexedDB store in the browser, or a memory store in tests (IdbStore, MemoryStore).",
        "The shared library is one instance for the game (sharedLibrary).",
        "A kept course's listeners are told when the kept list changes (watchKept).",
    ],
    files=["src/game/golf/osm/library.ts", "src/game/golf/osm/kept.ts"],
    dynamics=[
        Fn(name="CourseLibrary", at="src/game/golf/osm/library.ts:96", does="the library of kept courses over a store", sig="class CourseLibrary"),
        Fn(name="sharedLibrary", at="src/game/golf/osm/library.ts:133", does="the one shared library, opened once", sig="sharedLibrary(): Promise<CourseLibrary>"),
        Fn(name="keptCourses", at="src/game/golf/osm/kept.ts:11", does="the kept courses as the game sees them", sig="keptCourses(): readonly CourseRecord[]"),
        Fn(name="refreshKept", at="src/game/golf/osm/kept.ts:17", does="reloads the kept list from the library", sig="refreshKept(lib?): Promise<void>"),
    ],
    inputs=["a fetched answer and its spec"], outputs=["kept course records", "the kept list for the picker"],
    tests=["tests/golf-osm-kept.test.ts", "tests/golf-osm-catalogue.test.ts", "tests/golf-osm-find.test.ts"],
    below=["course.osm.fetch"], above=["course.osm", "ui"],
    dual="a kept course can be removed from the library (CourseStore) and the list is told at once (watchKept)",
    impl="describe", steer={"store": "idb"},
)
