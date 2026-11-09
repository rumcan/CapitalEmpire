"""core.save.io: the save store: gzip, IndexedDB, read, write, the backups and export or import (save.ts), described: it needs IndexedDB and CompressionStream."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.save.io", rung=3, title="Save store",
    purpose="Write the save compressed to its slot, read it back with its status, keep backups, and export or import the bytes.",
    requires=[
        "writeSave gzips the JSON with the build stamp and stores it under the slot (save.ts line 156).",
        "readSave returns a status: ok, none, future, otherMap or corrupt, and migrates an older version (line 175).",
        "importSaveBytes checks the save before it replaces the slot (line 241).",
    ],
    owns=["the save slot and its backups in IndexedDB", "SaveV5 (the save's fields)"],
    files=["src/game/save.ts"],
    dynamics=[
        Fn(name="writeSave", at="src/game/save.ts:156", does="writes the save to its slot, gzipped", sig="writeSave(d)"),
        Fn(name="readSave", at="src/game/save.ts:175", does="reads and migrates the save, with its status", sig="readSave()"),
        Fn(name="backupTownSlot", at="src/game/save.ts:209", does="copies the town slot to a tagged backup", sig="backupTownSlot(tag)"),
        Fn(name="exportSaveBytes", at="src/game/save.ts:237", does="the save's bytes for a download", sig="exportSaveBytes()"),
        Fn(name="importSaveBytes", at="src/game/save.ts:241", does="checks and stores an imported save", sig="importSaveBytes(buf)"),
    ],
    inputs=["the engine's SaveV5 (save()) and the stored bytes"],
    outputs=["the stored save", "a SaveRead status", "backup keys"],
    tests=["tests/save.test.ts", "tests/save-safety.test.ts", "tests/save-fixtures.test.ts", "tests/golf-save-compat.test.ts"],
    below=["core.save.migrate"], above=["core.save.engine"],
    dual="readBackup and deleteBackup (the backup slots); clearSave deletes the slot itself",
    seams=["SaveV5 (save.ts) to the engine's save and load"],
    impl="describe",
)
