"""course.estates.estate: the estate's lots on the course: their stages (sale, sold, building, built), the market, and the tool that lays a lot. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port the estate step (src/game/golf/estate.ts: newEstate :70, countsOf :109, the stage move) with its constants (M2_PRICE 20, "
         "LAY_COST 1000, SOLD_MONTHS 0.5..1.2, BUILD_MONTHS 2..3.5, MARKET_CAP 1.5): inputs an Estate {next, t, market, lots[]} and a month; "
         "output the estate after one step and the lots that changed stage")


def estate_step(estate: dict, month: float, knobs: dict | None = None):
    """the estate after one step of the market and the builds (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.estates.estate", rung=3, title="Estate lots and market",
    purpose="The estate on the course: each lot's stage from for sale to built, the market that sells and builds it over the months, and the tool that lays a new lot on a street.",
    requires=[
        "The market is capped at 1.5 (MARKET_CAP) and starts at 0.5 (START_MARKET).",
        "A lot's sale takes 0.5 to 1.2 months (SOLD_MONTHS) and its build 2 to 3.5 months (BUILD_MONTHS).",
        "A lot's frontage is off the street axis by at most 20 degrees (OFF_AXIS_DEG).",
        "A click reaches a lot within 6 tiles (CLICK_REACH).",
    ],
    files=["src/game/golf/estate.ts", "src/game/golf/estatetool.ts"],
    dynamics=[
        Fn(name="newEstate", at="src/game/golf/estate.ts:70", does="a new estate with its next id, the time and the market", sig="newEstate(t = 0): Estate"),
        Fn(name="lotAt", at="src/game/golf/estate.ts:94", does="the lot under a point", sig="lotAt(e, x, y): EstateLot | null"),
        Fn(name="countsOf", at="src/game/golf/estate.ts:109", does="how many lots are in each stage", sig="countsOf(e): {sale, sold, build...}"),
        Fn(name="frontageFrames", at="src/game/golf/estate.ts:129", does="the frames along a street where a lot can front it", sig="frontageFrames(s, sides, ...)"),
        Fn(name="EstateTool", at="src/game/golf/estatetool.ts:42", does="the tool that lays a lot: it finds the frames and says why a spot is refused", sig="class EstateTool"),
    ],
    inputs=["the estate", "a month", "a click on the course"], outputs=["the estate after a step", "stage changes", "a ghost of the lot to lay"],
    tests=["tests/golf-estate.test.ts", "tests/golf-estate-tool.test.ts", "tests/golf-estate-wiring.test.ts", "tests/house-lots-have-houses.test.ts", "tests/business-estate.test.ts"],
    below=["course.estates.sale", "town.lots"], above=["course.estates", "business"],
    dual="unverified: the estate tool's undo is not traced yet (estatetool.ts)",
    impl="native", fn=estate_step, port=_TODO,
    steer={"m2_price": 20, "lay_cost": 1000, "sold_months": [0.5, 1.2], "build_months": [2, 3.5], "market_cap": 1.5, "start_market": 0.5, "off_axis_deg": 20, "click_reach": 6, "levy": 20},
)
