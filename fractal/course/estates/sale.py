"""course.estates.sale: the land sold round the course: the offers of a block, their price band, the parcels a purchase joins, and what a parcel is worth. The port is still to write (see port)."""
from fractal.holon import Fn, Holon

_TODO = ("todo: port landOffers (src/game/golf/land-sale.ts:56) with bandOf (land-sale.ts:46) and the parcel helpers (parcels.ts: courseParcelList :73, "
         "inParcels :83): inputs a LandHost (parcels, the town's classes, the course's rectangles) and a block size; output the LandOffer list "
         "{rect, landClass, houses, buildings, price, band, why}")


def land_offers(host: dict, size: int = 40, knobs: dict | None = None):
    """the land offers of a host (the port is still to write: see port)"""
    raise NotImplementedError(_TODO)


HOLON = Holon(
    id="course.estates.sale", rung=3, title="Land sale round the course",
    purpose="The land the player can buy round the course: each block is offered at a price band, with what it holds and why a block is refused, and the parcels a purchase joins.",
    requires=[
        "A land offer's price band is cheap up to 1.5, fair up to 2.5 and dear above (BAND_MAX): the label is $, $$ or $$$ (BAND_LABEL).",
        "A parcel's price per square metre depends on its land class (LAND_PRICE_SQM); a building adds 4000 (BUILDING_SURCHARGE).",
        "Population grows 5% a month (POP_GROWTH_RATE).",
    ],
    files=["src/game/golf/land-sale.ts", "src/game/golf/parcels.ts"],
    dynamics=[
        Fn(name="landOffers", at="src/game/golf/land-sale.ts:56", does="the offers of the land round the course", sig="landOffers(h, size = LAND_BLOCK): LandOffer[]"),
        Fn(name="bandOf", at="src/game/golf/land-sale.ts:46", does="the price band of an offer's price", sig="bandOf(price, rect): PriceBand | null"),
        Fn(name="LandSale", at="src/game/golf/land-sale.ts:112", does="the land sale: buying and selling parcels", sig="class LandSale"),
        Fn(name="courseParcelList", at="src/game/golf/parcels.ts:73", does="the parcels that make up the course", sig="courseParcelList(plan): Rect[]"),
        Fn(name="inParcels", at="src/game/golf/parcels.ts:83", does="whether a point is in one of the owned parcels", sig="inParcels(parcels, x, y): boolean"),
    ],
    inputs=["a land host (parcels, classes, the course)", "a block size"], outputs=["land offers with price band and reason"],
    tests=["tests/land-sale.test.ts", "tests/golf-parcels.test.ts", "tests/golf-range-guided.test.ts"],
    below=["town.lots"], above=["course.estates"],
    dual="unverified: a purchase's undo is not traced yet (LandSale in land-sale.ts)",
    impl="native", fn=land_offers, port=_TODO,
    steer={"band_cheap_max": 1.5, "band_fair_max": 2.5, "building_surcharge": 4000, "house_surcharge": 0, "pop_growth_rate": 0.05, "land_block": 40},
)
