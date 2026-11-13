# Playing from behind the golfer: the player's guide

Written 2026-11-13 (T440, docs/CINDERLINKS-PORT.md). What the player needs to know about the view from behind the golfer inside CapitalEmpire.
The same points are in the view's own help: press **H** there.

## Opening it

- On the map, open a hole's card (click the hole) and press **Play this hole**. The view opens full screen on that hole's tee.
  If the button is grey, the line under it says why (no tee, no green, the hole cannot be played yet).
- **Esc** (or the ✕ at the top right) brings you back to the map. The game was paused while you played and runs on at the speed it had.
- Which round you play depends on what is going on:
  - **Your own round on a tournament day**, if your group is out and you have not handed over to the caddie. The view plays on that very round: your group, the field, the carts, the leaderboard. Each stroke counts in the day.
  - **A money match** you started with someone on the course. The view plays on that match. When it ends, the stake is settled in the game as it would be on the map.
  - **Otherwise, a practice hole**: free, not recorded.
- **Play a shared course…** on the hole card opens a course file someone shared (see below) and plays it with your own golfer.

## The keys

| Key | What it does |
|---|---|
| W S | walk forward, back (Shift: run) |
| A D | turn; Q E step sideways |
| mouse | aim, beside the ball; a click on the course sets the aim and holds it, so the mouse can go to the swing button (a click never swings) |
| swing button (bottom centre), or Space | hold it: the camera lines up behind the ball along your aim, then the distance fills (to 100% and back again, the landing marker growing with it); let go to hit at that distance. How straight it goes is your golfer's skill, not your timing |
| Shift (while holding) | the power boost, if your cards give it |
| Z, X | the shot's shape (draw or fade, high or low), when you have earned them |
| I | the boost pick, when you have earned it |
| 1 to 9, the wheel | your clubs (the tabs show each club's real carry) |
| J | jump to your ball |
| Y | take a gimme, where the round's rule allows one (never in a money match) |
| G | the golf cart: in and out (W S go and brake, A D steer) |
| middle drag | look around; wheel nearer or farther; R F raise or lower the camera |
| C | the camera behind the hole |
| U | show or hide the panels; P the picture's scale |
| H | the help |
| Settings (the button at the top) | the biome and course type, the picture, the render distance (and, outside your game, the golfer) |
| Esc | back to the map |

Some keys belong to the view on its own and do nothing in your game: B (drop a ball), N (new land), K and L (real courses), M and V (the
biome and course type).

## What carries over, and what does not

**Every shot is decided by the game, not by the view.** The view shows the swing and sends the game your club, aim, power and strike. The
game's golf model plays the stroke, the same model that plays the top view. So what you have built up counts here exactly as it does there:

- **Your skills**: driving, irons, wedges, putting, power, accuracy, touch, and the pressure on your nerve.
- **Your clubs**: the 14 in your bag, each at its upgrade level, and your putter's fitting. The club tabs show the carries after all of it.
- **Your cards**: their modifiers on every stat, and the mechanics they give (the power boost, spin added in the air).
- **Your unlocks**: the shot shapes and spins you have earned. A pick you have not earned is not offered.
- **The lie, the slope and the wind**: the same lie and slope the model reads (the view colours the grass by it), and the wind as it is now.
- **The rules**: the round's gimme rule; in a money match no mulligans and no gimmies.

**What does not carry over:**

- **The fine detail of the land is grown, not copied.** Each blade of grass, each tree, rock and flower in the view is grown from a seed taken from your course's name. The same course always looks the same, but it is not a copy of what you planted on the map: your planted trees stand where you put them, the rest is the view's own.
- **The shapes are smoothed.** The greens, fairways, bunkers and water come from what you painted, traced and rounded off, and the ground's height from your course's heights. Small steps in your paint will look smoother here.
- **Paths and buildings** are drawn as simple shapes: a path's surface, a building's box and roof, tents as striped marquees, grandstands as rows of seats.
- **The view's own ball flight is not used** while you play your game: the ball flies, bounces and rolls where the game says.

## Other people

- On a tournament day your group plays with you, in golf's order: the one farthest from the pin first, and on the tee the honour (the lowest score on the hole before). Their shots are shown as they play, and their balls lie where they come to rest (a marker on the green).
- Caddies walk beside the pros and tend the flag for a long putt. Carts keep to the cart paths and park by the greens.
- The rest of the field is out on the course too: near groups in full, far ones as small figures. The leaderboard card shows the leaders and you. When your group waits on the group ahead, the view says so.
- On a tournament day the galleries stand round the tees and greens and sit in the grandstands. They cheer a holed putt and groan at a short miss.

## Ghost rounds

A ghost is a round you played, kept as a small file that anyone can race.

- After playing a hole, press **Save ghost** (top right in the view). Your browser downloads a file such as `ghost-hole-3.json`.
- To race one, open the same hole and press **Ghost…**, then pick the file. The hole starts again. The ghost's golfer plays beside you, see-through, and his ball flies and rolls see-through too; neither gets in your way.
- A ghost only plays on the course it was played on. The file knows which course that is, and a ghost from another course is refused with the reason.
- The ghost file holds only the shots' inputs (club, aim, power, strike, conditions), so it replays exactly the same round on any machine.

## Shared courses

- In the view, press **Share course**. Your browser downloads your course as a file such as `my-club.course.json`: its shapes, heights, paths and buildings, its biome and its look.
- Send the file to a friend. On their hole card they press **Play a shared course…** and pick it. They play your course with their own golfer: their skills, their clubs and their cards.
- A file that has been changed since it was made is refused, and so is a file that is not a course.
- There is no server yet: sharing is by file only.

## Fair play between different golfers

Friends bring different golfers. For a ghost race or a shared course, choose the kit with the **Own kit / Level kit** button in the view
(the hole starts again with it):

- **Own kit**: everyone plays with their own skills, clubs and cards. The board shows the strokes as played and the **net** score: your strokes less your handicap's share of the holes played (the handicap is the one on your player card). A ghost saved in own kit carries its handicap with it.
- **Level kit**: everyone plays the same middling golfer with the standard bag and no cards. The board shows the strokes as played, and the best golf wins.
- A ghost brings the kit it was played with: racing it switches you to the same kit.
- **No stakes**: ghost races and shared courses never move money. Money is only played for in a money match.

## Not yet

- Live play with friends over the network (T435) needs a server and is not built.
- Boards and screens at tournaments are drawn as plain boxes.
