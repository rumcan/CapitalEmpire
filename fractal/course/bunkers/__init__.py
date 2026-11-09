"""course.bunkers: the bunkers' look (the sand, the lip and the wall), their stage baked off the main thread, and the vendored bunker-look package."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.bunkers", rung=2, title="Bunkers",
    purpose="Make each bunker look like a real sand trap: its sand and lip textures, its wall, the settings a player sets, the stage that bakes it, and the vendored package it came from.",
    requires=[
        "The bunker stages are floor, wall and lip (BUNKER_STAGES).",
        "The bunker stage cache is at most 32 MiB (BUNKER_STAGE_CACHE_BYTES), and it holds for 3 s before it is suspended (BUNKER_SUSPEND_HOLD_MS).",
        "The bunker textures are the built-in library plus the player's own uploads (BUNKER_TEXTURE_LIBRARY, registerOwnTexture).",
    ],
    below=["course.surfaces", "course.design", "land"],
    above=["course", "render"],
    dual="a player's upload is removed with removeOwnTexture; a setting goes back to the default (resolveBunkerSettings)",
    rules=["no flat colour washes", "highlights are textured, inset from edges", "new art used everywhere; the old look kept as an option", "performance is a hard gate"],
)
