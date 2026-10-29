# Water that moves: research (T248, #718)

The owner, 2026-10-28: "add effects of small waves to the transision from water to dirt with a vector lapping of waves animation on
edges of water" and "add maybe two textures on the water so it looks like the water is moving but first do research on how to make the
water look amazing".

This note covers how top-down and isometric games make water look good and move cheaply, what each technique costs in our renderer,
and the set we build. Sources were checked on 2026-10-29; where no write-up could be found, that is said, and nothing is claimed.

## Our setup, and what "cheap" means here

- The ground is baked by Web Workers into chunk pictures (2000 x 1000 world px, a full chunk 600 x 300 px at 30%) and drawn as one textured
  quad each (`gl.ts` `FS_QUAD`). Anything animated cannot be baked: it must be a per-frame pass in that shader, over water pixels only.
- That pass already exists for three effects, each with a small per-chunk mask made in the bake: T215's lamp pools (`uSpec`, a quarter-size
  mask), T199/T230's sky glint on the swamp's pools and the water (`uGloss`, a half-size mask; only with the camera specular switched on),
  and T262's grass shine (`uShine`, an R8 weight mask, plus one read of the last frame's shadow layer so a highlight never sits in a shadow).
- T230 (`water-look.ts`) already measures every water sample's distance from its shore (`WaterField.shore`: an exact Euclidean distance
  transform over a world-anchored lattice, 2 samples a tile, padded past the chunk so neighbouring chunks agree) and bakes the depth colour,
  the light edge and the shore's reflections from it.
- Budgets (the brief): at most +0.3 ms on a frame's CPU average and p95, at most +1 ms on a chunk bake's median, no new atlas page. GAME-PLAN
  2.3 gives the frame 8 ms of main thread, with the ground blit at 1 ms.

So a technique is cheap here when its per-frame work is a few uniforms on the CPU and some arithmetic per water fragment on the GPU, its
data rides in one small per-chunk mask made from the field T230 already computes, and it needs no new art and no render target.

## The techniques

### 1. Two scrolling detail or normal layers
Two copies of a ripple pattern at different scales scroll in different directions and are added; their sum never repeats visibly and reads
as a moving surface. It is the base of nearly every stylised water shader: the Godot "Stylized Water for Godot 4.x" shader scrolls a normal
map and two noise textures [5]; Roystan's toon water scrolls a noise texture and offsets it with a second, distortion texture so the motion
"doesn't look like a flat sheet" [6]; Factorio's animated water (FFF #323) is a cheap fractal noise made from a noise texture that moves
with world-anchored coordinates [1]. GPU Gems ch. 1 builds the same thing physically: a sum of sine or Gerstner waves, its normals from the
waves' analytic derivatives rather than finite differences [7].

