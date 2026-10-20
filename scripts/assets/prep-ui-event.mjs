// Cuts the stadium picture for the event card out of the owner's mockup (docs/ui/mockup-road-panel.webp; the game has no stadium
// art yet, only its placeholder) into src/assets/ui/art/stadium.webp.
// Run: node scripts/assets/prep-ui-event.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('src/assets/ui/art', { recursive: true });
await sharp('docs/ui/mockup-road-panel.webp').extract({ left: 1468, top: 100, width: 192, height: 128 }).webp({ quality: 88 }).toFile('src/assets/ui/art/stadium.webp');
