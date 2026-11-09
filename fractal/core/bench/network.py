"""core.bench.network: the benchmark's street grid (bench-net.ts benchLayout), not ported yet: it builds the network edits the engine applies."""
from fractal.holon import Fn, Holon


def bench_layout(size: int = 1, knobs: dict | None = None) -> dict:
    """the benchmark's line count and per-line positions (not ported yet)"""
    raise NotImplementedError("core.bench.network: port benchLayout and benchNetwork (src/game/bench-net.ts:11, :19; GRID 40 and M0 96 at :8)")


HOLON = Holon(
    id="core.bench.network", rung=3, title="Benchmark road grid",
    purpose="Lay the benchmark's street grid of avenues and boulevards, the same network for the bench, the sim gate and the tests.",
    requires=[
        "GRID is 40 tiles between streets and M0 96 is the margin in tiles (bench-net.ts line 8).",
        "benchLayout(size) gives the lines per side of the full map (line 11); benchNetwork applies them through the NetEditor (line 19).",
    ],
    owns=["the benchmark's grid spacing and margin"],
    files=["src/game/bench-net.ts"],
    dynamics=[
        Fn(name="benchLayout", at="src/game/bench-net.ts:11", does="the grid's line count and positions for a size", sig="benchLayout(size)"),
        Fn(name="benchNetwork", at="src/game/bench-net.ts:19", does="lays the grid through the network editor", sig="benchNetwork(e, size)"),
    ],
    inputs=["a size (1 is the full map)"],
    outputs=["the grid's lines through the NetEditor"],
    tests=["tests/lots.test.ts", "tests/network.test.ts"],
    below=["town.roads"], above=["core.bench.scenes", "core.gates.sim"],
    dual="netops undo (the editor's own undo reverses the lines)",
    impl="native", fn=bench_layout,
    port="todo: port benchLayout (inputs: size int; outputs: {lines, last} with the position list; TS bench-net.ts:11, constants GRID 40 and M0 96 at :8)",
    params={"size": "int, 1 for the full map"},
)
