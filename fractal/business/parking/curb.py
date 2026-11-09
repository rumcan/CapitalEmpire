"""business.parking.curb: On-street curbs and the car park look. Map node (T410, issue 1110), read from the game (read only). Describe only: runs in the live renderer or the UI."""
from fractal.holon import Fn, Holon



HOLON = Holon(
    id='business.parking.curb', rung=3, title='On-street curbs and the car park look',
    purpose='Parking along a kerb of a straight road run, and the look of a paved car park.',
    requires=['A curb is a straight run of road between two junctions, its kerb lane parked (event/curb.ts header).'],
    files=['src/game/event/curb.ts', 'src/game/event/parklook.ts'],
    dynamics=[Fn(name='curbRun', at='src/game/event/curb.ts:58', does='the run of road a curb takes', sig='(net, def)'),
        Fn(name='curbCheck', at='src/game/event/curb.ts:70', does='whether a curb may be laid', sig='(net, def, tollKeys)'),
        Fn(name='parkLook', at='src/game/event/parklook.ts:54', does='the look of a paved car park: kerbs, bays, islands, lamps', sig='(pk, door, walls)')],
    inputs=[], outputs=[],
    tests=['tests/curb.test.ts', 'tests/golf-parklook.test.ts', 'tests/parking-city.test.ts'],
    below=[], above=[], dual='none: derived from the road network',
    seams=['CurbDef'], rules=["town jams are the player's job (never auto-fix congestion)"],
    impl='describe',
)
