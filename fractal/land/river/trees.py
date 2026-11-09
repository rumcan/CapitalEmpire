"""land.river.trees: the tree belt along every river and creek (river-trees.ts): a wooded bank with clumps, conifers and snags."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.river.trees", rung=3, title="Tree belts along the water",
    purpose="Plant the banks: a belt of trees along every river and creek, bunched on the mass, with conifers and dead snags.",
    requires=[
        "beltField(seed, waters) builds the water index and the swamp and clump noise for a seed.",
        "riverBeltCell decides per cell whether a tree belt grows there, out to BELT_OUT from the bank.",
        "A cell under a road or lot is left free (riverBeltCell takes the free test).",
    ],
    owns=["BELT (river-trees.ts:43, the belt widths and fall-off)", "BELT_BROAD_DEAL, BELT_CONIFER_DEAL, BELT_SNAG_DEAL (the species mixes)"],
    files=["src/game/river-trees.ts"],
    dynamics=[
        Fn(name="beltField", at="src/game/river-trees.ts:118", does="the belt water index and noises for a seed and the waterways", sig="beltField(seed, waters): BeltField"),
        Fn(name="riverBeltCell", at="src/game/river-trees.ts:136", does="the trees of one cell in the belt, skipping built ground", sig="riverBeltCell(seed, cls, slope, f, ci, cj, free)"),
    ],
    inputs=["seed, the class and slope grids, the waterways, a cell"], outputs=["tree placements in the belt cell"],
    tests=["tests/river-belts.test.ts", "tests/river-natural.test.ts", "tests/t381-tree-removal.test.ts"],
    below=["land.river.course", "land.nature.forest"], above=["town", "course"],
    dual="MISSING: belt trees are placed by the seed; removing one is the tree-removal tool job, not a land function",
    seams=["the belt uses the species lists of the forest (forest.ts FOREST_CONIFERS, FOREST_BROADLEAF)"],
    rules=["town jams are the player's job", "performance is a hard gate"],
    impl="describe",
)
