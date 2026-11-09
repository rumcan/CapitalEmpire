"""render.gl: the WebGL2 renderer (T410). Children: the frame's draws, the shadow layer, the vector and point layer."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.gl", rung=2, title="WebGL2 renderer",
    purpose="Draw one frame from the streamed atlas: ground chunks, sprite instances, the shadow layer and the vectors.",
    requires=["A frame is begin, the chunk and sprite draws, the shadow and vector draws, then endFrame (gl.ts GLRenderer)."],
    below=["render.atlas", "render.sprites", "render.shadows"], above=["core.tick.frame"],
    rules=["performance is a hard gate", "shadows never multiply"],
)
