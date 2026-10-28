// The golf top bar's title (T235, #690; the concept's): the club's name in the serif over "Year 3 • October • Sunny 16°C", the weather in gold.
// golf/clubtitle.ts words it. The owner's one-row rule (T135, T233) holds: from 2560 px the full name ("Maple Falls Golf & Country Club") and the
// month in full; narrower the compact title ("Maple Falls G&CC", "Year 3 • Oct", the name and the line a size smaller), which is no wider than
// the old two-line title was at the widths where the bar is full (2200 to 2559 px: the chips' words and the tier's line are in); below 1900 px
// the words are hidden (App). Both forms are in the markup and the width picks one (index.css .title-full / .title-compact), so nothing is
// measured in script. The full text is the block's tooltip (the App puts it on the leaf too, so it is there where the words are hidden).
import type { ClubTitle } from '../game/golf/clubtitle';

/** the width from which the title is drawn in full (index.css: .title-full shows and .title-compact hides from this width) */
export const TITLE_FULL_FROM = 2560;
/** the width from which the golf bar draws the title's words at all (T233; narrower, the leaf and its tooltip) */
export const TITLE_WORDS_FROM = 1900;

export function ClubTitleText({ title }: { title: ClubTitle }) {
  return (
    <div className="club-title" data-testid="club-title">
      <div className="club-title-name font-display" data-testid="title-name">
        <span className="title-full">{title.name}</span><span className="title-compact">{title.short}</span>
      </div>
      <div className="club-title-sub" data-testid="title-sub">
        <span className="title-full">{title.when}</span><span className="title-compact">{title.whenShort}</span><span> • </span><span className="club-title-weather">{title.weather}</span>
      </div>
    </div>
  );
}
