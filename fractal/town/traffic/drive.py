"""town.traffic.drive: car following. A Python port of the IDM acceleration (src/game/sim/idm.ts:9) and the driver record."""
from fractal.holon import Fn, Holon

STEER = {"a": 1.5, "b": 2.0, "T": 1.2, "s0": 2.0, "delta": 4.0, "floor": -9.0}


def drive_accel(v, v0, gap, dv, knobs=None):
    """the intelligent driver's acceleration (m/s^2) for a car at speed v behind a gap to the car ahead closing at dv; v0 is the free speed"""
    k = {**STEER, **(knobs or {})}
    w = v0 if v0 > 0.1 else 0.1
    s_star = k["s0"] + max(0.0, v * k["T"] + v * dv / (2 * (k["a"] * k["b"]) ** 0.5))
    free = 1 - (v / w) ** k["delta"]
    inter = 0.0 if gap is None or gap == float("inf") else (s_star / max(gap, 0.01)) ** 2
    r = k["a"] * (free - inter)
    return k["floor"] if r < k["floor"] else k["a"] if r > k["a"] else r


HOLON = Holon(
    id="town.traffic.drive", rung=3, title="Car following (IDM)",
    purpose="Set how hard each car accelerates or brakes behind the car ahead, from its speed, the free speed and the gap.",
    requires=[
        "CAR is a = 1.5, b = 2.0, T = 1.2, s0 = 2.0, delta = 4 (src/game/sim/idm.ts:6).",
        "idm caps the braking at -9 and the acceleration at the car's a (src/game/sim/idm.ts:9-14).",
        "STYLE has normal, aggressive and cautious drivers (src/game/ext/drivers/index.ts:13).",
    ],
    files=["src/game/sim/idm.ts", "src/game/ext/drivers/acc.ts", "src/game/ext/drivers/index.ts"],
    dynamics=[
        Fn(name="idm", at="src/game/sim/idm.ts:9", does="the IDM acceleration of a car behind a gap, clamped to -9 .. a", sig="idm(d: Driver, v, v0, gap, dv): number"),
        Fn(name="accACC", at="src/game/ext/drivers/acc.ts:64", does="the adaptive cruise control variant of the acceleration (not yet ported)", sig="accACC(v, v0, s, vl, al, a, b, ...)"),
        Fn(name="Drivers", at="src/game/ext/drivers/index.ts:34", does="the per-car driver styles and their parameters", sig="class Drivers"),
    ],
    inputs=["speed v and free speed v0 (m/s)", "the gap to the car ahead (m, None for open road)", "the closing speed dv"],
    outputs=["acceleration in m/s^2"],
    tests=["tests/ext-drivers.test.ts", "tests/sim.test.ts", "tests/junction-rules.test.ts"],
    below=["town.traffic.lanes"], above=["town.traffic.sim"],
    dual="none needed: a per-step law with no state; the car's next step recomputes it",
    seams=["the car slots the sim packs into frames (src/game/sim/sim.ts)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=drive_accel, steer=STEER, port="todo: the ACC variant accACC (src/game/ext/drivers/acc.ts:64) and the driver styles (src/game/ext/drivers/index.ts:13); the IDM core is ported",
    params={"v": "float, speed m/s", "v0": "float, free speed m/s", "gap": "float or null, metres to the car ahead (null = open road)", "dv": "float, closing speed m/s"},
)
