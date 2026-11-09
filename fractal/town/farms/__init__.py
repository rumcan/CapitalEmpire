"""town.farms: farms on the town's edge: their parcels, their fields and animals, and the farmstead and its outbuildings."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.farms", rung=2, title="Farms",
    purpose="Lay farm parcels along the town's edge, compose each farm's fields, orchards, animals and farmstead, and keep the farm map in step with the town's lots.",
    requires=[
        "FARM_FRONT_MIN = 30, FARM_FRONT_MAX = 80, FARM_DEPTH_MIN = 60 and FARM_DEPTH_MAX = 150 bound a parcel (src/game/ext/farms/farms.ts:30).",
        "ANIMALS_PER_FARM_MAX = 16 (src/game/ext/farms/animals.ts:36).",
        "Farms never use the town's wood fences (src/game/ext/farms/farms.ts:158).",
    ],
    below=["town.lots", "town.network"], above=["town.growth", "render", "people"],
    rules=["no visible tiling", "no flat colour washes", "new art used everywhere, with the old look kept as an option"],
)
