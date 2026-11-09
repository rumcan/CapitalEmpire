"""town.network.junctions: junction types, their corners and slip roads, the rules that gate a flag, and the highway interchange geometry."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.network.junctions", rung=3, title="Junction types, corners and interchanges",
    purpose="Say which junction types a node may take, what each corner costs and fits, and the ramps of a highway interchange.",
    requires=[
        "variantCost adds the ring-lane cost for each roundabout lane above one (src/game/network.ts:201).",
        "isLights is true for a 'signal' or a 'slip' junction only (src/game/junctions.ts:17).",
        "junctionCorners lists each corner with its degree and whether it fits (src/game/junctions.ts:27).",
    ],
    files=["src/game/junctions.ts", "src/game/ext/interchange/index.ts", "src/game/ring-clear.ts"],
    dynamics=[
        Fn(name="junctionCorners", at="src/game/junctions.ts:27", does="each corner of a node: its two arms, degree, side, and whether it fits and is on", sig="junctionCorners(n: Node, geometry = true): Corner[]"),
        Fn(name="slipPlan", at="src/game/junctions.ts:40", does="the slip-road plan for the chosen corners", sig="slipPlan(n: Node, on: number[]): SlipPlan"),
        Fn(name="flagRule", at="src/game/junctions.ts:48", does="why a wide or traffic-light flag is refused at a node, '' when allowed", sig="flagRule(n: Node, k: 'wide' | 'tl'): string"),
        Fn(name="slipRule", at="src/game/junctions.ts:56", does="why a slip road is refused at a node, '' when allowed", sig="slipRule(n: Node): string"),
        Fn(name="makeInterchange", at="src/game/ext/interchange/index.ts:447", does="the ramps of a highway interchange between two roads", sig="makeInterchange(A: RoadSpec, B: RoadSpec, type: InterchangeType): Interchange"),
    ],
    inputs=["a Node with its arms", "the chosen corners (degrees)", "two road specs and an interchange type"],
    outputs=["Corner[] and SlipPlan", "rule strings for the tool", "ramp anchors (Bezier ramps)"],
    tests=["tests/junction-rules.test.ts", "tests/junction-tool.test.ts", "tests/ext-interchange.test.ts"],
    below=["town.network.graph"], above=["ui", "render"],
    dual="setNodeType back to the earlier type, as a node change in the journal (src/game/net-undo.ts:92)",
    seams=["the junction tool in the UI (ui)", "the renderer's ramps and corners (render)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
)
