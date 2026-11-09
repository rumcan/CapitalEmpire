"""town.compose.clean: the clean yards: the condition of a house's lot, and the clean-yard switches. Ports conditionOf (src/game/lots/clean-yards.ts:71)."""
import re

from fractal.holon import Fn, Holon

STEER = {"run_down_pattern": "rundown|shanty|derelict|abandon|dilapidat|boarded", "well_off_tier": 3, "max_trees": 3, "clean_model": 5}


def condition_of(state, tier, house_id, knobs=None):
    """the condition of a lot: run-down when declined, tier 0 or a run-down house; well-off when upgraded or tier 3+; else ordinary"""
    k = {**STEER, **(knobs or {})}
    if state == "declined" or tier == 0 or re.search(k["run_down_pattern"], house_id):
        return "run-down"
    t = 3 if tier is None else tier
    return "well-off" if state == "upgraded" or t >= k["well_off_tier"] else "ordinary"


HOLON = Holon(
    id="town.compose.clean", rung=3, title="Clean yards and clean ground",
    purpose="Give each house lot a clean yard: its drive and path surface by condition, its trees kept few, and its hedges in a run.",
    requires=[
        "conditionOf is run-down for a declined lot, tier 0 or a run-down house name, else well-off when upgraded or tier 3+ (src/game/lots/clean-yards.ts:71).",
        "MAX_TREES = 3 and CLEAN_MODEL = 5 (src/game/lots/clean-yards.ts:26, :29).",
        "setCleanYards switches the clean yards, and the old look stays when it is off (src/game/lots/clean-yards.ts:22).",
    ],
    files=["src/game/lots/clean-lot.ts", "src/game/lots/clean-yards.ts", "src/game/lots/setback.ts", "src/game/rough-yards.ts", "src/game/towntrees.ts"],
    dynamics=[
        Fn(name="conditionOf", at="src/game/lots/clean-yards.ts:71", does="the lot's condition: run-down, ordinary or well-off", sig="conditionOf(state, tier, houseId): Condition"),
        Fn(name="cleanGround", at="src/game/lots/clean-lot.ts:50", does="the clean ground patches of a lot (not yet ported)", sig="cleanGround(patches, W, D, house, ...)"),
        Fn(name="cleanTrees", at="src/game/lots/clean-lot.ts:177", does="the few trees a clean yard keeps (not yet ported)", sig="cleanTrees(B, f, keep, r, pool)"),
        Fn(name="setBack", at="src/game/lots/setback.ts:65", does="the house's setback from the street (not yet ported)", sig="setBack(fit, preset, lot, f)"),
    ],
    inputs=["the preset state (built, upgraded, declined)", "the building tier", "the house id"],
    outputs=["a condition word", "ground patches and trees (later)"],
    tests=["tests/clean-lots.test.ts", "tests/house-drives.test.ts", "tests/rough-yards.test.ts", "tests/street-base.test.ts"],
    below=["town.compose.lot"], above=["town.audit.audit"],
    dual="setCleanYards(false) (src/game/lots/clean-yards.ts:22) brings back the old yards",
    seams=["the lot's drive and path surfaces (ground protocol LotPatch)"],
    rules=["new art used everywhere, with the old look kept as an option", "no flat colour washes"],
    impl="native", fn=condition_of, steer=STEER,
    port="todo: cleanGround (src/game/lots/clean-lot.ts:50), cleanTrees (:177), hedgeRun (:204) and setBack (src/game/lots/setback.ts:65); conditionOf is ported",
    params={"state": "str, built | upgraded | declined", "tier": "int or null, 0..3", "house_id": "str, the house picture id"},
)
