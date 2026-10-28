// Compatibility entry point for the shared appended-view importer.
import { prepExtraViews } from './prep-extra-views.mjs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
export const prepGarageViews = prepExtraViews;
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2), at = args.indexOf('--root'), options = at >= 0 ? { root: path.resolve(args.splice(at, 2)[1]) } : {};
  await prepExtraViews(args, options);
}
