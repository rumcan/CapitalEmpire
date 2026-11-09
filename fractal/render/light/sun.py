"""render.light.sun: the cloud drift rate at a game speed (sun-patches.ts cloudRate), ported. Steer: the boost, the knee and the ceiling."""
import math

from fractal.holon import Fn, Holon

STEER = {"cloud_boost": 8.0, "cloud_knee": 64.0, "cloud_ceiling": 80.0}


def cloud_rate(speed: float, knobs: dict | None = None) -> float:
    """the clock's rate (game seconds of drift per real second) at game speed k: boost times k up to the knee, then an ease to the ceiling; 0 paused"""
    k = knobs or STEER
    v = k["cloud_boost"] * speed if speed > 0 else 0.0
    knee, ceil = k["cloud_knee"], k["cloud_ceiling"]
    return v if v <= knee else knee + (ceil - knee) * (1 - math.exp(-(v - knee) / (ceil - knee)))


HOLON = Holon(
    id="render.light.sun", rung=3, title="Sun patches and clouds",
    purpose="Drift the cloud patches over the ground at a rate that follows the game speed, and stop them when paused.",
    requires=[
        "cloudRate(speed) is 8 times the speed up to the knee (64), then eases to the ceiling (80) with no kink at the knee (sun-patches.ts line 68).",
        "A paused clock (speed 0) gives a rate of 0.",
    ],
    owns=["the sun noise texture (512 px, seeded)", "the sun setting (on, strength 0..2)"],
    files=["src/game/sun-patches.ts"],
    dynamics=[
        Fn(name="cloudRate", at="src/game/sun-patches.ts:68", does="the drift rate at a game speed", sig="cloudRate(speed)"),
        Fn(name="sunStep", at="src/game/sun-patches.ts:73", does="the drift step for one frame of dt seconds", sig="sunStep(dt, speed)"),
        Fn(name="sunNoise", at="src/game/sun-patches.ts:88", does="the seeded noise texture the patches are cut from", sig="sunNoise(seed)"),
    ],
    inputs=["the game speed", "the frame's dt"],
    outputs=["the drift step", "the sun texture"],
    tests=["tests/sun-patches.test.ts", "tests/water-glint.test.ts"],
    below=[], above=["core.tick.frame", "render.gl.frame"],
    dual="clampSun with on false (the sun patches off)",
    impl="native", fn=cloud_rate, steer=dict(STEER),
    params={"speed": "float, the game speed (1 = normal, 8 = 8x)"},
)
