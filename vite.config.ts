import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import net from "net";
import { fileURLToPath, pathToFileURL } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { ALLOC_PATH, checkDevRequest, checkDevSave, devSavePath, LEARN_PATH, mergeAllocations, mergePresets, mergeSamples, MODELS_DIR, shipPlan } from "./src/game/dev/dev-save";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** writes a file whole and atomically: a temp file next to it, then a rename, so the watcher sees the old text or the new, never half. Windows
 *  refuses the rename while another process (the watcher, an editor, a virus scan) has the file open, so it tries again for up to 2 s. done gets
 *  the error, or null */
function writeAtomic(file: string, text: string, done: (err: unknown) => void): void {
  const tmp = `${file}.${process.pid}-${Date.now()}.tmp`;
  try { fs.writeFileSync(tmp, text, "utf8"); } catch (e) { return done(e); }
  const swap = (left: number): void => {
    try { fs.renameSync(tmp, file); } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (left > 0 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) { setTimeout(() => swap(left - 1), 100); return; }
      try { fs.unlinkSync(tmp); } catch { /* gone */ }
      return done(e);
    }
    done(null);
  };
  swap(20);
}

// the build stamp (P07 decision 5, T044): every save records the package version and the git sha that wrote it (informational only)
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };
let sha = "dev";
try { sha = execSync("git rev-parse --short HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev"; } catch { /* no git (a source archive): dev */ }

/** The in-game dev editor's save (P20 / T071), in the dev server only (apply 'serve': never in a build). POST /__dev/save { file, json } writes
 *  one of the whitelisted files (src/game/dev/dev-save.ts: lot-presets.json, scale-overrides.json, removed.json) whole and atomically (a temp
 *  file, then a rename), so the watcher hot-reloads the JSON once, complete; GET /__dev/load?file= reads one back. POST /__dev/presets { upsert,
 *  remove } merges the lot presets per preset into lot-presets.json (mergePresets: one request at a time, each reading the file the last wrote),
 *  so two people's saves never overwrite each other; POST /__dev/allocations { upsert } merges the house allocations per house (T155); POST /__dev/learning { add } appends the lot wizard's samples (T158). Only the dev server's own pages may (dev-save.ts checkDevRequest: Origin, Sec-Fetch-Site,
 *  application/json); anything else is refused */
function devSave(): Plugin {
  return {
    name: "capitalempire-dev-save",
    apply: "serve",
    configureServer(server) {
      const reply = (res: import("http").ServerResponse, code: number, body: unknown) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(body)); };
      // only the dev server's own pages: another site's page (Origin, Sec-Fetch-Site) is refused, and a save must be application/json
      const foreign = (req: import("http").IncomingMessage) => {
        const h = (k: string) => { const v = req.headers[k]; return Array.isArray(v) ? v[0] : v; };
        return checkDevRequest({ method: req.method ?? "", host: h("host"), origin: h("origin"), secFetchSite: h("sec-fetch-site"), contentType: h("content-type") });
      };
      // the game's Studio button: starts the sprite studio (5191, this checkout, the launch config's settings) when it is not running, then opens it
      server.middlewares.use("/__dev/studio", async (req, res) => {
        if (req.headers["sec-fetch-site"] === "cross-site") return reply(res, 403, { error: "cross-site" });
        const open = () => new Promise<boolean>(ok => { const s = net.connect(5191, "127.0.0.1"); s.once("connect", () => { s.end(); ok(true); }); s.once("error", () => ok(false)); });
        if (!(await open())) {
          const log = fs.openSync(path.resolve("output/studio.log"), "a");
          const env = { ...process.env, STUDIO_HOST: "::", STUDIO_DEV_GAME: "1", STUDIO_GAME_URL: `http://localhost:${server.config.server.port ?? 5174}`, VIPS_CONCURRENCY: "1", TOT_REPO: process.env.TOT_REPO ?? path.resolve("../TrickOrTreat") };
          spawn(process.execPath, ["scripts/assets/review/server.mjs", "--port", "5191"], { cwd: process.cwd(), env, detached: true, stdio: ["ignore", log, log] }).unref();
          for (let i = 0; i < 60 && !(await open()); i++) await new Promise(r => setTimeout(r, 500));
        }
        res.statusCode = 302; res.setHeader("Location", `http://${(req.headers.host ?? "localhost").replace(/:\d+$/, "")}:5191/`); res.end();
      });
      server.middlewares.use("/__dev/load", (req, res) => {
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        const rel = devSavePath(new URL(req.url ?? "", "http://x").searchParams.get("file"));
        if (req.method !== "GET" || !rel) return reply(res, 403, { error: "not a dev file" });
        try { res.setHeader("Content-Type", "application/json"); res.end(fs.readFileSync(path.join(__dirname, rel), "utf8")); } catch { reply(res, 404, { error: "missing" }); }
      });
      server.middlewares.use("/__dev/save", (req, res) => {
        if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => { raw += c; if (raw.length > 40 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          let body: unknown;
          try { body = JSON.parse(raw); } catch { return reply(res, 400, { error: "the body is not JSON" }); }
          const c = checkDevSave(body);
          if (!c.ok) return reply(res, 403, { error: c.error });
          writeAtomic(path.join(__dirname, c.path), c.text, e => (e ? reply(res, 500, { error: String(e) }) : reply(res, 200, { ok: true, path: c.path, bytes: Buffer.byteLength(c.text) })));
        });
      });
      // the lot presets' merge: one request at a time (a promise chain), each reading the file the one before it wrote
      let presets: Promise<void> = Promise.resolve();
      server.middlewares.use("/__dev/presets", (req, res) => {
        if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => { raw += c; if (raw.length > 40 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          let body: unknown;
          try { body = JSON.parse(raw); } catch { return reply(res, 400, { error: "the body is not JSON" }); }
          const { upsert, remove } = (typeof body === "object" && body !== null ? body : {}) as { upsert?: unknown; remove?: unknown };
          presets = presets.then(() => new Promise<void>(done => {
            const file = path.join(__dirname, devSavePath("lot-presets.json")!);
            let text: string;
            try { text = fs.readFileSync(file, "utf8"); } catch (e) { reply(res, 500, { error: String(e) }); return done(); }
            const m = mergePresets(text, upsert, remove);
            if (!m.ok) { reply(res, 403, { error: m.error }); return done(); }
            writeAtomic(file, m.text, e => { if (e) reply(res, 500, { error: String(e) }); else reply(res, 200, { ok: true, count: m.count }); done(); });
          })).catch(e => { if (!res.headersSent) reply(res, 500, { error: String(e) }); });
        });
      });
      // the lot wizard's samples (T158): appended by sample id, one request at a time; GET reads the file back
      let learning: Promise<void> = Promise.resolve();
      server.middlewares.use("/__dev/learning", (req, res) => {
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        const file = path.join(__dirname, LEARN_PATH);
        if (req.method === "GET") { try { res.setHeader("Content-Type", "application/json"); res.end(fs.readFileSync(file, "utf8")); } catch { reply(res, 404, { error: "missing" }); } return; }
        if (req.method !== "POST") return reply(res, 405, { error: "GET or POST only" });
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => { raw += c; if (raw.length > 8 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          let body: unknown;
          try { body = JSON.parse(raw); } catch { return reply(res, 400, { error: "the body is not JSON" }); }
          const { add } = (typeof body === "object" && body !== null ? body : {}) as { add?: unknown };
          learning = learning.then(() => new Promise<void>(done => {
            let text = "";
            try { text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; } catch (e) { reply(res, 500, { error: String(e) }); return done(); }
            const m = mergeSamples(text, add);
            if (!m.ok) { reply(res, 403, { error: m.error }); return done(); }
            writeAtomic(file, m.text, e => { if (e) reply(res, 500, { error: String(e) }); else reply(res, 200, { ok: true, count: m.count }); done(); });
          })).catch(e => { if (!res.headersSent) reply(res, 500, { error: String(e) }); });
        });
      });
      // the lot lab's Ship model (T160): the model posted becomes the next version, v<N>.json beside the others, and the index is written again;
      // one request at a time (two people shipping at once get two versions, never one lost)
      let shipping: Promise<void> = Promise.resolve();
      server.middlewares.use("/__dev/lot-model", (req, res) => {
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
        let raw = "";
        req.setEncoding("utf8");
        // (T173: the exam picture rides along, a JPEG of a few MB)
        req.on("data", (c: string) => { raw += c; if (raw.length > 16 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          let body: { data?: unknown; from?: unknown; exam?: unknown };
          try { body = JSON.parse(raw) as { data?: unknown; from?: unknown; exam?: unknown }; } catch { return reply(res, 400, { error: "the body is not JSON" }); }
          shipping = shipping.then(() => new Promise<void>(done => {
            const dir = path.join(__dirname, MODELS_DIR);
            const have = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => /^v(\d+)\.json$/.exec(f)).filter((m): m is RegExpExecArray => !!m).map(m => +m[1]!) : [];
            // T173: the plan (dev-save.ts shipPlan): the exam picture, the model, the index, written in that order (the index last: a half ship never shows)
            const plan = shipPlan(have, body.data, typeof body.from === "string" ? body.from.slice(0, 300) : "shipped from the lot lab", body.exam);
            if (!plan) { reply(res, 403, { error: "not a lot model ({ counts: { class|kind|sector: [offered, kept] } }) or its exam not a JPEG" }); return done(); }
            fs.mkdirSync(dir, { recursive: true });
            const write = (k: number): void => {
              const f = plan.files[k];
              if (!f) { reply(res, 200, { ok: true, version: plan.version }); return done(); }
              const next = (e: unknown) => { if (e) { reply(res, 500, { error: String(e) }); return done(); } write(k + 1); };
              if (typeof f.content === "string") writeAtomic(path.join(dir, f.name), f.content, next);
              else fs.writeFile(path.join(dir, f.name), f.content, next);
            };
            write(0);
          })).catch(e => { if (!res.headersSent) reply(res, 500, { error: String(e) }); });
        });
      });
      // the house allocations' merge (T155): per house, one request at a time, as the presets'; GET reads the file back
      let allocs: Promise<void> = Promise.resolve();
      server.middlewares.use("/__dev/allocations", (req, res) => {
        const no = foreign(req); if (no) return reply(res, 403, { error: no });
        const file = path.join(__dirname, ALLOC_PATH);
        if (req.method === "GET") { try { res.setHeader("Content-Type", "application/json"); res.end(fs.readFileSync(file, "utf8")); } catch { reply(res, 404, { error: "missing" }); } return; }
        if (req.method !== "POST") return reply(res, 405, { error: "GET or POST only" });
        let raw = "";
        req.setEncoding("utf8");
        req.on("data", (c: string) => { raw += c; if (raw.length > 4 * 1024 * 1024) req.destroy(); });
        req.on("end", () => {
          let body: unknown;
          try { body = JSON.parse(raw); } catch { return reply(res, 400, { error: "the body is not JSON" }); }
          const { upsert } = (typeof body === "object" && body !== null ? body : {}) as { upsert?: unknown };
          allocs = allocs.then(() => new Promise<void>(done => {
            let text = "";
            try { text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; } catch (e) { reply(res, 500, { error: String(e) }); return done(); }
            const m = mergeAllocations(text, upsert);
            if (!m.ok) { reply(res, 403, { error: m.error }); return done(); }
            writeAtomic(file, m.text, e => { if (e) reply(res, 500, { error: String(e) }); else reply(res, 200, { ok: true, count: m.count }); done(); });
          })).catch(e => { if (!res.headersSent) reply(res, 500, { error: String(e) }); });
        });
      });
    },
  };
}

