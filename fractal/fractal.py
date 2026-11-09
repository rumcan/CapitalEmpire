#!/usr/bin/env python3
"""CapitalEmpire as a fractal BRS you can run (T410, #1110).

  python fractal/fractal.py                      the tree, two rungs deep
  python fractal/fractal.py tree [id] [depth]    the tree under a holon
  python fractal/fractal.py describe <id>        a holon's BRS card: requires, the four folds, around, rules, how to run it
  python fractal/fractal.py find <words>         the holons whose BRS, functions or files match
  python fractal/fractal.py run <id> [k=v ...]   run a holon (an image leaf writes a PNG and prints its path)
  python fractal/fractal.py steer <id> [k=v ...] a leaf's steering knobs (read, or set: saved in fractal/_steer/<id>.json)
  python fractal/fractal.py todo                 the leaves whose Python port is still to write
  python fractal/fractal.py check                the map's own audit: every source file owned once, every node has a BRS and a test, the duals
  python fractal/fractal.py shell                a small prompt to walk and run the tree

The tree on disk is the fractal: fractal/<domain>/__init__.py holds a domain's HOLON, each child module or folder holds its own.
"""
from __future__ import annotations

import importlib
import json
import pkgutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from fractal.holon import Holon, REPO  # noqa: E402

DOMAINS = ["land", "town", "course", "play", "people", "business", "render", "ui", "core", "art"]


def load_node(modname: str) -> Holon | None:
    """a module's HOLON, with its sub-modules' HOLONs added as children (the folder tree is the holon tree)"""
    try:
        m = importlib.import_module(modname)
    except ModuleNotFoundError:
        return None
    h: Holon | None = getattr(m, "HOLON", None)
    if h is None:
        return None
    have = {c.id for c in h.children}
    if hasattr(m, "__path__"):
        for info in sorted(pkgutil.iter_modules(m.__path__), key=lambda i: i.name):
            if info.name.startswith("_"):
                continue
            c = load_node(f"{modname}.{info.name}")
            if c and c.id not in have:
                h.children.append(c)
    return h


def game() -> Holon:
    root = Holon(id="game", rung=0, title="CapitalEmpire", purpose="A 1985 golf events manager: build a course and a town, play golf, run tournaments.",
                 requires=["Every Rung-1 domain below keeps its own BRS true."], impl="describe")
    for d in DOMAINS:
        h = load_node(f"fractal.{d}")
        if h:
            root.children.append(h)
    return root


def find(root: Holon, hid: str) -> Holon | None:
    return next((h for h in root.walk() if h.id == hid), None)


def show(h: Holon, depth: int, pad: str = "") -> None:
    tag = {"bridge": "[run: game]", "native": "[run: py]", "describe": ""}.get(h.impl, "")
    print(f"{pad}{h.id:<40} {h.title}  {tag}")
    if depth > 0:
        for c in h.children:
            show(c, depth - 1, pad + "  ")


def parse_args(kv: list[str]) -> dict:
    out = {}
    for a in kv:
        k, _, v = a.partition("=")
        try:
            out[k] = json.loads(v)
        except json.JSONDecodeError:
            out[k] = v
    return out


def audit(root: Holon) -> int:
    """the map checks itself: every tracked source file owned by exactly one leaf; every node has a BRS line; every leaf a test; the drains with no dual"""
    files = subprocess.run(["git", "-c", "safe.directory=*", "ls-files", "src"], cwd=REPO, capture_output=True, text=True).stdout.split()
    files = [f for f in files if f.endswith((".ts", ".tsx", ".js", ".mjs"))]
    owner: dict[str, list[str]] = {}
    for h in root.walk():
        for f in h.files:
            owner.setdefault(f, []).append(h.id)
    unowned = [f for f in files if f not in owner]
    twice = {f: o for f, o in owner.items() if len(o) > 1}
    nobrs = [h.id for h in root.walk() if not h.requires]
    notest = [h.id for h in root.walk() if not h.children and not h.tests]
    missing = [(h.id, h.dual) for h in root.walk() if h.dual and h.dual.startswith("MISSING")]
    nodes = list(root.walk())
    print(f"nodes {len(nodes)}  (by rung: {', '.join(f'{r}:{sum(1 for h in nodes if h.rung == r)}' for r in range(5))})")
    print(f"source files {len(files)}  owned {len(files) - len(unowned)}  unowned {len(unowned)}  owned twice {len(twice)}")
    print(f"runnable: game {sum(1 for h in nodes if h.impl == 'bridge')}  python {sum(1 for h in nodes if h.impl == 'native')}")
    for f in unowned[:30]:
        print("  unowned", f)
    for f, o in list(twice.items())[:30]:
        print("  twice  ", f, o)
    for i in nobrs[:20]:
        print("  no BRS ", i)
    for i in notest[:20]:
        print("  no test", i)
    for i, d in missing:
        print("  dual   ", i, "->", d)
    return 1 if unowned or twice or nobrs else 0


def shell(root: Holon) -> None:
    print("fractal shell: tree [id] [depth] | describe <id> | find <words> | run <id> k=v ... | quit")
    while True:
        try:
            line = input("fractal> ").strip()
        except EOFError:
            break
        if line in ("quit", "exit", "q"):
            break
        if line:
            main(line.split(), root)


def main(argv: list[str], root: Holon | None = None) -> int:
    root = root or game()
    cmd = argv[0] if argv else "tree"
    if cmd == "tree":
        h = find(root, argv[1]) if len(argv) > 1 else root
        show(h or root, int(argv[2]) if len(argv) > 2 else 2)
    elif cmd == "describe" and len(argv) > 1:
        h = find(root, argv[1])
        print(json.dumps(h.card(), indent=2) if h else f"no holon {argv[1]}")
    elif cmd == "find" and len(argv) > 1:
        q = " ".join(argv[1:]).lower()
        for h in root.walk():
            text = " ".join([h.id, h.title, h.purpose, *h.requires, *h.files, *(f.name for f in h.dynamics)]).lower()
            if all(w in text for w in q.split()):
                print(f"{h.id:<40} {h.title}")
    elif cmd == "run" and len(argv) > 1:
        h = find(root, argv[1])
        if not h:
            print(f"no holon {argv[1]}")
            return 1
        print(json.dumps(h.run(**parse_args(argv[2:])), indent=2, default=str))
    elif cmd == "steer" and len(argv) > 1:
        h = find(root, argv[1])
        if not h:
            print(f"no holon {argv[1]}")
            return 1
        if len(argv) > 2:
            d = HERE / "_steer"
            d.mkdir(exist_ok=True)
            f = d / f"{h.id}.json"
            cur = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
            cur.update(parse_args(argv[2:]))
            f.write_text(json.dumps(cur, indent=2), encoding="utf-8")
        print(json.dumps(h.knobs(), indent=2))
    elif cmd == "todo":
        for h in root.walk():
            if h.port:
                print(f"{h.id:<40} {h.port}")
    elif cmd == "check":
        return audit(root)
    elif cmd == "shell":
        shell(root)
    else:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
