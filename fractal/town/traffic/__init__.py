"""town.traffic: the traffic: the lane graph, car following, signals, the day's trips, the incidents and disasters, and the subway."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.traffic", rung=2, title="Traffic and the town's clock",
    purpose="Send the town's cars along its streets: the lanes, the car following, the signals, the day's demand, the breakdowns and crashes, and the subway.",
    requires=[
        "Traffic is stepped every DT = 0.1 s (src/game/sim/sim.ts:17).",
        "MIN_GREEN = 7 and MAX_GREEN = 40 bound a signal's green (src/game/sim/signals.ts:9).",
        "Trip demand follows a day curve through the day (src/game/sim/trips.ts:35).",
    ],
    below=["town.network", "town.growth"], above=["ui", "render", "play", "people", "core"],
    rules=["town jams are the player's job (never auto-fix congestion)", "performance is a hard gate"],
)
