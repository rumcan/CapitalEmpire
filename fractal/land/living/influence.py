"""land.living.influence: the living ground influence (living-ground.ts): how much each caster, road, water and sand field changes the ground look per chunk."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.influence", rung=3, title="Living ground influence",
    purpose="Make the ground change with what stands on it: lush grass near trees and water, bare dirt by roads, sand in the desert, damp near the lake.",
    requires=[
        "influence(box, res, sources) returns an influence grid for a chunk box at a resolution.",
        "livingSignature changes when the sources change, so a chunk is redone only when its influence moved.",
        "The shadow direction used for the casters is 145 degrees (SHADOW_DIR), the one sun of the game.",
    ],
    owns=["CK caster kinds (living-ground.ts:24)", "CASTER_STRIDE 7 and the reach constants (MAX_CASTER_REACH 12, CHUNK_CASTER_REACH 9)", "VARIANT_IDS (the four ground variants)"],
    files=["src/game/living-ground.ts"],
    dynamics=[
        Fn(name="influence", at="src/game/living-ground.ts:239", does="the influence grid of a chunk box from its sources", sig="influence(box, res, src): InfluenceGrid"),
        Fn(name="livingSignature", at="src/game/living-ground.ts:430", does="a signature of the sources, to know when to redo a chunk", sig="livingSignature(res, src): number"),
        Fn(name="livingMasks", at="src/game/living-ground.ts:464", does="the masks (grass, dirt, leaves) from an influence grid", sig="livingMasks(g): LivingMasks"),
        Fn(name="sandField", at="src/game/living-ground.ts:167", does="the desert sand field at a point", sig="sandField(x, y, res)"),
    ],
    inputs=["a chunk box, a resolution and the sources (casters, roads, water lines, desert)"], outputs=["influence grid and the masks for the bake"],
    tests=["tests/living-ground.test.ts", "tests/ground-layers.test.ts", "tests/desert-sand.test.ts", "tests/water-look.test.ts", "tests/rugged-edges.test.ts"],
    below=["land.river.course"], above=["land.bake.worker", "land.living.base-grass", "land.living.leaves"],
    dual="setLiving(on, debug) on the ground cache switches the living ground off (GroundCache.setLiving)",
    seams=["the casters come from the buildings, trees, fences and hedges (town and course)"],
    rules=["sun upper right, shadows 145 degrees", "no flat colour washes", "performance is a hard gate"],
    impl="describe",
)
