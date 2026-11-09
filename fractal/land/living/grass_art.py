"""land.living.grass_art: the photo grass textures (grass-art.ts): the Paint tool photo textures in tile space, with their periods and eager loads."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.living.grass-art", rung=3, title="Photo grass textures",
    purpose="Hold the photo grass the Paint tool offers: which textures exist, how big a tile each is, and which load eagerly.",
    requires=[
        "PHOTO_TEX lists every photo texture with its mix; isPhotoTex says whether a texture is one of them.",
        "photoPeriod gives a texture repeat period from its mix and the mixed share.",
        "EAGER_PHOTO lists the textures loaded at start; the rest load on demand.",
    ],
    owns=["PHOTO_TEX (grass-art.ts:51)", "PHOTO_SIZE 1.25 and EAGER_PHOTO (grass-art.ts:94-96)"],
    files=["src/game/grass-art.ts"],
    dynamics=[
        Fn(name="PHOTO_TEX", at="src/game/grass-art.ts:51", does="the photo texture table (texture, file, mix and tiles)", sig="PHOTO_TEX: PhotoTexEntry[]"),
        Fn(name="photoPeriod", at="src/game/grass-art.ts:99", does="a photo texture repeat period", sig="photoPeriod(p, mixed)"),
    ],
    inputs=["a texture id"], outputs=["its period and whether it is a photo texture"],
    tests=["tests/paint.test.ts", "tests/painted-grass-lod.test.ts", "tests/lab-boot.test.ts"],
    below=[], above=["land.living.base-grass", "land.bake.worker"],
    dual="MISSING: a photo texture is picked by id; nothing to undo here (the Paint tool sets the old look back)",
    seams=["the picture files come from the photo prep script (grass-art.ts header)"],
    rules=["no visible tiling", "new art used everywhere"],
    impl="describe",
)
