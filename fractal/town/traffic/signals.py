"""town.traffic.signals: signal plans and the bottleneck report. Ports the level-of-service grade (src/game/sim/bottlenecks.ts:24)."""
from fractal.holon import Fn, Holon

STEER = {"los_signal": [10, 20, 35, 55, 80], "los_other": [10, 15, 25, 35, 50]}


def los_grade(delay, signal, knobs=None):
    """the level of service A..F of a delay (s per vehicle) at a signal or elsewhere: A at or below the first bound, F above the last"""
    k = {**STEER, **(knobs or {})}
    b = k["los_signal"] if signal else k["los_other"]
    i = 0
    while i < len(b) and delay > b[i]:
        i += 1
    return "ABCDEF"[i]


HOLON = Holon(
    id="town.traffic.signals", rung=3, title="Signals and bottleneck grades",
    purpose="Time the signal phases, and grade each junction's delay from A (free) to F (jammed).",
    requires=[
        "SIG has GREEN, AMBER and RED (src/game/sim/signals.ts:6).",
        "MIN_GREEN = 7 and MAX_GREEN = 40 bound a signal's green (src/game/sim/signals.ts:9).",
        "los grades A to F with delay bounds 10, 20, 35, 55, 80 at a signal and 10, 15, 25, 35, 50 elsewhere (src/game/sim/bottlenecks.ts:6, :24).",
    ],
    files=["src/game/sim/signals.ts", "src/game/sim/bottlenecks.ts"],
    dynamics=[
        Fn(name="los", at="src/game/sim/bottlenecks.ts:24", does="the level of service letter of a delay, signal or other junction", sig="los(delay: number, signal: boolean): string"),
        Fn(name="stepSignals", at="src/game/sim/signals.ts:101", does="advances every signal plan by dt (not yet ported)", sig="stepSignals(ps, onLane, s, spd, lLen, dt, fixed, t)"),
        Fn(name="bottlenecks", at="src/game/sim/bottlenecks.ts:37", does="ranks the junctions and links where the sim loses time (not yet ported)", sig="bottlenecks(g, m, ...)"),
    ],
    inputs=["a delay in seconds per vehicle", "whether the junction is a signal"],
    outputs=["a letter A..F"],
    tests=["tests/signals.test.ts", "tests/bottlenecks.test.ts"],
    below=["town.traffic.lanes"], above=["town.traffic.sim", "ui"],
    dual="none needed: the grade is recomputed from the delay each report",
    seams=["the bottleneck report in the UI (ui)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=los_grade, steer=STEER,
    port="todo: stepSignals (src/game/sim/signals.ts:101) and bottlenecks (src/game/sim/bottlenecks.ts:37, needs LaneGraph); the level-of-service grade is ported",
    params={"delay": "float, seconds of delay per vehicle", "signal": "bool, true at a signal"},
)
