// #1304 and #1300 (2026-11-15): the pictures the lead paints through ChatGPT (the bridge, D:/AI/chatgpt-bridge) and where each lands in the game.
// One table for both sides: scripts/assets/chatgpt-queues/build-1304-1300.mjs writes the queues and their guides from it, and
// scripts/assets/prep-1304-1300.mjs imports the finished pictures (D:/AI/chatgpt-bridge/in/<name>-1view-<v>.png, -view1-/-view2-) by it.
// Nothing here is game code: the game's own tables (src/ui/tool-tiles.ts ICON_TILE, src/ui/Emblem.tsx, src/game/golf/second-hand.ts) name the same ids.

/** the bridge's folder (the queues, guides/ and in/) */
export const BRIDGE = 'D:/AI/chatgpt-bridge';

// ---------- #1304: the old 64 px gold icons (src/ui/Icon.tsx) as painted action tiles, three more 4 x 3 sheets of the tile cutter (prep-ui-tool-tiles.mjs)
/** each sheet's tiles, row-major: [tile id, what the tile shows, the Icon names it replaces] */
export const ICON_SHEETS = {
  // the top bar's chips and stats, the cards' headers
  v14: [
    ['rating-leaf', 'one big scarlet-and-orange maple leaf resting on a small mown lawn, a few fallen golden leaves beside it', ['leaf']],
    ['club-house', 'a small white clapboard golf clubhouse with a green shingle roof, a front porch with two rocking chairs and a flagpole', ['house']],
    ['golfers', 'two tiny golfers in 1985 clothes (one in a red sweater, one in a yellow cap) chatting beside a golf bag on a stand', ['people']],
    ['golf-bag', 'a tan leather golf bag on its stand with four club heads and a folded umbrella showing at the top', ['briefcase']],
    ['takings', 'a canvas money bag tied with string, a green banknote poking out, beside a short stack of gold coins on a wooden counter', ['income']],
    ['trophy', 'a gleaming gold two-handled golf trophy cup on a dark wooden plinth', ['trophy']],
    ['calendar', 'a paper desk calendar on a little easel, its page a blank grid with one square ringed in red pencil, a pencil beside it', ['calendar']],
    ['card-deck', 'a fanned hand of five collectible game cards with plain coloured backs (gold, blue, red, green, purple) lying on a small felt mat', ['layers']],
    ['compass', 'an open brass pocket compass lying on a folded blank paper map', ['compass']],
    ['hole-flag', 'a red golf flag on a white pin in the cup of a small putting green, a white ball beside the hole', ['pin']],
    ['buildings', 'a little row of three different 1985 small-town buildings: a red brick shop, a white clapboard house and a tall grey timber barn', ['buildings']],
    ['reputation', 'three gold stars of rising height standing on little wooden posts on a lawn, the right one the tallest', ['chart']],
  ],
  // the buttons: clock, zoom, close, the arrows. Each is ONE chunky painted object shaped like the button's symbol, so it reads at 16 px
  v15: [
    ['pause', 'two thick upright dark-green painted wooden posts side by side, like a pause sign', ['pause']],
    ['play', 'one big green painted wooden triangle pointing to the RIGHT, like a play button, standing upright', ['play']],
    ['fast', 'two green painted wooden triangles pointing to the RIGHT, one just behind the other (fast forward)', ['fast']],
    ['skip', 'a green painted wooden triangle pointing to the RIGHT against a tall upright green bar (skip to the end)', ['skip']],
    ['rewind', 'two green painted wooden triangles pointing to the LEFT, one just behind the other (rewind)', ['rewind']],
    ['forward', 'a thick white painted timber arrow curving round to the RIGHT (turn right), on a short post', ['forward2']],
    ['zoom-in', 'a brass magnifying glass on a little stand with a raised green-painted wooden PLUS shape in front of it', ['zoom-in']],
    ['zoom-out', 'a brass magnifying glass on a little stand with a raised green-painted wooden MINUS shape (one short bar) in front of it', ['zoom-out']],
    ['info', 'a lit brass desk lamp shining on a blank cream index card', ['info']],
    ['close', 'two red-and-white painted wooden planks crossed in a big X, standing upright like a barrier', ['close']],
    ['up', 'one big golden painted wooden arrow pointing straight UP, standing on the slab', ['up']],
    ['down', 'one big golden painted wooden arrow pointing straight DOWN, standing on the slab', ['down']],
  ],
  // the map tools, the road chips, the lock and the shot's wind
  v16: [
    ['left', 'one big golden painted wooden arrow pointing to the LEFT, standing on the slab', ['left']],
    ['right', 'one big golden painted wooden arrow pointing to the RIGHT, standing on the slab', ['right']],
    ['swap', 'two curved painted timber arrows chasing each other round in a circle, one green and one gold, lying on the slab', ['swap']],
    ['road', 'a short stretch of two-lane asphalt road with a dashed white centre line and grass verges', ['road']],
    ['one-way', 'a short stretch of asphalt road with one big white arrow painted on it, every lane the same way', ['oneway']],
    ['sidewalk', 'a grey concrete sidewalk of square slabs with a kerb beside a strip of asphalt and an old iron lamp post', ['sidewalk']],
    ['junction', 'a small crossroads of two asphalt roads with white stop lines and four kerb corners', ['junction']],
    ['bus', 'a cream-and-green 1985 town bus pulled up at a little timber bus shelter', ['bus']],
    ['wooded-road', 'a narrow road running into a dense dark-green pine forest', ['forest']],
    ['locked', 'a heavy closed brass padlock hanging on the latch of a small timber gate', []],
    ['windsock', 'an orange-and-white striped windsock on a white pole, blown out stiffly to the left', []],
    ['new-look', 'an empty round wooden turf-sample tray with a trowel and three blank seed packets beside it', []],
  ],
};
/** Icon names that already have a painted tile of the same meaning (no painting): the Icon swap uses these as they are */
export const ICON_REUSE = { bank: 'bank', gear: 'settings', bulldozer: 'bulldoze', trees: 'trees', tree: 'trees', sun: 'daylight', terrain: 'earthworks', help: 'how-to-play' };

