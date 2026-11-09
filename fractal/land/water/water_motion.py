"""land.water.motion: water that moves (water-motion.ts): flow, ripple, foam, sparkle and the wet edge, with their ranges and the saved setting."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.water.motion", rung=3, title="Water motion",
    purpose="Make the water move: flow along the river, small waves and foam on the edge, sparkle in the sun, a wet bank.",
    requires=[
        "WATER_MOTION defaults on, with flow 2.29, ripple 1.17, foam 1.28, sparkle 3; each range is 0 to 3 (MOTION_RANGES).",
        "clampWaterMotion clamps a saved setting to those ranges on load.",
        "motionMask writes the mask the shader reads: the signed distance and the flow direction per texel.",
    ],
    owns=["WATER_MOTION (water-motion.ts:37)", "WATER_MOTION_KEY (the saved key, v1)", "LAP, RIPPLE, FLOW, FOAM, SPARKLE and WET (the tuning)"],
    files=["src/game/water-motion.ts"],
    dynamics=[
        Fn(name="clampWaterMotion", at="src/game/water-motion.ts:42", does="clamps a saved motion setting to its ranges", sig="clampWaterMotion(s: unknown): WaterMotion"),
        Fn(name="motionMask", at="src/game/water-motion.ts:77", does="the motion mask over a water field (signed distance and flow per texel)", sig="motionMask(f, ex = {}): MotionMaskData | null"),
        Fn(name="motionFrame", at="src/game/water-motion.ts:229", does="the motion values for one frame at a zoom and night level", sig="motionFrame(m, z, night, ze, ph)"),
        Fn(name="stepPhases", at="src/game/water-motion.ts:234", does="advances the wave and drift phases by dt", sig="stepPhases(ph, dt, m)"),
    ],
    inputs=["a water field, zoom, night level, time step"], outputs=["mask data and per-frame motion values"],
    tests=["tests/water-motion.test.ts", "tests/water-glint.test.ts"],
    below=["land.water.map", "land.river.course"], above=["land.bake.worker", "render"],
    dual="setWaterMotion(false) on the ground cache switches it off (GroundCache.setWaterMotion)",
    seams=["the motion mask is a texture the water shader samples (WATER_MOTION_GLSL)"],
    rules=["performance is a hard gate", "highlights are textured", "sun upper right, shadows 145 degrees"],
    impl="describe",
)
