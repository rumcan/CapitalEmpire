"""art.library.plants: the tree, new prop and animal picture rows appended to LIBRARY, described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.library.plants", rung=3, title="Plant, prop and animal pictures",
    purpose="Append the tree, new prop and animal pictures, with the species lists, to the library.",
    requires=[
        "appendTrees, appendNewProps and appendAnimals add their rows and pages to LIBRARY; NEW_CONIFER_SPECIES and NEW_BROADLEAF_SPECIES list the species.",
        "Animals have 8 directions and 15 frames each (animals-library.ts ANIMAL_DIRS, ANIMAL_FRAMES).",
    ],
    owns=["the tree, prop and animal rows", "ANIMAL_BASE (the first animal index)"],
    files=["src/game/trees-library.ts", "src/game/new-props-library.ts", "src/game/kit.ts"],
    dynamics=[
        Fn(name="appendTrees", at="src/game/trees-library.ts:42", does="appends the tree pictures", sig="appendTrees(library, pages)"),
        Fn(name="appendNewProps", at="src/game/new-props-library.ts:28", does="appends the new prop pictures", sig="appendNewProps(library, pages)"),
        Fn(name="animalItem", at="src/game/animals-library.ts:27", does="the library index of an animal, direction and frame (animals-library.ts is owned by people; described here)", sig="animalItem(a, d, f)"),
    ],
    inputs=["the LIBRARY array and the page list"],
    outputs=["tree, prop and animal rows in LIBRARY"],
    tests=["tests/farm-animals.test.ts", "tests/farm-paddock.test.ts", "tests/tree-sun.test.ts", "tests/props-all.test.ts"],
    below=["art.library.index"], above=["art.library.index", "render.light.trees"],
    dual="MISSING: an appended row cannot be removed at runtime (saved indices)",
    rules=["never mirror lit sprites"],
    impl="describe",
)
