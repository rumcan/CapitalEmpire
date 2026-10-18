# Agents

Outside coding agents that help build Capital Empire through pull requests.

- **`arena/INSTRUCTIONS.md`** – the Arena agent: code only (like the in-house Haiku coders), one task per PR, every
  feature built as a standalone module in `src/game/ext/<feature>/` that the lead wires in. Read it first.
- **`arena/PR_TEMPLATE.md`** – the PR body.
- **`tasks/`** – one spec per task (`T001-...md`). A task's `Status:` is `open`, `in progress (<branch>)`,
  `in review (#PR)`, `merged` or `wired in`. The lead writes the specs, reviews the PRs, merges, and does the wiring.

How the lead uses it: pick features that stand on their own (a transit mode, a business type's economics, a
generator), write the task spec with the exact API, let the agent build and test it in isolation, then review the PR
and wire it into the city worker, the engine tools, the renderer and the save.
