"""core.save: the save and load: gzip JSON in IndexedDB, the migrations, the backups and the engine's timer (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.save", rung=2, title="Save and load",
    purpose="Keep the town between sessions: write it compressed, read it back with migrations, keep backups, and export or import it.",
    requires=["SAVE_VERSION is 5; v2, v3 and v4 saves migrate on read (save.ts header and MIGRATIONS)."],
    below=["core.engine.orchestra"], above=["core"],
    rules=["roads rebuild instantly, no manual ground rebuild"],
)
