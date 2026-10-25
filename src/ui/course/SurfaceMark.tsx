// A surface's small disc with its mark (T118): the same mark the paint cursor's chip carries beside the pointer (ext/course-cursor MARKS),
// drawn as an inline SVG for the hint pill and the Course panel's surface chips, so a surface reads by its shape as well as its colour:
// a flag on green, stripes on fairway, a ball on its tee peg on tee, tufts on rough, wisps on fescue, grains on bunker, pebbles on waste,
// ripples on water, lanes on a cart path. Light glyphs on a dark halo, as on the chip.
import { SURFACE_TINT, markOf, type MarkKind } from '../../game/ext/course-cursor';

const LIGHT = '#fbf8ec', HALO = 'rgba(10,16,8,0.7)';

/** a light stroke on a dark halo */
function Glyph({ d, light = LIGHT, w = 0.9 }: { d: string; light?: string; w?: number }) {
  return <><path d={d} fill="none" stroke={HALO} strokeWidth={w + 1} strokeLinecap="round" strokeLinejoin="round" /><path d={d} fill="none" stroke={light} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" /></>;
}

/** the mark's shapes in the 24 x 18 box (the disc's top face: centre 12, 8, half axes 10.5 and 5.25) */
function MarkShapes({ mark, id }: { mark: MarkKind; id: string }) {
  switch (mark) {
    case 'flag': return <>
      <ellipse cx="10" cy="10" rx="1.6" ry="0.8" fill="rgba(16,24,12,0.85)" />
      <Glyph d="M10 10 V1.4" w={1} />
      <path d="M10.4 1.4 L16 3 L10.4 4.6 Z" fill="#ffd23f" stroke="rgba(46,28,0,0.9)" strokeWidth="0.6" strokeLinejoin="round" />
    </>;
    case 'stripes': return <g clipPath={`url(#${id})`}>
      {[-6, 0, 6].map(o => <path key={o} d={`M${3 + o} 15 L${10 + o} 1 L${13 + o} 1 L${6 + o} 15 Z`} fill="rgba(255,255,232,0.5)" />)}
    </g>;
    case 'peg': return <>
      <path d="M11.4 11 L12.6 11 L13.4 7.6 L10.6 7.6 Z" fill="#f2ece0" stroke="rgba(20,18,14,0.85)" strokeWidth="0.5" />
      <circle cx="12" cy="5.4" r="2.5" fill="#fdfdf9" stroke="rgba(20,18,14,0.9)" strokeWidth="0.6" />
    </>;
    case 'tufts': return <>
      {/* three tufts of three leaves on a wide base (grass, never an arrow) */}
      {[[6, 10.6, 1], [12, 8, 1], [18, 11.2, 0.9]].map(([x, y, k]) => (
        <path key={x} fill={LIGHT} stroke={HALO} strokeWidth="0.5" strokeLinejoin="round" paintOrder="stroke"
          d={`M${x - 1.5 * k} ${y} Q${x - 1.8 * k} ${y - 1.9 * k} ${x - 2.7 * k} ${y - 3.3 * k} Q${x - 1.1 * k} ${y - 2.2 * k} ${x - 0.55 * k} ${y} Z M${x - 0.5 * k} ${y} Q${x - 0.3 * k} ${y - 2.6 * k} ${x + 0.15 * k} ${y - 4.6 * k} Q${x + 0.45 * k} ${y - 2.4 * k} ${x + 0.55 * k} ${y} Z M${x + 0.6 * k} ${y} Q${x + 1.2 * k} ${y - 2 * k} ${x + 2.7 * k} ${y - 3.2 * k} Q${x + 1.8 * k} ${y - 1.7 * k} ${x + 1.5 * k} ${y} Z`} />
      ))}
    </>;
    case 'wisps': return <>
      <Glyph d="M8 11 Q7.4 7 5.6 3.6 M8.6 11 Q9 7 9.6 3 M15 10 Q15.6 6.6 17.4 3.6 M14.4 10 Q14 6.6 13.2 3.4" w={0.8} light="#fbeec4" />
      {[[5.6, 3.6], [9.6, 3], [17.4, 3.6], [13.2, 3.4]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="0.8" ry="1.1" fill="#f6dc8a" stroke={HALO} strokeWidth="0.4" />)}
    </>;
    case 'grains': return <>
      {[[7, 6.5], [10.5, 5], [14, 6], [17.5, 7.5], [5.5, 9], [9, 8.6], [12.6, 9], [16, 10], [8, 11.4], [12, 12], [15.2, 12.2], [19, 9.6]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="0.75" fill="rgba(84,56,24,0.95)" />)}
    </>;
    case 'pebbles': return <>
      {[[7.5, 7], [13, 5.8], [16.5, 9.4], [10, 10.6], [5.4, 10]].map(([x, y]) => <ellipse key={x} cx={x} cy={y} rx="1.6" ry="1" fill="#a9a294" stroke="rgba(30,24,16,0.85)" strokeWidth="0.5" />)}
    </>;
    case 'ripples': return <Glyph d="M4.5 6.4 Q6 5.2 7.5 6.4 T10.5 6.4 T13.5 6.4 M9.5 9.2 Q11 8 12.5 9.2 T15.5 9.2 T18.5 9.2 M5.5 11.6 Q7 10.4 8.5 11.6 T11.5 11.6" light="#eaf7ff" />;
    case 'lanes': return <g clipPath={`url(#${id})`}><Glyph d="M2 12.5 L22 4.5 M3.6 15 L23.6 7" light="#fff4e4" w={0.8} /></g>;
    default: return null;
  }
}

/** the disc of brush kind `kind` (fairway, green, tee, rough, bunker, water, path, ...) with its mark, size px wide */
export function SurfaceMark({ kind, size = 24, title }: { kind: string; size?: number; title?: string }) {
  const id = `sm-${kind}`, tint = SURFACE_TINT[kind] ?? '#8aa860', mark = markOf(kind);
  return (
    <svg width={size} height={(size * 18) / 24} viewBox="0 0 24 18" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} className="inline-block shrink-0 align-middle">
      {title && <title>{title}</title>}
      <defs><clipPath id={id}><ellipse cx="12" cy="8" rx="10.5" ry="5.25" /></clipPath></defs>
      {/* the side wall, the top face in the surface's tint, its rim */}
      <path d="M1.5 8 V11 A10.5 5.25 0 0 0 22.5 11 V8 Z" fill="#4a3a28" />
      <ellipse cx="12" cy="8" rx="10.5" ry="5.25" fill={tint} />
      <path d="M1.5 8 A10.5 5.25 0 0 0 22.5 8" fill="none" stroke="rgba(255,246,214,0.6)" strokeWidth="0.6" />
      <MarkShapes mark={mark} id={id} />
    </svg>
  );
}
