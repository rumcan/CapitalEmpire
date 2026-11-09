"""course.design.pieces: the piece buttons (the course's pre-shaped pieces), their cost, and the props a piece brings."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.design.pieces", rung=3, title="Piece buttons",
    purpose="The buttons of pre-shaped course pieces: what each costs to lay, whether it can go where the cursor is, and the props it brings.",
    requires=[
        "PIECE_BUTTONS lists the piece kinds a player can lay.",
        "A piece is refused with a reason when it sits on land the player does not own (pieceWhy).",
    ],
    files=["src/game/ext/course-pieces/index.ts"],
    dynamics=[
        Fn(name="snapTargets", at="src/game/ext/course-pieces/index.ts:28", does="the existing areas a new piece can snap to", sig="snapTargets(areas, ...)"),
        Fn(name="pieceAreas", at="src/game/ext/course-pieces/index.ts:40", does="the course areas a placed piece makes", sig="pieceAreas(pl: SnapPiecePlacement): Omit<PaintArea,'id'>[]"),
        Fn(name="pieceCost", at="src/game/ext/course-pieces/index.ts:55", does="what laying the piece costs, by its areas and plant kind", sig="pieceCost(areas, plant = 'seed'): number"),
        Fn(name="piecePropsOf", at="src/game/ext/course-pieces/index.ts:71", does="the props (flags, trees) a piece brings", sig="piecePropsOf(anchors): PresetProp[]"),
    ],
    inputs=["a piece placement", "the course's areas"], outputs=["areas", "a cost", "props", "a refusal reason"],
    tests=["tests/ext-course-pieces.test.ts", "tests/course-props.test.ts", "tests/ext-course-height-wiring.test.ts"],
    below=["course.design.snap"], above=["course.design"],
    dual="remove the piece (the editor's undo stack)",
    impl="describe", steer={"plant_default": "seed"},
)
