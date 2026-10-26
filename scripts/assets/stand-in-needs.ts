// The scale each new-art building must be packed at for the old buildings drawn as it (src/game/newart.ts standInNeeds: a building of the art
// inventory without its four views is drawn as the new-art building of its family nearest its size, filling its footprint), for prep-views.mjs:
// it bundles this with esbuild (the game's own libraries and sizes, the atlas pictures left out) and runs it in a child process. Prints one JSON
// object: id -> scale (only the stand-ins some building needs).
import { standInNeeds } from '../../src/game/newart';

process.stdout.write(JSON.stringify(standInNeeds()));