/** T080: the atlas pages as KTX2 (Basis UASTC) next to their WebP in the production build, for atlas-ktx2.ts to transcode to BC7 / ASTC / ETC2 at
 *  load: every atlas page level (library.ts ATLAS_PAGES) the bundle emits gets a sibling with the same name and a .ktx2 extension. The encoding
 *  is cached by the WebP's sha256 (scripts/assets/atlas-ktx2.mjs: shared by the clone's worktrees, so only a changed page encodes again). If it
 *  fails the build goes on without them and the game uses the WebP pages. ATLAS_KTX2=0 turns it off. */
const KTX2_ON = process.env.ATLAS_KTX2 !== "0";
function atlasKtx2(): Plugin {
  interface Ktx2Script {
    atlasPageSources(root: string): Promise<string[][]>;
    encodeAtlasPages(items: { key: string; source: Buffer }[], o?: { log?: (m: string) => void }): Promise<Map<string, Buffer>>;
  }
  let script: Ktx2Script | null = null, sources = new Set<string>();
  const rel = (file: string) => path.relative(__dirname, file).split("\\").join("/");
  return {
    name: "capitalempire-atlas-ktx2",
    apply: "build",
    // a page level small enough to inline (a sparse page's 128 px mip) would become a data: URL with no file to sit beside: never inline them
    config: () => ({ build: { assetsInlineLimit: (file: string) => (sources.has(rel(file)) ? false : undefined) } }),
    async buildStart() {
      if (!KTX2_ON) return;
      const t0 = Date.now();
      // the real file (a dynamic import Vite does not bundle into the config), so its worker threads and cache paths resolve from scripts/assets
      script = (await import(pathToFileURL(path.join(__dirname, "scripts/assets/atlas-ktx2.mjs")).href)) as Ktx2Script;
      sources = new Set((await script.atlasPageSources(__dirname)).flat());
      console.log(`atlas KTX2: ${sources.size} page levels listed in ${Date.now() - t0} ms`);
    },
    async generateBundle(_out, bundle) {
      if (!script) return;
      const t0 = Date.now(), items: { key: string; source: Buffer }[] = [];
      for (const a of Object.values(bundle)) {
        if (a.type !== "asset" || !a.fileName.endsWith(".webp")) continue;
        if ((a.originalFileNames ?? []).some(n => sources.has(n.split("\\").join("/")))) items.push({ key: a.fileName, source: Buffer.from(a.source as Uint8Array) });
      }
      if (items.length !== sources.size) this.warn(`atlas KTX2: ${items.length} of the ${sources.size} page levels found in the bundle`);
      try {
        const out = await script.encodeAtlasPages(items, { log: (m: string) => console.log(m) });
        for (const [fileName, source] of out) this.emitFile({ type: "asset", fileName: fileName.replace(/\.webp$/, ".ktx2"), source });
        console.log(`atlas KTX2: ${out.size} files in ${Date.now() - t0} ms`);
      } catch (e) { this.warn(`atlas KTX2 skipped, the game will use the WebP pages: ${String(e)}`); }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), devSave(), atlasKtx2()],
  // the KTX2 atlas pages exist in a production build only: the dev server always shows the WebP pages, fresh as the art is edited
  define: { __ATLAS_KTX2__: JSON.stringify(command === "build" && KTX2_ON), __BUILD__: JSON.stringify({ app: pkg.version, sha }) },
  // T080: the build is index.html plus hashed files next to it (dist/assets: the code, the workers, every atlas, view and ground picture), not one
  // inlined file: the single-file build had grown to 324 MB, took 4-11 minutes and ran out of memory. './' keeps every URL relative to the page, so
  // dist/ works from any folder of any static server (vite preview, a plain server, a sub-path such as GitHub Pages); the workers are files too
  // (?worker, not ?worker&inline: a blob worker cannot resolve the relative URLs of the pictures it fetches)
  base: "./",
  build: { reportCompressedSize: false },
  // output/ holds benchmark screenshots and a browser profile whose locked files crash the watcher
  server: { watch: { ignored: ['**/output/**', '**/ref/**', '**/dist/**'] } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
}));
