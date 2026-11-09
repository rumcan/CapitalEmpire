"""business.money: Money: the budget, costs and sponsors (T410). The treasury and its ledger, the surface build and upkeep costs, and the tournament's sponsors and TV money."""
from fractal.holon import Holon

HOLON = Holon(
    id='business.money', rung=2, title='Money: the budget, costs and sponsors',
    purpose="The treasury and its ledger, the surface build and upkeep costs, and the tournament's sponsors and TV money.",
    requires=['Property tax: a built residential lot on a street at access 1 pays 12 (budget.test.ts).', "A surface's build cost is its area times its unit cost, by seed or sod (golf/costs.ts:65-76)."],
    below=['course', 'town'], above=['ui', 'core'],
    dual=None, rules=[],
)
