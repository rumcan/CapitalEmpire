"""play.cards.view: Cards screens and the fold. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='play.cards.view', rung=3, title='Cards screens and the fold',
    purpose='The Cards card and the vending screen, and the fold that folds the cards away while a shot is open.',
    requires=['A shot opening folds the open cards at that moment, and only them (golf-card-fold.test.ts).', 'The folded cards come back FOLD_BACK_MS (6000) after the shot closes (golf/cardfold.ts:17).'],
    files=['src/game/golf/cards/view.ts', 'src/game/golf/cardfold.ts'],
    dynamics=[Fn(name='cardsView', at='src/game/golf/cards/view.ts:34', does="the Cards card's view of the slots and the collection", sig='(c, ctx)'),
        Fn(name='CardFold', at='src/game/golf/cardfold.ts:25', does='the fold state: open shots fold the cards and bring them back', sig='class')],
    inputs=[], outputs=[],
    tests=['tests/golf-card-fold.test.ts'],
    below=[], above=[], dual='the cards come back on their own after FOLD_BACK_MS; reset drops the fold (golf-card-fold.test.ts)',
    seams=['OpenCards', 'FoldKey'], rules=[],
    impl='describe',
)
