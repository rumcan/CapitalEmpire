// The 'maple-valley' word lists (T012): a small-town North American valley of maples, creeks, mills and bass lakes.
// Pure data, no logic: a new setting is a new file in this shape, wired up in names.ts (SETTINGS). Lists are packed
// strings (space = one word, | = one entry) to keep the data dense, as in the rest of the codebase.

/** the word lists one setting supplies: every list is read-only data the Names class combines (see names.ts) */
export interface SettingData {
  /** curated town names, drawn (shuffled by the seed) before any generated town name */
  towns: string[];
  /** town-name first parts for generated towns past the curated list (first + townSuffix) */
  townFirst: string[];
  /** town-name endings, glued straight on ('ton' -> Mapleton) or spaced (' Falls' -> Maple Falls) */
  townSuffix: string[];
  /** trees and other plants: street stems */
  trees: string[];
  /** local and civic names (Main, Mill, Church, Washington...): street stems */
  local: string[];
  /** family names: street stems, memorial bridges, and business owners ("Miller's Garage") */
  surnames: string[];
  /** scenic one-entry stems (Fairview, Honey Creek...): street stems */
  scenic: string[];
  /** second words of compound stems (Maple + Ridge -> Maple Ridge Avenue) */
  seconds: string[];
  /** qualifiers in front of a stem (North Maple, Old Mill...) */
  prefixes: string[];
  /** first names of diner, bakery and cafe owners ("Rose's Bakery") */
  owners: string[];
  /** place-y words for a business with no place given ("Riverside Stadium") */
  scenicPlaces: string[];
}

/** one entry per space-separated word */
const w = (s: string): string[] => s.split(' ');
/** one entry per |-separated piece (the entries themselves may hold spaces) */
const p = (s: string): string[] => s.split('|');

/** the maple-wooded valley setting (the game's current art and theme) */
export const MAPLE_VALLEY: SettingData = {
  towns: p('Maple Falls|Riverton|Cedar Grove|Bass Lake|Elk Creek|Maplewood|Miller Crossing|Stonebridge|Fairview|Clearwater|Oakdale|Riverside|Mill Creek|Trout Run|Bear Hollow|Granite Falls|Birchwood|Hickory Flats|Union Mills|Spring Valley|Lakeview|Elkton|Mapleton|Copper Creek|Iron Falls|Walnut Grove|Pine Ridge|Deerfield|Brookfield|Fern Hollow|Harper|Booneville|Clayton|Hartfield|Lowell Junction|Summit Valley|Tamarack|Heron Lake|Moose Creek|Otter Creek|Loon Lake|Rockford|Millerton|Alden|Bramwell|Freeport|Greenville|New Bethlehem|Pine Grove|Sugar Creek|Laurel Ridge|Chestnut Hill|Quarryville|Forge Creek|Timberline|Briar Patch|Heron Landing|Kings Crossing|Widow Creek|Panther Gap|Stony Ford|Meadowbrook|Sunset Valley|Grandview|Ridgewood|Valley Forge|Canal Fulton|Depot Town|Gristmill|Hog Hollow|Possum Run|Raccoon Creek|Turkey Foot|Wolf Gap|Bald Knob|Big Run|Little Valley|Long Hollow|Dry Fork|Muddy Creek|Slippery Rock|Standing Stone|Tumbledown|Waterfall|Yellow Creek'),
  townFirst: w('Maple Cedar Oak Pine Elm Birch Walnut Hickory River Lake Stone Mill Iron Copper Granite Elk Bear Deer Eagle Heron Otter Bass Trout Spring Summit Sugar Fern Briar Timber Quarry Forge Harper Boone Miller Hartley Alden Clayton Lowell Mercer Vernon Warren'),
  townSuffix: p('ton|ville|burg|ford|field|wood| Falls| Creek| Grove| Junction| Landing| Lake| Rapids| Hollow| Ridge| Center| Corners| Mills'),
  trees: w('Maple Oak Elm Pine Cedar Birch Walnut Hickory Ash Aspen Poplar Willow Chestnut Spruce Fir Hemlock Beech Cherry Apple Pear Plum Magnolia Dogwood Sycamore Linden Juniper Cottonwood Hawthorn Alder Buckeye Catalpa Tamarack Balsam Laurel Myrtle Holly Basswood Butternut Sassafras Mulberry'),
  local: w('Main Mill Church School River Lake Hill Valley Bridge Stone Iron Depot Market Union Liberty Center College Academy Park Garden Meadow Spring Summer Winter Harvest Orchard Quarry Forge Granite Marble Copper Timber Canal Railroad Front Water Bank Pearl Broad High State Washington Lincoln Jefferson Franklin Madison Monroe Adams Jackson Harrison Grant Allegheny Juniata Clarion Kinzua'),
  surnames: w('Miller Johnson Smith Brown Wilson Taylor Anderson Thomas Moore Martin Lee Walker Hall Allen Young King Wright Scott Green Adams Baker Nelson Carter Mitchell Roberts Turner Phillips Campbell Parker Evans Edwards Collins Stewart Morris Rogers Reed Cook Morgan Bell Murphy Bailey Cooper Richardson Cox Howard Ward Peterson Gray Hartley Boone Keller Snyder Weaver Fisher Wagner Hoffman Novak Kowalski'),
  scenic: p('Fairview|Grandview|Riverview|Lakeview|Hillcrest|Stonefield|Clearwater|Sweetwater|Riverside|Lakeside|Hillside|Brookside|Woodside|Parkside|Wildwood|Fernwood|Rosewood|Briarwood|Tanglewood|Honey Creek|Sugar Run|Stony Creek|Laurel Run|Panther Run|Wolf Run|Buffalo Run|Spruce Run|Falling Spring|Bald Eagle|Sugar Valley|Brush Valley|White Deer|Little Pine'),
  seconds: w('Ridge Grove Hollow Hill Brook Field Bend Landing Crossing Heights Valley Point Bluff Glen Dale Run Fork Creek Falls Mill Gap Knob Spring'),
  prefixes: w('North South East West Old New Upper Lower'),
  owners: w('Rose Ruth Hank Edna Pearl Gus Mae Clara Floyd Hazel Otis Vera Earl Mabel Clyde Opal Alvin Beulah Chester Delia Elmer Fannie Grover Hattie Ira Josephine Lester Myrtle Norman Olive Percy Ralph Stella'),
  scenicPlaces: p('Riverside|Lakeside|Brookside|Hillcrest|Fairview|Maplewood|Pine Valley|Elk Creek|Stonebridge|Mill Creek|Bass Lake|Trout Run|Cedar Grove|Granite Falls'),
};
