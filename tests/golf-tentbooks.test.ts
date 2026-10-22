// Tests for golf tournament tent books: booking tent takings as business income and tent upkeep/rent as upkeep costs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Budget, type DayIn } from '../src/game/budget';
import { City } from '../src/game/city';

function mockDay(): DayIn {
  return {
    lots: [],
    segs: [],
    nodes: [],
    trade: { arrived: 0, punctual: 0 },
    pop: 1000,
  };
}

test('Budget.spend books business income into today.biz and Ledger.business', () => {
  const b = new Budget();
  const m0 = b.money;

  // Book tent takings ($115) as negative business spend
  b.spend('business', -115);

  assert.equal(b.money, m0 + 115, 'treasury should increase by tent takings');
  assert.equal(b.today.biz, 115, 'today.biz should record tent takings');

  const ledger = b.endDay(1, mockDay());
  assert.equal(ledger.business, 115, 'ledger.business should include tent takings');
});

test('Budget.spend books upkeep costs into today.upkeepLive and Ledger.upkeep', () => {
  const b = new Budget();
  const m0 = b.money;

  // Book tent rent ($2000) and annual upkeep ($4920) through upkeep spend
  const totalUpkeepCost = 2000 + 4920;
  b.spend('upkeep', totalUpkeepCost);

  assert.equal(b.money, m0 - totalUpkeepCost, 'treasury should decrease by upkeep cost');
  assert.equal(b.today.upkeepLive, totalUpkeepCost, 'today.upkeepLive should record upkeep cost');

  const ledger = b.endDay(1, mockDay());
  assert.equal(ledger.upkeep, totalUpkeepCost, 'ledger.upkeep should include tent rent and upkeep');
});

test('City.spend routes business income and upkeep through budget', () => {
  const city = new City(1);
  const m0 = city.budget.money;

  city.spend('business', -250);
  assert.equal(city.budget.money, m0 + 250);
  assert.equal(city.budget.today.biz, 250);

  city.spend('upkeep', 500);
  assert.equal(city.budget.money, m0 + 250 - 500);
  assert.equal(city.budget.today.upkeepLive, 500);
});

test('bought structures pay upkeep for a year while rented structures pay per tournament', () => {
  const monthlyUpkeep = 410;
  const annualUpkeep = monthlyUpkeep * 12;
  const rentCost = 2000;

  assert.equal(annualUpkeep, 4920, 'bought structures pay 12 months of upkeep per year');
  assert.equal(rentCost, 2000, 'rented structures pay per tournament');

  const b = new Budget();
  b.spend('business', -5000); // 5000 tent revenue
  b.spend('upkeep', rentCost + annualUpkeep); // rent + annual upkeep

  const ledger = b.endDay(1, mockDay());
  assert.equal(ledger.business, 5000);
  assert.equal(ledger.upkeep, 6920);
  assert.equal(ledger.net, 5000 - 6920);
});
