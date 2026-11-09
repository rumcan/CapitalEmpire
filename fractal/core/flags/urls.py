"""core.flags.urls: the URL flags that open a mode or a dev tool (bench.ts, newart.ts, main.tsx), described."""
from fractal.holon import Holon

HOLON = Holon(
    id="core.flags.urls", rung=3, title="URL flags",
    purpose="Let a page's URL open a benchmark, the new-art preview, the old art, or a dev audit.",
    requires=[
        "?bench opens the benchmark tour (bench.ts header).",
        "?newart previews new art only; ?oldart shows the old pictures for comparison (newart.ts lines 26 to 34).",
        "?shadows=audit, ?shadows=draft and ?carpaint=audit open dev pages, in dev builds only (main.tsx).",
    ],
    owns=["nothing: each flag is read from location.search"],
    files=[],
    dynamics=[],
    inputs=["the page's query string"],
    outputs=["the mode the page opens in"],
    tests=["tests/newart-default.test.ts", "tests/lab-boot.test.ts"],
    below=["art.newart.swap", "core.bench.scenes"], above=["core.flags"],
    dual="removing the query string (the default page)",
    impl="describe",
)
