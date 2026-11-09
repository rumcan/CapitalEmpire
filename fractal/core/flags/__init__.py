"""core.flags: the feature switches and the URL flags that turn a feature on or open a dev tool (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.flags", rung=2, title="Feature flags",
    purpose="Hold the owner's feature switches (features.ts) and the URL flags that open a mode or a tool.",
    requires=["A feature switched off in features.ts has no button, no panel and no system behind it (features.ts header)."],
    below=[], above=["core", "ui"],
    rules=["no horizontal scrollbars, and side flyouts"],
)
