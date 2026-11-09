"""core.dev: the dev hooks: the lot lab, the lot and learn tools, the shadow audits and the fixtures, all dev builds only (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.dev", rung=2, title="Dev hooks",
    purpose="Give the owner and the agents their dev tools: the lot lab, the shadow audit and draft pages, the learn store and the fixtures.",
    requires=["Every dev tool sits behind a dev-only URL or import; a production build does not start them (main.tsx)."],
    below=["core.engine.orchestra", "core.save.io"], above=["core"],
    rules=["sun upper right, shadows 145 degrees"],
)
