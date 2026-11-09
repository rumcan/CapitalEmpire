"""play.range.balls: Ball room and buckets. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.range.balls.json."""
from fractal.holon import Fn, Holon

STEER = {'balls_visit': 40, 'ref_day': 600, 'min_visit': 8, 'min_day': 24, 'hour': 24, 'field_cap': 8000, 'start_balls': 200, 'case_balls': 120, 'ball_cost': 8.5, 'cases_a_day': 3}

def visit_balls(*, day_len: float, knobs=None) -> int:
    """the balls a bucket holds at a day of day_len sim seconds: BALLS_VISIT at REF_DAY, at least min_visit (rangeballs.ts:62)"""
    k = {**STEER, **(knobs or {})}
    scaled = k["balls_visit"] * max(k["min_day"], day_len) / k["ref_day"]
    return max(int(k["min_visit"]), int(scaled + 0.5))


def per_hour(*, bps: float, day_len: float, knobs=None) -> float:
    """balls an hour of a rate in balls a sim second, over a day of day_len (rangeballs.ts:64)"""
    k = {**STEER, **(knobs or {})}
    return bps * max(k["min_day"], day_len) / k["hour"]


HOLON = Holon(
    id='play.range.balls', rung=3, title='Ball room and buckets',
    purpose="The balls: a bucket's count at a day's length, balls an hour, the ball room's stock, the outfield and the picking.",
    requires=["A bucket holds BALLS_VISIT (40) balls at the reference day (600 s) and scales with the day's length, at least 8 (golf/rangeballs.ts:62).", "Balls an hour are the rate times the day's length over 24 (golf/rangeballs.ts:64).", 'The outfield holds FIELD_CAP (8000) balls; past it a ball is lost (golf/rangeballs.ts:18).'],
    files=['src/game/golf/rangeballs.ts'],
    dynamics=[Fn(name='visitBalls', at='src/game/golf/rangeballs.ts:62', does="the balls a bucket holds at a day's length", sig='(dayLen)'),
        Fn(name='perHour', at='src/game/golf/rangeballs.ts:64', does='balls an hour from a rate in balls a sim second', sig='(bps, dayLen)'),
        Fn(name='takeMix', at='src/game/golf/rangeballs.ts:93', does="takes a bucket's mix of clean and dirty balls", sig='(b, vb)'),
        Fn(name='landBalls', at='src/game/golf/rangeballs.ts:105', does='balls land on the outfield', sig='(b, x, y, n, rnd, fence)'),
        Fn(name='pickAround', at='src/game/golf/rangeballs.ts:130', does='picks up the balls near a point', sig='(b, x, y, r, max)')],
    inputs=[], outputs=[],
    tests=['tests/golf-range-balls.test.ts', 'tests/golf-range-pacing.test.ts'],
    below=[], above=[], dual='MISSING: a sold bucket cannot be refunded; takeMix (golf/rangeballs.ts:93) only takes stock out; pickAround (golf/rangeballs.ts:130) collects balls on the ground only',
    seams=['BallSave in the range save'], rules=[],
    impl='native',
    fn=visit_balls, params={}, steer=STEER, port='todo: port takeMix, landBalls and pickAround (golf/rangeballs.ts:93, :105, :130); needs the BallSave shape (rangeballs.ts 28-51)',
)
