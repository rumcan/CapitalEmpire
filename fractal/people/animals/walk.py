"""people.animals.walk: Graze and walk clips of the farm animals (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

def ported(knobs: dict):
    """the Python port is still to write: see HOLON.port"""
    raise NotImplementedError('port todo: see HOLON.port')

HOLON = Holon(
    id='people.animals.walk',
    rung=3,
    title='Graze and walk clips of the farm animals',
    purpose="The animals' walk, graze and look-up clips: how each farm animal moves on its frames once the town has placed it.",
    requires=['The animal clips are graze (4 frames, loop), lookup (3, one-shot) and walk (8 frames) per heading (animals-library.ts ANIMAL_CLIPS).', "Cows walk at 0.28 tiles a second, horses 0.40, sheep 0.20 (ANIMAL_SPEED, the town's farm runtime; see seams)."],
    dynamics=[
        Fn(name='ANIMAL_CLIPS', at='src/game/animals-library.ts', does='the graze, lookup and walk clips of an animal', sig="Record<'graze' | 'lookup' | 'walk', PeopleClip>")],
    inputs=["an animal's heading and clip name"],
    outputs=['the frame to draw'],
    tests=['farm-animals.test.ts', 'farm-paddock.test.ts'],
    below=['people.animals.library', 'people.animation'],
    above=['town.farms', 'render'],
    dual='derived each frame from the seed and the time; nothing to undo',
    seams=["town.farms: the herd plan and the placement (ext/farms/animals.ts, herd.ts) are town's, and only the clips and frames are people's"],
    rules=['lit sprites are never mirrored'],
    impl='describe',
)
