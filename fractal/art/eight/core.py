"""art.eight.core: the facing logic (object-eight-core.ts): createObjectFacings, facingAt, the legacy facing and the normal replacements, described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.eight.core", rung=3, title="Facing logic",
    purpose="Choose which of an object's eight views is drawn for a turn, and which pictures replace the normal ones.",
    requires=[
        "createObjectFacings builds each set's facings and says its mode: eight, four or single, with the views still missing (object-eight-core.ts line 8).",
        "facingAt(v, turn) returns the view id and never sets flip (flip is false): a view is a picture, not a mirror (line 28).",
    ],
    owns=["the ObjectFacing records (subject, ids, keys, mode, missing)"],
    files=['src/game/object-eight-core.ts'],
    dynamics=[
        Fn(name="createObjectFacings", at="src/game/object-eight-core.ts:8", does="builds each set's facings from its manifest", sig="createObjectFacings(sets, has, fallback, sizeKey)"),
        Fn(name="facingAt", at="src/game/object-eight-core.ts:28", does="the view id drawn for a turn, never flipped", sig="facingAt(v, turn)"),
        Fn(name="eventArtSet", at="src/game/object-eight-core.ts:47", does="the set an event object uses at its visual tier", sig="eventArtSet(sets, typeId, visualTier)"),
    ],
    inputs=["the eight-view sets (object-eight-types.ts)", "the picture ids that exist (has)"],
    outputs=["ObjectFacing records for object-eight.ts objectFacings"],
    tests=["tests/object-eight.test.ts", "tests/event-seating.test.ts", "tests/eight-lot-views.test.ts"],
    below=["art.eight.types"], above=["art.eight.registry"],
    dual="objectNormalReplacements with the legacy facing (legacyObjectFacing) puts the old normal back",
    rules=["never mirror lit sprites"],
    impl="describe",
)
