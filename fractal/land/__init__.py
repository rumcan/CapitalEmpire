"""land: the ground the game is played on (the terrain and its height, the river, creeks and water, the ground bake and the living ground, the painted surfaces, the nature dressing and the desert theme)."""
from fractal.holon import Holon

HOLON = Holon(
    id="land", rung=1, title="Land: terrain, height, water, ground bake, themes",
    purpose="Make the map's ground: a seeded valley with hills, a river and creeks, the height the course and town sit on, and the painted, living ground the player sees.",
    requires=[
        "The same seed and terrain model give the same valley (generateTerrain(seed, model) is a pure function of its two arguments).",
        "The map is 1024 tiles a side (iso.ts MAP) with a height sample every 8 tiles (types.ts HSTEP), so 128 samples a side.",
        "The ground re-bakes itself when the road network or the terrain changes; no manual rebuild step exists.",
        "A chunk of ground is painted in a Web Worker on an OffscreenCanvas, and the main thread holds only the baked textures.",
    ],
    below=["render"], above=["town", "course", "play", "people"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes", "highlights are textured", "no visible tiling", "new art used everywhere", "performance is a hard gate", "roads rebuild instantly, no manual ground rebuild", "town jams are the player's job"],
    seams=["Terrain {seed, cls, height, waters} is the one shared map: town, course and render read it."],
)
