# Screenshot to complete scene to individual sprites

Owner direction, 2026-10-22. Apply this workflow to all new object, foliage, character and tournament sprites. Do not start by inventing disconnected sprite sheets.

## Latest owner corrections, 2026-10-23

- Do not generate any more people, character sheets or crowds. Existing people artwork and the game's animation system may remain; new scene references must omit people.
- The starter tier is a **small budget**, not a distressed luxury venue and not a dilapidated shanty town. Use simple functional construction and inexpensive readily available equipment in clean usable condition: modest pop-up gazebos, folding tables, ordinary plastic chairs, basic timber signboards, rope on simple stakes and standard bins.
- Budget and condition are independent axes. A cheap canopy can be new and well cared for; an expensive structure can be worn and need replacement. Generate age/damage variants only for a separate maintenance/replacement state, never as the definition of cheap.
- Establish a complete small local-event setup in a screenshot-derived master scene, then derive those exact inexpensive props. Leave out premium ornament, grand scales and expensive material choices instead of adding rust, tears, dirt or broken parts.

## 1. Establish the actual game view

Start with a current in-game screenshot at the zoom where the assets must look good. Record the screenshot resolution, camera/zoom when known, lighting, existing reference objects and their approximate on-screen sizes. If the zoom value is unknown, say so rather than inventing it. Preserve the reference in the art workspace.

This task's source is [game-reference.png](./scene-reference/game-reference.png), supplied by the owner. It shows the course surrounded by its town, with warm autumn foliage, dark conifers, a central clubhouse and parking. Its exact numeric camera zoom is unknown; match the visible scale and projection.

## 2. Generate the whole target scene first

Give the screenshot to the image generator as a composition, camera, scale and style reference. Ask it to show the desired complete feature in context. For this tournament, add the actual golf event and a food court with white tents, serving fronts, paths, tables, queues and support facilities. Keep the established course, streets and town coherent. A tent should have a plausible relationship to a person, car and clubhouse at this zoom.

Use the resulting full scene to establish the shared art direction. Inspect it before deriving the component assets. If its scale, angle or lighting is wrong, correct the scene first. Small-budget, developed and premium versions must each read as coherent complete venues. A small budget means modest size and straightforward inexpensive construction in usable condition.

## 3. Inventory the elements actually visible

Identify individual objects in the generated scene: tent types, stalls, tables, chairs, bins, gates, signs, planting, trees and other useful pieces. Record a crop region or visual locator for each subject, its role, approximate footprint and ground contact point. Separate independently placeable objects. A tee marker is one marker; a distance stake is one stake. Do not bundle several interchangeable markers into one sprite.

Assemblies are appropriate only when they are intended to be placed as one unit, such as a picnic table with attached benches. Walking people must remain individual animated customers, not static crowd scenery replacing the visitor simulation.

## 4. Derive sprites using the generated scene again

Give the generated full scene back to the generator for every extraction or reconstruction. Name the exact visible element and preserve its design, camera elevation, proportions, materials, lighting and ground contact. Request a complete isolated sprite on true transparent PNG alpha. Remove the surrounding ground and neighboring objects; do not invent a different object or photograph a model from another angle. Preserve useful original detail while increasing source resolution where the generator supports it. Do not upscale and claim new detail.

All objects need clean silhouettes, generous margins, no baked UI, captions, checkerboard, background haze or broad shadows. Inspect the alpha channel as well as the preview. A screenshot crop is a reference, not automatically a finished sprite: hidden backs/sides require reference-guided reconstruction.

## 5. Generate rotations and meaningful variants

For a rotatable prop, use one sheet for the same object in four true world rotations: NE, SE, SW and NW, separated in a 2-by-2 layout. Record this order in its manifest. Keep the same dimensions, style, object identity and consistent ground anchor across all views. A mirrored asymmetric sprite is not a true rotation.

Prioritize color variations for tents, umbrellas, carts, service vehicles, outdoor furniture, bins and tee markers. Generate structural budget tiers separately: small-budget, developed, premium. Generate old/worn condition as a separate axis only where maintenance/replacement needs it. Do not generate new visitor clothing or people. Match foliage to the scene's dense red/orange/gold broadleaf canopies and blue-green conifers, with variation in age and silhouette. Do not apply a generic color filter and call it a new species or angle.

## 6. Validate in the game

Check every sprite at the reference zoom and at the closest supported view. Verify relative size beside people/cars, projection, ground contact, all four directions, alpha edges, cropping and depth sorting. Keep source screenshots, generated scenes, exact prompts, generator provenance and selected sprite versions. Mark generation, visual review, packing and in-game verification as separate statuses; do not call unreviewed sheets production-ready.

## Ground materials and wear overlays

The renderer projects top-down opaque base textures into the game plane; do not bake the isometric perspective into those textures twice. Use the game screenshot and existing materials to calibrate their detail density and physical scale. Grass condition, mowing patterns, divots, cart tracks and crowd wear remain separate layers so gameplay can update them locally. Transparent wear decals also need reference-scale checks and clear individual sprite boundaries.

## Reusable scene prompt

> Use the attached game screenshot as the exact reference for camera projection, zoom, on-screen scale, warm autumn lighting and existing town/course style. Show the entire golf tournament operating within this view, with a plausible white-tent food court near the clubhouse, visitors arriving from parking, walking through admission, queuing at food stalls and watching golf. Keep tents, people, cars, trees and furniture correctly proportioned. Preserve the existing course and street layout. This is the master scene for subsequent isolated game sprites; make the individual objects coherent and readable at this zoom.

## Reusable sprite prompt

> Use the attached generated master scene as the design, scale, camera and lighting reference. Isolate/reconstruct the specified visible object as a complete transparent PNG game sprite, preserving its identity and proportions. Remove all surrounding scene, neighboring objects and UI. Keep the ground anchor and isometric angle consistent. No background, broad shadow halo, captions or cropping. For a rotation sheet show exactly the same object facing NE, SE, SW and NW in that reading order with generous transparent gutters.
