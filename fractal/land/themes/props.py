"""land.themes.props: the desert and oasis props (desert-props.ts): the sheet props by type, with their scatter from a seed over a box."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.themes.props", rung=3, title="Desert and oasis props",
    purpose="Scatter the desert props (rocks, shrubs, cacti and the oasis set) over a box from a seed.",
    requires=[
        "DESERT lists the props by type; DESERT_IDS is all of them.",
        "DRY_MIX weights the types so the dry types dominate.",
        "desertScatter places props over a box from the seed, the same for the same seed.",
    ],
    owns=["DESERT and DESERT_IDS (desert-props.ts:12, :16)", "DRY_MIX (desert-props.ts:19)"],
    files=["src/game/desert-props.ts"],
    dynamics=[Fn(name="desertScatter", at="src/game/desert-props.ts:41", does="scatters desert props over a box from a seed", sig="desertScatter(seed, box, ...)")],
    inputs=["a seed and a box"], outputs=["prop placements"],
    tests=["tests/props-all.test.ts", "tests/desert-start.test.ts"],
    below=["land.themes.theme"], above=["town", "course"],
    dual="MISSING: placements come from the seed; a removed prop is the tool's job, not a land function",
    seams=["the prop sheets are the owner art cut by the prep script (desert-props.ts header)"],
    rules=["new art used everywhere", "no visible tiling"],
    impl="describe",
)
