"""town.traffic.incidents: the rates of breakdowns and crashes on a lane, and at a junction. Ports incidents.ts:66-80."""
from fractal.holon import Fn, Holon

STEER = {
    "break_per_mkm": 150, "crash_per_mkm": 4, "junction_per_mpass": 1, "conflict_ref": 600, "night": 1.4,
    "break_stop_go": 1.2, "break_density": 0.8, "break_density_ref": 60,
    "crash_stop_go": 4, "crash_density": 2.5, "crash_density_ref": 50,
}


def _clamp01(v):
    return v if 0 < v < 1 else (1.0 if v >= 1 else 0.0)


def breakdown_rate(density, stop_go, night=False, knobs=None):
    """breakdowns per vehicle-km on a lane: stop-and-go, dense traffic and night each raise it (density veh/km/lane, stop_go 0..1)"""
    k = {**STEER, **(knobs or {})}
    f = 1 + k["break_stop_go"] * _clamp01(stop_go) + k["break_density"] * _clamp01(density / k["break_density_ref"])
    return k["break_per_mkm"] * 1e-6 * f * (k["night"] if night else 1)


def crash_rate(density, stop_go, night=False, knobs=None):
    """mid-lane crashes per vehicle-km: stop-and-go and dense traffic raise it far more than a breakdown"""
    k = {**STEER, **(knobs or {})}
    f = 1 + k["crash_stop_go"] * _clamp01(stop_go) + k["crash_density"] * _clamp01(density / k["crash_density_ref"])
    return k["crash_per_mkm"] * 1e-6 * f * (k["night"] if night else 1)


def junction_crash_rate(conflict_load, night=False, knobs=None):
    """crashes per junction passage: a heavy conflicting flow (veh/h) makes junction crashes concentrate at busy nodes"""
    k = {**STEER, **(knobs or {})}
    r = conflict_load / k["conflict_ref"] if conflict_load > 0 else 0.0
    return k["junction_per_mpass"] * 1e-6 * (1 + r * r ** 0.5) * (k["night"] if night else 1)


HOLON = Holon(
    id="town.traffic.incidents", rung=3, title="Breakdowns, crashes and disasters",
    purpose="Roll the chance of a breakdown or crash on a lane or junction from its traffic, and close and repair roads after a disaster.",
    requires=[
        "BREAK_PER_MKM = 150 and CRASH_PER_MKM = 4 are the base rates per million vehicle-km (src/game/ext/incidents/incidents.ts:15, :17).",
        "NIGHT_FROM = 22 and NIGHT_TO = 6 are the night hours, and night multiplies the rates by NIGHT = 1.4 (incidents.ts:11, :23).",
        "Disasters takes a seed, so its daily roll is repeatable (src/game/ext/disasters/index.ts:67).",
    ],
    files=["src/game/ext/incidents/incidents.ts", "src/game/ext/incidents/index.ts", "src/game/ext/disasters/index.ts"],
    dynamics=[
        Fn(name="breakdownRate", at="src/game/ext/incidents/incidents.ts:66", does="breakdowns per vehicle-km on a lane", sig="breakdownRate(density, stopGo, night = false): number"),
        Fn(name="crashRate", at="src/game/ext/incidents/incidents.ts:72", does="mid-lane crashes per vehicle-km", sig="crashRate(density, stopGo, night = false): number"),
        Fn(name="junctionCrashRate", at="src/game/ext/incidents/incidents.ts:78", does="crashes per junction passage", sig="junctionCrashRate(conflictLoad, night = false): number"),
        Fn(name="Incidents", at="src/game/ext/incidents/incidents.ts:96", does="rolls and clears incidents on lanes (not yet ported)", sig="class Incidents"),
        Fn(name="Disasters", at="src/game/ext/disasters/index.ts:51", does="the seeded daily disaster roll and the road closures it makes (not yet ported)", sig="class Disasters"),
    ],
    inputs=["density (veh/km/lane)", "stop-and-go share 0..1", "night flag", "conflicting flow (veh/h) at a junction"],
    outputs=["rate per vehicle-km (or per passage)"],
    tests=["tests/ext-incidents.test.ts", "tests/ext-disasters.test.ts", "tests/incidents-sim.test.ts", "tests/disasters-wiring.test.ts"],
    below=["town.traffic.sim"], above=["town.growth.city"],
    dual="City.liftIncident (src/game/city.ts:915) clears an incident; Disasters.repair (src/game/ext/disasters/index.ts:122) repairs a closed road",
    seams=["the closures the sim blocks (src/game/city.ts:918)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=breakdown_rate, steer=STEER,
    port="todo: crashRate and junctionCrashRate are ported; the Incidents roll (src/game/ext/incidents/incidents.ts:96) and the Disasters roll (src/game/ext/disasters/index.ts:51) are still to port",
    params={"density": "float, veh/km/lane", "stop_go": "float 0..1, stop-and-go share", "night": "bool"},
)
