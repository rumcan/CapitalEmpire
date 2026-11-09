"""ui.tools.place: Place tools: parking, props, practice, estate (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.tools.place',
    rung=3,
    title='Place tools: parking, props, practice, estate',
    purpose="The placement tools in hand: the parking rows and curbs, the props ghost, the practice facility ghost, and the practice facility ghost (the estate tool is course's, see ui.handoff).",
    requires=['Escape cancels a parking row drag (parking-tool.ts:288).', 'A prop or lot ghost shows green where it can stand and red with the reason where it cannot (propstool.ts and estatetool.ts headers).'],
    files=['src/game/parking-tool.ts', 'src/game/golf/propstool.ts', 'src/game/golf/practicetool.ts', 'src/game/ext/event-ghost/index.ts', 'src/game/ext/ghost-preview/index.ts', 'src/game/ext/refused-mark.ts'],
    dynamics=[
        Fn(name='ParkingTool', at='src/game/parking-tool.ts:81', does="the Parking tool's state and input", sig='class ParkingTool'),
        Fn(name='PropsTool', at='src/game/golf/propstool.ts:74', does="the Props tool's ghost and input", sig='class PropsTool'),
        Fn(name='PracticeTool', at='src/game/golf/practicetool.ts:36', does="the practice facility's ghost", sig='class PracticeTool')],
    inputs=["pointer and key input; the host's state"],
    outputs=['the ghost; the placed items'],
    tests=['parking-tool.test.ts', 'golf-props-tool.test.ts', 'golf-estate-tool.test.ts', 'practice-tools.test.ts'],
    below=['core', 'town', 'course'],
    above=['core'],
    dual='Esc cancels a drag; a placed item comes out with bulldoze or sell in its own system',
    rules=['people are never placeable'],
    impl='describe',
)
