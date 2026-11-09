"""core.boot.entry: the browser entry (main.tsx) and the Vite env types (vite-env.d.ts), described: they mount React and pick the dev audit pages."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="core.boot.entry", rung=3, title="Browser entry",
    purpose="Mount the React app at the root element, apply the saved UI scale, or open a dev audit page by URL.",
    requires=[
        "The UI scale is applied before the first paint (main.tsx applyUiScale).",
        "The dev-only audit pages open only in a dev build: ?shadows=audit, ?shadows=draft and ?carpaint=audit (main.tsx).",
    ],
    owns=["nothing: the root element is the page's own"],
    files=["src/main.tsx", "src/vite-env.d.ts"],
    dynamics=[Fn(name="createRoot", at="src/main.tsx:20", does="mounts the App in StrictMode at the root element, or opens a dev audit page", sig="createRoot(root).render(...)")],
    inputs=["the URL query (shadows, carpaint)", "the saved UI scale"],
    outputs=["the React root"],
    tests=["tests/lab-boot.test.ts", "tests/ui-keys.test.ts"],
    below=["ui"], above=["core.boot"],
    dual=None,
    impl="describe",
)
