"""town.network.graph: the road graph, RoadNetwork, and a leg's rounded geometry (roundPieces)."""
from fractal.holon import Fn, Holon

import math

STEER = {"straight_tol": 0.02, "min_turn": 0.05, "arc_cap": 0.49}


def _p(q):
    return (float(q["x"]), float(q["y"])) if isinstance(q, dict) else (float(q[0]), float(q[1]))


def _sub(a, b): return (a[0] - b[0], a[1] - b[1])
def _add(a, b): return (a[0] + b[0], a[1] + b[1])
def _mul(a, k): return (a[0] * k, a[1] * k)
def _dot(a, b): return a[0] * b[0] + a[1] * b[1]
def _len(a): return math.hypot(a[0], a[1])


def _norm(a):
    l = _len(a) or 1.0
    return (a[0] / l, a[1] / l)


def round_pieces(pts, r, closed, knobs=None):
    """a leg's corners rounded into straight runs and arcs: a Python port of roundPieces (src/game/network.ts:272); tunables in STEER"""
    k = {**STEER, **(knobs or {})}
    P = [_p(q) for q in pts]
    n = len(P)
    if n < 2:
        return []
    dk, rk = [0.0] * n, [0.0] * n
    for i in (range(n) if closed else range(1, n - 1)):
        p, c, q = P[(i - 1) % n], P[i], P[(i + 1) % n]
        u, v = _norm(_sub(p, c)), _norm(_sub(q, c))
        phi = math.acos(max(-1.0, min(1.0, _dot(u, v))))
        if phi > math.pi - k["straight_tol"] or phi < k["min_turn"]:
            continue
        t = math.tan(phi / 2)
        rr = min(r, k["arc_cap"] * _len(_sub(p, c)) * t, k["arc_cap"] * _len(_sub(q, c)) * t)
        rk[i], dk[i] = rr, rr / t
    out = []
    for i in range(n if closed else n - 1):
        a, b = P[i], P[(i + 1) % n]
        d, k1 = _norm(_sub(b, a)), (i + 1) % n
        out.append({"run": True, "a": _add(a, _mul(d, dk[i])), "b": _sub(b, _mul(d, dk[k1]))})
        if rk[k1] > 0 and (closed or k1 < n - 1):
            nd = _norm(_sub(P[(k1 + 1) % n], b))
            out.append({"run": False, "ctrl": b, "from": _sub(b, _mul(d, dk[k1])), "to": _add(b, _mul(nd, dk[k1])), "r": rk[k1]})
    return out


HOLON = Holon(
    id="town.network.graph", rung=3, title="Road graph and leg geometry",
    purpose="Hold the road segments and nodes, rebuild only the changed box, and round a leg's corners into runs and arcs.",
    requires=[
        "RoadNetwork.rebuild(full=false) bumps the version and rebuilds only the dirty box (src/game/network.ts:733).",
        "roundPieces splits a polyline into straight runs and rounded arcs for a corner radius r (src/game/network.ts:272).",
        "classOf falls back to the 'street' class for an unknown id (src/game/network.ts:111).",
    ],
    files=["src/game/network.ts", "src/game/road-route.ts", "src/game/route-obstacles.ts", "src/game/street-marks.ts", "src/game/structures.ts"],
    dynamics=[
        Fn(name="roundPieces", at="src/game/network.ts:272", does="rounds a leg's corners: straight runs and arcs, closed or open", sig="(pts: Pt[], r: number, closed: boolean): Piece[]"),
        Fn(name="RoadNetwork", at="src/game/network.ts:563", does="the road graph: segments, nodes, routes and the features drawn from them", sig="class RoadNetwork"),
        Fn(name="rebuild", at="src/game/network.ts:733", does="rebuilds the routes and features of the dirty box after an edit", sig="rebuild(full = false)"),
        Fn(name="addSegment", at="src/game/network.ts:598", does="adds a segment between two points, splitting crossed segments", sig="private addSegment(P, Q, cls, style, kind = 0, town?)"),
        Fn(name="setNodeType", at="src/game/network.ts:676", does="changes a node's junction type and rebuilds it", sig="setNodeType(n, type, rebuild = true)"),
        Fn(name="removePiece", at="src/game/network.ts:666", does="removes one piece of a segment and rebuilds", sig="removePiece(sel, rebuild = true)"),
        Fn(name="classOf", at="src/game/network.ts:111", does="the road class for an id, 'street' when unknown", sig="classOf(id: string): RoadClass"),
    ],
    inputs=["NetOp edits (src/game/netops.ts)", "a leg's points as {x, y} tiles", "a corner radius r in tiles"],
    outputs=["features and routes for the renderer", "Piece[] runs and arcs"],
    tests=["tests/network.test.ts", "tests/roads.test.ts", "tests/road-route.test.ts", "tests/road-owner.test.ts", "tests/streets.test.ts"],
    above=["town.network.edit", "town.network.junctions", "town.network.kerbs", "town.network.offroad", "town.lots.cut", "town.traffic.lanes"],
    dual="the journal: NetJournal.undo (src/game/net-undo.ts:92) reverts a removed piece or a changed node",
    seams=["src/game/ground-protocol.ts NetOp (the worker's edits)", "the renderer's features (RoadNetwork.view, src/game/network.ts:709)"],
    rules=["roads rebuild instantly, with no manual ground rebuild"],
    impl="native", fn=round_pieces, steer=STEER, port="",
    params={"pts": "Pt[], the leg's points as [{x, y}] in tiles", "r": "number, the corner radius in tiles", "closed": "bool, true for a loop"},
)
