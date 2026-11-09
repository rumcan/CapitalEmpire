"""land.relief.paint: the terrain paint helpers: class coverage, water and bar shapes, the rock alpha (terrain-paint.ts). Used in workers and Node."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.relief.paint", rung=3, title="Terrain paint helpers",
    purpose="Paint the terrain own look: the hillshade overlay, the water and bank shapes and the bare rock on the steep faces.",
    requires=[
        "shadeRGBA draws the hillshade over tiles at res pixels per tile; dark where in shadow, pale where lit.",
        "waterShape and barShape draw the river and creek shapes through a path sink; the cut mode of barShape is the outer bank.",
        "woodlandTex takes its surface from the presets (PRESETS), so the woodland look follows the paint presets.",
    ],
    owns=["WOODLAND_TEX (terrain-paint.ts:20)", "CUT (terrain-paint.ts:133)"],
    files=["src/game/terrain-paint.ts"],
    dynamics=[
        Fn(name="shadeRGBA", at="src/game/terrain-paint.ts:51", does="the hillshade as an RGBA overlay over a box of tiles", sig="shadeRGBA(shade, x0, y0, w, h, res, course = null)"),
        Fn(name="classAlpha", at="src/game/terrain-paint.ts:76", does="the soft coverage of one terrain class over a box", sig="classAlpha(cls, want, x0, y0, w, h, res, noise)"),
        Fn(name="waterShape", at="src/game/terrain-paint.ts:107", does="the water outline of a waterway through a path sink", sig="waterShape(sink, pts, extra, box, widthScale = 1): boolean"),
        Fn(name="barShape", at="src/game/terrain-paint.ts:134", does="the point bar or the cut bank of a natural river", sig="barShape(sink, pts, box, mode, grow = 0): boolean"),
        Fn(name="rockAlpha", at="src/game/terrain-paint.ts:182", does="bare rock alpha on the steep faces (slope past about 1.2 fades in)", sig="rockAlpha(slope, x0, y0, w, h, res, noise)"),
    ],
    inputs=["height and class grids, waterways, a box and a resolution"], outputs=["RGBA or alpha pictures and path shapes"],
    tests=["tests/terrain-paint.test.ts", "tests/forest.test.ts", "tests/golf-paintcourse.test.ts", "tests/river-natural.test.ts", "tests/t381-tree-removal.test.ts"],
    below=["land.relief.hillshade", "land.relief.slope", "land.terrain.fields"], above=["land.bake.worker"],
    dual="MISSING: a painted overlay is redrawn on each bake; no separate undo (the ground re-bakes itself)",
    seams=["Terrain and the course height (ext/course-height SUN_LIGHT) drive the shade"],
    rules=["no flat colour washes", "highlights are textured", "sun upper right, shadows 145 degrees"],
    impl="describe",
)
