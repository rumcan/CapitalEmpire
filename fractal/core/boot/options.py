"""core.boot.options: the boot options and the ground levers (boot.ts withGroundLevers, withBootNumbers). Not ported yet: the lever table is read from boot.ts."""
from fractal.holon import Fn, Holon


def with_ground_levers(spec: str, knobs: dict | None = None) -> dict:
    """the boot options with the named ground levers on (not ported yet)"""
    raise NotImplementedError("core.boot.options: port withGroundLevers with GROUND_LEVERS (src/game/boot.ts:82, table at :67)")


HOLON = Holon(
    id="core.boot.options", rung=3, title="Boot options and levers",
    purpose="Turn the game's boot options into the ground workers' memory levers, one at a time, for a dev build to measure.",
    requires=[
        "withGroundLevers sets each named lever's on or off values; 'old' turns on the cache too (boot.ts line 82).",
        "withBootNumbers sets the numeric boot keys (atlasMB, atlasKeep, groundPx, tileSources, paintedSources, tileMB) and null means the game's default (boot.ts line 94).",
    ],
    owns=["BootOptions", "GAME_BOOT (frozen)", "GROUND_LEVERS"],
    files=["src/game/boot.ts"],
    dynamics=[
        Fn(name="withGroundLevers", at="src/game/boot.ts:82", does="the boot options with the named levers on", sig="withGroundLevers(boot, spec)"),
        Fn(name="withBootNumbers", at="src/game/boot.ts:94", does="the boot options with the numeric keys set", sig="withBootNumbers(boot, spec)"),
        Fn(name="lightPack", at="src/game/boot.ts:132", does="the lab's light sprite pack, by photo name", sig="lightPack(allPhotos, eager, lazy, lazyMosaics)"),
    ],
    inputs=["the ?boot=<levers> and ?boot=<key>:<value> URL options"],
    outputs=["the BootOptions the engine reads in its constructor"],
    tests=["tests/lab-boot.test.ts", "tests/ram-step2.test.ts"],
    below=["render.atlas.pages"], above=["core.boot", "core.engine.orchestra"],
    dual="a boot with no levers (GAME_BOOT as it is)",
    impl="native", fn=with_ground_levers,
    port="todo: port withGroundLevers with the GROUND_LEVERS table (inputs: the spec string; outputs: the boot options as a dict with the levers' on or off values; TS boot.ts:82, :67)",
    params={"spec": "str, a comma list of lever names"},
)
