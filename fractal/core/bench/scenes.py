"""core.bench.scenes: the benchmark's build and its scripted tour (bench.ts buildBenchmark, benchGame), described: it drives the live engine."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.bench.scenes", rung=3, title="Benchmark tour",
    purpose="Build the synthetic city and run the stages: the zoom tour, the river, the roll, the field, the estate, the farm, the frame and the bake.",
    requires=[
        "buildBenchmark makes a 40-tile street grid with ~500k props and BENCH_CARS 10000 test cars (bench.ts line 19 and 23).",
        "The tour's zoom stages are the STAGES list; zoomStages takes an override spec (bench.ts line 103).",
    ],
    owns=["the benchmark's stage list and its results"],
    files=["src/game/bench.ts"],
    dynamics=[
        Fn(name="buildBenchmark", at="src/game/bench.ts:23", does="builds the synthetic city in the engine", sig="buildBenchmark(g, size)"),
        Fn(name="benchGame", at="src/game/bench.ts:167", does="runs the benchmark's scene and its stages", sig="benchGame(g, scene)"),
        Fn(name="zoomStages", at="src/game/bench.ts:103", does="the zoom stages from an override spec", sig="zoomStages(spec)"),
    ],
    inputs=["the engine (Game)", "the scene and the size"],
    outputs=["window.__bench and the console report"],
    tests=["tests/tile-cache.test.ts", "gate: npm run bench (the tour is its input)"],
    below=["core.bench.network"], above=["core.gates.perf"],
    dual=None,
    rules=["performance is a hard gate"],
    impl="describe",
)
