"""business.facilities.practicetool: Practice building tool. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='business.facilities.practicetool', rung=3, title='Practice building tool',
    purpose="Facilities > Practice: the engine's side of the practice building tools (handed off to ui: ui.tools.place also claims the file).",
    requires=['Facilities > Practice has its own building tools (golf/practicetool.ts header, T206).'],
    files=[],
    dynamics=[],
    inputs=[], outputs=[],
    tests=['tests/practice-tools.test.ts'],
    below=[], above=[], dual="the practice plan's removal (business.facilities.practice)",
    seams=["the Practice tool's ghost (ui)"], rules=[],
    impl='describe',
)
