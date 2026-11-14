// The ball room's upgrade tree (T386, #1043; the owner: "some progression and automation", menus as side-opening flyouts, never a sideways scrollbar). A flyout
// beside the Range card, opening away from it in three columns as the flyouts of the rail do: the branches (Picking, Supply, then the staff, machines, nets and
// the golf side as they come), the branch's nodes in the order they are bought, and the open node (what it does, its price, what it needs, upkeep, a Buy button).
// Every node is a range upgrade (golf/rangesave.ts RANGE_UPGRADES with a branch) bought at once with the range's till. The columns narrow to fit the screen and
// scroll up and down inside themselves: nothing ever scrolls sideways.
import { useState } from 'react';
import type { RangeCardView } from '../../game/golf/rangehost';
import { BRANCH_NAME, type TreeBranch } from '../../game/golf/rangesave';

import { money } from './money';
import { PaybackLine } from './Decisions';
import { payback, rangeUpgradeExtra } from '../../game/golf/payback';
import { ActionTile, TILE_BIG, TILE_ROW, TILE_SMALL } from '../ActionTile'; // J8 (#1261), J13 (#1277): every node's painted tile, on its row and bigger on its open card
import { BRANCH_TILE, RANGE_UPGRADE_TILE } from '../tool-tiles';
/** a node's tile: its own (every upgrade has one), else its branch's */
export const nodeTile = (id: string, branch: TreeBranch) => RANGE_UPGRADE_TILE[id] ?? BRANCH_TILE[branch];
/** the branches in the order the first column lists them */
export const BRANCHES: readonly TreeBranch[] = ['picking', 'staff', 'machines', 'supply', 'golf'];
type Node = RangeCardView['upgrades'][number];
/** the verb of a node's throughput line (T386 part 3: a staff or machine node's balls an hour, from the host's view) */
const RATE_WORDS: Readonly<Record<string, string>> = { washer: 'Washes', robot: 'Picks', robot2: 'Picks', robot3: 'Picks', attendant: 'Picks', attendant2: 'Picks', attendant3: 'Picks' };

/** a node's state: built, ready to buy, or waiting on its prerequisites (the tree's own words; the money is the till's) */
export function nodeState(u: Pick<Node, 'owned' | 'why'>): 'built' | 'ready' | 'locked' { return u.owned ? 'built' : u.why ? 'locked' : 'ready'; }
/** the nodes of a branch, in the order they are listed (the upgrade list's order is the order they are bought) */
export const nodesOf = (list: readonly Node[], branch: TreeBranch): Node[] => list.filter(u => u.branch === branch);

