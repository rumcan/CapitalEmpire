# Garage direction contract

The original garage ID stays N (front faces screen down). Existing view:<id>:e/s/w remain unchanged. New view:<id>:ne/se/sw/nw are true diagonal quarter turns, front facing world +y/+x/-y/-x; footprint edges have screen slopes ±0.5. They are appended after all pre-existing libraries, share their base garage size, and are never mirrored. Studio shows eight labelled thumbnails; the dev editor can place explicit diagonal IDs and R turns within that diagonal set.

Automatic eight-heading road selection remains T154 Phase 2. No claim is made that adding PNGs selects them automatically on all lots.

Footprint: 26 m frontage × 18 m depth (13×9 world tiles), swapped for SE/NW. Native source pixels are preserved in this store; normal atlas packing/filtering is separate.

Known pre-existing issue: axis drafts labelled 4/5/6 storeys appear to show 3/4/5 covered levels. These are preserved pending separate owner/art correction, never silently relabelled by this importer.
