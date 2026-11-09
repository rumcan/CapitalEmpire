"""art.eight: the 8-view registry: each object drawn from eight authored camera views, with the four normal and four yaw8 facings (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art.eight", rung=2, title="8-view registry",
    purpose="Keep each object's eight camera views (four normal, four yaw8) and pick the facing an object is drawn at.",
    requires=[
        "OBJECT_FACING_KEYS are normalNE, yaw8N, normalSE, yaw8E, normalSW, yaw8S, normalNW, yaw8W (object-eight-types.ts line 5).",
        "The manifest is the authority for yaw8: a square-axis set never qualifies on its own (object-eight-core.ts header).",
    ],
    below=["art.library"], above=["town", "business", "course", "core.engine.orchestra"],
    rules=["straight views turned 8 degrees", "new art used everywhere", "never mirror lit sprites"],
)
