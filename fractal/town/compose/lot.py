"""town.compose.lot: compose one lot into its props and ground. The composer is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: compose (src/game/lots/compose.ts:1237) needs the preset library (town.lots.library), the lot frame (preset-frame.ts:43), the Build class (src/game/lots/compose-core.ts:156), lotPreset (compose.ts:433) and standIns (compose.ts:669)"


def compose(lot, st, drops=None, knobs=None):
    """port todo: props and ground for one lot from its geometry and state (Python port of compose, src/game/lots/compose.ts:1237)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.compose.lot", rung=3, title="Compose a lot: props and ground",
    purpose="Place the house, the drive, the path, the fence and the trees of one lot from its preset and state.",
    requires=[
        "compose returns a Composition of props, ground patches and anchors for one lot (src/game/lots/compose.ts:1237).",
        "composeWhole composes a whole lot from one preset (src/game/lots/compose.ts:1227).",
        "PAVING_NEAR is the reach of the paving beside a lot (src/game/lots/compose.ts:920).",
    ],
    files=["src/game/lots/compose.ts", "src/game/lots/compose-core.ts", "src/game/lot-decals.ts"],
    dynamics=[
        Fn(name="compose", at="src/game/lots/compose.ts:1237", does="composes one lot: its props, ground patches and anchors", sig="compose(lot: LotGeom, st: ComposeState, drops?: PresetDrop[]): Composition"),
        Fn(name="composeWhole", at="src/game/lots/compose.ts:1227", does="composes a whole lot from one preset", sig="composeWhole(lot, preset, seed): Composition"),
        Fn(name="lotLayout", at="src/game/lots/compose.ts:941", does="the laid items of a lot", sig="lotLayout(lot, st): LaidItem[] | null"),
        Fn(name="lotPreset", at="src/game/lots/compose.ts:433", does="the preset a lot takes, fitted to its size", sig="lotPreset(lot, st)"),
        Fn(name="standIns", at="src/game/lots/compose.ts:669", does="stand-ins for pictures the library has removed", sig="standIns(fit, preset, lot, f): Fitted"),
        Fn(name="Build", at="src/game/lots/compose-core.ts:156", does="the build of one lot's props and patches", sig="class Build"),
        Fn(name="specFit", at="src/game/lots/compose-core.ts:415", does="the best-fitting sprite for a spec", sig="specFit(B, list, maxW, maxD, o)"),
    ],
    inputs=["a lot {o, u, n, w, d}", "a ComposeState {use, level, decline, seed}", "optional preset drops"],
    outputs=["a Composition {props, ground, anchors?}"],
    tests=["tests/compose.test.ts", "tests/fence-only.test.ts", "tests/eight-lot-views.test.ts", "tests/lot-remix.test.ts", "tests/lots-on-the-fly.test.ts", "tests/lots-every-use.test.ts"],
    below=["town.lots.cut", "town.buildings.facing", "town.buildings.classes", "town.compose.clean", "town.compose.parts", "town.compose.auto", "town.compose.legacy"],
    above=["town.audit.audit", "render"],
    dual="none stored: the composition is recomputed from the lot's state; a level back to EMPTY (LV.EMPTY) composes no props",
    seams=["the picture library (art)", "the ground protocol LotPatch (src/game/ground-protocol.ts:128)"],
    rules=["a built house lot always has a house facing its street", "no flat colour washes", "lit sprites are never mirrored"],
    impl="native", fn=compose, steer={"paving_near": 1.2, "overlap": 0.35}, port=PORT,
    params={"lot": "{o: {x,y}, u: {x,y}, n: {x,y}, w, d} the lot geometry in tiles", "st": "{use, level, decline, seed} the lot state", "drops": "optional list of preset drops"},
)
