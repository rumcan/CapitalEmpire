"""town.audit.review: the owner's review file of lots (marks per check), and the survey lines drawn on a lot. Parsing is a stub for now."""
from fractal.holon import Fn, Holon

PORT = "todo: parseReview (src/game/lots/review-file.ts:126) needs readRecord (review-file.ts:80) and the ReviewRecord shape; standingOf (:55) and summaryOf (:61) follow"


def parse_review(file_text, knobs=None):
    """port todo: the review records and their summary from the review file text (Python port of parseReview, src/game/lots/review-file.ts:126)"""
    raise NotImplementedError(PORT)


HOLON = Holon(
    id="town.audit.review", rung=3, title="Review file and survey lines",
    purpose="Keep the owner's marks on each reviewed lot, read them back as a standing and a summary, and draw the survey lines on a lot.",
    requires=[
        "CHECKS are house, drive, trees and fence (src/game/lots/review-file.ts:13).",
        "REVIEW_KINDS are town, estate and sample (src/game/lots/review-file.ts:46).",
        "isBad is the record's bad flag (src/game/lots/review-file.ts:52).",
    ],
    files=["src/game/lots/review-file.ts", "src/game/lots/survey.ts"],
    dynamics=[
        Fn(name="parseReview", at="src/game/lots/review-file.ts:126", does="reads the review file text into its records", sig="parseReview(fileText): ReviewFile"),
        Fn(name="mergeReview", at="src/game/lots/review-file.ts:141", does="adds, updates or removes review records and returns the new text", sig="mergeReview(fileText, upsert, remove)"),
        Fn(name="standingOf", at="src/game/lots/review-file.ts:55", does="the standing of one record", sig="standingOf(r): Standing"),
        Fn(name="summaryOf", at="src/game/lots/review-file.ts:61", does="the lot, ok and bad counts of a review file", sig="summaryOf(f): {lots, ok, bad, ...}"),
        Fn(name="surveyLines", at="src/game/lots/survey.ts:22", does="the survey lines inset on a lot's plot", sig="surveyLines(p, inset = SURVEY_INSET): number[]"),
    ],
    inputs=["the review file text", "upserts and removals", "a plot"],
    outputs=["review records and a summary", "the new file text", "survey line points"],
    tests=["tests/lot-review.test.ts", "tests/building-sites.test.ts"],
    below=["town.lots.library"], above=["ui", "art"],
    dual="mergeReview(fileText, upsert, remove) removes a record (src/game/lots/review-file.ts:141)",
    seams=["the review file scripts/assets/lot-review.json (dev, core)"],
    rules=["new art used everywhere, with the old look kept as an option"],
    impl="native", fn=parse_review, steer={"checks": ["house", "drive", "trees", "fence"]}, port=PORT,
    params={"file_text": "str, the review file's text"},
)
