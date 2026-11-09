"""render.lamps.night: the night's blue wash and the lamp glows on the sprites (night-light.ts), not ported yet."""
from fractal.holon import Fn, Holon


def night_at(s: dict, h: float, day: float | None = None, knobs: dict | None = None) -> float:
    """the night amount at a clock hour (not ported yet)"""
    raise NotImplementedError("render.lamps.night: port nightAt and nightDay (src/game/night-light.ts:78 and :71)")


HOLON = Holon(
    id="render.lamps.night", rung=3, title="Night wash and lit windows",
    purpose="Wash the town in blue moonlight as the game clock goes to night, and light the sprites' lamps and windows.",
    requires=[
        "NIGHT_DEFAULT sets the night wash from the owner's gear menu values; nightAt follows the game clock (dusk, night, dawn) or is always on or off.",
        "The art is painted at early evening: by day nothing changes (night-light.ts header).",
    ],
    owns=["the night settings (NightSettings)", "the light types (LIGHT_TYPES: lamps, windows)"],
    files=["src/game/night-light.ts"],
    dynamics=[
        Fn(name="nightAt", at="src/game/night-light.ts:78", does="the night amount at a clock hour", sig="nightAt(s, h, day)"),
        Fn(name="propLights", at="src/game/night-light.ts:98", does="the lights one prop gives off at night", sig="propLights(p, it, s, screen, ze, out)"),
        Fn(name="NightRenderer", at="src/game/night-light.ts:122", does="draws the night pools and glows", sig="class NightRenderer"),
    ],
    inputs=["the game clock hour", "the night settings"],
    outputs=["the night amount (0 day, 1 night)", "NightLight records for the lamp pass"],
    tests=["tests/night-light.test.ts", "tests/lamp-pool.test.ts", "tests/water-glint.test.ts"],
    below=["render.lamps.pool"], above=["render.lamps", "core.engine.orchestra"],
    dual="setNight with the night off (engine.ts setNight)",
    impl="native", fn=night_at,
    port="todo: port nightAt and nightDay (inputs: the NightSettings dict and the clock hour; output: the 0..1 night amount; TS night-light.ts:78 and :71)",
    params={"h": "float, the clock hour"},
)
