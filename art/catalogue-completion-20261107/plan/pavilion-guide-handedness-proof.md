# Pavilion guide handedness proof

The supplied guide coordinate conversion is now mathematically verified against the actual game projection. This proves the technical model mapping, not the positions or visibility in the native painting.

For unrotated guide model coordinates `(x,y,z)`, runtime local metres must be `(x,-y)`; keep height unchanged. The guide normalNE cell rotates its model 270 degrees, and this reflected runtime basis reproduces that cell at runtime heading zero. With guide camera beta and guide object rotation theta, the exact runtime heading is `(beta - theta - 45) mod 360`.

| Source key | Source cell | Guide beta | Guide theta | Physical runtime heading |
| --- | ---: | ---: | ---: | ---: |
| normalSE | 0 | -45 | 0 | 270 |
| normalSW | 1 | -45 | 90 | 180 |
| normalNW | 2 | -45 | 180 | 90 |
| normalNE | 3 | -45 | 270 | 0 |
| yaw8N | 0 | 8 | 0 | 323 |
| yaw8E | 1 | 8 | 90 | 233 |
| yaw8S | 2 | 8 | 180 | 143 |
| yaw8W | 3 | 8 | 270 | 53 |

The game ground projection for local metres is `[(X-Y)*32,(X+Y)*16]`. Dividing by the true camera scale `32*sqrt(2)` gives `[(X-Y)/sqrt(2),(X+Y)/(2*sqrt(2))]`. For a 30-degree source camera, add height `-sqrt(3)*z/2` in normalized screen-down. Substituting `(X,Y)=R(heading)*(x,-y)` reproduces both guide camera basis rows exactly.

Checked all 656 recorded anchor projections across eight cells; maximum normalized residual 1.78e-15 (floating-point roundoff). The JSON records each residual and the failed old positive-heading alternative.

The draft base seating is three rows, eight seats each, starting x=-2.275m at runtime y=+1.4m,0m,-1.4m, step x=+0.65m; front=(0,+1). Rear entries are (-3.1,-3) and (+3.1,-3)m. Bench top is 0.70m. This preserves all three authored row banks and both rear access points. Use explicit `verticalPixelsPerMetre=39.1918358845` for this correctly scaled 30-degree native camera: the existing 32 default is a legacy draft estimate, not this source's vertical calibration.

Keep exact headings by source cell; no crop reordering or pixel rotation is necessary. Native art still requires measured per-view ppm/anchors and feature/seat/roof review. The technical guide's 56 ppm cannot be assigned to a native painting without measurement. The JSON includes draft metadata only; it never unlocks facilities or declares seats visible.