- **Our cost:** no texture needed: gradient noise in the shader returns its value and its derivatives in one evaluation (a "noised"
  function), so two layers are two evaluations, about 40 ALU each, on water fragments only. Lit by the one sun (upper right) as a multiply of
  the baked colour, it keeps the painted texture (the owner's no-flat-wash rule). Bake: nothing. Memory: nothing.
- World-anchored (tile coordinates), so the ripples stay put on the ground as the camera pans and agree across chunks.

### 2. Flow maps
A flow map stores a direction per point; the pattern's coordinates are pushed along it. Pushing forever stretches the pattern, so the
pattern is sampled twice, half a cycle apart, each restarting while the other is at full weight, and the two are cross-faded by a triangle
wave (Valve's water flow in Left 4 Dead 2 and Portal 2 [2]; Catlike Coding's "Texture Distortion" walks through the same two phases, the
per-point time offset that hides the pulse, and the jump that keeps each cycle's pattern new [3]). "Directional Flow" [4] rotates the
ripples to line up with the flow, at the cost of a grid of cells blended together (8 to 16 samples a fragment).

- **Our cost:** the river's downstream direction comes free while the field marks the river (its spline runs from source to exit, so each
  segment's direction is downstream): two bytes a sample in the same mask. In the shader the two phases double the ripple layers' cost
  (four noise evaluations on river water). Directional (rotated) flow is not worth it: our river turns slowly and its ripples are
  isotropic at our scale; skipped.

### 3. UV distortion
The slope of the moving layers offsets where the water's own picture is read, so the baked texture wobbles as if seen through moving
water (Roystan [6], the Godot shader's screen distortion [5]).

- **Our cost:** one more read of the chunk picture. The risk is at the shore and the chunk edges: an offset read pulls the bank into the
  water, or reads past the chunk's picture. It also smears the baked reflections and the painting's own ripples. Not in the first set.

### 4. Shore foam from a distance-to-shore field, with animated bands
The distance from the shore drives foam: stylised shaders take it from the depth buffer [5][6]; Outerra's ocean renderer computes each
water point's distance to the shore in a pass, smooths it, feeds it to a wave-shape function so the surf runs perpendicular to the
coast, takes the foam's direction from the distance's gradient, and breaks the waves up with a time-varying mask so they are not continuous
round the shore [8]. Factorio keeps its shore foam in a channel of a per-tile render target [1]. GPU Gems ch. 1 attenuates the waves by depth
and lets them "lap" onto the shore by fading them out just above the water plane [7].

- **Our cost:** T230's field already holds the distance in from the shore. The bank side (a wet band and the swash running up it) needs the
  distance out from the water too: a second distance transform over the same lattice (the field is about 100 x 100 samples a chunk; a
  fraction of a millisecond). The bands are a `fract` of the distance plus a phase, shaped and broken by the ripple layers already
  computed: a few ALU on fragments within about three tiles of a shore. Bridges and the swamp's margin go into the mask as an exclusion.

### 5. Fresnel and sky reflection
Water reflects more of the sky at grazing angles (Godot's water tutorial approximates fresnel with `sqrt(1 - dot(NORMAL, VIEW))` [9]).

- **Our cost:** almost nothing, but almost no gain: our camera is a fixed isometric view from far away, so the view angle is the same over
  the whole screen and fresnel is a constant. T230's light edge and its camera glint (T215's falloff) already give the sky's reflection
  its variation across the screen. Skipped; the ripples' sun-facing slopes carry the sky's colour a little (item 6).

### 6. Specular sparkle
Where a ripple's normal turns toward the half-vector between the sun and the eye, a sharp highlight glints; with moving normals it
twinkles (GPU Gems ch. 1 lights its normal map so [7]).

- **Our cost:** the normal comes from the ripple layers' derivatives already computed: a `pow` a fragment. To keep a sun highlight out of the
  shadows (bridges, trees on the shore), read the last frame's shadow layer as T262's grass shine does: one more texture read, only where a
  glint is about to be drawn. Faded after dusk.

### 7. Caustics in the shallows
Light focused by the waves draws a moving bright net on a shallow bed. GPU Gems ch. 2 gives an aesthetics-driven method: per bed point a
refracted ray from the wave normal looks up a sun-disk map, "very low computational cost" against ray tracing [10]. The stylised version is
a Voronoi or two-noise net added in the shallows.

- **Our cost:** a Voronoi net is 9 cells a layer, two layers: about 200 ALU a fragment in the light edge. Our water pictures are opaque deep
  teal (the concept's pond, the lake), and the bed shows only in T230's thin light edge, where the foam bands already move. Not in the
  first set; a candidate for clear-water ponds later.

### 8. Colour by depth
Shallow water lighter and more of the bed, deep water darker and more saturated (the depth fade in [5]; GPU Gems' depth attenuation [7]).

- **Our cost:** none: T230 bakes it into the chunk from the field. The motion layers here are weighted by the same distance (the ripples
  grow off the bank; the foam lives in the shallows).

## The games

- **Factorio** (FFF #323, "Animated water", 2019) [1]: a cheap fractal noise made by sampling a noise texture (not computing Perlin) moves
  over the static water picture in world coordinates; reflections, transparency and foam are kept in the red, green and blue channels of a
  render target that tiles and entities draw into; chunks with animated water are flagged and the rest keep their cached terrain, so the
  effect costs nothing where there is no water. This is the closest match to our setup (a baked, cached ground with a per-frame water pass)
  and the main model for ours: our per-chunk mask plays the render target's part, and a chunk without water binds none.
- **Townscaper, Cities: Skylines, Anno:** searched on 2026-10-29 (the developers' talks, blogs and dev diaries) and found no technical
  write-up of their water rendering. Cities: Skylines' last video dev diary (2015) covers the dynamic water system's gameplay (rivers with
  mass and direction), not its shader. Nothing is claimed here about how these games do it.

## Recommended set (built in T248)

1. **Two moving ripple layers** (technique 1): procedural gradient noise with analytic derivatives, two scales, two directions and speeds,
   world-anchored, lit by the one sun as a textured multiply of the baked water (crests toward the sun lighter, their backs darker): the
   water's own painting stays, never a wash. Ponds drift slowly with the wind.
2. **A flow map for the rivers** (technique 2): the downstream direction from the river's spline, in the chunk's water mask; the two-phase
   cross-fade with a per-point time offset and a jump per cycle, so the river runs downstream forever without stretching.
3. **Waves lapping at the shore** (technique 4): from the distance-to-shore field baked with the chunk, thin, broken, irregular foam crests
   run in toward the bank and fade as they arrive, the swash wets a darker band of bank just above the waterline and dries again. The ponds
   lap gently, a bigger body (the lake) more, the river along its course; stopped at bridges and at the swamp's margin; never a hard white
   outline.
4. **Sparkle** (technique 6): from the same ripple normals, out of the shadows (the last frame's shadow layer), faded after dusk.
5. **Not now:** UV distortion of the bake (it smears the reflections and pulls the bank into the water), fresnel (a constant in our fixed
   view), caustics (cost, and our opaque water shows no bed). T230 keeps the depth colour.

Cost plan: one RGBA8 mask a water chunk (the field's lattice: about 100 x 100 texels, ~40 KB; no atlas page, no render target), built from
T230's field plus one more distance transform in the bake; a branch in `FS_QUAD` that a chunk without water never takes; on water fragments
two to five noise evaluations. Faded out toward the district zoom (the district chunks carry no mask). A gear-menu switch: off is today's
frame, bit for bit (no mask is made, the shader's branch is never taken).

## Sources (checked 2026-10-29)

1. Factorio, Friday Facts #323, "Animated water" (2019): https://direct.factorio.com/blog/post/fff-323
2. A. Vlachos (Valve), "Water Flow in Portal 2", SIGGRAPH 2010 Advances in Real-Time Rendering course:
   https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf
3. Catlike Coding, Flow 1, "Texture Distortion": https://catlikecoding.com/unity/tutorials/flow/texture-distortion/
4. Catlike Coding, Flow 2, "Directional Flow": https://catlikecoding.com/unity/tutorials/flow/directional-flow/
5. Godot Shaders, "Stylized Water for Godot 4.x": https://godotshaders.com/shader/stylized-water-for-godot-4-x/
6. Roystan, "Toon Water Shader" (Unity): https://roystan.net/articles/toon-water/
7. M. Finch, "Effective Water Simulation from Physical Models", GPU Gems ch. 1:
   https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models
8. Outerra, "Ocean rendering" (2011): https://outerra.blogspot.com/2011/02/ocean-rendering.html
9. Godot docs, "Your second 3D shader" (water): https://docs.godotengine.org/en/stable/tutorials/shaders/your_first_shader/your_second_3d_shader.html
10. J. Guardado, D. Sánchez-Crespo, "Rendering Water Caustics", GPU Gems ch. 2:
    https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics
