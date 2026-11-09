"""people.identity.look: Person identity and portraits (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.identity.look',
    rung=3,
    title='Person identity and portraits',
    purpose="A person's name, job and look from its seed, and the portrait that matches that exact look.",
    requires=['personIdentity gives the same id, look, role, name and job for the same seed, instance, look and role.', "portraitOf never gives another person's look: it matches the look id, the state (upgraded, rundown, one) and the person's id or role."],
    files=['src/game/person-identity.ts', 'src/game/portraits.ts', 'src/game/golf/you.ts'],
    dynamics=[
        Fn(name='personIdentity', at='src/game/person-identity.ts:41', does="a clicked person's stable identity", sig='(seed, instance, lookId, role, ...) => PersonIdentity'),
        Fn(name='identityHash', at='src/game/person-identity.ts:8', does='a hash of the seed and a key', sig='(seed: number, key: string) => number'),
        Fn(name='portraitOf', at='src/game/portraits.ts:11', does="the approved portrait of a person's exact look", sig='(person, manifest, state) => PortraitPic | null')],
    inputs=['a seed, an instance key, a look id, a role'],
    outputs=['a PersonIdentity; a PortraitPic or null'],
    tests=['person-details.test.ts'],
    below=['art'],
    above=['ui.cards.you', 'people.crowd'],
    dual='derived from the seed; nothing to undo',
    seams=['assets/portraits/manifest.json'],
    rules=['new art used everywhere'],
    impl='native',
    steer={'states': ['upgraded', 'rundown', 'one']},
    port='todo: port personIdentity (person-identity.ts:41) with identityHash (:8), personJob (:25) and personLookIndex (:16); port portraitOf (portraits.ts:11) over a manifest dict',
    fn=ported,
)
