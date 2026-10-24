import path from "path";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// the build stamp (T044): every save records the package version and the git sha that wrote it
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };
let sha = "dev";
try { sha = execSync("git rev-parse --short HEAD", { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev"; } catch { /* no git (a source archive): dev */ }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { __BUILD__: JSON.stringify({ app: pkg.version, sha }) },
  // output/ holds benchmark screenshots and a browser profile whose locked files crash the watcher
  server: { watch: { ignored: ['**/output/**', '**/ref/**', '**/dist/**'] } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
