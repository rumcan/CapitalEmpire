import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { checkDevRequest, checkDevSave, devSavePath } from "./src/game/dev/dev-save";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** The in-game dev editor's save (P20 / T071), in the dev server only (apply 'serve': never in a build). POST /__dev/save { file, json } writes
 *  one of the whitelisted files (src/game/dev/dev-save.ts: lot-presets.json, scale-overrides.json, removed.json) whole and atomically (a temp
 *  file, then a rename), so the watcher hot-reloads the JSON once, complete; GET /__dev/load?file= reads one back. Only the dev server's own
 *  pages may (dev-save.ts checkDevRequest: Origin, Sec-Fetch-Site, application/json); anything else is refused */
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
          const file = path.join(__dirname, c.path), tmp = `${file}.${process.pid}-${Date.now()}.tmp`;
          try { fs.writeFileSync(tmp, c.text, "utf8"); } catch (e) { return reply(res, 500, { error: String(e) }); }
          // Windows refuses the rename while another process (the watcher, an editor, a virus scan) has the file open: try again for up to 2 s
          const swap = (left: number) => {
            try { fs.renameSync(tmp, file); reply(res, 200, { ok: true, path: c.path, bytes: Buffer.byteLength(c.text) }); }
            catch (e) {
              const code = (e as NodeJS.ErrnoException).code;
              if (left > 0 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) { setTimeout(() => swap(left - 1), 100); return; }
              try { fs.unlinkSync(tmp); } catch { /* gone */ }
              reply(res, 500, { error: String(e) });
            }
          };
          swap(20);
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), devSave()],
  // output/ holds benchmark screenshots and a browser profile whose locked files crash the watcher
  server: { watch: { ignored: ['**/output/**', '**/ref/**', '**/dist/**'] } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
