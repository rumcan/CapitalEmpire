"""core.bench: the benchmark: the synthetic 4 km city, the scripted camera tour through every zoom tier, and its road network (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.bench", rung=2, title="Benchmark",
    purpose="Measure the frame on a synthetic city of 500k props and 10k cars, through every zoom, and report the frame times.",
    requires=["The benchmark opens with ?bench and writes its results to window.__bench and the console when the tour ends (bench.ts header)."],
    below=["core.tick.perf", "core.engine.orchestra"], above=["core.gates.perf"],
    rules=["performance is a hard gate (ground plus tiles at most 192 MB)"],
)
