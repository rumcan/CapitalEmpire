"""play: Golf play (T410, issue 1110). The golf round as the owner and the AI golfers play it: the swing, the ball's flight and roll, lies, wind, the bag, cards, rounds and the range ball loop."""
from fractal.holon import Holon

HOLON = Holon(
    id='play', rung=1, title='Golf play',
    purpose="The golf round as the owner and the AI golfers play it: the swing, the ball's flight and roll, lies, wind, the bag, cards, rounds and the range ball loop.",
    requires=["Every golfer x hole draws from its own seeded stream, so one golfer's play does not change another's (golf/play/shot.ts header).", 'A round is the same for the same seed and inputs (golf/play/round.ts playRound; golf-play.test.ts).', "The owner's shots are made with the swing meter, the shape and the spin; the AI golfers' shots come from the model (golf/play/shot.ts hitShot)."],
    below=['land', 'course'], above=['ui', 'people', 'business', 'render'],
    rules=['performance is a hard gate (the frame stays in budget)'],
)
