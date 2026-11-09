"""town.lots.groups: the lot groups: a sprite's role, and the zone and size cells the presets are grouped in. Role lookup is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: roleOf (src/game/lots/groups.ts:29) needs the role rules and the library sprite ids; zoneOf (groups.ts:54) and sizeOf (:62) are small and can follow"


def role_of(id, knobs=None):
    """port todo: a sprite id's role or None (Python port of roleOf, src/game/lots/groups.ts:29)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.lots.groups", rung=3, title="Lot groups: roles, zones and sizes",
    purpose="Sort the lot pictures by role and the lots by zone and size, so a lot draws from its own group.",
    requires=[
        "roleOf returns one role for a sprite id, or null (src/game/lots/groups.ts:29).",
        "zoneOf places a lot in one zone of the town by its position (src/game/lots/groups.ts:54).",
        "buildGroups rebuilds the group cells from the presets, and the cells are cleared until it runs (src/game/lots/groups.ts:98).",
    ],
    files=["src/game/lots/groups.ts", "src/game/lots/group-data.ts"],
    dynamics=[
        Fn(name="roleOf", at="src/game/lots/groups.ts:29", does="the role of a sprite id, or null", sig="roleOf(id: string): Role | null"),
        Fn(name="zoneOf", at="src/game/lots/groups.ts:54", does="the zone of a lot by its position and size", sig="zoneOf(x, y, w, d): Zone"),
        Fn(name="buildGroups", at="src/game/lots/groups.ts:98", does="rebuilds the group cells from the presets", sig="buildGroups(presets): void"),
        Fn(name="learnGroups", at="src/game/lots/groups.ts:81", does="the group members learned from the presets", sig="learnGroups(presets): Map<string, string[]>"),
    ],
    inputs=["a sprite id", "a lot's position and size", "the preset list"],
    outputs=["a role or null", "a zone", "the group cells"],
    tests=["tests/lot-groups.test.ts", "tests/lots-every-use.test.ts", "tests/item-places.test.ts", "tests/autolot.test.ts"],
    below=["town.lots.library"], above=["town.compose"],
    dual="buildGroups again from the same preset list (a rebuild; nothing to undo)",
    seams=["the presets' groups (town.lots.library)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=role_of, steer={"role_words": []}, port=PORT,
    params={"id": "str, a sprite id"},
)
