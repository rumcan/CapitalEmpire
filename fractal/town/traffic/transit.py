"""town.traffic.transit: the subway's build cost from its stations, lines and trains. Ports buildCost (src/game/ext/subway/subway.ts:36)."""
import math

from fractal.holon import Fn, Holon

STEER = {"station_cost": 40000, "tunnel_cost_per_tile": 900, "train_cost": 25000, "upkeep_rate": 0.01}


def build_cost(stations, lines, knobs=None):
    """the subway's cost: stations, the tunnel length of each line (its loop closes), and its trains"""
    k = {**STEER, **(knobs or {})}
    by_id = {s["id"]: s for s in stations}
    length, trains = 0.0, 0
    for line in lines:
        ids = line["stations"]
        trains += max(0, int(line["trains"]))
        for i in range(len(ids) + (1 if line.get("loop") else 0) - 1):
            a, b = by_id.get(ids[i % len(ids)]), by_id.get(ids[(i + 1) % len(ids)])
            if a and b:
                length += math.hypot(b["x"] - a["x"], b["y"] - a["y"])
    return len(stations) * k["station_cost"] + length * k["tunnel_cost_per_tile"] + trains * k["train_cost"]


HOLON = Holon(
    id="town.traffic.transit", rung=3, title="Subway cost and service",
    purpose="Price a subway plan from its stations, track and trains, and run the underground service.",
    requires=[
        "STATION_COST = 40000, TUNNEL_COST_PER_TILE = 900 and TRAIN_COST = 25000 price the plan (src/game/ext/subway/subway.ts:17-21).",
        "UPKEEP_RATE = 0.01 is the subway's upkeep rate (src/game/ext/subway/subway.ts:23).",
        "The subway module is pure and deterministic, with no DOM or renderer (src/game/ext/subway/subway.ts:1).",
    ],
    files=["src/game/ext/subway/subway.ts"],
    dynamics=[
        Fn(name="buildCost", at="src/game/ext/subway/subway.ts:36", does="the cost of stations, track length and trains", sig="buildCost(stations: StationDef[], lines: LineDef[]): number"),
        Fn(name="Subway", at="src/game/ext/subway/subway.ts:53", does="the deterministic underground train and passenger simulation (not yet ported)", sig="class Subway"),
    ],
    inputs=["stations [{id, x, y}]", "lines [{stations: [id], trains, loop}]"],
    outputs=["the build cost (money)"],
    tests=["tests/ext-subway.test.ts"],
    below=["town.network.graph"], above=["ui", "business"],
    dual="MISSING: no sell or remove for a subway station or line (src/game/ext/subway/subway.ts has no remove path; grep finds none)",
    seams=["the subway plan the UI edits (ui)"],
    rules=["performance is a hard gate"],
    impl="native", fn=build_cost, steer=STEER,
    port="todo: the Subway train and passenger simulation (src/game/ext/subway/subway.ts:53); buildCost is ported",
    params={"stations": "list of {id, x, y}, tile positions", "lines": "list of {stations: [id], trains: int, loop: bool}"},
)
