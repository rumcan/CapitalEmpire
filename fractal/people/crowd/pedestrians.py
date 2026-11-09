"""people.crowd.pedestrians: Townspeople on the sidewalks (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.crowd.pedestrians',
    rung=3,
    title='Townspeople on the sidewalks',
    purpose='The townspeople who stroll the sidewalks, stop, and go indoors at the houses and shops.',
    requires=['Townspeople walk at WALK_SPEED 0.7 tiles a second: 1.4 m a second at 2 m a tile (pedestrians.ts:15).', 'A walker shows one of the eight facing rows (facing, pedestrians.ts:67).'],
    files=['src/game/ext/pedestrians/pedestrians.ts', 'src/game/ext/pedestrians/index.ts'],
    dynamics=[
        Fn(name='Pedestrians', at='src/game/ext/pedestrians/pedestrians.ts:92', does='the townspeople of a town', sig='class Pedestrians'),
        Fn(name='sidewalks', at='src/game/ext/pedestrians/pedestrians.ts:53', does='the sidewalk lines of the roads', sig='(roads, weight?) => Sidewalk[]'),
        Fn(name='populate', at='src/game/ext/pedestrians/pedestrians.ts:202', does='fills the town with n walkers', sig='(n) => void'),
        Fn(name='step', at='src/game/ext/pedestrians/pedestrians.ts:242', does='moves every walker by dt', sig='(dt) => void')],
    inputs=['the roads, the doors, a seed'],
    outputs=['WalkerView per walker'],
    tests=['ext-pedestrians.test.ts', 'person-details.test.ts'],
    below=['people.animation', 'town'],
    above=['render', 'people.crowd.view'],
    dual='identityState and restoreIdentities (pedestrians.ts:128, :135) save and restore who is who',
    seams=['Door', 'Sidewalk'],
    rules=['performance is a hard gate'],
    impl='native',
    steer={'walk_speed': 0.7, 'stride_m': 0.175, 'cross': 7, 'arrive': 3, 'indoors': [8, 45]},
    port='todo: port the Pedestrians class (pedestrians.ts:92): sidewalks (:53), populate (:202), step (:242), frame (:285)',
    fn=ported,
)
