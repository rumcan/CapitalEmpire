// A road class drawn as a small picture for the road panel: a short stretch running up to the right across grass, its surface, sidewalks
// or verges, median, lane lines, centre line, shoulders and trees taken from the class itself (so a new class or variant draws itself).
import type { RoadClass } from '../game/network';

const SURFACE: Record<string, string> = { gravel: '#9b8668', asphaltWorn: '#555a61', asphalt: '#43474e', asphaltDark: '#33363c' };
const WALK: Record<string, string> = { slabs: '#bdb5a5', gravel: '#9d8d70' };
const W = 112, H = 48, K = 3; // picture size (px) and px per tile across the road

export function RoadThumb({ cls, w = W, h = H }: { cls: RoadClass; w?: number; h?: number }) {
  const half = cls.h + cls.walk, y = (o: number) => H / 2 + o * K, L = -40, R = W + 40;
  const band = (o0: number, o1: number, fill: string, key: string) => <rect key={key} x={L} y={y(o0)} width={R - L} height={(o1 - o0) * K} fill={fill} />;
  const line = (o: number, stroke: string, dash: string | undefined, key: string, wd = 0.9) => <line key={key} x1={L} x2={R} y1={y(o)} y2={y(o)} stroke={stroke} strokeWidth={wd} strokeDasharray={dash} />;
  const parts: React.ReactNode[] = [];
  parts.push(band(-half, half, WALK[cls.walkTex] ?? '#bdb5a5', 'walk'));
  parts.push(band(-cls.h, cls.h, SURFACE[cls.tex] ?? '#43474e', 'surface'));
  if (cls.median) parts.push(band(-cls.median / 2, cls.median / 2, '#5d7a3a', 'median'));
  if (cls.medianTrees) for (let x = 6; x < W; x += 14) parts.push(<circle key={`mt${x}`} cx={x} cy={y(0)} r={2.6} fill="#2f5a24" />);
  if (cls.streetTrees) for (const s of [-1, 1]) for (let x = 3; x < W; x += 16) parts.push(<circle key={`st${s}${x}`} cx={x} cy={y(s * (half - 0.35))} r={2.4} fill="#2f5a24" />);
  if (cls.shoulder) for (const s of [-1, 1]) parts.push(line(s * (cls.h - cls.shoulder), '#e7c24a', undefined, `sh${s}`, 0.7));
  // lane lines: a one-way class lists them across the whole width, a two-way class for one side (mirrored)
  const lanes = cls.oneway ? cls.laneLines : cls.laneLines.flatMap(o => [o, -o]);
  lanes.forEach((o, i) => parts.push(line(o, '#e8e8e2', '4 3', `ll${i}`, 0.7)));
  if (!cls.oneway) {
    if (cls.centre === 'dashed' || cls.centre === 'style') parts.push(line(0, '#e7c24a', '5 3', 'c'));
    else if (cls.centre === 'double') { parts.push(line(-0.25, '#e7c24a', undefined, 'c1', 0.7)); parts.push(line(0.25, '#e7c24a', undefined, 'c2', 0.7)); }
    else if (cls.centre === 'twltl') { parts.push(line(-0.9, '#e7c24a', undefined, 't1', 0.7)); parts.push(line(0.9, '#e7c24a', undefined, 't2', 0.7)); parts.push(line(-0.6, '#e7c24a', '4 3', 't3', 0.6)); parts.push(line(0.6, '#e7c24a', '4 3', 't4', 0.6)); }
  } else for (let x = 14; x < W; x += 30) parts.push(<path key={`ar${x}`} d={`M${x} ${y(0) - 2.5} l5 2.5 l-5 2.5`} fill="none" stroke="#e8e8e2" strokeWidth={0.9} />);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={w} height={h} className="shrink-0 rounded-md" aria-hidden>
      <rect width={W} height={H} fill="#4f6b2c" />
      <g transform={`rotate(-16 ${W / 2} ${H / 2})`}>{parts}</g>
      <rect width={W} height={H} fill="none" stroke="rgba(0,0,0,.35)" />
    </svg>
  );
}
