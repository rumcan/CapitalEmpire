"""land.height.tiles: the elevation tiles decoded and sampled (golf/osm/terrarium.ts): the Terrarium PNG tiles, the metre grid over a box, the smoothing and crop."""
from fractal.holon import Fn, Holon

HOLON = Holon(
    id="land.height.tiles", rung=3, title="Elevation tiles: decode, sample, smooth",
    purpose="Read the elevation tiles (Terrarium PNGs) and turn them into a metre grid over a course box, smoothed to the course's own scale.",
    requires=[
        "DEM_ZOOM is 15 and TILE_PX is 256; tilesFor lists the tile keys that cover a metre box.",
        "decodePng reads the RGB PNG; decodeTile gives the height in metres (Terrarium encoding).",
        "sampleTiles returns a HeightGrid over the box at a step; a tile that is missing raises MissingTile.",
    ],
    owns=["DEM_ZOOM, TILE_PX, EARTH_R (terrarium.ts:13-17)", "HeightGrid and DemTile (the grid types)"],
    files=["src/game/golf/osm/terrarium.ts"],
    dynamics=[
        Fn(name="tilesFor", at="src/game/golf/osm/terrarium.ts:43", does="the tile keys that cover a metre box at a zoom", sig="tilesFor(c, box, z = DEM_ZOOM): TileKey[]"),
        Fn(name="decodePng", at="src/game/golf/osm/terrarium.ts:68", does="decodes a PNG tile to RGB bytes", sig="decodePng(bytes): Promise<RawPng>"),
        Fn(name="sampleTiles", at="src/game/golf/osm/terrarium.ts:140", does="the metre grid over a box, sampled from the decoded tiles", sig="sampleTiles(tiles, c, box, step, z = DEM_ZOOM): HeightGrid"),
        Fn(name="smoothGrid", at="src/game/golf/osm/terrarium.ts:157", does="smooths a height grid by a metre sigma", sig="smoothGrid(g, sigmaM): HeightGrid"),
    ],
    inputs=["tile bytes, a centre, a metre box, a step"], outputs=["HeightGrid (metres)"],
    tests=["tests/golf-osm-land.test.ts", "tests/ext-course-height-land-light.test.ts"],
    below=[], above=["land.height.dem", "land.height.pack"],
    dual="MISSING: a decoded grid is derived data; nothing to undo (the download is the only source)",
    seams=["the tile URLs point at a public tile host (demTileUrl): a network dependency"],
    rules=["performance is a hard gate"],
    impl="describe",
)
