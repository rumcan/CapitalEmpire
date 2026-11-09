"""people.identity: Who a person is (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='people.identity',
    rung=2,
    title='Who a person is',
    purpose="A person's name, job and look from its seed, and the predicate that says a library picture is a person.",
    requires=['A person is a library picture of a people category or a person id (person.ts isPerson).', 'The same seed, instance, look and role give the same person (personIdentity).'],
    below=['art'],
    above=['crowd', 'staff', 'animation'],
    dual='derived from the seed; nothing to undo',
    seams=['LibItem.person', 'PeopleClip'],
    rules=['people are never placeable'],
)
