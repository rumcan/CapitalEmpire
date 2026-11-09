"""town.lots.library: the preset library: the lot presets, their frames and their scales. Parsing is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: parsePresets (src/game/lots/preset-read.ts:79) needs the preset JSON shape and its validators; presetsFor (src/game/lots/presets.ts:46) needs the same types"


def parse_presets(json, knobs=None):
    """port todo: read lot-presets.json into presets and an invalid count (Python port of parsePresets, src/game/lots/preset-read.ts:79)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.lots.library", rung=3, title="Preset library and scales",
    purpose="Load the lot presets, pick the one that fits a lot, and keep the picture scales the library draws at.",
    requires=[
        "presetsFor filters the presets by use, state and size (src/game/lots/presets.ts:46).",
        "parsePresets reports the invalid presets it skipped rather than throwing (src/game/lots/preset-read.ts:79).",
        "applyStudioScales returns the ids whose scale changed (src/game/lots/scales-live.ts:16).",
    ],
    files=[
        "src/game/lots/presets.ts", "src/game/lots/preset-read.ts", "src/game/lots/preset-from.ts", "src/game/lots/preset-frame.ts",
        "src/game/lots/preset-art.ts", "src/game/lots/derive.ts", "src/game/lots/scales.ts", "src/game/lots/scales-live.ts",
        "src/game/lots/studio-base.ts", "src/game/lots/lot-presets.json",
    ],
    dynamics=[
        Fn(name="parsePresets", at="src/game/lots/preset-read.ts:79", does="reads the preset JSON into presets and an invalid count", sig="parsePresets(json: unknown)"),
        Fn(name="presetsFor", at="src/game/lots/presets.ts:46", does="the presets for a use, state and size", sig="presetsFor(all, use, state, w, d)"),
        Fn(name="derivePreset", at="src/game/lots/derive.ts:51", does="a preset scaled to another lot size", sig="derivePreset(m, w, d, info, id)"),
        Fn(name="presetFromComposition", at="src/game/lots/preset-from.ts:24", does="turns a composition back into a preset", sig="presetFromComposition(c, f, w, d)"),
        Fn(name="frameOf", at="src/game/lots/preset-frame.ts:43", does="the preset frame of a lot (its road, quarter and axes)", sig="frameOf(lot)"),
        Fn(name="fourViews", at="src/game/lots/preset-art.ts:39", does="the four views of a picture id", sig="fourViews(id)"),
        Fn(name="applyStudioScales", at="src/game/lots/scales-live.ts:16", does="applies new studio scales and returns the ids changed", sig="applyStudioScales(next)"),
    ],
    inputs=["the preset JSON", "a use, state and lot size", "studio scale overrides"],
    outputs=["presets and an invalid count", "a fitted preset", "changed scale ids"],
    tests=["tests/lot-presets.test.ts", "tests/lot-presets-json.test.ts", "tests/lot-presets-lab.test.ts", "tests/lot-presets-farm.test.ts", "tests/lot-derive.test.ts", "tests/sizes.test.ts"],
    below=["town.lots.cut"], above=["town.compose", "town.audit.review"],
    dual="setLotPresets (src/game/lots/compose.ts:286) and onLotPresetsReload (compose.ts:304): reload the saved preset list",
    seams=["the lot lab's preset editor (dev, core)", "the picture libraries (art)"],
    rules=["new art used everywhere, with the old look kept as an option", "lit sprites are never mirrored"],
    impl="native", fn=parse_presets, steer={"strict": False}, port=PORT,
    params={"json": "object, the parsed lot-presets.json"},
)
