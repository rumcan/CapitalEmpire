"""business.career.tiers: Lot tiers. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='business.career.tiers', rung=3, title='Lot tiers',
    purpose='Which buildings a town may have, by its income and its stage; the tier rules.',
    requires=['Income tiers come from the takings at the thresholds (src/game/lots/tiers.ts:27).'],
    files=[],
    dynamics=[Fn(name='tierOf', at='src/game/lots/tiers.ts:21', does='the tier of a building id', sig='(id)'),
        Fn(name='incomeTier', at='src/game/lots/tiers.ts:27', does='the tier a takings figure reaches', sig='(takings, at)'),
        Fn(name='townTier', at='src/game/lots/tiers.ts:30', does="the town's tier from its takings and stage", sig='(takings, homeStage, at)')],
    inputs=[], outputs=[],
    tests=['tests/lot-tiers.test.ts'],
    below=[], above=[], dual='none: derived from the takings each time',
    seams=["the lot tier rules: the file is town's (handed off to town; these are its business reads)"], rules=[],
    impl='describe',
)
