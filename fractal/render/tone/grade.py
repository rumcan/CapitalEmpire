"""render.tone.grade: the whole-frame colour grade (grade.ts gradeFrame, the split tone curve and the edge blur), not ported yet."""
from fractal.holon import Fn, Holon


def grade_frame(on: bool = True, strength: float = 1.0, edge_blur: bool = False, night: float = 0.0, knobs: dict | None = None) -> dict | None:
    """the grade for this frame (not ported yet)"""
    raise NotImplementedError("render.tone.grade: port gradeFrame, gradeDay and the curve (src/game/grade.ts:96, :91, :104); needs the GRADE table at :41")


HOLON = Holon(
    id="render.tone.grade", rung=3, title="Frame colour grade",
    purpose="Grade the frame's colour (split tone, mid contrast, vibrance, a vignette and edge blur), fading out after dusk.",
    requires=[
        "gradeFrame is null when the grade is off; otherwise its strength is the setting (max 1.5) times the day share (grade.ts line 96).",
        "The grade's curve at strength 0 is the identity, exactly (gradeRgb).",
    ],
    owns=["the grade settings (on, strength, edgeBlur) saved under capitalempire.grade"],
    files=[],
    dynamics=[
        Fn(name="gradeFrame", at="src/game/grade.ts:96", does="the grade for this frame, or null", sig="gradeFrame(g, night)"),
        Fn(name="gradeRgb", at="src/game/grade.ts:104", does="the tone curve on one display colour", sig="gradeRgb(r, g, b, s)"),
        Fn(name="blurTaps", at="src/game/grade.ts:128", does="the edge blur's taps and weights", sig="blurTaps(sigma, reach)"),
    ],
    inputs=["the grade settings", "the night amount"],
    outputs=["a GradeFrame for gl.ts endFrame"],
    tests=["tests/grade.test.ts", "tests/ext-grade.test.ts", "tests/golf-osm-find.test.ts"],
    below=["render.lamps.night"], above=["render.tone", "render.gl.frame"],
    dual="setGrade with on false (engine.ts setGrade)",
    impl="native", fn=grade_frame,
    port="todo: port gradeFrame, gradeDay and gradeRgb (inputs: GradeSettings dict, night 0..1; outputs: the frame strength and the curve; TS grade.ts:96, :91, :104, GRADE table :41)",
    params={"strength": "float, the grade setting 0..1.5", "night": "float, the night amount 0..1"},
)
