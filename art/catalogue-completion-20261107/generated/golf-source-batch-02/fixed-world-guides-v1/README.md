# Fixed-world golf-prop correction guides

Five technical models,40views, recorded in [index.json](./index.json). Read [compact.json](./compact.json) for the exact normal/yaw8PNG guide paths and fixed identities. These are simple geometry references for root native image generation, never final game sprites.

- Ball washer: lid heldOPEN70degrees in every view; crank physicalRIGHT+X; towel physicalLEFT-X. Screen-left/right can change naturally with camera.
- Bench: sitting front-Y, backrest+Y; attached map panel always at physicalRIGHT+X, map front-Yand plain backing+Y.
- Ball dispenser: front-Yhas ball window, coin controls, chute and one basket; rear+Yis a plain latched service panel.
- Rope corner: exactly5stanchions and4sagging rope spans in one rigid90degreeL. No flattening, mirror reuse, duplicate corner, ground slab or grey alpha haze.

All ten technical sheets were visually inspected and geometry is unclipped. Component and feature world coordinates, projection bases, source hashes and guide calibrations remain in the JSON meshes. Object sizes are technical design proposals, not runtime economy or placement changes. No native imagegen, runtime edits, services, tests, build, import or commits.

- Manual ball hopper extension: sloping cap fixed to wedge-sided metal bin, four sawn-timber legs, front-Youtlet/chute/crank and exactly one front bucket; rear+Yplain panel and diagonal brace.
