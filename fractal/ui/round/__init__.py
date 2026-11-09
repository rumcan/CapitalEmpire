"""ui.round: The round on screen (T410 map)."""
from fractal.holon import Holon

HOLON = Holon(
    id='ui.round',
    rung=2,
    title='The round on screen',
    purpose="The shot panel and spin ball during a shot, and the round's bar, score and match cards.",
    requires=["The shot panel is open only while the owner's shot is due, and the game is paused for it (ShotPanel header).", 'The spin ball puts spin on the ball before the shot, and adds more in the air (SpinBall header).'],
    below=['play'],
    above=['ui.cards'],
    dual='MISSING: a struck shot cannot be taken back from the panel',
    rules=['performance is a hard gate'],
)
