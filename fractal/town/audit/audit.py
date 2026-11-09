"""town.audit.audit: audit one composed lot against its lot; the exam sample. The audit is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: auditLot (src/game/lots/lot-audit.ts:51) needs the LotGeom and the Composition shapes (compose-core.ts:32) and the house anchors (LotAnchors); examLots (lot-exam.ts:22) can follow"


def audit_lot(g, c, knobs=None):
    """port todo: the audit verdict of a composition against its lot (Python port of auditLot, src/game/lots/lot-audit.ts:51)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.audit.audit", rung=3, title="Audit a lot and sample the exam",
    purpose="Say whether a composed lot's house, drive, trees and fence sit where they should, and sample lots for the exam sheets.",
    requires=[
        "REACH = 0.8 tiles and DOOR_SLACK = 0.9 are the audit's tolerances (src/game/lots/lot-audit.ts:42).",
        "EXAM_N = 50 lots make an exam sheet (src/game/lots/lot-exam.ts:13).",
        "The exam takes the built, upgraded and declined states (src/game/lots/lot-exam.ts:16).",
    ],
    files=["src/game/lots/lot-audit.ts", "src/game/lots/lot-exam.ts"],
    dynamics=[
        Fn(name="auditLot", at="src/game/lots/lot-audit.ts:51", does="audits a composition against its lot", sig="auditLot(g: LotGeom, c: Composition): LotAudit"),
        Fn(name="examLots", at="src/game/lots/lot-exam.ts:22", does="the lots sampled for an exam sheet", sig="examLots(presets): ExamLot[]"),
        Fn(name="examRows", at="src/game/lots/lot-exam.ts:55", does="lays the exam lots out in rows", sig="examRows(lots, span = 150, gap = 3, max = 7)"),
    ],
    inputs=["a lot {o, u, n, w, d}", "a Composition"],
    outputs=["a LotAudit verdict", "exam lots and rows"],
    tests=["tests/clean-lots.test.ts", "tests/house-drives.test.ts", "tests/house-lots-have-houses.test.ts", "tests/lot-review.test.ts", "tests/lots-every-use.test.ts", "tests/lot-taste.test.ts"],
    below=["town.compose.lot"], above=["ui", "art"],
    dual="none needed: an audit reads and changes nothing; the fix is a re-compose (town.compose.lot)",
    seams=["the review marks the owner sets (town.audit.review)"],
    rules=["a built house lot always has a house facing its street"],
    impl="native", fn=audit_lot, steer={"reach": 0.8, "door_slack": 0.9, "exam_n": 50}, port=PORT,
    params={"g": "{o, u, n, w, d} the lot geometry", "c": "a Composition {props, ground, anchors}"},
)