// ---------- #1304: the emblems and the code-drawn pictures, one picture each (transparent PNG)
/** [id, picture (the prompt's subject), where it goes, the output file, its longest side in px, words allowed in it] */
export const SINGLES = [
  { id: 'emblem-mayors-cup', out: 'src/assets/ui/emblems/mayors-cup.webp', size: 256, words: "MAYOR'S CUP",
    where: "the Mayor's Cup: the event card's title (EventCard.tsx), the event pill and your titles (PlayerCard.tsx)",
    subject: "the emblem of a small town's yearly golf event: a gold two-handled cup in front of a dark green shield with a red maple leaf, a cream ribbon banner across the bottom that reads MAYOR'S CUP in dark green serif capitals, a thin gold border. A 1985 small-town crest, painted, not flat vector" },
  { id: 'emblem-club-championship', out: 'src/assets/ui/emblems/club-championship.webp', size: 256, words: 'CLUB CHAMPIONSHIP',
    where: 'the Club Championship: the event card title, the event pill and your titles',
    subject: "the emblem of a golf club's members' championship: two crossed wooden-shafted golf clubs behind a navy shield with a gold golf ball on a tee, a laurel wreath round it, a cream ribbon banner that reads CLUB CHAMPIONSHIP in navy serif capitals. Painted, not flat vector" },
  { id: 'emblem-night-golf', out: 'src/assets/ui/emblems/night-golf.webp', size: 256, words: 'NIGHT GOLF',
    where: 'Night golf: the event card title and the event pill',
    subject: 'a round badge of a night golf event: a deep blue night sky with a pale crescent moon and stars over a dark green with a white flag, a softly glowing golf ball, a gold rim, a ribbon banner that reads NIGHT GOLF in cream capitals. Painted, not flat vector' },
  { id: 'emblem-tour-event', out: 'src/assets/ui/emblems/tour-event.webp', size: 256, words: 'TOUR',
    where: "the tour's tournament: the event panel's header and its pill (App.tsx)",
    subject: 'the emblem of a professional golf tour event of 1985: a gold laurel wreath round a navy disc with a white golf flag and a gold ball, a red ribbon banner across the bottom that reads TOUR in white capitals. Painted, not flat vector' },
  { id: 'emblem-club-crest', out: 'src/assets/ui/emblems/club-crest.webp', size: 256, words: null,
    where: "your club's crest: the top bar's title block (App.tsx, 38 px), in place of the gold maple-leaf line icon",
    subject: "a golf club's crest with NO words: a heater-shaped dark green shield with a thin gold border, a big red-and-orange maple leaf on it and a small white golf flag on a pin crossing the leaf's stem. Painted, not flat vector" },
  { id: 'swing-meter-face', out: 'src/assets/ui/art/swing-meter-face.webp', size: 600, words: null, aspect: '300:178 (a wide half-disc)',
    where: 'the shot panel\'s swing meter (ShotPanel.tsx, 300 x 178 px): drawn under the meter\'s coloured bands, ticks and marker, which the code keeps drawing',
    subject: 'the empty face of a half-circle gauge, seen straight on (not isometric): an upper half-ring of polished brass about one sixth of the radius thick with a smooth dark slate-blue enamel channel along it (EMPTY: no colour bands, no ticks, no numbers, no needle), a small brass hub at the centre of the flat bottom edge, a thin dark walnut base strip along the bottom. Lit from the upper right. The ring\'s outer edge touches the picture\'s left, top and right sides; the flat bottom edge sits a quarter of the way up from the bottom' },
  { id: 'spin-ball', out: 'src/assets/ui/art/spin-ball.webp', size: 272, words: null, aspect: '1:1',
    where: 'the spin box (SpinBall.tsx, a 100 px ball in a 136 px canvas): the ball under the code\'s cross, labels and red strike dot',
    subject: 'one white golf ball seen straight on (not isometric), filling the picture edge to edge as a perfect circle: crisp round dimples all over, soft shading, lit from the upper right with a small highlight there and a cool grey shade toward the lower left. No logo, no markings, no tee, no shadow outside the circle' },
  { id: 'tee-markers', out: 'src/assets/golf/tee-markers.webp', size: 256, words: null,
    where: "the map's tee markers (engine.ts, two coloured balls at each tee): a pair of painted markers (follow-up: the map draw)",
    subject: 'a pair of classic 1985 golf tee markers: two shiny red painted wooden balls the size of grapefruits, each on a short spike, standing a stride apart on nothing (no ground), in the game\'s 2:1 isometric camera, small soft contact shadows toward the lower left' },
];
/** the desert litter sheets (src/game/desert-litter.ts, "Stand In for desert litter"): small transparent pieces on a grid, cut by the importer */
export const LITTER_SHEETS = [
  { id: 'desert-litter-pieces', cols: 4, rows: 3, outDir: 'src/assets/desert-litter',
    where: 'the desert theme\'s litter sprites (desert-litter.ts desertLeafSheet: 48 cells of 40 px; road litter, the ground scatter, the fallen piles)',
    cells: ['a large rounded sandstone pebble', 'a small grey-brown pebble', 'two small pebbles touching with a little grit', 'a soft clump of pale sand',
      'a dry bleached twig with one fork', 'a tuft of dry straw-coloured grass', 'a small round tumbleweed tangle of dry brown stems', 'a chunk of dry brown desert brush',
      'a short tuft of grey-green sage', 'a small scatter of warm sand grains and tiny stones', 'a flat streak of wind-blown pale sand', 'a dry curled brown seed pod'] },
  { id: 'desert-litter-patches', cols: 2, rows: 2, outDir: 'src/assets/desert-litter',
    where: 'the desert theme\'s flat decals (desert-litter.ts: lot decals and map decals: drifts, heaps, grit, brush patches)',
    cells: ['a long low drift of pale sand with wind ripples', 'a low heap of sand and pebbles', 'a loose scatter of grit and small stones', 'a flat patch of dry brown brush and twigs'] },
];

