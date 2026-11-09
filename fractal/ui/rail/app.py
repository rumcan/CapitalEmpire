"""ui.rail.app: the app shell, the React root that mounts the game's canvas, the rail, the footer and the panels (src/App.tsx)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="ui.rail.app", rung=3, title="The app shell",
    purpose="The React root: it mounts the game over the canvas with the rail, the footer, the panels and the dev panels.",
    requires=[
        "main.tsx renders <App /> as the one React root (src/main.tsx:22).",
        "App.tsx holds the shell's state in a reducer (useReducer, App.tsx:169) and re-renders on each bump.",
        "src/index.css is the app's one stylesheet, imported by main.tsx (src/main.tsx:3).",
    ],
    owns=["the shell's render counter (useReducer, App.tsx:169)", "the dev panels: TilesPanel and PerfPanel (App.tsx:1044, 1064)"],
    files=["src/App.tsx", "src/index.css"],
    dynamics=[
        Fn(name="App", at="src/App.tsx:161", does="the React root: the game, the rail, the panels and the keys", sig="export default function App()"),
        Fn(name="BudgetPanel", at="src/App.tsx:1110", does="the budget panel card", sig="function BudgetPanel({ game })"),
        Fn(name="PerfPanel", at="src/App.tsx:1064", does="the dev perf panel", sig="function PerfPanel({ game })"),
    ],
    inputs=["the Game instance and the React events"],
    outputs=["the DOM of the app: the canvas, the rail, the footer and the panels"],
    tests=["tests/golf-estate-wiring.test.ts", "tests/ext-progressive-progress.test.ts"],
    below=["core.engine.orchestra", "ui.rail.buttons", "ui.tools.modes"], above=["core.boot.entry"],
    dual="the undo button and Esc undo what the shell routes (ui.rail.buttons, ui.tools.modes)",
    seams=["the rail group ids are mirrored in tests/ext-progressive-progress.test.ts (APP_GROUP_IDS)"],
    rules=["no horizontal scrollbars, and side flyouts"],
    impl="describe",
)
