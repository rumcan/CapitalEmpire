"""core.engine: the Game class (engine.ts, 13,000 lines) as orchestration: its constructor and init, its new-game paths, and its overlay (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.engine", rung=2, title="Game engine",
    purpose="Own the one Game object: its state, its boot, its new games, and the overlay that draws the ui's markings on the map.",
    requires=[
        "The Game constructor takes the canvas, the overlay canvas and the boot options (engine.ts line 3032); init (line 3149) loads the save or starts a new game.",
        "The engine reads its state from the save on load and writes it back on a timer (scheduleSave, 800 ms).",
    ],
    below=["render", "town", "course", "play", "people", "business", "land", "art", "ui", "core.save", "core.boot"], above=["core.tick", "core.gates"],
    rules=["roads rebuild instantly, no manual ground rebuild", "town jams are the player's job"],
)
