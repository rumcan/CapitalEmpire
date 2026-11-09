"""art.tools: the picture tools (native, PIL and numpy): a contact sheet of a folder, keying a magenta sheet to alpha, splitting a 2x2 sheet (T410)."""
from fractal.holon import Holon

HOLON = Holon(
    id="art.tools", rung=2, title="Picture tools",
    purpose="Check, key and cut the art sheets the runner makes, without the game running.",
    requires=["Every tool writes under OUT (E:/ClaudeTemp/fractal-out) and never over its input."],
    below=[], above=["art"],
    rules=["art goes straight in (report after)", "no flat colour washes"],
)
