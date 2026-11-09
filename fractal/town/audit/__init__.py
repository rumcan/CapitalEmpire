"""town.audit: checking the lots: the audit of a composed lot, the exam sheets of lots by use, and the review file the owner marks them in."""
from fractal.holon import Holon

HOLON = Holon(
    id="town.audit", rung=2, title="Lot audit and review",
    purpose="Check each composed lot against its lot (its house, drive, trees and fence), sample the lots for the exam sheets, and keep the owner's review marks.",
    requires=[
        "auditLot checks a composition against its lot within REACH = 0.8 tiles and DOOR_SLACK = 0.9 (src/game/lots/lot-audit.ts:42, :51).",
        "CHECKS are house, drive, trees and fence (src/game/lots/review-file.ts:13).",
        "The review file is scripts/assets/lot-review.json (src/game/lots/review-file.ts:11).",
    ],
    below=["town.compose", "town.lots"], above=["ui", "art"],
    rules=["a built house lot always has a house facing its street", "town jams are the player's job (never auto-fix congestion)"],
)