// ---------- #1300: second-hand pictures in place of the shack ones (two views each, from the style picture and a 2:1 guide box)
/** each second-hand building: its id (the painting's), the NEW prop it is the cheaper version of, the shack props it replaces (old saves load as the
 *  new one until the second-hand painting lands, then as it), its size in metres (long front L, depth D, height H) and what it looks like */
export const SECOND_HAND = [
  // queue-shack1300.json: the huts, kiosks, stalls, tents and booths
  { id: 'second-hand-starter-hut', newId: 'newprop:starter-hut', shacks: ['newprop:shanty-hut'], L: 3.5, D: 2.5, H: 2.8, what: "a golf starter's hut: cream-painted weatherboard walls with the paint a little faded, a pale green door and window frames, a small sliding window with a narrow counter, a shallow shingle roof with one patched row of newer shingles, a step of old bricks" },
  { id: 'second-hand-food-kiosk', newId: 'newprop:green-food-kiosk', shacks: ['newprop:shanty-stall'], L: 3, D: 2.5, H: 2.7, what: 'a small food kiosk: green-painted timber walls a few seasons old, a wide serving hatch with a propped flap, a stainless counter with a few scratches, a striped awning faded to soft colours, a menu board left blank' },
  { id: 'second-hand-pro-shop-kiosk', newId: 'newprop:pro-shop-kiosk', shacks: ['newprop:shanty-counter'], L: 3, D: 2, H: 2.6, what: 'a little pro shop kiosk: a timber counter booth painted cream and green, a few years old and well kept, a rack of used clubs and a wire basket of balls on the counter, a small flat roof with a timber fascia' },
  { id: 'second-hand-food-pavilion', newId: 'newprop:food-pavilion', shacks: ['newprop:snack-shack'], L: 5, D: 4, H: 3.2, what: 'a snack pavilion: an older open-sided timber pavilion with a hip roof of weathered cedar shingles, a counter at the back with an urn and a cooler, two folding tables, the paint softened by sun' },
  { id: 'second-hand-garden-shed', newId: 'newprop:garden-shed', shacks: ['newprop:shanty-shed', 'newprop:bait-shack'], L: 3, D: 2.4, H: 2.6, what: 'a timber garden shed: sound board-and-batten walls stained a mellow brown, a ledged door with an old iron latch, one small window, a felt roof with a slightly sun-faded edge' },
  { id: 'second-hand-marquee', newId: 'newprop:marquee', shacks: ['newprop:tarp-shelter'], L: 6, D: 4, H: 3.2, what: 'a hired canvas marquee: cream canvas a little weathered and creased from many events, timber poles and guy ropes, its front side rolled up, two trestle tables inside' },
  { id: 'second-hand-drinks-stand', newId: 'newprop:drinks-stand-with-canopy', shacks: ['newprop:tarp-market-stall'], L: 3, D: 2.5, H: 2.8, what: 'a drinks stand: a timber trestle stall under a clean but faded red-and-white striped canvas canopy, an old enamel cooler, glass bottles in crates' },
  { id: 'second-hand-club-rack-stall', newId: 'newprop:club-rack-stall', shacks: ['newprop:shack-stall'], L: 3, D: 2, H: 2.4, what: 'a used-club stall: a timber market table under a small canvas sunshade, two timber racks of older golf clubs, a barrel of putters, everything neat and cared for' },
  { id: 'second-hand-kiosk', newId: 'newprop:green-kiosk', shacks: ['newprop:tarp-counter'], L: 2.5, D: 2, H: 2.6, what: 'a small green-painted timber kiosk with a pitched roof, its paint a few seasons old, a serving hatch and a little shelf' },
  { id: 'second-hand-medical-tent', newId: 'newprop:medical-tent', shacks: ['newprop:shanty-medical-tent'], L: 4, D: 3, H: 2.8, what: 'a first aid tent: an older white canvas ridge tent, clean, with a red cross on a white panel, the front flaps tied back, a folding camp bed and a first aid box inside' },
  { id: 'second-hand-toilets', newId: 'newprop:portable-toilets', shacks: ['newprop:shanty-toilet'], L: 2.6, D: 1.3, H: 2.4, what: 'two hired portable toilet cabins side by side: moulded plastic in a faded blue, clean and sound, a little scuffed at the base' },
  { id: 'second-hand-ticket-booth', newId: 'newprop:ticket-booth', shacks: ['newprop:shanty-ticket-hut'], L: 2, D: 2, H: 2.6, what: 'a ticket booth: a small square timber booth painted cream with a green trim, a little faded, a ticket window with a brass grille and a small shelf, a pyramid roof' },
  { id: 'second-hand-booth', newId: 'newprop:green-booth', shacks: ['newprop:shanty-booth'], L: 2.5, D: 2, H: 2.5, what: 'an information booth: an older green-painted timber booth with a counter, a folding stool and a blank noticeboard, sound and tidy' },
  { id: 'second-hand-tent-booth', newId: 'newprop:white-tent-booth', shacks: ['newprop:shanty-counter-2'], L: 3, D: 2.5, H: 2.6, what: 'a small hired gazebo booth: a white canvas pop-up roof a little creased, a folding trestle counter with a cloth, two folding chairs' },
  { id: 'second-hand-range-bay', newId: 'newprop:range-bay', shacks: ['newprop:shanty-range-bay'], L: 4, D: 3, H: 3, what: 'a driving-range hitting bay: a timber-framed open bay with a shallow corrugated-steel roof painted green (sound, not rusty), timber side screens, an older green turf mat with a rubber tee and a wire basket of balls' },
  { id: 'second-hand-turnstiles', newId: 'newprop:ticket-booth', shacks: ['newprop:shanty-turnstiles'], L: 3, D: 1, H: 1.6, what: 'a pair of older steel turnstiles painted green, a little chipped, between three short timber fence posts with a rope barrier' },
  // queue-shack1300b.json: the boards, signs, media and vehicles
  { id: 'second-hand-map-board', newId: 'newprop:course-map-board', shacks: ['newprop:shack-map-board'], L: 2, D: 0.4, H: 2, what: 'a course map board: a timber-framed board on two posts with a small roof, its painted course map faded but clear (no words), a little moss at the post feet' },
  { id: 'second-hand-camera-tower', newId: 'newprop:camera-tower', shacks: ['newprop:shanty-camera-tower'], L: 3, D: 3, H: 7, what: 'a TV camera tower: an older galvanised scaffold tower, sound and braced, a timber platform with a rail at the top and a 1985 TV camera on a tripod, a ladder up one side' },
  { id: 'second-hand-broadcast-van', newId: 'newprop:broadcast-truck', shacks: ['newprop:shanty-broadcast-van'], L: 7, D: 2.5, H: 3.2, what: "a TV outside-broadcast truck from the late 1970s: a boxy white truck with a faded blue stripe (no lettering), roof rails, cable drums at the back, clean and well kept" },
  { id: 'second-hand-satellite-van', newId: 'newprop:satellite-van', shacks: ['newprop:shanty-satellite-van'], L: 5.5, D: 2.2, H: 3.2, what: 'a TV satellite van from the late 1970s: a white panel van with a faded red stripe (no lettering), a folded grey dish on the roof, clean and sound' },
  { id: 'second-hand-tv-camera', newId: 'newprop:tv-camera', shacks: ['newprop:shanty-camera'], L: 1.2, D: 1.2, H: 1.8, what: 'an older 1970s studio TV camera on a heavy tripod with a cable reel and a small folding stool beside it' },
  { id: 'second-hand-cart-ambulance', newId: 'newprop:cart-ambulance', shacks: ['newprop:shanty-cart-ambulance'], L: 3, D: 1.4, H: 2, what: 'a golf-cart ambulance: an older white golf cart with a canvas roof, a stretcher frame on the back and a small red cross on a white panel, clean and sound' },
  { id: 'second-hand-weather-mast', newId: 'newprop:weather-station', shacks: ['newprop:shanty-weather-mast'], L: 1.5, D: 1.5, H: 5, what: 'a weather mast: a galvanised pole with a cup anemometer and a wind vane at the top, a small white louvred instrument box on legs at its foot, a few years old and tidy' },
  { id: 'second-hand-leaderboard', newId: 'newprop:leaderboard', shacks: ['newprop:shanty-leaderboard'], L: 3, D: 0.6, H: 2.5, what: 'a small leaderboard: a timber board painted green with a cream frame and rows of blank cream name slats, on two posts, a little weathered' },
  { id: 'second-hand-hole-sign', newId: 'newprop:hole-12-sign', shacks: ['newprop:shanty-hole-sign'], L: 1, D: 0.4, H: 1.4, what: 'a tee sign: a small blank painted timber board on a stout post with a tiny shingle roof, a little weathered' },
  { id: 'second-hand-clock', newId: 'newprop:clock-post', shacks: ['newprop:shanty-clock'], L: 0.6, D: 0.6, H: 3, what: 'a course clock: an older green cast-iron post clock with a round white face (hands and tick marks only, no numbers), a little paint worn at the base' },
  { id: 'second-hand-signpost', newId: 'newprop:direction-signpost', shacks: ['newprop:shanty-signpost'], L: 1, D: 0.6, H: 2.4, what: 'a direction signpost: a timber post with three blank painted pointer boards, the paint a few seasons old' },
  { id: 'second-hand-sale-sign', newId: 'newprop:direction-signpost', shacks: [], L: 1.2, D: 0.3, H: 2, what: "an estate agent's sign for a house lot: a blank white board with a red border on a timber post, a little weathered (no words)" },
  { id: 'second-hand-picnic-seats', newId: 'newprop:picnic-table', shacks: ['newprop:tarp-seating'], L: 3, D: 3, H: 2.4, what: 'two older timber picnic tables with benches under a faded canvas sunshade on a timber pole' },
];
/** the shack scenes of your own range (src/assets/scenes): each repainted as a second-hand place from its upgraded picture's viewpoint */
export const SCENES = [
  { slug: 'range-road', what: 'the driving range seen from the county road as a modest second-hand place: a plain painted roadside sign (no words), a small prefab site hut with off-white fibre-cement panels and a green door as the shop, four older turf mats on a timber deck, a gravel apron. Cared for and decent, not run down: NO shack, no tin, no tarp' },
  { slug: 'pro-shop-inside', what: 'inside a small second-hand pro shop: plain painted plasterboard walls, an older timber counter with a till, a rack of used clubs, a wire basket of balls, a small window. Modest and tidy: NO shack, no tin walls, no oil drums' },
  { slug: 'practice-green', what: 'a small putting green beside a plain prefab site hut, the green a little uneven but mown, one flag, a timber bench. Modest and tidy: NO shack, no tin, no tarp' },
];

/** the queue files (each under ~25 items) */
export const QUEUES = {
  icons1304: 'queue-icons1304.json',
  shack1300: 'queue-shack1300.json', shack1300b: 'queue-shack1300b.json', shack1300c: 'queue-shack1300c.json',
};
/** the bridge's file names for an item (the runner: `${name}-${p2 ? 'view1' : '1view'}-${v}.png`, and `${name}-view2-${v}.png`) */
export const bridgeFiles = (name, v, views = 1) => views === 2 ? [`${name}-view1-${v}.png`, `${name}-view2-${v}.png`] : [`${name}-1view-${v}.png`];
