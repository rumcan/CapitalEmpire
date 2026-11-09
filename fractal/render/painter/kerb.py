"""render.painter.kerb: the kerb face of a bevelled edge (kerb-face.ts kerbFace), described: it draws onto a 2D context."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.painter.kerb", rung=3, title="Kerb face",
    purpose="Draw the vertical face of a kerb or bank edge, so a raised edge reads as raised on the ground.",
    requires=[
        "FACE_WORLD is 7.5 world px at the closest zoom and faceShift never goes below 1 px (kerb-face.ts lines 14 and 19).",
        "kerbFace draws the face in the bands given, once per feature, at the shift.",
    ],
    owns=["nothing: it draws onto the bevel context"],
    files=[],
    dynamics=[Fn(name="kerbFace", at="src/game/kerb-face.ts:32", does="draws the kerb faces of the features in bands", sig="kerbFace(g, feats, M, shift, bands)")],
    inputs=["the features (Feature list) and the affine M"],
    outputs=["the face pixels on the bevel canvas"],
    tests=["tests/kerb-face.test.ts", "tests/cart-bevel.test.ts"],
    below=[], above=["render.painter.ground"],
    dual=None,
    seams=["town.network: the kerb edges (kerb-face.ts is owned by town.network; render draws them)"],
    impl="describe",
)
