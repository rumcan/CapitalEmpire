"""render.gl.frame: the frame's begin, chunk and sprite draws, and endFrame (gl.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="render.gl.frame", rung=3, title="Frame draw",
    purpose="Start a frame, draw the baked ground chunks and the sprite instances, and finish it (the grade pass when on).",
    requires=[
        "begin clears the colour target and sets the camera (X, Y, ze) and the screen size; endFrame runs the grade pass only when gl.grade is set.",
        "drawSprites draws one instance range per call; a sprite under CULL_MIN_PX (7 px) is culled before it is drawn.",
        "Uploads (uploadParts) are typed-array copies; no per-frame allocation in the draw path.",
    ],
    owns=["the WebGL2 context and programs", "the scene and colour targets", "the wind and camera uniforms", "gl.stats (instances, draws)"],
    files=["src/game/gl.ts"],
    dynamics=[
        Fn(name="begin", at="src/game/gl.ts:611", does="clears the colour target and sets the camera for the frame", sig="begin(v: View, clear: [number, number, number])"),
        Fn(name="drawChunk", at="src/game/gl.ts:685", does="draws one baked ground chunk as a textured quad in world px", sig="drawChunk(tex, X0, Y0, X1, Y1, masked, alpha, uv, spec)"),
        Fn(name="drawSprites", at="src/game/gl.ts:736", does="draws a range of sprite instances from the sprite buffer", sig="drawSprites(firstFloat, count, minPx)"),
        Fn(name="endFrame", at="src/game/gl.ts:646", does="runs the colour grade pass when on and presents the frame", sig="endFrame()"),
        Fn(name="uploadParts", at="src/game/gl.ts:721", does="uploads Float32Array parts to the instance buffer", sig="uploadParts(parts)"),
    ],
    inputs=["a View (camera X, Y, zoom, canvas size)", "Float32Array instance parts from sprites.ts"],
    outputs=["the presented frame", "gl.stats instance and draw counts (the perf counters)"],
    tests=["tests/cast-shadow.test.ts", "tests/shadow-cull.test.ts", "tests/roof-dust.test.ts", "gate: npm run bench (frame budget, GAME-PLAN 2.3)"],
    below=["render.atlas.upload", "render.sprites.pack", "render.shadows.cast"], above=["render.gl", "core.tick.frame"],
    dual=None, seams=["View (iso.ts camera) in; the canvas out"],
    rules=["performance is a hard gate", "no visible tiling"],
    impl="describe",
)
