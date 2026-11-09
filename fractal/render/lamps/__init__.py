"""render.lamps: the lamps and the night: the light pools on the ground, the specular glints, and the night's blue wash (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="render.lamps", rung=2, title="Lamps and night",
    purpose="Put each lamp's light on the ground as a round feathered pool, and wash the town blue as the night comes.",
    requires=["A lamp's light pool is a round feathered falloff of radius POOL_R 2.6 (lamp-pool.ts), lit straight below the lamp's head."],
    below=["art"], above=["render.gl", "core.tick.frame"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes"],
)
