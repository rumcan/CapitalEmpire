"""render.gl.vectors: the vector mesh and point layer for the planner view (gl.ts, described under render.gl)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.gl.vectors", rung=3, title="Vector and point layer",
    purpose="Draw vehicles as points in the planner view, and the vector shadows and sprites from one shared mesh.",
    requires=[
        "initVector uploads the shadow vector mesh once; drawVector draws ranges of VECTOR_STRIDE 20 floats.",
        "drawPoints draws POINT_STRIDE 6 floats per vehicle at the planner zoom.",
    ],
    owns=["the vector mesh buffers (shadow-vector.ts buildVectorMesh output)"],
    files=['src/game/ext/map-grid/index.ts', 'src/game/ext/map-grid/layer.ts'],
    dynamics=[
        Fn(name="initVector", at="src/game/gl.ts:822", does="uploads the shadow vector mesh", sig="initVector(m: VectorMesh)"),
        Fn(name="drawVector", at="src/game/gl.ts:841", does="draws a range of vector sprites or shadows", sig="drawVector(firstFloat, count, verts, sx, sy, contact, cast, far, minPx)"),
        Fn(name="drawPoints", at="src/game/gl.ts:855", does="draws vehicles as points in the planner view", sig="drawPoints(firstFloat, count, size, soft)"),
    ],
    inputs=["VectorMesh from shadow-vector.ts vectorMesh()", "point instance ranges"],
    outputs=["vector shadows and points in the scene target"],
    tests=["tests/shadow-vector.test.ts", "tests/car-lamps.test.ts"],
    below=["render.shadows.vector"], above=["render.gl"],
    dual=None, seams=["VectorMesh (shadow-vector.ts) in"],
    impl="describe",
)
