# Golf Manager 2026: itch.io page (draft for the owner's OK)

(The game was called "Fairway Fortune" until 2026-11-15; this page replaces that draft.)

## Settings
- **Title:** Golf Manager 2026
- **Project URL:** golf-manager-2026 (on the owner's itch account)
- **Short description / tagline:** Pick your spot, open a driving range, build a golf course hole by hole, then walk out and play it from the tee.
- **Classification:** Games · Kind of project: HTML · Release status: Prototype
- **Pricing:** No payments
- **Uploads:**
  - the web zip that `npm run build:jam` writes (index.html at the root; its size is in the release candidate's PR), "This file will be played in the browser"
  - `golf-manager-2026-gdd.pdf` (Game Design Document), downloadable
  - `golf-manager-2026-budget.pdf` (Budget and Production Plan), downloadable
- **Embed options:** Click to launch in fullscreen (the game adapts to any size); "Fullscreen button" on; "Mobile friendly" off (desktop: mouse and keyboard); "Automatically start on page load" off; SharedArrayBuffer not needed.
- **Genre:** Simulation · **Tags:** golf, tycoon, management, building, sports, isometric, pixel-art, economy, singleplayer, financial-literacy
- **AI generation disclosure (itch's field):** Yes: code, graphics. Details: `docs/jam/AI-DISCLOSURE.md` (its last section is the jam form's text).
- **Gameplay video:** the link from the trailer work (`docs/jam/VIDEO.md`), if one is made.
- **Screenshots:** to be retaken from the release candidate (the start, the range, a built hole, the golf view at the tee, the putting grid, night, practice). **Cover image:** 630 x 500.
- **Visibility:** Public (the jam requires a page judges can open), published just before submitting.

## Description (the page body)

**Golf Manager 2026: build the club. Play the course.**

Start with an empty valley and $75,000. **Pick your spot** and drop your driving range: the land, the road, your home and an old range with a dirt car park and an outfield full of junk. Golfers start rolling in, buying buckets and hitting balls, and a little town grows across the road.

**Build your course, your way**
- **New hole:** click a tee, click a green, hit BUILD NOW. Every green gets natural contours.
- **Shape it by hand:** paint fairways, greens, bunkers and water; repaint the ground with the Texture Painter; plant trees and flower beds; place props.
- **Real courses:** import a real golf course and play it.
- **Grow the range:** clear the junk, upgrade the ball room, paint the outfield, set the bucket price, and watch golfers walk your paths.
- **A picture on every button:** a Build menu of painted cards, each with its price and when it pays for itself.

**Then play it from the tee**
- Hold to swing, **tap to boost** the power, and **spin the ball in the air** with the arrow keys.
- **Shape your shots:** draw, fade, high or low.
- **Read the green** on a slope grid coloured like a heat map, with dots that run downhill.
- Play in **daylight, golden hour, dusk or at night.**
- Cliffs and rocks beside the holes: hit into them and take your drop.
- **Practise on your own range:** after every ball a launch-monitor readout (carry, speeds, spin, a tip), and six drills that unlock skills and cut your handicap.

**Run the money**
Your takings pay for every hole. Click your cash for the Bank: borrow (the payment and the total interest shown before you sign), repay early, or save. Each month ends with a statement of what came in, what went out and what your club is worth.

**And a radio:** eleven free tunes, from bossa nova to chiptune, in the top bar.

### Controls
- **Builder:** the mouse. Tool rail on the left, cards on the right; click to place, **R** to turn, the wheel to zoom, drag to pan. Click your cash for the Bank. "Pick a spot for me" places your range for you.
- **Golf view:** hold the swing button (or **Space**) and let go; **tap Up** while holding to boost; **arrows** spin the ball in flight; click the ground to aim; **1-9** or the wheel for clubs; **Esc** back to the course.
- **Settings (the gear):** Exit to main menu (your game is saved; Continue brings you back), text size, US dollars or UAE dirhams, music.
- Tip: the speed buttons at the top run time faster while your range earns.

### Made for Zoud GameLab, "Make FinLit Fun"
No quizzes and no lectures. You learn the money by running a club: pricing against demand, whether an upgrade pays for itself, saving versus borrowing with a loan's real cost shown up front, and a monthly statement that keeps profit, cash and net worth apart. The design document has the details.

### Documents
- Game Design Document (PDF): attached below
- Budget and Production Plan (PDF): attached below

### Credits and AI use
Made by **Francois Smit** (South Africa), solo creator, with AI coding and art tools under his direction (disclosed in full in the jam submission).

**Sound:** every sound effect is synthesized in the game's own code. The radio plays eleven free CC0 tracks from OpenGameArt.org: "Bossa Town" and "Seaside Village" by KarateStudios; "All into Harmony" and "Sunny Side Up 2" by Pro Sensory (Alex McCulloch); "Blue Intermission" and "Two Left Socks" by congusbongus; and five chiptunes ("Title Screen", "Level 1" to "Level 3", "Ending") by Juhani Junkala (SubspaceAudio). Details in docs/jam/AUDIO-CREDITS.md.

**Map data:** real courses © OpenStreetMap contributors (ODbL 1.0). Real-course ground height: USGS 3DEP, GMTED2010 and SRTM data, courtesy of the U.S. Geological Survey.

## Jam submission form (itch.io/jam/zoud-gamelab)
- Team: Francois Smit (solo), South Africa
- FinLit theme description: "Golf Manager 2026 teaches money through running a golf club you build and play: pricing and demand, payback on investments, saving versus borrowing with the total cost of a loan shown before signing, and monthly statements that separate profit, cash and net worth. The player learns by consequences, not lessons."
- AI use (judges only): the text in `docs/jam/AI-DISCLOSURE.md`, section "For the jam form".
- Links: GDD PDF and budget PDF (the itch downloads, public), video link if any.
