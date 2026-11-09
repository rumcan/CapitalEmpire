"""town.network.kerbs: the kerb face, the bevel strip a kerb casts along a road's edge (a paint helper, no state)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.network.kerbs", rung=3, title="Kerb faces",
    purpose="Paint the kerb face along a road's edge, cut in two bands, shifted by the road's length factor.",
    requires=[
        "The kerb face is cut in two bands at FACE_CUTS = 0.62 and 0.3 (src/game/kerb-face.ts:17).",
        "faceShift(L) is FACE_WORLD * L, at least 1, with FACE_WORLD = 7.5 (src/game/kerb-face.ts:14, :19).",
    ],
    files=["src/game/kerb-face.ts"],
    dynamics=[
        Fn(name="kerbFace", at="src/game/kerb-face.ts:32", does="paints the kerb face of a road's features into the bevel bands", sig="kerbFace<I>(g: BevelCtx<I>, feats, M: Affine, shift: number, bands: string[])"),
        Fn(name="faceShift", at="src/game/kerb-face.ts:19", does="the kerb face's shift for a length L, at least 1 pixel", sig="faceShift(L: number): number"),
    ],
    inputs=["a road's features (Feature[])", "the affine map to screen", "the shift and the bands"],
    outputs=["painted kerb faces on the bevel context"],
    tests=["tests/kerb-face.test.ts"],
    below=["town.network.graph"], above=["render"],
    dual="none needed: a paint helper with no state; the next rebuild paints it again",
    seams=["the renderer's bevel pass (render)"],
    rules=["no flat colour washes"],
)
