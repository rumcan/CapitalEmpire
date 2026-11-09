"""business.event.stadium: Stadium site and crowd send. Map node (T410, issue 1110), read from the game (read only). Python port steered by fractal/_steer/business.event.stadium.json."""
from fractal.holon import Fn, Holon

STEER = {}

def todo_port(*, knobs=None, **kw):
    """the Python port is still to write (see HOLON.port)"""
    raise NotImplementedError(__name__)


HOLON = Holon(
    id='business.event.stadium', rung=3, title='Stadium site and crowd send',
    purpose="Where the stadium's footprint goes on the valley, and the crowd each town sends by population share.",
    requires=["placeStadium on seeds 1-3 gives a site, fully buildable, each town centre within the site's range, deterministically (event.test.ts).", "crowdFor splits a level's cars by population share (event.test.ts)."],
    files=['src/game/event/site.ts', 'src/game/event/config.ts'],
    dynamics=[Fn(name='crowdFor', at='src/game/event/site.ts:100', does='the cars a level sends from each town, by population share', sig='(level, pops, total)'),
        Fn(name='placeStadium', at='src/game/event/site.ts:91', does="the stadium's site on the class grid", sig='(cls, centres)')],
    inputs=[], outputs=[],
    tests=['tests/event.test.ts', 'tests/stadium-place.test.ts'],
    below=[], above=[], dual='none: the site is derived from the map each time',
    seams=['Site', 'the event tunables (config.ts)'], rules=[],
    impl='native',
    fn=todo_port, params={}, steer=STEER, port='todo: port crowdFor and placeStadium (event/site.ts:100, :91) with the tunables (event/config.ts)',
)
