"""ui.tools.paint: The Paint tool (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.tools.paint',
    rung=3,
    title='The Paint tool',
    purpose="The Paint tool's state and input: outlines by clicks or a lasso, picking, erasing, the shape handles, and the paint panel with its texture picker.",
    requires=['The Paint tool draws outlines by clicks or a lasso, and its preview shows before the click (paint-tool.ts header).', "An action's undo restores its areas, props, money and course height blocks (paint-tool.ts:104 to :108)."],
    files=['src/game/paint-tool.ts', 'src/PaintPanel.tsx', 'src/ui/TexturePicker.tsx', 'src/game/brush.ts', 'src/game/paint.ts', 'src/game/paint-presets.ts', 'src/game/paint-presets-saved.ts'],
    dynamics=[
        Fn(name='PaintTool', at='src/game/paint-tool.ts:364', does="the Paint tool's state and input", sig='class PaintTool'),
        Fn(name='PaintPanel', at='src/PaintPanel.tsx:66', does='the paint panel', sig='(props) => JSX'),
        Fn(name='texRepeatTiles', at='src/ui/TexturePicker.tsx:16', does='how many tiles a texture repeats', sig='(tex: string) => number')],
    inputs=['pointer and key input from the engine'],
    outputs=['LotPatch and the preview; the undo steps'],
    tests=['paint-polish.test.ts', 'paint-brush.test.ts', 'paint.test.ts', 'plant-brush-panel.test.ts', 'surface-flyout-open.test.ts'],
    below=['core', 'course'],
    above=['core'],
    dual='the undo stack: each action keeps what it changed (paint-tool.ts:106 to :108)',
    rules=['no flat colour washes', 'textured highlights', 'no visible tiling'],
    impl='describe',
)
