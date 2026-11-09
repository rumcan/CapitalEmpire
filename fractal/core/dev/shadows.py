"""core.dev.shadows: the shadow audit and draft pages: the sheets that check the cast and contact shadows by eye (src/game/dev/shadow-*), described (dev only)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.dev.shadows", rung=3, title="Shadow audit and draft pages",
    purpose="Show every sprite's shadow on one sheet, and draft the vector shadows for review, so the shadows can be checked by eye.",
    requires=["The shadow audit opens at ?shadows=audit and the draft at ?shadows=draft (main.tsx), dev builds only."],
    owns=["the audit items and the draft items", "shadow-hints.json (the hints for the drafted shapes)"],
    files=[
        "src/game/dev/shadow-audit.ts", "src/game/dev/shadow-audit-items.ts", "src/game/dev/shadow-draft.ts",
        "src/game/dev/shadow-draft-items.ts", "src/game/dev/shadow-draft-page.ts", "src/game/dev/shadow-hints.json",
    ],
    dynamics=[],
    inputs=["the sprite items and their shadow shapes"],
    outputs=["the audit sheet and the draft sheet"],
    tests=["tests/shadow-overrides.test.ts", "tests/shadow-shape.test.ts", "tests/shadow-vector.test.ts"],
    below=["render.shadows.shape", "render.shadows.vector"], above=["core.dev"],
    dual="the drafted hints are kept in shadow-hints.json; removing a hint restores the rule's shape",
    rules=["sun upper right, shadows 145 degrees"],
    impl="describe",
)
