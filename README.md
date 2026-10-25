# Capital Empire

A road-building traffic game played in event rounds: connect the surrounding towns to each event through your toll
gate, then keep the surge flowing live. The design and the phases are in
[docs/GAME-PLAN.md](docs/GAME-PLAN.md).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173/. Add `?bench` for the 4 km benchmark city (`?bench=0.25` builds a quarter of it).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build in `dist/`: `index.html` plus hashed code and picture files in `dist/assets/` (serve the folder with `npx vite preview` or any static server; opening `index.html` from disk does not work) |
| `npm test` | Headless tests (road network, incremental rebuilds, worker replay, saves) |
| `npm run typecheck` | TypeScript check |
| `npm run assets:ground` | Rebuild `src/assets/ground/` and `src/game/ground-art.ts` from the town builder's ground art |
| `npm run assets:sprites` | Rebuild the sprite atlas (`src/assets/atlas/`) and `src/game/library.ts` |
| `node scripts/perf/bench.mjs [--size 1] [--dpr 1] [--shots]` | Runs the benchmark in headless Edge on the real GPU; results and screenshots in `output/bench/` |

The asset scripts read from a TrickOrTreat checkout next to this repo (`TOT_REPO` overrides the path) and fall back to
GitHub. They only read from it.

## How it fits together

- `src/game/network.ts`: the road network. Edits rebuild only the touched nodes and the routes through them; ground
  features live in a spatial grid, and road litter is generated lazily (LRU cached).
- `src/game/netops.ts`: every network edit is recorded as an op and replayed by the ground workers, so their networks
  match the main thread's exactly.
- `src/game/ground.worker.ts`, `renderer.ts`, `textures.ts`: the ground painter (roads, curbs, slabs, markings, lamp
  pools, litter) runs in workers on OffscreenCanvas. One worker builds the procedural textures (or loads them from
  an IndexedDB cache) and shares them with the others.
- `src/game/ground-cache.ts`: which chunks are baked, stale or wanted. Three kinds: full chunks up close, 4x4 district
  chunks without fine detail further out, and planner chunks for the whole-map view. A stale chunk keeps its old
  picture until the new one arrives; a new road is revealed by the build animation, with no rebuild step.
- `src/game/gl.ts`, `sprites.ts`: WebGL2. Sprites come from one texture-array atlas (mips 0.6x to 0.0375x of native).
  Each draw tile keeps its own painter's order; instances carry their tile's rectangle and the shader clips to it,
  so a whole frame of sprites is one instanced draw. Moving cars are merged into each tile's order.
- `src/game/traffic.ts`: placeholder test traffic for the benchmark (the real simulation is Phase 2).
- `src/game/save.ts`: saves are gzip-compressed in IndexedDB; v2 saves from the 160-tile map are moved into the centre.
