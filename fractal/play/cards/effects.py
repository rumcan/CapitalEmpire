"""play.cards.effects: Card effects on the tournament. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/play.cards.effects.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='play.cards.effects', rung=3, title='Card effects on the tournament',
    purpose="A card's effect on a tournament: the sponsor deal, rain insurance, the early bird, the volunteer corps.",
    requires=['GOLF_CARDS defines at least 10 golf cards (golf-cards.test.ts).', 'Each golf card effect applies in its moment: gate flows, quality, sponsors, upkeep, weather, reputation (golf-cards.test.ts).'],
    files=['src/game/golf/golfcards.ts'],
    dynamics=[Fn(name='applySponsorDealIncome', at='src/game/golf/golfcards.ts:188', does='the sponsor income with the sponsor-deal card', sig='(baseSponsorIncome, cards)'),
        Fn(name='golfDraftFor', at='src/game/golf/golfcards.ts:166', does='the draft offer for a tournament day', sig='(xp, runs, taken=[], count=DRAFT)'),
        Fn(name='applyRainInsuranceToSatisfaction', at='src/game/golf/golfcards.ts:266', does='the satisfaction with rain insurance', sig='(repAfter, cards, ...)')],
    inputs=[], outputs=[],
    tests=['tests/golf-cards.test.ts'],
    below=[], above=[], dual='none: pure functions of the equipped cards',
    seams=['GolfSave.cards'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port the card effects (golf/golfcards.ts 143-331); the draft is also a business concern',
)
