"""render.lamps.pool: the falloff of a lamp's light pool at a distance (lamp-pool.ts poolAt), ported. Steer: the pool radius in world units."""
from fractal.holon import Fn, Holon

STEER = {"pool_r": 2.6}


def pool_at(r: float, knobs: dict | None = None) -> float:
    """the pool's strength at distance r from the lamp's foot: (1 - (r / R) squared) cubed inside R, 0 outside"""
    R = (knobs or STEER)["pool_r"]
    s = r / R
    if not s < 1:
        return 0.0
    t = 1 - s * s
    return t * t * t


HOLON = Holon(
    id="render.lamps.pool", rung=3, title="Lamp light pool",
    purpose="Shape each lamp's light pool on the ground: strongest under the lamp, feathered to nothing at its radius.",
    requires=[
        "poolAt(r) is 0 at and beyond POOL_R (2.6), and (1 - (r / R)^2)^3 inside it (lamp-pool.ts line 26).",
        "lampGround puts the pool straight below the lamp's head, at the pole's foot (lamp-pool.ts line 52).",
    ],
    owns=["the pool stamp (POOL_STAMP 256 px, a Float32Array alpha)", "the cars' brake lights (car-lamps.ts brakeLamps: two lit lamps, behind the sprites)"],
    files=["src/game/lamp-pool.ts", "src/game/sim/car-lamps.ts"],
    dynamics=[
        Fn(name="poolAt", at="src/game/lamp-pool.ts:26", does="the pool's strength at a distance from the lamp", sig="poolAt(r)"),
        Fn(name="poolStampAlpha", at="src/game/lamp-pool.ts:32", does="the pool stamp's alpha, row by row", sig="poolStampAlpha(n)"),
        Fn(name="lampGround", at="src/game/lamp-pool.ts:52", does="the ground point under a lamp's head", sig="lampGround(it, p)"),
    ],
    inputs=["a lamp's distance from its foot"],
    outputs=["the pool stamp alpha for the lamp ground layer"],
    tests=["tests/lamp-pool.test.ts", "tests/night-light.test.ts", "tests/car-lamps.test.ts"],
    below=[], above=["render.lamps", "render.gl.frame"],
    dual=None, seams=["the lamp glows of a LibItem (art) in"],
    impl="native", fn=pool_at, steer=dict(STEER),
    params={"r": "float, distance from the lamp's foot in world units"},
)
