"""town.lots.cut: the lots cut from the roads: frontage lots (LotMap), block lots (blocks.ts, blocklots.ts). Subdivision is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: subdivide needs spineCells and h5 (src/game/lots/blocklots.ts:77 and its helpers) and the block outline (src/game/blocks.ts:42); LotMap (src/game/lots/lots.ts:267) needs the RoadNetwork"


def subdivide(W, H, seed, wide=False, knobs=None):
    """port todo: split a W by H block into lot cells (Python port of subdivide, src/game/lots/blocklots.ts:77)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.lots.cut", rung=3, title="Lot cut: frontage and block lots",
    purpose="Cut each road's frontage into lots, and each enclosed block into block lots, dropping the lots on bad ground.",
    requires=[
        "BAD_MAX = 0.1 is the share of bad terrain a lot may have (src/game/lots/lots.ts:30).",
        "BLOCK_MAX_AREA = 160000 and BLOCK_MIN_AREA = 9 tiles squared bound the enclosed blocks (src/game/blocks.ts:9, :11).",
        "subdivide splits a block into cells deterministically for a given rnd (src/game/lots/blocklots.ts:77).",
    ],
    files=["src/game/lots/lots.ts", "src/game/lots/blocklots.ts", "src/game/blocks.ts"],
    dynamics=[
        Fn(name="subdivide", at="src/game/lots/blocklots.ts:77", does="splits a block into cells along its spine", sig="subdivide(W: number, H: number, rnd: () => number, wide = false): Cell[]"),
        Fn(name="enclosedBlocks", at="src/game/blocks.ts:42", does="the blocks enclosed by the road network", sig="enclosedBlocks(net: RoadNetwork, maxArea = BLOCK_MAX_AREA, box?): Block[]"),
        Fn(name="LotMap", at="src/game/lots/lots.ts:267", does="the lots cut from the network, updated as roads change", sig="class LotMap"),
        Fn(name="badShare", at="src/game/lots/lots.ts:142", does="the share of bad terrain under a lot rectangle", sig="badShare(terr, o, u, n, W, d): number"),
        Fn(name="endReach", at="src/game/lots/lots.ts:46", does="how far a road end reaches for lots", sig="endReach(n: Node, cls: RoadClass): number"),
    ],
    inputs=["the road network", "a block outline", "a W by H block size and a seed"],
    outputs=["lots (frontage and block)", "the removed lot keys"],
    tests=["tests/blocks.test.ts", "tests/blocklots.test.ts", "tests/lots.test.ts", "tests/lots-keep.test.ts", "tests/course-drive.test.ts"],
    below=["town.network.graph"], above=["town.compose", "town.audit.audit"],
    dual="LotMap.update's removed list (src/game/city.ts:723) lifts a lot; undoing the road re-cuts it",
    seams=["the lots the sim reads (town.traffic.sim)", "the parcels the ground bakes (ground-protocol)"],
    rules=["town jams are the player's job (never auto-fix congestion)"],
    impl="native", fn=subdivide, steer={"wide_min": 4, "spine_bias": 0.5}, port=PORT,
    params={"W": "int, block width in tiles", "H": "int, block height in tiles", "seed": "int, for the random spine choice", "wide": "bool, wider cells"},
)
