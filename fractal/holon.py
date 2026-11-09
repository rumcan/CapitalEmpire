"""The holon: one node of CapitalEmpire's fractal BRS (T410, #1110; the owner, 2026-11-09: "distill the game into a BRS, then python scripts in
the fractal system way for each BRS function, including functions that generate images, all in a fractal structure python script I can run").

Every node has the same shape at every rung (the Fidelity holon):
  inside  - substrate (the state and files it owns), dynamics (the game functions that change it), transducer (in -> out), evaluator (its tests)
  around  - below (what it calls), above (who calls it), dual (what undoes it), seams (the data it shares)
and a BRS: `requires`, the lines it must keep true. A leaf can be RUN:
  impl='bridge'   - calls the real game function headlessly through scripts/fractal/bridge.mjs (Node), so the answer is the game's own
  impl='native'   - pure Python (images: heightmaps, relief, mowing previews, sheet keying, contact sheets, alpha checks)
  impl='describe' - tied to the live renderer or the browser: run() returns its BRS and where it lives in the code
A domain is a folder fractal/<domain>/ with __init__.py holding its Rung-1 HOLON; each child is a module or a sub-folder holding its own HOLON,
so the tree on disk IS the fractal (python fractal.py tree walks it).
"""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional

ROOT = Path(__file__).resolve().parent            # fractal/
REPO = Path(os.environ.get("FRACTAL_REPO", ROOT.parent))   # the game's repo (the folder holding src/ and scripts/)
OUT = Path(os.environ.get("FRACTAL_OUT", "E:/ClaudeTemp/fractal-out"))   # where image leaves write (never the C: drive)


@dataclass
class Fn:
    """a game function the holon runs: name, where it is ('src/game/lots/compose.ts:1098'), its signature as written, what it does"""
    name: str
    at: str
    does: str
    sig: str = ""


@dataclass
class Holon:
    id: str                       # 'town.lots.compose' (the game is 'game')
    rung: int                     # 0 game, 1 domain, 2 system, 3 process, 4 step
    title: str
    purpose: str                  # one line, in the player's or the game's terms
    requires: list[str]           # BRS lines, testable, true of the code today
    # inside: the four folds
    owns: list[str] = field(default_factory=list)        # substrate: state, types, save fields
    files: list[str] = field(default_factory=list)       # substrate: the source files this LEAF owns (each file in exactly one leaf)
    dynamics: list[Fn] = field(default_factory=list)     # the game functions (entry points)
    inputs: list[str] = field(default_factory=list)      # transducer in
    outputs: list[str] = field(default_factory=list)     # transducer out
    tests: list[str] = field(default_factory=list)       # evaluator: tests/*.test.ts, gates, budgets
    # around: the four directions
    below: list[str] = field(default_factory=list)
    above: list[str] = field(default_factory=list)
    dual: Optional[str] = None    # what undoes it; 'MISSING: ...' when nothing can (a finding)
    seams: list[str] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)       # the owner's standing rules that bind it
    # running it
    impl: str = "describe"        # 'bridge' | 'native' | 'describe'
    bridge: str = ""              # for impl='bridge': the key the Node bridge registers (scripts/fractal/bridge.mjs)
    params: dict[str, str] = field(default_factory=dict)  # argument name -> what it is ('seed: int, the map seed')
    fn: Optional[Callable[..., Any]] = None               # for impl='native': the Python function
    # steering (the owner, 2026-11-09: "we don't mind drift; we would use Astra and emerging capabilities to steer the system; drift will make it
    # fun"): the Python port is its own living version of the game, not a mirror of the TypeScript. STEER holds the leaf's tunable numbers and
    # switches (the knobs a model or a person turns); fractal.py `steer <id> k=v` writes them to fractal/_steer/<id>.json, which wins at run time
    steer: dict[str, Any] = field(default_factory=dict)
    port: str = ""                # '' when the Python port is done; 'todo: <what the port needs>' when it is still to write
    children: list["Holon"] = field(default_factory=list)

    def knobs(self) -> dict[str, Any]:
        """the steering knobs: the module's STEER defaults, overridden by fractal/_steer/<id>.json"""
        k = dict(self.steer)
        f = ROOT / "_steer" / f"{self.id}.json"
        if f.exists():
            k.update(json.loads(f.read_text(encoding="utf-8")))
        return k

    # ---------------------------------------------------------------- running
    def run(self, **args: Any) -> Any:
        """run this holon: a native function, a call into the real game through the bridge, or (describe) its BRS card"""
        if self.impl == "native" and self.fn:
            OUT.mkdir(parents=True, exist_ok=True)
            import inspect
            if "knobs" in inspect.signature(self.fn).parameters and "knobs" not in args:
                args = {**args, "knobs": self.knobs()}
            return self.fn(**args)
        if self.impl == "bridge" and self.bridge:
            return call_bridge(self.bridge, args)
        return self.card()

    def card(self) -> dict[str, Any]:
        """the holon as data (what `python fractal.py describe <id>` prints)"""
        d = {k: v for k, v in self.__dict__.items() if k not in ("children", "fn")}
        d["dynamics"] = [f.__dict__ for f in self.dynamics]
        d["children"] = [c.id for c in self.children]
        return d

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


def call_bridge(key: str, args: dict[str, Any]) -> Any:
    """one call into the game's own TypeScript, headless: node runs scripts/fractal/bridge.mjs with the key and the JSON args and prints JSON back"""
    script = REPO / "scripts" / "fractal" / "bridge.mjs"
    if not script.exists():
        return {"error": f"the bridge is not built yet ({script}); this leaf calls the game function '{key}'"}
    p = subprocess.run(["node", str(script), key, json.dumps(args)], cwd=REPO, capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        return {"error": p.stderr.strip()[-2000:]}
    return json.loads(p.stdout)
