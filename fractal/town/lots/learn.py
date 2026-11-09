"""town.lots.learn: learning how lots are dressed from samples, and the taste the samples give. Stats is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: learningStats (src/game/lots/learn.ts:203) needs the Sample shape (learn.ts:111 readSample); buildModel (learn.ts:158) and buildTaste (src/game/lots/taste.ts:41) follow"


def learning_stats(samples, knobs=None):
    """port todo: the sample count, by class (Python port of learningStats, src/game/lots/learn.ts:203)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.lots.learn", rung=3, title="Learning lots from samples",
    purpose="Learn from the owner's dressed lots how many items of each kind go in each sector, and the taste that pairs them.",
    requires=[
        "SECTORS are verge, fence, near, drive, front and back (src/game/lots/learn.ts:19).",
        "PRIOR is a = 1, b = 1, the Beta prior of each count (src/game/lots/learn.ts:32).",
        "The learning file is src/game/lots/lot-learning.json, merged by mergeSamples (src/game/lots/learn.ts:139).",
    ],
    files=["src/game/lots/learn.ts", "src/game/lots/taste.ts", "src/game/lots/lot-learning.json"],
    dynamics=[
        Fn(name="learningStats", at="src/game/lots/learn.ts:203", does="the sample count in total and by class", sig="learningStats(samples): {total, byClass}"),
        Fn(name="buildModel", at="src/game/lots/learn.ts:158", does="the model of kept counts from the samples", sig="buildModel(samples): Model"),
        Fn(name="sectorOf", at="src/game/lots/learn.ts:48", does="the sector a point falls in on a lot", sig="sectorOf(l, x, y): Sector"),
        Fn(name="buildTaste", at="src/game/lots/taste.ts:41", does="the taste (anchors, pairs, density) from the samples", sig="buildTaste(samples, group = 'res'): Taste"),
    ],
    inputs=["learning samples (JSON)", "a lot's sectors"],
    outputs=["sample stats", "a model", "a taste"],
    tests=["tests/lot-learning-presets.test.ts", "tests/lot-taste.test.ts", "tests/lot-wizard.test.ts", "tests/lots-every-use.test.ts"],
    below=["town.lots.library"], above=["town.compose"],
    dual="MISSING: a learned sample cannot be unlearned: mergeSamples only adds (src/game/lots/learn.ts:139), so a bad sample stays until the file is edited by hand",
    seams=["the lot lab's sample store (dev, core)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=learning_stats, steer={"prior_a": 1, "prior_b": 1}, port=PORT,
    params={"samples": "list of learning samples (JSON)"},
)
