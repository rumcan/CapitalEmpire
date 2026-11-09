"""course.holes.plan: a hole's plan from tee to green: its line, its width, its green shape, and the wizard that draws it. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port defaultPlan (src/game/ext/hole-plan/index.ts:143) and centreLine (index.ts:217), with newPlan (hole-wizard/index.ts:96): inputs a hole "
         "number, a tee, a green and bends; output a HolePlan {seed, tee, green, bends, widths, shape}; the width and green limits are WIDTH_MIN 12 .. "
         "WIDTH_MAX 60 and GREEN_M2 400 .. 700 (hole-wizard/index.ts:33-35)")


def default_plan(hole: int, tee: list[float], green: list[float], bends: list[list[float]] | None = None, knobs: dict | None = None):
    """a hole's default plan (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.holes.plan", rung=3, title="Hole plan and wizard",
    purpose="Draw a hole: the tee, the green, up to three bends, the width along the hole, and the shape of the green, with the wizard's steps and the handles to drag.",
    requires=[
        "The wizard's steps are tee, green and shape (WizStep).",
        "A hole's plan keeps at most 3 bends (MAX_BENDS, the wizard's limit).",
        "A click reaches a handle within 11 pixels for a point and 8 for a line (HIT_PX, LINE_PX).",
    ],
    files=[
        "src/game/ext/hole-plan/index.ts",
        "src/game/ext/hole-wizard/index.ts",
        "src/game/ext/hole-wizard/draw.ts",
        "src/game/ext/hole-wizard/extras.ts",
    ],
    dynamics=[
        Fn(name="defaultPlan", at="src/game/ext/hole-plan/index.ts:143", does="a hole's default plan", sig="defaultPlan(...)"),
        Fn(name="rasterPlan", at="src/game/ext/hole-plan/index.ts:696", does="paints a plan onto the grid", sig="rasterPlan(...)"),
        Fn(name="HoleWizard", at="src/game/ext/hole-wizard/index.ts:264", does="the hole wizard: the steps, the handles and the plan it edits", sig="class HoleWizard"),
        Fn(name="newPlan", at="src/game/ext/hole-wizard/index.ts:96", does="a new plan from a tee, a green and bends", sig="newPlan(hole, tee, green, bends)"),
        Fn(name="drawWizard", at="src/game/ext/hole-wizard/draw.ts:240", does="draws the wizard over the course (canvas: not runnable in Python)", sig="drawWizard(v, w, mouse, now)"),
        Fn(name="collarOf", at="src/game/ext/hole-wizard/extras.ts:42", does="the collar of a surface at a point (the cells it covers)", sig="collarOf(s): {cells, over} | null"),
    ],
    inputs=["a hole number", "a tee and a green", "bends and widths", "mouse clicks on handles"], outputs=["a HolePlan", "the raster of the plan", "a wizard view"],
    tests=["tests/ext-hole-plan.test.ts", "tests/ext-hole-wizard.test.ts", "tests/hole-wizard-extras.test.ts", "tests/golf-range-ramp.test.ts"],
    below=["course.design.grid", "course.terrain.height"], above=["course.holes"],
    dual="the wizard's undo: withPlan and withoutPlan (hole-wizard/index.ts:130, :132) restore the plans of the course",
    impl="native", fn=default_plan, port=_TODO,
    steer={"green_m2": [400, 700, 50], "width": [12, 60], "max_bends": 3, "min_hole_m": 60, "hit_px": 11, "line_px": 8, "clear_forest": 1, "clear_town": 1.6},
)
