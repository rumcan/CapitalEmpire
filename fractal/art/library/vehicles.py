"""art.library.vehicles: the car pictures appended to LIBRARY (cars-library.ts appendCars), described."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="art.library.vehicles", rung=3, title="Vehicle pictures",
    purpose="Append the car pictures, with their sizes and footprints, to the library.",
    requires=["appendCars adds the car rows and their atlas pages to LIBRARY and the page list (cars-library.ts line 12)."],
    owns=["the car rows (appended after the town art)"],
    files=["src/game/cars-library.ts", "src/game/car-paint.ts", "src/game/ext/car-art/index.ts", "src/game/ext/car-art/model.mjs", "src/game/traffic.ts", "src/game/vehicles.ts"],
    dynamics=[Fn(name="appendCars", at="src/game/cars-library.ts:12", does="appends the car pictures to the library and its pages", sig="appendCars(library, pages)")],
    inputs=["the LIBRARY array and the page list"],
    outputs=["car rows in LIBRARY"],
    tests=["tests/cars-size.test.ts", "tests/car-model.test.ts", "tests/car-size-studio.test.ts", "tests/car-class-sizes.test.ts"],
    below=["art.library.index"], above=["art.library.index"],
    dual="MISSING: an appended row cannot be removed at runtime (LIBRARY indices are saved)",
    impl="describe",
)
