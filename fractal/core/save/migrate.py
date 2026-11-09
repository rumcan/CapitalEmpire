"""core.save.migrate: the save migrations (save.ts MIGRATIONS, upgradeSave). Not ported yet: the migrations are the game's history, read from save.ts."""
from fractal.holon import Fn, Holon


def upgrade_save(d: dict, knobs: dict | None = None) -> dict | None:
    """a save of any older version brought to SAVE_VERSION 5 (not ported yet)"""
    raise NotImplementedError("core.save.migrate: port upgradeSave and the MIGRATIONS list (src/game/save.ts:165, :158, and migrateV2 at :220)")


HOLON = Holon(
    id="core.save.migrate", rung=3, title="Save migrations",
    purpose="Bring an old save forward: v2 (160-tile maps in localStorage), v3 (painted terrain), v4 (seed only) to v5 (lots and the sim clock).",
    requires=[
        "MIGRATIONS lists each step from an older version; upgradeSave applies them in order and returns null when none fits (save.ts lines 158 and 165).",
        "migrateV2 reads the old localStorage save (save.ts line 220).",
    ],
    owns=["the MIGRATIONS list (from version and an up function)"],
    files=[],
    dynamics=[
        Fn(name="upgradeSave", at="src/game/save.ts:165", does="applies the migrations to bring a save to v5", sig="upgradeSave(d)"),
        Fn(name="MIGRATIONS", at="src/game/save.ts:158", does="the list of migration steps", sig="MIGRATIONS: {from, up}[]"),
    ],
    inputs=["a save of version 2, 3, 4 or 5"],
    outputs=["a SaveV5 or null"],
    tests=["tests/save-fixtures.test.ts", "tests/golf-save-compat.test.ts", "tests/desert-start.test.ts"],
    below=[], above=["core.save.io"],
    dual="MISSING: a migrated save is not written back in its old form (the old version is not kept)",
    impl="native", fn=upgrade_save,
    port="todo: port upgradeSave with the MIGRATIONS steps (inputs: a save dict with version and map; outputs: a v5 dict or null; TS save.ts:165, :158, migrateV2 :220)",
    params={"d": "dict, a save of any version"},
)
