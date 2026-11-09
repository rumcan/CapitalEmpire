"""course.bunkers.look: the bunker's look: its geometry, its settings, its textures, and its picture (bunker-look.ts and the game-side ext/bunker-look)."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="course.bunkers.look", rung=3, title="Bunker look, settings and textures",
    purpose="How a bunker looks in the game: its outline and mound, the settings the player sets for depth, wall and slope, its textures (built-in or the player's own), and the picture the renderer draws.",
    requires=[
        "A bunker's outer edge is at its mound's edge plus its mound width (BUNKER_OUT), and its inner edge at its bowl plus 0.25 (BUNKER_IN).",
        "An uploaded texture is resized to at most 1024 pixels on its longer edge (UPLOAD_EDGE).",
        "A bunker's settings are clamped to their ranges on read (clampBunkerSettings).",
    ],
    files=[
        "src/game/bunker-look.ts",
        "src/game/ext/bunker-look/controller.ts",
        "src/game/ext/bunker-look/geometry.ts",
        "src/game/ext/bunker-look/look-picture.ts",
        "src/game/ext/bunker-look/look-settings.ts",
        "src/game/ext/bunker-look/settings.ts",
        "src/game/ext/bunker-look/texture-library.ts",
        "src/game/ext/bunker-look/uploads.ts",
        "src/game/ext/bunker-look/textures/README.md",
    ],
    dynamics=[
        Fn(name="bunkerImages", at="src/game/bunker-look.ts:74", does="the light and shade pictures of a bunker's edge field", sig="bunkerImages(f, k, pxPerTile)"),
        Fn(name="BunkerController", at="src/game/ext/bunker-look/controller.ts:46", does="the bunker controller: the default settings and each bunker's custom mark", sig="class BunkerController"),
        Fn(name="buildBunkerGeometry", at="src/game/ext/bunker-look/geometry.ts:48", does="the geometry of the bunkers of a course", sig="buildBunkerGeometry(input, options): BunkerGeometryBatch"),
        Fn(name="clampBunkerSettings", at="src/game/ext/bunker-look/settings.ts:145", does="clamps a bunker's settings to their ranges", sig="clampBunkerSettings(value, base?)"),
        Fn(name="bunkerLookPicture", at="src/game/ext/bunker-look/look-picture.ts:22", does="the picture URL of a bunker look's texture", sig="bunkerLookPicture(tex): {id, url} | null"),
        Fn(name="bunkerTexture", at="src/game/ext/bunker-look/texture-library.ts:48", does="the texture of a bunker slot", sig="bunkerTexture(slot, id, library)"),
        Fn(name="addOwnTexture", at="src/game/ext/bunker-look/uploads.ts:33", does="adds a player's upload as a bunker texture", sig="addOwnTexture(file: File): Promise<string>"),
    ],
    inputs=["a bunker's edge field", "its settings", "a texture upload"], outputs=["bunker pictures", "geometry batches", "clamped settings"],
    tests=["tests/bunker-look.test.ts", "tests/ext-bunker-controller.test.ts", "tests/ext-bunker-geometry.test.ts", "tests/ext-bunker-settings.test.ts", "tests/ext-bunker-modern-wiring.test.ts"],
    below=["course.design.grid", "course.terrain.height"], above=["course.bunkers"],
    dual="removeOwnTexture (uploads.ts:46) takes the upload away; a setting is reset to the default",
    impl="describe", steer={"upload_edge": 1024, "bunker_out_note": "moundAt + moundW", "bunker_in_note": "bowl + 0.25"},
)
