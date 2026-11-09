"""town.traffic.demand: the trip demand through the day, and the golf-day clock marks. Ports demandAt (src/game/sim/trips.ts:35)."""
import math

from fractal.holon import Fn, Holon

STEER = {"day": 1440, "knots": [[3, 0.35], [8, 1], [12, 0.7], [17, 1], [22, 0.5]], "golf_hours": [360, 1200]}


def demand_at(t, day_len=None, knobs=None):
    """the demand share at time t (in the units of day_len, default 1440 minutes): a cosine ease between the knots, wrapping at night"""
    k = {**STEER, **(knobs or {})}
    dl = day_len or k["day"]
    K = k["knots"]
    h = (t / dl * 24) % 24
    if h < K[0][0]:
        h += 24
    for i in range(len(K)):
        last = i + 1 == len(K)
        h0, v0 = K[i]
        h1 = K[0][0] + 24 if last else K[i + 1][0]
        v1 = K[0][1] if last else K[i + 1][1]
        if h0 <= h < h1:
            return v0 + (v1 - v0) * (1 - math.cos(math.pi * (h - h0) / (h1 - h0))) / 2
    return K[0][1]


HOLON = Holon(
    id="town.traffic.demand", rung=3, title="Trip demand through the day",
    purpose="Say how busy the town's streets are at each hour: a smooth day curve of trip demand.",
    requires=[
        "DAY = 1440 is the day length in minutes (src/game/sim/trips.ts:14).",
        "The demand knots are at 3, 8, 12, 17 and 22 hours, and the curve is a cosine ease between them (src/game/sim/trips.ts:30, :35).",
        "GOLF_HOURS_A = 360 and GOLF_HOURS_B = 1200 are the golf-day marks, 06:00 and 20:00 (src/game/sim/townclock.ts:18).",
    ],
    files=["src/game/sim/trips.ts", "src/game/sim/townclock.ts", "src/game/beforeafter.ts"],
    dynamics=[
        Fn(name="demandAt", at="src/game/sim/trips.ts:35", does="the trip demand share at time t of the day", sig="demandAt(t: number, dayLen = DAY): number"),
        Fn(name="Trips", at="src/game/sim/trips.ts:46", does="the town's trip makers: where and when they start", sig="class Trips"),
        Fn(name="LotTrips", at="src/game/sim/trips.ts:185", does="the trips a lot's residents and jobs make", sig="class LotTrips"),
        Fn(name="townClockFor", at="src/game/sim/townclock.ts:15", does="the town clock for a day length", sig="townClockFor(dayLen: number): TownClock"),
        Fn(name="townTimeOf", at="src/game/sim/townclock.ts:53", does="the town's day, hour and minute at a sim time", sig="townTimeOf(c, t)"),
    ],
    inputs=["a time t in the day's units", "the day length (default 1440)"],
    outputs=["the demand share (about 0.35 to 1)", "the town clock's day, hour and minute"],
    tests=["tests/trips.test.ts", "tests/sim-townclock.test.ts", "tests/clock.test.ts"],
    below=["town.lots.cut"], above=["town.traffic.sim"],
    dual="none needed: demand is a function of the clock, nothing is stored",
    seams=["the town clock the UI shows (ui)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=demand_at, steer=STEER,
    port="todo: the Trips and LotTrips generators (src/game/sim/trips.ts:46, :185) and the town clock (src/game/sim/townclock.ts:15); demandAt is ported",
    params={"t": "float, time in the day's units", "day_len": "float, the day length (default 1440)"},
)
