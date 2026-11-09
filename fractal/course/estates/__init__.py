"""course.estates: the estates on the course: the house lots that front a street, their sale and build, and the land sold round the course."""
from fractal.holon import Holon

HOLON = Holon(
    id="course.estates", rung=2, title="Estates and house lots on the course",
    purpose="Sell house lots on the course's land: a lot fronts a street, is sold, then built with a house facing that street, and the land round the course is offered at a price band.",
    requires=[
        "A house lot fronts a street: a lot with no street is refused (NO_STREET).",
        "A lot's price is 20 per square metre (M2_PRICE), and laying a lot costs 1000 (LAY_COST).",
        "A lot goes sale, sold, building, built, in that order (ST: SALE 0, SOLD 1, BUILDING 2, BUILT 3).",
        "A land offer's price band is cheap up to 1.5, fair up to 2.5 and dear above (BAND_MAX).",
    ],
    below=["course.surfaces", "town.lots"],
    above=["course", "business"],
    dual="unverified: how a sale or a built house is undone is not traced yet (estatetool.ts and land-sale.ts to check)",
    rules=["a built house lot always has a house facing its street", "town jams are the player's job"],
)
