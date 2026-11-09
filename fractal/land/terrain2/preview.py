"""land.terrain2.preview: the hand-run preview of the v2 terrain (Node only, run with esbuild by hand)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.terrain2.preview", rung=3, title="Terrain v2 preview (by hand)",
    purpose="Let a developer look at a v2 map from the command line, Node only.",
    requires=["preview.ts is run by hand with esbuild as a Node bundle; the game does not load it."],
    owns=[],
    files=["src/game/ext/terrain2/preview.ts"],
    dynamics=[Fn(name="preview", at="src/game/ext/terrain2/preview.ts", does="a Node script that makes a v2 terrain preview (run by hand, see its header)", sig="script (no export)")],
    inputs=["a seed, from the command line"], outputs=["a preview printed or written by the script"],
    tests=["none (run by hand; see the header of preview.ts)"],
    below=["land.terrain2.generate"], above=[],
    dual="MISSING: a preview writes nothing the game reads, so there is nothing to undo",
    seams=[], rules=[],
    impl="describe",
)
