// Compatibility entry point for the shared appended-view importer.
import { prepExtraViews } from './prep-extra-views.mjs';
import { pathToFileURL } from 'node:url';
export const prepGarageViews = prepExtraViews;
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await prepExtraViews(process.argv.slice(2));
