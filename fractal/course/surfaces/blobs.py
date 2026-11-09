"""course.surfaces.blobs: the outlines of the course surfaces (blobs), their edges, and the grow and splash effects."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.surfaces.blobs", rung=3, title="Surface outlines, edges and growth",
    purpose="Draw each surface as a smooth outline with its edge and collar, grow the grass in stages from seed or sod, and splash dirt, sand or water when a ball lands.",
    requires=[
        "A surface outline is worked in chunks of 64 cells with a 3.5-tile margin (CHUNK_MARGIN).",
        "The grow stage is between 0 and 1 for a share of the surface (growStage, seededStage).",
        "A splash is one of dirt, sand or water (SplashKind).",
    ],
    files=[
        "src/game/ext/course-blobs/index.ts",
        "src/game/ext/course-edges/index.ts",
        "src/game/ext/course-fx/index.ts",
        "src/game/ext/course-fx/seed.ts",
        "src/game/rugged-edges.ts",
    ],
    dynamics=[
        Fn(name="chunkOutlines", at="src/game/ext/course-blobs/index.ts:1029", does="the outlines of the surfaces in one chunk", sig="chunkOutlines(g, cx, cy, size = 64, styles)"),
        Fn(name="blobOutlines", at="src/game/ext/course-blobs/index.ts:1062", does="the outline of one surface in a box", sig="blobOutlines(g, surf, box, style)"),
        Fn(name="DrawnSurfaces", at="src/game/ext/course-blobs/index.ts:1073", does="the drawn surfaces class: the outlines as pictures", sig="class DrawnSurfaces"),
        Fn(name="binEdges", at="src/game/ext/course-edges/index.ts:78", does="bins the edge runs of the surfaces into the edge pictures", sig="binEdges(...)"),
        Fn(name="growMask", at="src/game/ext/course-fx/index.ts:52", does="the mask of grown grass for a stage", sig="growMask(...)"),
        Fn(name="spawnSplash", at="src/game/ext/course-fx/index.ts:143", does="starts a splash particle of dirt, sand or water", sig="spawnSplash(...)"),
        Fn(name="seedColour", at="src/game/ext/course-fx/seed.ts:50", does="the colour of seeded ground over its soil", sig="seedColour(look, soil): string"),
    ],
    inputs=["the course grid", "the grow month and the plant kind", "a splash kind"], outputs=["outlines", "edge pictures", "grow masks", "splash particles"],
    tests=["tests/ext-course-blobs.test.ts", "tests/ext-course-banks.test.ts", "tests/ext-course-edges.test.ts", "tests/ext-course-fx.test.ts", "tests/course-border-none.test.ts"],
    below=["course.design.grid"], above=["course.surfaces"],
    dual="none for the picture (it is rebuilt from the grid); a splash is a short effect that ends by itself",
    impl="describe", steer={"chunk_margin": 3.5, "fill_grow": 0.1, "simplify_tol": 0.04, "lattice": 0.25, "kernel_r": 1.25},
)
