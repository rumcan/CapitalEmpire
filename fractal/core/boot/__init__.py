"""core.boot: what the engine boots with: the plain game's options, the ground levers and the dev boot numbers, and the entry point (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.boot", rung=2, title="Boot",
    purpose="Start the engine with the game's boot options (or a dev build's levers) and mount the React app.",
    requires=["GAME_BOOT is the plain game's boot: kind 'game', one ground worker, sim on, save on (boot.ts line 60)."],
    below=["render.iso"], above=["core"],
)
