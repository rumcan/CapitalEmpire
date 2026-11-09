"""ui.picker.course: Your course picker and catalogue (T410 map)."""
from __future__ import annotations

from fractal.holon import Fn, Holon, OUT

HOLON = Holon(
    id='ui.picker.course',
    rung=3,
    title='Your course picker and catalogue',
    purpose='The course picker: Build your own, Featured, Downloaded, and Find a real course, with the country catalogue.',
    requires=['Build your own stays first; the shipped courses are Featured; a pick fetches with one Overpass query (CoursePicker header).', 'A search is on submit only, by name, link or way id (CoursePicker header).'],
    files=['src/ui/golf/CoursePicker.tsx', 'src/ui/golf/CourseNames.tsx'],
    dynamics=[
        Fn(name='CoursePicker', at='src/ui/golf/CoursePicker.tsx:79', does='the course picker', sig='({featured, current, onOwn, onFeatured, ...}) => JSX'),
        Fn(name='PreviewButtons', at='src/ui/golf/CoursePicker.tsx:68', does="the preview's buttons", sig='({can, holes, onBuild, onPlace}) => JSX'),
        Fn(name='CatalogueFinder', at='src/ui/golf/CourseNames.tsx:34', does='the find-a-course search', sig='(p: CatalogueFinderProps) => JSX')],
    inputs=['the catalogue and the downloaded courses'],
    outputs=['the pick into the game'],
    tests=['ui-course-picker.test.ts', 'ui-osm-land.test.ts', 'golf-osm-catalogue.test.ts'],
    below=['course'],
    above=['ui.rail'],
    dual='Delete removes a downloaded course (CoursePicker header)',
    rules=['no horizontal scrollbars, and side flyouts'],
    impl='describe',
)
