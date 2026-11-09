# Five remaining fixed-world golf prop guides

Technical reference geometry only. No finished painted image, runtime registration, service, build or gameplay change was made.

Use each model's yaw guide as the first camera/geometry reference and the archived native normal sheet as the second identity/material reference. Normal guides are included to explain the same fixed object. Do not copy a convenient corner, mirror a front, reattach features or re-aim a sign to face the camera. All future painted output uses the established painterly style, late-afternoon upper-right sunlight and lower-left shadows, transparent background.

- [Index](./index.json) contains exact subject IDs, proposed dimensions, mesh/reference hashes and both guide paths. [Compact index](./compact.json) is for prompt preparation. [Inspection](./inspection.json) records all 40 cell bounds and hashes after visual review.
- The water station is based on native normal-v2: a closed galvanized tank, two fixed front taps and open trough, four legs and rear braces, a physical-right towel/basket, front-right bucket and functional slatted grate. The fill cap stays rear-left. There is no map or number-12 plaque.
- Four direction arrows stay in one plane: two left, two right. Golf/food/toilet/exit pictograms appear only on their fixed front faces; backs are plain.
- The map board has a green gable roof, front map and information badge, two front unlit lanterns, two support posts and plain braced rear. Lantern grey glass is intentionally unlit. No planters or paving.
- The straight barrier has exactly three posts and two fixed sagging rope spans. The paired tee markers have exactly two balls with a fixed gap, individual mounts, and no shared ground plate.

Dimensions are source-design proposals, not accepted runtime sizes. The compact tee-marker centre gap is proposed at 0.46 m to follow current painted proportions; this replaces the earlier unmeasured 1 m source brief only. Actual tee width is unchanged.

Physical coordinates are right +X, left -X, front -Y, rear +Y, up +Z. Normal cells are SE/SW/NW/NE at camera beta -45 degrees; yaw cells are N/E/S/W at beta +8 degrees. Whole-model rotations are 0/90/180/270 degrees. The existing proven game-local basis is (model x, -model y), with explicit physical heading (beta - object rotation - 45) modulo 360. A filename never certifies final native yaw.

All ten final technical sheets were visually inspected; all 40 cell silhouettes stay within their 800x800 cells. Genuine symmetries of spheres and straight barriers remain intact. Fine map drawing, golf dimples and painterly materials belong to native generation, not this technical mesh.
