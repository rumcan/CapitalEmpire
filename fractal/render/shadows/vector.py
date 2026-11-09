"""render.shadows.vector: the vector shadow mesh and its triangulation (shadow-vector.ts), not ported yet."""
from fractal.holon import Fn, Holon


def triangulate(pts: list, outer: list, holes: list, knobs: dict | None = None) -> list:
    """the triangle indices of a polygon with holes (not ported yet)"""
    raise NotImplementedError("render.shadows.vector: port triangulate (src/game/shadow-vector.ts:82)")


HOLON = Holon(
    id="render.shadows.vector", rung=3, title="Vector shadow mesh",
    purpose="Build one triangle mesh of every vector shadow (its outline, holes and blur), uploaded once for the GPU.",
    requires=[
        "triangulate returns triangles for an outer ring with holes (shadow-vector.ts line 82).",
        "buildVectorMesh packs VERTEX_FLOATS 8 floats per vertex; the mesh is built once and cached (vectorMesh).",
    ],
    owns=["the vector mesh (vertices, indices, the id to entry map)", "the vector fallback table (VECTOR_FALLBACK)"],
    files=["src/game/shadow-vector.ts"],
    dynamics=[
        Fn(name="buildVectorMesh", at="src/game/shadow-vector.ts:226", does="builds the vector shadow mesh from the shape table", sig="buildVectorMesh(shapes)"),
        Fn(name="vectorMesh", at="src/game/shadow-vector.ts:246", does="the cached mesh (built on first use)", sig="vectorMesh()"),
        Fn(name="vectorFallback", at="src/game/shadow-vector.ts:260", does="the kind to use when an item has no vector shadow", sig="vectorFallback(id, kind)"),
    ],
    inputs=["the shape tables (shadow-shapes.json, animal-shadows.json)"],
    outputs=["the VectorMesh for gl.ts initVector"],
    tests=["tests/shadow-vector.test.ts", "tests/axis-shadows.test.ts", "tests/farm-animals.test.ts"],
    below=["render.shadows.shape"], above=["render.gl.vectors"],
    dual="releaseVectorMeshData (drops the CPU copy after upload)",
    impl="native", fn=triangulate,
    port="todo: port triangulate, then buildVectorMesh (inputs: the outline and hole rings as [x, y] lists; outputs: triangle index triples; TS shadow-vector.ts:82 and :226)",
    params={"pts": "list, the ring points", "outer": "list, the outer ring indices", "holes": "list of lists, the hole rings"},
)
