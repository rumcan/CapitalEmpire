"""art.library: the picture library: the LIBRARY list of every picture the game draws, built from the per-folder libraries (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art.library", rung=2, title="Picture library",
    purpose="Hold every picture the game draws as one LIBRARY list, each with its atlas rectangle, size, anchor and footprint.",
    requires=[
        "LIBRARY is built at load from library.ts and the appended folder libraries; a picture's index is its saved identity (library.ts header).",
        "Each entry's tex is [page, u0, v0, u1, v1] in the atlas and quad is the trimmed picture inside its w x h display rectangle (library.ts header).",
    ],
    below=["render.atlas"], above=["town", "course", "people", "play", "business", "render"],
    rules=["new art used everywhere", "lit sprites are never mirrored", "straight views turned 8 degrees"],
)
