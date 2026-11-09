# Vehicle camera guide references

Technical geometry only. Preserve each actual vehicle's native identity, materials and painterly finish when applying these camera references. The simple block shapes and colours are not proposed final sprites.

Each `generated/technical-vehicle-{sedan,hatch,pickup,van,bus}/guides/` folder includes:

- `cardinal-world-v1.png`: label-free transparent2x2 at1600x1600. Cells front noseDOWN, right noseRIGHT / rear noseUP, left noseLEFT.
- `cardinal-world-v1.calibration.json`: actual basis, pitch30degrees, cardinal horizontal camera offset0, object rotations0/90/180/270, actual projected nose vectors and screen headings90/0/270/180degrees clockwise from right.
- `normal-world-v1.png`: the same model/camera pitch in four45degree corner views. Camera beta-45; cell source names are camera labels, not guessed vehicle nose directions.
- `traffic8-camera-world-v1.png`: compact transparent4x2 at1600x800, matching the native traffic atlas order: LOWER LEFT, DOWN, LOWER RIGHT, RIGHT / UPPER RIGHT, UP, UPPER LEFT, LEFT. Cardinal and corner views use the SAME physical model and scale, not independent shape guesses. This composite is reference geometry, not a runtime atlas.
- Editable world mesh, fixed dimensions and projected anchor coordinates. All physical dimensions are generic design hypotheses; do not impose a sedan wheelbase on a real pickup/van identity.

The camera is orthographic30degrees down. Horizontal roof/hood/deck depth has sin30=0.5 projection; a top plane must remain visibly present in exact side views. Vertical wheel faces in a true side view have height/width=cos30=0.8660254. Eye-level would be1.0. Do not incorrectly flatten wheel height to0.5: that ratio applies to horizontal ground planes, not vertical tyre discs. Front/rear tyre faces are seen edge-on.

The existing shared world renderer gains an optional `cardinal` family only. Existing normal/yaw8 defaults keep their camera/output behaviour. This wrapper opts out of technical labels for reference images, creates its own five isolated generic models, and changes no house/budget assets. Cardinal views have one visible vertical body wall; there is no invented second sliver at exactly0yaw.

All5 eight-view composites were visually inspected: intended fronts/rears/opposite side profiles, continuous roof/hood surfaces, same model dimensions across poses, pickup bed and van/bus roof visible from above. The bus entry door stays on its actual right side. No final native artwork is generated or approved by these proxies. Source artwork/runtime unchanged; no tests, server, build or commit.
