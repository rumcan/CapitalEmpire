"""play.view: What the round looks like (T410). The round at a game minute: the golfers, the balls, the leaderboard and the everyday car park's cars."""
from fractal.holon import Holon

HOLON = Holon(
    id='play.view', rung=2, title='What the round looks like',
    purpose="The round at a game minute: the golfers, the balls, the leaderboard and the everyday car park's cars.",
    requires=["The leaderboard shows each row's position, name, to par and holes thru, and the owner's row when he is below the top (golf/play/board.ts header)."],
    below=['render', 'course'], above=['ui', 'render'],
    dual=None, rules=[],
)
