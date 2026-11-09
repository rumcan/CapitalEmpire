"""town.farms.fields: what a crop field shows in a month. Ports cropState and cornShift (src/game/ext/farms/crops.ts:27, :32)."""
from fractal.holon import Fn, Holon

STEER = {"corn_year": ["plough", "plough", "plough", "plough", "plough", "young", "young", "ripe", "ripe", "ripe", "stubble", "plough"]}


def corn_shift(u):
    """a corn field's months early (-1), on time (0) or late (+1) from a uniform u in [0, 1): a quarter early, half on time, a quarter late"""
    return -1 if u < 0.25 else (0 if u < 0.75 else 1)


def crop_state(use, month, shift=0, knobs=None):
    """what a field of this use shows in calendar month (0 January), shifted by shift months: 'fallow' has none (None), 'plough' is always ploughed"""
    k = {**STEER, **(knobs or {})}
    if use == "fallow":
        return None
    if use == "plough":
        return "plough"
    return k["corn_year"][(int(month) - shift) % 12]


HOLON = Holon(
    id="town.farms.fields", rung=3, title="Crop states by month",
    purpose="Show each farm field in the right state for the month: ploughed, young, ripe or stubble.",
    requires=[
        "CROP_STATES are plough, young, ripe and stubble (src/game/ext/farms/crops.ts:21).",
        "A fallow field has no crop: cropState returns null (src/game/ext/farms/crops.ts:32).",
        "A corn field follows CORN_YEAR by month, shifted by its own early, on-time or late draw (src/game/ext/farms/crops.ts:25, :27).",
    ],
    files=["src/game/ext/farms/crops.ts"],
    dynamics=[
        Fn(name="cropState", at="src/game/ext/farms/crops.ts:32", does="the crop state of a field use in a month, with its shift", sig="cropState(use: FieldUse, month: number, shift = 0): CropState | null"),
        Fn(name="cornShift", at="src/game/ext/farms/crops.ts:27", does="a corn field's early, on-time or late shift from a uniform draw", sig="cornShift(u: number): -1 | 0 | 1"),
        Fn(name="rowSegments", at="src/game/ext/farms/crops.ts:95", does="the crop row segments of a field quad (not yet ported)", sig="rowSegments(quad, dx, dy, pitch, phase, ...)"),
    ],
    inputs=["use: 'corn' | 'plough' | 'fallow'", "month 0..11 (any integer)", "shift -1, 0 or 1"],
    outputs=["a crop state or null"],
    tests=["tests/farm-crops.test.ts", "tests/farm-textures.test.ts"],
    below=["town.farms.parcels"], above=["town.farms.map"],
    dual="none needed: the state is a function of the month; nothing is stored to undo",
    seams=["the field's surface paint (render)"],
    rules=["no visible tiling", "no flat colour washes"],
    impl="native", fn=crop_state, steer=STEER,
    port="todo: rowSegments (src/game/ext/farms/crops.ts:95) and the row look; cropState and cornShift are ported",
    params={"use": "str, corn | plough | fallow", "month": "int, 0 January .. 11 December", "shift": "int, -1, 0 or 1"},
)
