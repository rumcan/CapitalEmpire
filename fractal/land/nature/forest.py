"""land.nature.forest: the forest planted on the hills (forest.ts): cells of trees from the seed, the conifers and broadleaves, and their deal by weight."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.nature.forest", rung=3, title="Forest on the hills",
    purpose="Plant the hills with forest: cells of trees from the seed, conifers high and broadleaves low, clearings where the noise says so.",
    requires=[
        "FOREST_CELL is 64 tiles; forestCellRange gives the cells a view covers, with FOREST_VIEW_MARGIN 8.",
        "treeDeal weights the species of a list; dealTree picks one species from a unit value u.",
        "forestCell plants one cell from the seed, the class grid, the height and the slope (the slope past the rock fade is left bare).",
    ],
    owns=["FOREST_CONIFERS and FOREST_BROADLEAF (the species lists, forest.ts:35, :52)", "FOREST_SIZE 0.55 and the deals (forest.ts:73-79)"],
    files=["src/game/forest.ts", "src/game/treecut.ts"],
    dynamics=[
        Fn(name="treeDeal", at="src/game/forest.ts:61", does="a weighted deal over a species list", sig="treeDeal(species, live = false)"),
        Fn(name="conifer", at="src/game/forest.ts:87", does="the conifer share at a point (the clearing noise)", sig="conifer(clearing, x, y): number"),
        Fn(name="forestCell", at="src/game/forest.ts:92", does="plants one forest cell from the seed, the classes, height and slope", sig="forestCell(seed, cls, height, slope, ...)"),
    ],
    inputs=["seed, the class, height and slope grids and a cell"], outputs=["tree placements for the cell"],
    tests=["tests/forest.test.ts", "tests/ring-clear.test.ts", "tests/towntrees.test.ts", "tests/tree-sun.test.ts", "tests/golf-dressing.test.ts"],
    below=["land.relief.slope", "land.terrain.generate"], above=["land.river.trees", "course", "town"],
    dual="MISSING: forest cells come from the seed; a cut tree is the tree tool's job, not a land function",
    seams=["the species lists are shared with the river belt (river-trees.ts)"],
    rules=["straight views turned 8 degrees", "performance is a hard gate", "no visible tiling"],
    impl="describe",
)
