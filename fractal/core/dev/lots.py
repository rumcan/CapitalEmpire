"""core.dev.lots: the lot tools: derive, edit, examine, gallery, grid, houses, paint, review, select and the lot wizard, described (dev only)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.dev.lots", rung=3, title="Lot dev tools",
    purpose="Edit, examine and review the house lots in dev builds: derive a lot's look, paint it, pick its house, and step it through a wizard.",
    requires=["A built house lot always has a house facing its street (the owner's rule; lot-houses and house-alloc-store keep it)."],
    owns=["the dev lot selection and the house allocation store"],
    files=[
        "src/game/dev/lot-derive.ts", "src/game/dev/lot-edit.ts", "src/game/dev/lot-editor.ts", "src/game/dev/lot-exam.ts",
        "src/game/dev/lot-gallery.ts", "src/game/dev/lot-grid.ts", "src/game/dev/lot-houses.ts", "src/game/dev/lot-paint.ts",
        "src/game/dev/lot-review.ts", "src/game/dev/lot-select.ts", "src/game/dev/lot-wizard.ts", "src/game/dev/wizard-lot.ts",
        "src/game/dev/house-alloc-store.ts", "src/game/dev/live-model.ts",
    ],
    dynamics=[],
    inputs=["a lot key from the dev selection"],
    outputs=["an edited lot (saved through dev-save)"],
    tests=["tests/lot-derive.test.ts", "tests/lot-edit.test.ts", "tests/lot-paint.test.ts", "tests/lot-review.test.ts", "tests/lot-wizard.test.ts", "tests/house-alloc.test.ts", "tests/house-lots-have-houses.test.ts"],
    below=["core.save.io"], above=["core.dev"],
    dual="the lot edits are saved as the dev save's own lot records (dev-save.ts; a reset restores the old)",
    rules=["a built house lot always has a house facing its street"],
    impl="describe",
)
