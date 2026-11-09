"""course.tees.placement: where a tee box goes: its aim at the pin, its turn in steps, its scale, and the tee sets a hole has."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.tees.placement", rung=3, title="Tee placement and sets",
    purpose="Put a tee box on the ground: aim it down the hole at the pin, turn it in 15-degree steps, scale it, and say which of the four tee sets a hole has.",
    requires=[
        "A tee's turn is snapped in steps of 15 degrees (TEE_TURN_DEG, snapTurn).",
        "The gap between tees is 25 m for the first sets and 40 m for the red (TEE_GAP_M, RED_GAP_M).",
        "A set's tee is found from the nearest set the hole has (nearestSet).",
    ],
    files=["src/game/golf/teeplace.ts", "src/game/golf/teesets.ts"],
    dynamics=[
        Fn(name="teeAim", at="src/game/golf/teeplace.ts:32", does="the point a tee box aims at, from the pins and the aims", sig="teeAim(n, pins, aims): Pt | null"),
        Fn(name="polyCells", at="src/game/golf/teeplace.ts:78", does="the grid cells a tee box covers, and whether it is off the course", sig="polyCells(g, pts): {cells, off}"),
        Fn(name="addTeeSpot", at="src/game/golf/teesets.ts:62", does="finds the spot for a new tee of a set along the hole's line", sig="addTeeSpot(kind, sets, line): {at, dir} | null"),
        Fn(name="teeBox", at="src/game/golf/teesets.ts:82", does="the outline of a tee box at a point, direction and scale", sig="teeBox(at, dir, scale = 1): number[]"),
        Fn(name="migrateTees", at="src/game/golf/teesets.ts:48", does="turns old tee marks into the four sets", sig="migrateTees(tees): TeeMark[]"),
    ],
    inputs=["a hole's pins, aims and line", "the tee marks"], outputs=["tee box outlines", "tee spots", "migrated tee marks"],
    tests=["tests/golf-tee-place.test.ts", "tests/golf-tee-sets.test.ts", "tests/tee-look.test.ts"],
    below=["course.tees.walls", "course.holes.plan"], above=["course.tees", "play"],
    dual="a tee is removed by its marker (the holes panel) and the undo stack restores the old mark",
    impl="describe", steer={"tee_turn_deg": 15, "tee_scale_min": 0.7, "tee_scale_max": 2, "tee_scale_step": 0.1, "tee_min_to_pin_m": 60, "box_len_m": 14, "box_wid_m": 8, "tee_gap_m": 25, "red_gap_m": 40},
)
