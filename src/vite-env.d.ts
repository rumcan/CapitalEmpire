/// <reference types="vite/client" />
/** T080: the production build ships the atlas pages as KTX2 next to their WebP (vite.config.ts atlasKtx2) */
declare const __ATLAS_KTX2__: boolean;
/** the build stamp (vite.config.ts define; T044): the package version and the git sha, undefined under the node tests */
declare const __BUILD__: { app: string; sha: string } | undefined;