export function BallTree({ view, onBuy, onClose, rightRem = 0.75 }: { view: RangeCardView; onBuy: (id: Node['id']) => void; onClose: () => void; /** the card's right edge (rem): the tree opens to its left */ rightRem?: number }) {
  const [branch, setBranch] = useState<TreeBranch>('picking');
  const nodes = nodesOf(view.upgrades, branch), [open, setOpen] = useState<Node['id'] | null>(null);
  const node = nodes.find(n => n.id === open) ?? nodes.find(n => !n.owned) ?? nodes[0] ?? null, till = view.balls?.till ?? 0, rate = node ? view.balls?.rates?.[node.id] : undefined;
  return (
    // (the columns open to the card's left: the first, the branches, stands beside the card; each is its own height, scrolling up and down only)
    <div className="flyouts" style={{ top: 'var(--hud-top, 6rem)', left: 'auto', right: `calc(${rightRem}rem + 340px + 0.4rem)`, flexDirection: 'row-reverse', maxWidth: 'calc(100vw - 28rem)' }} data-testid="ball-tree">
      <div className="flyout glass" style={{ width: 188, maxHeight: 'calc(var(--vh-ui, 100vh) - var(--hud-top, 6rem) - 4.5rem)' }} role="menu" data-flyout-col="0">
        <div className="flyout-caption flex items-center justify-between"><span>Ball room upgrades</span><button className="btn-icon" onClick={onClose} title="Close the tree" aria-label="Close the tree">×</button></div>
        <div className="flex items-center gap-1.5 px-1.5 pb-1 text-[12px] text-slate-300" data-testid="ball-tree-till" title="What the range has taken, less what it has spent on its gear: every node here is bought with it"><ActionTile tile="range-till" size={TILE_SMALL - 4} /><span>Range till <span className="font-semibold text-emerald-300">{money(till)}</span></span></div>
        {BRANCHES.map(k => { const list = nodesOf(view.upgrades, k), done = list.filter(n => n.owned).length; return (
          <button key={k} type="button" role="menuitem" className={`flyout-row ${branch === k ? 'flyout-row-open' : ''}`} onClick={() => { setBranch(k); setOpen(null); }} onMouseEnter={() => { if (branch !== k) { setBranch(k); setOpen(null); } }} data-testid={`ball-tree-branch-${k}`}>
            <ActionTile tile={BRANCH_TILE[k]} size={TILE_SMALL + 4} />
            <span className="flyout-text"><span className="flyout-label">{BRANCH_NAME[k]}</span><span className="flyout-why">{done} of {list.length} bought</span></span>
            <span className="flyout-more" aria-hidden>▸</span>
          </button>
        ); })}
      </div>
      <div className="flyout glass" style={{ width: 208, maxHeight: 'calc(var(--vh-ui, 100vh) - var(--hud-top, 6rem) - 4.5rem)' }} role="menu" data-flyout-col="1" data-testid="ball-tree-nodes">
        <div className="flyout-caption">{BRANCH_NAME[branch]}</div>
        {nodes.map(n => { const st = nodeState(n); return (
          <button key={n.id} type="button" role="menuitem" className={`flyout-row ${node?.id === n.id ? 'flyout-row-open' : ''} ${st === 'locked' ? 'flyout-row-locked' : ''}`} onClick={() => setOpen(n.id)} onMouseEnter={() => setOpen(n.id)} data-testid={`ball-tree-node-${n.id}`} data-state={st}>
            <ActionTile tile={nodeTile(n.id, branch)} size={TILE_ROW} />
            <span className="flyout-text">
              <span className="flyout-label">{n.name}</span>
              <span className={`flyout-why ${st === 'built' ? '!text-emerald-300' : st === 'ready' ? '!text-amber-200' : ''}`}>{st === 'built' ? 'Bought' : `${money(n.cost)}${st === 'locked' && view.needs[n.id].length ? ` · needs ${view.needs[n.id].join(' and ')}` : ''}`}</span>
            </span>
          </button>
        ); })}
      </div>
      {node && (
        <div className="flyout glass" style={{ width: 232, maxHeight: 'calc(var(--vh-ui, 100vh) - var(--hud-top, 6rem) - 4.5rem)' }} data-flyout-col="2" data-testid="ball-tree-node">
          <div className="flex items-center gap-2 px-1.5 py-1"><ActionTile tile={nodeTile(node.id, branch)} size={TILE_BIG} /><span className="text-[14px] font-semibold text-amber-200">{node.name}</span></div>
          <div className="px-1.5 text-[12.5px] leading-snug text-slate-200">{node.effect}</div>
          {rate !== undefined && <div className="px-1.5 pt-1 text-[12px] text-sky-200" data-testid="ball-tree-rate">{RATE_WORDS[node.id] ?? 'Takes'} about {rate.toLocaleString()} balls an hour{node.id.startsWith('robot') ? ' (a pair, over a charge)' : node.id.startsWith('attendant') ? ' (on his shift)' : ''}</div>}
          <div className="px-1.5 pt-1 text-[12px] text-slate-400">Price {money(node.cost)}{node.upkeep ? ` · upkeep ${money(node.upkeep)} a month` : ''}{view.needs[node.id].length ? ` · needs ${view.needs[node.id].join(' and ')}` : ''}</div>
          {/* J4 (#1207): what it earns back (golf/payback.ts: the range's demand model; the ball room's gear mostly saves work, not money) */}
          {!node.owned && <div className="px-1.5 pt-1"><PaybackLine p={payback(node.cost, node.upkeep, rangeUpgradeExtra(view.biz, view.demand, view.dayLen, node.id))} testid="ball-tree-payback" /></div>}
          <div className="px-1.5 pt-2">
            {node.owned ? <span className="text-emerald-300">Bought</span>
              : <button className="chip chip-on disabled:opacity-40" disabled={!!node.why} onClick={() => onBuy(node.id)} title={node.why || `Buy it with the range's till (${money(node.cost)})`} data-testid={`ball-tree-buy-${node.id}`}>Buy {money(node.cost)}</button>}
            {!node.owned && node.why && <div className="pt-1 text-[12px] text-amber-300/80" data-testid="ball-tree-why">{node.why}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
