"""course.greens.rolls: the roll at a green's edge: the light and dark bands that show the lip where the green falls away (bunker-look.ts)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.greens.rolls", rung=3, title="Green roll edge",
    purpose="Draw the roll round a green's edge: a lit band and a dark band where the green drops, so the lip reads in the picture.",
    requires=[
        "The roll is 0.9 tile wide with its light band at 0.4 and its dark band at 0.32 (GREEN_ROLL.w, light, dark).",
        "The roll reaches at most the larger of its width and out, plus 0.2 tile (GREEN_ROLL_REACH).",
    ],
    files=[],
    dynamics=[
        Fn(name="greenRollImages", at="src/game/bunker-look.ts:130", does="the light and dark roll pictures for a green's edge field", sig="greenRollImages(f: EdgeField, k: number): {light, dark}"),
    ],
    inputs=["a green's edge field and a scale k"], outputs=["a light and a dark roll picture"],
    tests=["tests/bunker-look.test.ts", "tests/course-border-none.test.ts"],
    below=["course.surfaces.blobs"], above=["course.greens"],
    dual="none: the roll is a picture drawn from the edge field (rebuilt when the green changes)",
    impl="describe", steer={"w": 0.9, "out": 0.55, "light": 0.4, "dark": 0.32, "gap": 0.04, "ramp": 0.12},
)
