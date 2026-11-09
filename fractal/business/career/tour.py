"""business.career.tour: Golf tour tiers and verdict. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.career.tour.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.career.tour', rung=3, title='Golf tour tiers and verdict',
    purpose="The five golf tiers: what each needs, the reputation that moves toward the year's score, and the verdict.",
    requires=['The golf tour has five tiers; tierInfo clamps to 1..5 (src/game/golf/tour.ts:50).', "The reputation moves toward the year's score (src/game/golf/tour.ts:55, reputationAfter)."],
    files=['src/game/golf/tour.ts'],
    dynamics=[Fn(name='tierInfo', at='src/game/golf/tour.ts:50', does="a tier's rules, clamped to 1..5", sig='(tier)'),
        Fn(name='reputationAfter', at='src/game/golf/tour.ts:55', does="the reputation after a year's score", sig='(prev, score)'),
        Fn(name='daySatisfaction', at='src/game/golf/tour.ts:62', does="the day's satisfaction from its facts", sig='(d)'),
        Fn(name='missingFor', at='src/game/golf/tour.ts:75', does='what a tier still needs from the course', sig='(tier, facts)'),
        Fn(name='verdict', at='src/game/golf/tour.ts:88', does='the tier verdict for the year', sig='(tier, reputation, facts, poorYears)')],
    inputs=[], outputs=[],
    tests=['tests/golf-tour.test.ts'],
    below=[], above=[], dual="none: a verdict from the year's facts",
    seams=['Tier (tour.ts)', 'CourseFacts'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port tierInfo, reputationAfter and verdict (golf/tour.ts:50, :55, :88)',
)
