"""art.eight.existing: the earlier object-eight sets reused from packed native art (object-eight-existing.ts and its JSON), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.eight.existing", rung=3, title="Existing object-eight sets",
    purpose="Keep the sets already packed as native art, with their standalone yaw8 bounds, so the saved rows still resolve.",
    requires=[
        "EXISTING_OBJECT_EIGHT_SETS is the registered rows whose runtimeEnabled is not false (object-eight-existing.ts line 6).",
        "appendExistingObjectEight preserves all old rows, UVs and road-lot boxes (line 8).",
    ],
    owns=["object-eight-existing.json (the registered rows and their sourceIds)"],
    files=["src/game/object-eight-existing.ts", "src/game/object-eight-existing.json"],
    dynamics=[
        Fn(name="appendExistingObjectEight", at="src/game/object-eight-existing.ts:8", does="appends the existing rows to LIBRARY, UVs unchanged", sig="appendExistingObjectEight(library)"),
        Fn(name="EXISTING_OBJECT_EIGHT_SETS", at="src/game/object-eight-existing.ts:6", does="the registered, runtime-enabled sets", sig="EXISTING_OBJECT_EIGHT_SETS"),
    ],
    inputs=["object-eight-existing.json"],
    outputs=["existing rows in LIBRARY"],
    tests=["tests/object-eight.test.ts", "tests/eight-lot-views.test.ts"],
    below=["art.eight.types"], above=["art.eight.library"],
    dual="runtimeEnabled false on a registered row (the set is no longer drawn)",
    impl="describe",
)
