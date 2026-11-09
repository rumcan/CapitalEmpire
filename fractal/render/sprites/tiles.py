"""render.sprites.tiles: the per-tile painter's order and its re-sort (sprites.ts SpriteTiles, topoOrder, isBehind), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.sprites.tiles", rung=3, title="Tile painter's order",
    purpose="Keep each draw tile's props in painter's order, re-sorting only the tiles an edit touches.",
    requires=[
        "isBehind decides which of two props is drawn first; topoOrder sorts a tile's props by it.",
        "Moving vehicles merge into a tile's order every frame, after the last prop that is behind them (sprites.ts header).",
    ],
    owns=["the SpriteTiles lists and their rectangles (Float32Array)"],
    files=[],
    dynamics=[
        Fn(name="SpriteTiles", at="src/game/sprites.ts:207", does="the tile lists: add, remove, re-sort the tiles a prop touches", sig="class SpriteTiles"),
        Fn(name="isBehind", at="src/game/sprites.ts:83", does="whether prop a draws before prop b", sig="isBehind(a, b)"),
    ],
    inputs=["props touched by an edit", "moving vehicles each frame"],
    outputs=["each tile's ordered instance range"],
    tests=["tests/props-variety.test.ts", "tests/golf-sway.test.ts"],
    below=["render.sprites.pack"], above=["render.sprites"],
    dual="a prop removed from its tile (SpriteTiles remove on the edit that deletes it)",
    impl="describe",
)
