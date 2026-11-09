"""art.tools.contact: a contact sheet of a picture folder (native). Each picture is fitted into a cell over the steer background, named under it."""
from pathlib import Path

from PIL import Image, ImageDraw

from fractal.holon import OUT, Fn, Holon

STEER = {"cell": 160, "cols": 6, "bg": [40, 40, 46], "label_px": 14, "limit": 200}
EXTS = (".png", ".webp", ".jpg", ".jpeg")


def contact_sheet(folder: str, knobs: dict | None = None) -> dict:
    """a contact sheet of the pictures in a folder, in name order, at most `limit`: writes OUT/contact-<folder>.png and returns its path and count"""
    k = knobs or STEER
    files = sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in EXTS)[: k["limit"]]
    cell, cols, lab = k["cell"], k["cols"], k["label_px"]
    rows = max(1, -(-len(files) // cols))
    sheet = Image.new("RGB", (cols * cell, rows * (cell + lab)), tuple(k["bg"]))
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(files):
        x, y = (i % cols) * cell, (i // cols) * (cell + lab)
        im = Image.open(p).convert("RGBA")
        im.thumbnail((cell - 8, cell - 8))
        sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        draw.text((x + 4, y + cell), p.stem[: max(4, cell // 7)], fill=(230, 230, 230))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"contact-{Path(folder).name}.png"
    sheet.save(out)
    return {"path": str(out), "count": len(files)}


HOLON = Holon(
    id="art.tools.contact", rung=3, title="Contact sheet",
    purpose="See a whole picture folder on one sheet, to check its cuts, angles, size and light at a glance.",
    requires=["contact_sheet takes the folder's pictures in name order, at most 200, each fitted in its cell with its name under it."],
    owns=["nothing: it writes a new sheet under OUT"],
    files=[],
    dynamics=[Fn(name="contact_sheet", at="art/tools/contact.py:1", does="a contact sheet of a picture folder (a Python function, not a game function)", sig="contact_sheet(folder, knobs)")],
    inputs=["a folder of PNG, WebP or JPEG pictures"],
    outputs=["OUT/contact-<folder>.png", "the count"],
    tests=["fractal: python fractal/fractal.py run art.tools.contact folder=<dir>"],
    below=[], above=["art.tools"],
    dual=None,
    impl="native", fn=contact_sheet, steer=dict(STEER),
    params={"folder": "str, a folder of pictures"},
)
