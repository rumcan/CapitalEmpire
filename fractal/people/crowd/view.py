"""people.crowd.view: Crowd picture: frames and seeded people (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import math

M = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """32-bit multiply, as Math.imul"""
    return ((a & M) * (b & M)) & M


def hash2(a: int, b: int) -> float:
    """a deterministic hash of two integers in [0, 1) (crowdview.ts hash)"""
    h = _imul(a, 0x9E3779B1) ^ _imul(b + 0x7F4A7C15, 0x85EBCA77)
    h = _imul(h ^ (h >> 16), 0x7FEB352D)
    h = _imul(h ^ (h >> 15), 0x846CA68B)
    return ((h ^ (h >> 16)) & M) / 4294967296


def clip_frame(clip: dict, t: float) -> int:
    """the frame (absolute: start + k) of a clip t seconds in (crowdview.ts clipFrame): a loop wraps, a one-shot holds its last frame"""
    start, n, times, loop = clip["start"], clip["n"], clip["times"], clip["loop"]
    if n <= 1:
        return start
    t0 = times[0]
    span = times[n - 1] - t0
    total = span + span / (n - 1)
    u = t - t0
    if u <= 0 or total <= 0:
        return start
    if loop:
        u = math.fmod(u, total)
    for k in range(n - 1, 0, -1):
        if u >= times[k] - t0:
            return start + k
    return start

HOLON = Holon(
    id='people.crowd.view',
    rung=3,
    title='Crowd picture: frames and seeded people',
    purpose='The frame a person shows at a time, and the seeded hash every crowd position and time comes from.',
    requires=["clipFrame loops a loop clip, holds a one-shot on its last frame, and shows the first frame before the clip's first time (crowdview.ts:27).", 'hash(a, b) is a float in [0, 1), the same for the same two integers (crowdview.ts:19).'],
    files=['src/game/crowdview.ts', 'src/game/spacing.ts'],
    dynamics=[
        Fn(name='clipFrame', at='src/game/crowdview.ts:27', does='the frame of a clip t seconds in', sig='(clip: PeopleClip, t: number) => number'),
        Fn(name='hash', at='src/game/crowdview.ts:19', does='a deterministic hash of two integers', sig='(a: number, b: number) => number'),
        Fn(name='galleryPeople', at='src/game/crowdview.ts:84', does='fills the spectators of one gallery', sig='(G, o, spot, now, people, out, cheer?, seating?, places?) => number'),
        Fn(name='queuePeople', at='src/game/crowdview.ts:112', does='fills a queue at a stop or a gate', sig='(x, y, fx, fy, count, key, now, people, out) => number'),
        Fn(name='walkerPeople', at='src/game/crowdview.ts:130', does='fills a walking party', sig='(W, o, idx, now, people, out, stride?) => number')],
    inputs=['a clip and a time; the gallery, queue and walker buffers'],
    outputs=['a frame number; CrowdPerson slots'],
    tests=['crowdview.test.ts', 'event-seating.test.ts', 'spacing.test.ts', 't377-spectators-carts.test.ts'],
    below=['people.animation', 'people.identity'],
    above=['render', 'people.galleries', 'people.crowd.walkers'],
    dual='derived each frame; nothing to undo',
    seams=['SPECTATOR_CLIPS', 'PlacedSeating'],
    rules=['performance is a hard gate', 'lit sprites are never mirrored'],
    impl='native',
    params={'clip': 'a clip dict: start, n, times, loop', 't': "float, seconds on the clip's own axis"},
    steer={'stand_max': 90, 'plain_max': 60, 'queue_max': 24, 'party_max': 3, 'cheer_spread': 0.4, 'place_jitter': 0.28},
    port='todo: port galleryPeople (crowdview.ts:84), queuePeople (:112) and walkerPeople (:130) on the steer caps; clip_frame and hash are ported',
    fn=clip_frame,
)
