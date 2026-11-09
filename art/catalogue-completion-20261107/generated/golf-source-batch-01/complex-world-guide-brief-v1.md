# Four complex golf source-art guides

These are proposed technical geometry references, never final sprites or accepted runtime calibration. Use their fixed feature layout and camera alongside the native identity/style references. The existing event placement plots are exact constraints; internal component dimensions are design proposals. No native source image was changed.

| Job | Exact plot | Fixed identity |
|---|---|---|
| [TV camera tower](native/golf-source-01-02-tv-camera-tower/guides/) |2x2m| Platform z4m; camera aims front-Y; ladder on front-Y near right+X; case rear-right+X/+Y. Do not relocate an occluded case/ladder to make it visible. |
| [Main leaderboard](native/golf-source-01-09-main-leaderboard/guides/) |8x4m| Grid front-Y; rear slats/braces+Y; service deck-Y; exactly one staircase+X. Three-part rain cap and two fixed green flags. The right-hand stair changes apparent screen end when the model is viewed from behind. |
| [Four-lane entrance](native/golf-source-01-06-four-lane-entrance/guides/) |12x6m| Exactly three manual turnstile lanes, then the wider accessible swing gate at+X; hinge fixed at the gate's left edge. Plain overhead sign frame, no concrete slab or terrain. Only separate hardware feet. The brief does not require the earlier native sheet's roof/shed sidewalls. |
| [Broadcast compound](native/golf-source-01-03-broadcast-compound/guides/) |30x20m| Truck left-X, uplink van rear-right+X/+Y; both cabs nose-Y. One roof dish with fixed aim, generator front-right, bench/reel fixed, central front service gap open. Two period support vehicles, not a garage. No ground slab. |

Every folder includes label-free transparent normal/yaw8 pairs: use `normal-world-v1.png` and `yaw8-world-v1.png` for tower/leaderboard/compound; use padded `normal-world-v2.png` and `yaw8-world-v2.png` for the entrance (v1 preserved). All include calibration JSON for every fixed feature anchor/vector, full editable world mesh, and `design-brief-v1.json`. Single orthographic camera30degrees down; one mesh rotates0/90/180/270degrees. Normal cell camera order SE SW / NW NE; yaw8 N E / S W. The actual object headings are recorded explicitly: normal NE/SE/SW/NW0/270/180/90; yaw8 N/E/S/W323/233/143/53, conditional on the proved runtime local basis `(guide x,-guide y)`. These names are not claims that future painted output matches the guide camera.

All eight guide sheets (32cells) were visually inspected. These references do not approve native art, unlock seats, import anything, change existing guides, edit runtime, run tests/builds/servers, or create a commit. Only these four complex designs were added. Source brief and output hashes are in [the index](complex-world-guide-index-v1.json).

Entrance v2 changes reference framing only, using59px/m rather than67 for50px minimum yaw8 margins and80px normal margins. The exact physical model and12x6m plot remain unchanged. Use the index recommended paths for generation.
