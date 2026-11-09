# Native pavilion QA: normal v2 and yaw v1

**No runtime integration or art/seating approval. Capacity remains unvalidated.** Both sources show the same plausible worn green/cream timber pavilion, corrugated gable roof, wooden deck and three green bench banks. There are eight distinct views, no people stamped into the sprites, no night glow and no core clipping. Visible supports are consistent with six posts; roof-hidden posts cannot be independently counted.

Two geometry issues need review before approval:

- In the technical normal SE guide, a small part of a rear stair extends beyond the left deck corner; native SE appears to omit it. The corresponding small stair sliver at the right corner is also absent in native NE. Normal SW/NW correctly show both stairs. These should be the same two physical assemblies in every view, including their visible slivers.
- The yaw deck-bottom edge slopes measure 0.05839/0.04574/0.05299/0.04286 for N/E/S/W. At a 30-degree camera they imply turns of **6.66/5.23/6.05/4.90 degrees**, whereas 8 degrees requires slope0.07027. Robust fits used195–295 boundary pixels per view, with0.30–0.33pixel RMS. This measures the painted silhouette, not just a guessed corner pair. Native painterly camera deviations remain; do not certify8degrees from the filename. Normal slopes are approximately0.50–0.53 rather than exactly0.50.

## Alpha correction

The first raw-image viewer misleadingly displayed saturated hidden RGB as coloured fringes. Proper black, grey and white alpha composites were inspected for both sheets: **no visible saturated fringe**. All such pixels have alpha at most5/255, and zero exceed8,24 or128. Normal contains1813 such pixels; yaw3390. Native source pixels and alpha remain untouched. Tiny low-alpha padding speckles do not constitute clipping: the alpha>8 object bounds have safe cell margins.

## Measured calibration candidates

Ground origins are the projected model centre at z=0, not deck or building centroid. Coordinates below are within each627x627 source cell. Native source dimensions are1254x1254. Native ppm comes from fitted physical8x6metre deck correspondences; the guide's56ppm was never assigned to the native art. Corner x picks carry about3pixel manual uncertainty. These are review candidates, not approved import metadata.

| View | Guide physical heading | Candidate camera ppm | Ground origin x,y | Max floor fit residual px |
| --- | ---: | ---: | --- | ---: |
| normalSE | 270 | 46.518 | 308.13, 387.90 | 7.85 |
| normalSW | 180 | 44.912 | 307.12, 387.13 | 2.72 |
| normalNW | 90 | 44.739 | 315.36, 383.96 | 3.27 |
| normalNE | 0 | 46.309 | 313.58, 383.57 | 7.84 |
| yaw8N | 323 | 45.026 | 312.30, 399.71 | 2.11 |
| yaw8E | 233 | 45.196 | 327.66, 406.89 | 3.28 |
| yaw8S | 143 | 45.261 | 311.40, 387.74 | 3.09 |
| yaw8W | 53 | 43.675 | 297.31, 411.07 | 3.55 |

Use the proven reflected local basis `(guide x,-guide y)` and explicit per-view guide headings, not the old assumed positive headings. Those headings are exact for the technical model; native camera accuracy remains separately unapproved.

The accompanying [JSON](./review.json) records all native hashes, sampled edge ranges, fitted lines, physical floor correspondences, uncertainty, origins and per-view notes. Each diagnostic image projects24seat centres (magenta),24proxy heads (cyan),two rear entries (orange) and the ground origin (red). Across eight views this is400projected anchors. All eight diagnostics were visually inspected. They are analytical overlays only; the source PNGs are unmodified.

## Seat positions do not establish visibility

The projected banks broadly follow the painted rows, but several proxy seat points fall on bench faces rather than clearly exposed seating surfaces. Actual bench height/bank placement needs native calibration. Many cyan proxy head positions fall on opaque roof pixels. The roof/posts hide people correctly only with reviewed visibility/foreground information; drawing all people after the PNG puts heads over the roof, while drawing before the entire PNG also hides bodies behind deck/bench pixels. The technical mesh's ray visibility counts are separate evidence and cannot approve native painted masks.

Keep seating draft and capacity unvalidated until the stair/camera issues are resolved, native bank/entry/visibility metadata is reviewed and a real seated-crowd runtime preview passes. No tests, server, build, runtime registration or source-image edits were performed for this read-only review.
