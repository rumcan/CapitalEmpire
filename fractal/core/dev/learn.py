"""core.dev.learn: the lot learning store: groups, presets and reviewed sets (src/game/dev/learn-*.ts and review-set.ts), described (dev only)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.dev.learn", rung=3, title="Lot learning store",
    purpose="Keep the lot presets the owner has learned from review: their groups, their presets and the reviewed set.",
    requires=["The learn store keeps the owner's reviewed lot presets; a preset is a learned look, not a random one (learn-store.ts)."],
    owns=["the learn groups, presets and the review set"],
    files=["src/game/dev/learn-groups.ts", "src/game/dev/learn-presets.ts", "src/game/dev/learn-store.ts", "src/game/dev/review-set.ts"],
    dynamics=[],
    inputs=["a reviewed lot"],
    outputs=["the learn store's groups and presets"],
    tests=["tests/lot-learning-presets.test.ts", "tests/lot-review.test.ts", "tests/lot-presets.test.ts"],
    below=["core.dev.lots"], above=["core.dev"],
    dual="the learn store's own remove (a preset dropped from its group)",
    impl="describe",
)
