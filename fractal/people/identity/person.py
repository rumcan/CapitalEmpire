"""people.identity.person: Predicate: is this a person (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

import re


def is_person_id(pid: str, knobs: dict) -> bool:
    """whether an id names a person (the knobs' id_pattern; person.ts PERSON_ID)"""
    return re.match(knobs["id_pattern"], pid) is not None


def is_person(item: dict, knobs: dict) -> bool:
    """a library picture is a person: tagged, of a people category, or named as one (person.ts isPerson)"""
    if item.get("person") is True or item.get("kind") == "person" or item.get("cat") in knobs["cats"]:
        return True
    return is_person_id(str(item.get("id", "")), knobs)


def drop_people(tuples: list, lookup: dict, knobs: dict) -> list:
    """the saved prop tuples without people (person.ts dropPeople); lookup maps an id to its library picture"""
    keep = []
    for t in tuples:
        pid = t[0] if t else None
        if not isinstance(pid, str):
            keep.append(t)
            continue
        it = lookup.get(pid)
        if is_person_id(pid, knobs) or (it is not None and is_person(it, knobs)):
            continue
        keep.append(t)
    return keep

HOLON = Holon(
    id='people.identity.person',
    rung=3,
    title='Predicate: is this a person',
    purpose='Says whether a library picture or a saved prop is a person, so the Props catalogue, the studio and the loader ask one question.',
    requires=['isPerson is true for a picture tagged person, of kind person, of cat Townspeople, Spectators, Golfers or New: People, or with an id starting person:, golfer:, spectator:, staff:, crowd: or a people prop.', 'dropPeople keeps every saved prop that is not a person; a person in an old save is dropped with nothing refunded.'],
    files=['src/game/person.ts'],
    dynamics=[
        Fn(name='isPerson', at='src/game/person.ts:19', does='says whether a library picture is a person', sig='(it: PersonLike) => boolean'),
        Fn(name='dropPeople', at='src/game/person.ts:24', does='drops the people from saved prop tuples on load', sig='<T>(tuples, lookup) => T[]')],
    inputs=['a library picture dict: id, cat, kind, person'],
    outputs=['true or false'],
    tests=['people-not-placeable.test.ts', 'props-all.test.ts'],
    below=['art'],
    above=['ui.tools.place', 'town'],
    dual='MISSING: a person dropped from an old save by dropPeople is not restored, and nothing is refunded',
    seams=['LibItem (types.ts)'],
    rules=['people are never placeable'],
    impl='native',
    params={'item': 'a library picture dict: id, cat, kind, person'},
    steer={'cats': ['Townspeople', 'Spectators', 'Golfers', 'New: People'], 'id_pattern': '^(person:|golfer:|spectator:|staff:|crowd:|newprop:(golfer|caddie|marshal|course-worker|catering-staff)(-|$))'},
    fn=is_person,
)
