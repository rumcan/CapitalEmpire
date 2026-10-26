# Prop shadow audit (T141, #271)

The owner (2026-10-26): "audit each props boxed shadow. the shadows should be tailor made for a top right shadow ... some are not right at
all." House rule: the sun at the upper right, shadows at 145° on screen (to the lower left), a cool multiply that keeps the ground's texture.

**Status: WIP.** The audit sheet works and the before sheets are taken; the review is in progress (problems found so far below); no fix yet.

## The audit sheet (dev only)

- `npm run dev`, then `http://127.0.0.1:<port>/?shadows=audit&cat=<category>&page=<n>` (src/game/dev/shadow-audit.ts). Categories
  (src/game/dev/shadow-audit-items.ts `AUDIT_CATS`): trees, poles, props, golf (the Props tool's catalogue, the course dressing, the course
  pieces' props, the Event tool's structures: T113's course props), range (every piece of a fully built range at each home stage and facing),
  vehicles, walkers (sampled: standing frames, all eight facings), buildings, fences.
- Each sprite in each of its views is drawn three times, one strip each: BOTH shadows, the CONTACT shadow alone (with its footprint in white
  and its anchor in red), the CAST shadow alone; the label gives the id, the contact shape (`o` round, `[]` box, half extents in metres),
  the kind and the scale. Drawn with the game's own GL programs and sprite packing (gl.ts, sprites.ts), so the sheet is what the game draws.
- Options: `&z=0.3` zoom, `&w=1600` width (CSS px), `&per=40` items a page, `&h=3600` page height (device px), `&measure=1` measures every
  picture's opaque base from the atlas alpha (window.__shadowAudit.measure).
- Capture: `node scripts/dev/shadow-audit.mjs --base http://127.0.0.1:5186/ --out <dir> [--cats trees,poles] [--scales 1,2] [--measure]`
  (headless Edge; JPGs `<cat>-<page>-30pct.jpg` at 30% on a 1x screen, `-2x.jpg` at 30% on a 2x screen, 1600 px wide).
- 1,102 entries: trees 63, poles 178, props 401, golf 134, range 63, vehicles 54, walkers 40 (sample), buildings 122, fences 47. Left out:
  the 14 baked lots (they carry their own shadows) and 45 old buildings the game never draws as themselves (newart.ts draws a new-art
  stand-in of their family, which is audited).

## How the shadows work (before T141)

- Contact: `shadow-shape.ts` picks a kind by name regexes in this order: vehicle (`\b(car|van|pickup|bus|compact|truck|wagon|sedan|coupe|cart)\b`),
  roundhouse (gazebo, fountain, merry-go-round), building (kinds house, building, venue, vending, arcade, junglegym, unless the name matches the
  pole words), tree (kind tree or `/tree/` in the name), pole (kind lamp or the pole words: lamp, pole, sign, post, flag, meter, ...), plant
  (kind bush or the round words), else prop (a box from the footprint). Round shapes sit on the anchor, boxes on the footprint's centre.
- The GPU leans every shape toward the cast side by `6 * cast.length` screen px per metre of its half extents (hx + hy), along 145°.
- Cast: each sprite's silhouette sheared at 145° by 0.9 per px of height, standing on its footprint's front edges.

## Problems found so far (before)

### Name rules
- `/tree/` matches "street": `world:streetlamp` (kind lamp; also the range's floodlights), `town:street_sign` and both street-name sign
  sets (`variation:sign-street-names-a/b-*`, 12 sprites) get a tree's canopy pool (0.45 to 0.66 m) instead of a pole's spot. The tree rule is
  checked before the lamp kind.
- The pole words veto the building rule: `town:postoffice` and its variation ("Post Office") and `world:drivein_marquee` (buildings) get a
  0.12 to 0.35 m spot under a whole building.
- `post` matches inside words: `expansion:compost-bin` (3 views) gets a pole spot; `arcade_v2_clutter_poster` (a poster stand, 3) too.
- `bus` / `car` / `cart` / `wagon` as vehicles: `town:bus_stop` (a shelter, 4 views), `ce:parking-entry`, `-exit`, `-kiosk` (4 views),
  `-in-sign` ("Car park ..."), `expansion:carseat-bench` (3), `business:golf-cart-garage` (a garage, 4 views: a 0.88 m round pool under a
  14 m building), the toy car, the pull wagon, the shopping cart: the vehicle's darkest pool (core 0.95, 1.35x the body).
- `world:goalposts` (a pole spot in the middle of two posts and a crossbar).

### Business art: 1 x 1 placeholder boxes
- Every `business:*` sprite (and its views) has a 2 x 2 m placeholder box, so its contact box is 0.9 x 0.9 m whatever its size: the
  clubhouse (1,036 px wide), the cart garage, the halfway pavilion, the coffee kiosk, the pro shop, the motel, the casino ... draw a contact
  shadow hidden under the middle of the building (invisible), and the small ones (the bag trolley at 0.16, the pins) a speck.

### Footprints that are not under the picture
- `golf:grandstand-s`, `golf:leaderboard`, `golf:toilet-block` (and the range's sign, the leaderboard): the NE and SW views' footprints
  reach far to the left of the picture (the box shadow is off-centre by 70 to 340 px at scale 1), the SE and NW views' to the right.

### Trees
- Every capital and generated tree's canopy pool hits the 1.6 m cap (one size for all), about a third of the canopy's width; reasonable for
  a contact pool under the cast shadow. Some trees' pictures reach 30 to 100 px below the anchor (`ref:tree-maple-crimson` 98,
  `ref:tree-spruce-blue` 67, `ref:tree-birch-gold` 49, `world:tree_pine_*` 36 to 48, `world:tree_dead_*` about 30): to check whether the
  pool sits on the trunk's foot.

(To be continued: the props, poles, vehicles, buildings and fences sheets, and the lean.)

## Sheets

Before: `E:/ClaudeTemp/T141/before/` on the dev PC (scratch, not committed), with `items-<cat>-<n>.json` (each page's entries and shapes)
and `measure-<cat>.json` (each picture's measured base).
