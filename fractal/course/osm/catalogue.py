"""course.osm.catalogue: the catalogue filter: which courses match what the player typed, the best first (a Python port of catalogue.ts filterCatalogue)."""
import json
import math
import re
import unicodedata
from pathlib import Path

from fractal.holon import Fn, Holon

STEER = {"limit": 60, "cc": "", "prefer": ""}
_LETTERS = str.maketrans({"ß": "ss", "æ": "ae", "Æ": "ae", "ø": "o", "Ø": "o", "ł": "l", "Ł": "l", "đ": "d", "Đ": "d", "œ": "oe", "Œ": "oe", "ı": "i"})


def fold(s: str) -> str:
    """the text folded: accents off, the special letters spelt out, lower case (catalogue.ts fold)"""
    t = unicodedata.normalize("NFD", str(s))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return t.translate(_LETTERS).lower()


def words_of(s: str) -> list[str]:
    """the words of a text, folded; an apostrophe joins (St Andrew's is st, andrews)"""
    return re.findall(r"[^\W_]+", re.sub(r"['’‘`´]", "", fold(s)))


def spaced(s: str) -> str:
    """the catalogue's name form: a leading space and the folded words (' gate park')"""
    w = words_of(s)
    return f" {' '.join(w)}" if w else ""


def word_score(e: dict, t: str) -> int:
    """how well one word matches a course: the start of a name word (the first best), inside a word, then the same in the place (0: no match)"""
    if e["nm"].startswith(f" {t}"):
        return 120
    if f" {t}" in e["nm"]:
        return 100
    if t in e["nm"]:
        return 55
    if f" {t}" in e["pl"]:
        return 45
    if t in e["pl"]:
        return 25
    return 0


def filter_catalogue(entries: str, query: str, knobs: dict | None = None) -> dict:
    """the courses that match the query: entries is a JSON path to a list of {id, name, place, cc, full, w, h}; returns rows, matched and words"""
    k = {**STEER, **(knobs or {})}
    all_ = []
    for raw in json.loads(Path(entries).read_text(encoding="utf-8")):
        all_.append({**raw, "nm": spaced(raw.get("name", "")), "pl": spaced(raw.get("place", ""))})
    words = words_of(query)[:6]
    limit = int(k["limit"])
    pool = [e for e in all_ if e.get("cc") == k["cc"]] if k["cc"] else all_
    if not words:
        if not k["cc"]:
            return {"rows": [], "matched": 0, "words": words}
        rows = sorted(pool, key=lambda e: (e["nm"], e["id"]))
        return {"rows": [_row(e) for e in rows[:limit]], "matched": len(rows), "words": words}
    scored = []
    for e in pool:
        s, in_name, ok = 0, 0, True
        for t in words:
            w = word_score(e, t)
            if not w:
                ok = False
                break
            s += w
            in_name += 1 if w >= 55 else 0
        if not ok:
            continue
        if in_name == len(words):
            s += 40
        if k["prefer"] and e.get("cc") == k["prefer"]:
            s += 30
        if e.get("full"):
            s += 12
        s += min(15, math.log2(1 + (e.get("w", 0) * e.get("h", 0)) / 10000) * 2)
        scored.append((e, s))
    scored.sort(key=lambda x: (-x[1], x[0]["nm"], x[0]["id"]))
    return {"rows": [_row(e) for e, _ in scored[:limit]], "matched": len(scored), "words": words}


def _row(e: dict) -> dict:
    """a row of the answer: the course's id, name, place and country"""
    return {"id": e["id"], "name": e.get("name", ""), "place": e.get("place", ""), "cc": e.get("cc", "")}


HOLON = Holon(
    id="course.osm.catalogue", rung=3, title="Course catalogue filter",
    purpose="The search box of the real-course catalogue: what the player types finds the matching courses, best first, the name matches over the town matches.",
    requires=[
        "Every word typed must match a word of the course's name, town or country; a word matches at the start of a name word, inside one, or in the place (wordScore).",
        "A name match scores over a town match, and a course whose every word is in its name gets 40 more.",
        "At most 60 rows are listed (LIST_MAX), and at most 6 words are used (the query's first six).",
        "With nothing typed and a country chosen, the rows are that country's courses by name; with nothing typed and no country, there are none.",
    ],
    files=["src/game/golf/osm/catalogue.ts"],
    dynamics=[
        Fn(name="filterCatalogue", at="src/game/golf/osm/catalogue.ts:102", does="the courses that match the query, the best first", sig="filterCatalogue(all, query, opt): Filtered"),
        Fn(name="fold", at="src/game/golf/osm/catalogue.ts:34", does="folds text: accents off, special letters spelt out, lower case", sig="fold(s: string): string"),
        Fn(name="wordsOf", at="src/game/golf/osm/catalogue.ts:38", does="the folded words of a text", sig="wordsOf(s: string): string[]"),
    ],
    inputs=["a JSON list of catalogue entries", "the query text", "steer knobs: limit, cc (country), prefer"],
    outputs=["rows (id, name, place, cc)", "matched count", "the words looked for"],
    tests=["tests/golf-osm-catalogue.test.ts", "tests/ui-course-picker.test.ts"],
    below=["course.osm.library"], above=["course.osm", "ui"],
    dual="none: a filter changes nothing; it is recomputed for each query",
    impl="native", fn=filter_catalogue, params={"entries": "str, JSON path of catalogue entries {id, name, place, cc, full, w, h}", "query": "str, what the player typed"},
    steer=STEER,
)
