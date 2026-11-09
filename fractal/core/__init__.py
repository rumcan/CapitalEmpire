"""core: the engine's orchestration: boot, the engine and its frame tick, save and load, the bench, the dev hooks, the feature flags and the gates (T410, #1110)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core", rung=1, title="Engine core",
    purpose="Boot the game, run the engine's frame, keep the save, measure the performance, and hold the dev hooks and gates that check it all.",
    requires=[
        "The engine is one Game class (engine.ts) constructed from a canvas and the boot options; init loads or starts a game, then the frame loop runs.",
        "A save is gzip-compressed JSON in IndexedDB at SAVE_VERSION 5; older saves migrate on read (save.ts).",
        "Roads rebuild instantly and the ground re-bakes itself: there is no manual rebuild step (CLAUDE.md).",
    ],
    below=["render", "town", "course", "play", "people", "business", "land", "art", "ui"], above=[],
    rules=["performance is a hard gate (ground plus tiles at most 192 MB)", "roads rebuild instantly, no manual ground rebuild", "town jams are the player's job"],
)
