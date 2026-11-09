"""business.biz.taxi: the taxi company, its ranks, fleet and fares (src/game/ext/taxi/)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="business.biz.taxi", rung=3, title="The taxi company",
    purpose="A taxi company the player places: its ranks and fleet take parties from A to B for 1985 fares.",
    requires=[
        "Taxi requests are served by the nearest idle taxi; a party that waits past its limit gives up (taxi.ts:181 step).",
        "Fares are 1985 prices: a flag fall, a per-km and a per-minute charge, less the driver and fuel costs (REAL_ECON, taxi.ts:41).",
        "Each served fare books to the company's revenue and the ledger's business line, and taking the company away drops its taxis (tests/business-taxi.test.ts).",
    ],
    owns=["REAL_ECON, the 1985 taxi prices (taxi.ts:41)", "the ranks, the queue and the fleet inside Taxis (taxi.ts:65)"],
    files=["src/game/ext/taxi/index.ts", "src/game/ext/taxi/taxi.ts"],
    dynamics=[
        Fn(name="Taxis", at="src/game/ext/taxi/taxi.ts:65", does="the dispatch brain: ranks, a fleet, requests and fares", sig="class Taxis(seed, ranks, fleet, travelTime, econ)"),
        Fn(name="Taxis.request", at="src/game/ext/taxi/taxi.ts:126", does="queue a party's request from A to B", sig="request(r)"),
        Fn(name="Taxis.step", at="src/game/ext/taxi/taxi.ts:181", does="advance the fleet and return the orders that drive the taxi cars", sig="step(t, reached): Order[]"),
        Fn(name="Taxis.stats", at="src/game/ext/taxi/taxi.ts:300", does="served, gave-up, revenue, costs and mean wait", sig="stats()"),
    ],
    inputs=["the ranks, a fleet size, a travel-time oracle and each day's requests"],
    outputs=["the Order[] that drives the taxi cars, and the day's served, gave-up, revenue and cost numbers"],
    tests=["tests/ext-taxi.test.ts", "tests/business-taxi.test.ts"],
    below=["town.traffic.sim"], above=["town.growth.city"],
    dual="MISSING: a booked fare or cost is not reversed; taking the company away drops its taxis and their cars, but no fare is refunded",
    seams=["the taxi cars carry the sim's taxi tag (business-taxi test)", "the ledger's business line (business.money.ledger)"],
    rules=["performance is a hard gate"],
    impl="describe",
)
