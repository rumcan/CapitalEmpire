// The owner's fixes for one frame of a townsperson's walk (the sprite studio's People tab). They are stored in
// scripts/assets/walker-fixes.json as { personId: { DIR: { frameIndex: code } } } and applied by prep-sprites.mjs and by the
// studio's /frame/ route. A code is one of:
//   'mirror'                  the frame flipped left to right
//   'use:<k>'                 frame k (0 idle, 1-8 the walk) of the same facing (row), as drawn
//   'use-mirror:<k>'          the same, flipped
//   'use:<DIR>:<k>'           frame k of the facing DIR (S SW W NW N NE E SE)
//   'use-mirror:<DIR>:<k>'    the same, flipped
//   'new'                     a new picture is needed; the owner drops it in (newFramePath)
// '' (or anything else) means no fix.
import path from 'node:path';

export const NEW_FRAMES_DIR = 'scripts/assets/walker-frames';
const USE = /^use(-mirror)?:(?:(S|SW|W|NW|N|NE|E|SE):)?([0-8])$/;

/** a fix code as an object: { kind: 'mirror' } | { kind: 'use', dir, frame, mirror } | { kind: 'new' }; null for '' and unknown codes */
export function parseFix(op) {
  if (typeof op !== 'string') return null;
  if (op === 'mirror') return { kind: 'mirror' };
  if (op === 'new') return { kind: 'new' };
  const m = USE.exec(op);
  return m ? { kind: 'use', dir: m[2] ?? null, frame: +m[3], mirror: !!m[1] } : null;
}

/** the code of a parsed fix, the inverse of parseFix; '' for no fix */
export function fixCode(f) {
  if (f?.kind === 'mirror') return 'mirror';
  if (f?.kind === 'new') return 'new';
  if (f?.kind === 'use') return `use${f.mirror ? '-mirror' : ''}:${f.dir ? f.dir + ':' : ''}${f.frame}`;
  return '';
}

/** where the picture dropped in for a 'new' frame is kept: <root>/scripts/assets/walker-frames/<person>/<DIR>-<k>.png */
export function newFramePath(root, personId, dir, frame) {
  return path.join(root, NEW_FRAMES_DIR, personId.replace(/[^a-z0-9_.-]/gi, '_'), `${dir}-${frame}.png`);
}

/** a short label for a fix code, for the studio and the build log: 'mirrored', 'frame 3', 'SE frame 2', 'new frame needed' */
export function describe(op) {
  const f = parseFix(op); if (!f) return '';
  if (f.kind === 'mirror') return 'mirrored';
  if (f.kind === 'new') return 'new frame needed';
  return `${f.dir ? f.dir + ' ' : ''}frame ${f.frame}${f.mirror ? ' mirrored' : ''}`;
}
