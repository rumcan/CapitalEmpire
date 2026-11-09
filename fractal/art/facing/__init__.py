"""art.facing: which picture a building or plant is drawn from for a flip: never a mirrored lit picture, a partner view instead (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art.facing", rung=2, title="Facing without mirroring",
    purpose="Decide the picture drawn for a flip: a partner view or the picture unflipped, never a mirrored building, tree or lit sprite.",
    requires=["No building is ever mirrored: a flip draws its partner view, else the picture unflipped (mirror.ts header)."],
    below=["art.library"], above=["core.engine.orchestra", "render.sprites.pack"],
    rules=["never mirror lit sprites", "straight views turned 8 degrees"],
)
