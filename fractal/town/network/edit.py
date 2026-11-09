"""town.network.edit: the road edits as ops, the diff between two networks, and the undo journal."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="town.network.edit", rung=3, title="Road edits and undo",
    purpose="Turn a network into ops and back, diff two states, and undo or redo a player's road edit as one step.",
    requires=[
        "netToOps turns a network into the ops that rebuild it, and applyOps applies a list of ops (src/game/netops.ts:6, :25).",
        "diffNet returns null when two network states are the same (src/game/net-undo.ts:39).",
        "applyNetDiff with undo=true restores the segments and nodes a diff changed (src/game/net-undo.ts:69).",
    ],
    files=["src/game/netops.ts", "src/game/net-undo.ts", "src/game/snap.ts"],
    dynamics=[
        Fn(name="applyOps", at="src/game/netops.ts:25", does="applies a list of road ops to a network", sig="applyOps(n: RoadNetwork, ops: NetOp[])"),
        Fn(name="netToOps", at="src/game/netops.ts:6", does="the ops that rebuild a network", sig="netToOps(net: RoadNetwork): NetOp[]"),
        Fn(name="NetEditor", at="src/game/netops.ts:101", does="the editor that places, cuts and re-types segments and nodes", sig="class NetEditor"),
        Fn(name="netState", at="src/game/net-undo.ts:27", does="a snapshot of every segment and node of a network", sig="netState(net: RoadNetwork): NetState"),
        Fn(name="diffNet", at="src/game/net-undo.ts:39", does="the segments and nodes that differ between two snapshots", sig="diffNet(before, after): NetDiff | null"),
        Fn(name="applyNetDiff", at="src/game/net-undo.ts:69", does="applies a diff forwards (redo) or backwards (undo)", sig="applyNetDiff(edit, d, undo: boolean): boolean"),
        Fn(name="createNetJournal", at="src/game/net-undo.ts:93", does="the journal: begin, end (one step), undo, redo", sig="createNetJournal(h): NetJournal"),
    ],
    inputs=["a RoadNetwork", "a player's road edit (between begin and end)"],
    outputs=["NetOp lists", "a NetDiff step on the undo stack"],
    tests=["tests/net-undo.test.ts", "tests/net-undo-stack.test.ts", "tests/network.test.ts"],
    below=["town.network.graph"], above=["ui"],
    dual="NetJournal.undo and redo (src/game/net-undo.ts:92): the journal is the dual of every road edit",
    seams=["the undo stack in the UI (ui: undo)", "the worker's NetOp messages (src/game/ground-protocol.ts)"],
    rules=["roads rebuild instantly, with no manual ground rebuild"],
)
