"""town.farms.animals: which animals a farm keeps and in what, from its fields. Ports herdPlan and shelterOf (src/game/ext/farms/herd.ts:21, :32)."""
from fractal.holon import Fn, Holon

STEER = {"paddock_cow_share": 0.6, "animals_per_farm_max": 16}
_M = 0xFFFFFFFF


def _imul(a, b):
    return ((a & _M) * (b & _M)) & _M


def h32(a, b, c=0):
    """the hash the animals are drawn from: a fraction of 2^32 from three integers (a port of herd.ts:10)"""
    h = (_imul(int(a), 0x9E3779B1) ^ _imul(int(b), 0x85EBCA77) ^ _imul(int(c), 0xC2B2AE3D)) & _M
    h = _imul(h ^ (h >> 16), 0x7FEB352D)
    h = _imul(h ^ (h >> 15), 0x846CA68B)
    return (h ^ (h >> 16)) & _M


def u01(a, b, c=0):
    return h32(a, b, c) / 4294967296


def herd_plan(fields, seed, knobs=None):
    """the grazing plan: the paddocks (cows or horses), the pasture (sheep), and the fallow field when it is drawn"""
    k = {**STEER, **(knobs or {})}
    s0 = h32(seed, 0x7309)
    fallow_list = sorted([f for f in fields if f["kind"] == "fallow"], key=lambda q: -((q["a1"] - q["a0"]) * (q["b1"] - q["b0"])))
    fallow = fallow_list[0] if fallow_list else None
    has_pasture = any(f["kind"] == "pasture" for f in fields)
    out = []
    for qi, q in enumerate(fields):
        keep = q["kind"] != "fallow" or (q is fallow and u01(s0, 1) < 0.5 and not has_pasture)
        if not keep:
            continue
        kind = ("cow" if u01(s0, 2, qi) < k["paddock_cow_share"] else "horse") if q["kind"] == "paddock" else "sheep"
        out.append({"field": qi, "kind": kind})
    return out


def shelter_of(plan):
    """the farm's main outbuilding: horses a stable, cows a barn; sheep alone a shed; no animals the barn it always had"""
    paddock = next((g for g in plan if g["kind"] in ("cow", "horse")), None)
    if paddock:
        return "stable" if paddock["kind"] == "horse" else "barn"
    return "shed" if plan else "barn"


HOLON = Holon(
    id="town.farms.animals", rung=3, title="Herd plan and shelters",
    purpose="Choose each farm's animals from its fields, and the outbuilding they are kept in.",
    requires=[
        "HERD gives cows a herd of 3 to 8 (src/game/ext/farms/animals.ts:34).",
        "ANIMALS_PER_FARM_MAX = 16 (src/game/ext/farms/animals.ts:36).",
        "shelterOf: horses get a stable, cows a barn, sheep alone a shed (src/game/ext/farms/herd.ts:32).",
    ],
    files=["src/game/ext/farms/animals.ts", "src/game/ext/farms/herd.ts", "src/game/ext/farms/paddock.ts"],
    dynamics=[
        Fn(name="herdPlan", at="src/game/ext/farms/herd.ts:21", does="the grazing plan: which field gets cows, horses or sheep", sig="herdPlan(fields: AnimalField[], seed: number): Graze[]"),
        Fn(name="shelterOf", at="src/game/ext/farms/herd.ts:32", does="the farm's main outbuilding from its herd", sig="shelterOf(plan: Graze[]): Shelter"),
        Fn(name="farmAnimals", at="src/game/ext/farms/animals.ts:73", does="places a farm's animals on their herds (not yet ported)", sig="farmAnimals(p, seed, arts, model?)"),
        Fn(name="paddockOf", at="src/game/ext/farms/paddock.ts:39", does="the paddock's fence and field rectangles (not yet ported)", sig="paddockOf(f: Frame, q: Rect)"),
    ],
    inputs=["the farm's fields (a0, b0, a1, b1, kind)", "the world seed"],
    outputs=["the plan [{field, kind}]", "the shelter name"],
    tests=["tests/farm-animals.test.ts", "tests/farm-paddock.test.ts"],
    below=["town.farms.parcels"], above=["town.farms.map"],
    dual="none needed: the herd is a function of the layout and seed; nothing is stored",
    seams=["the outbuilding the parcel composes (town.farms.parcels)"],
    rules=["no visible tiling"],
    impl="native", fn=herd_plan, steer=STEER,
    port="todo: farmAnimals (src/game/ext/farms/animals.ts:73) and paddockOf (src/game/ext/farms/paddock.ts:39) for the placement; herdPlan, shelterOf and the hash are ported",
    params={"fields": "list of {a0, b0, a1, b1, kind: paddock|pasture|fallow}", "seed": "int, the world seed"},
)
