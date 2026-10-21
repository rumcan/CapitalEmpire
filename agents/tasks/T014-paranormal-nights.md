# T014 - Paranormal nights and the new TrickOrTreat artwork

Status: in progress
Module: `src/game/ext/paranormal/`, `src/game/ext/disasters/`
Tests: `tests/ext-paranormal.test.ts`, `tests/ext-disasters.test.ts`, `tests/disasters-wiring.test.ts`
Owner request: 2026-10-20. Branch: `feature/paranormal-nights`.

The owner explicitly requested importing the newly generated grass textures and artwork into the CapitalEmpire library and Sprite Studio, and adding recurring paranormal disasters using the TrickOrTreat lighting and monster/kid artwork. This task authorizes the integration files, asset preparation scripts, runtime artwork and asset manifests needed for that request, including renderer, city simulation wiring, Sprite Studio and disaster controls. Do not modify the source TrickOrTreat repository or the owner's saved maps. Do not edit `docs/`.

Implement deterministic paranormal nights every three to five simulation days when disasters are enabled. Warn for 45 simulation seconds, last for 240 seconds, and close nearby roads through the existing City routing and lane-block contract. Keep natural disasters and paid quake repairs working. Persistent quake damage must not prevent future paranormal nights. Disable releases all road closures. The lighting darkens the city and adds warm local lights; kids fight varied existing TrickOrTreat monsters in the affected neighbourhood.

The pure battle API is `sampleParanormalBattle(disaster, simTime): ParanormalActor[]`, accepting an event's id, kind, start/end times and tile-coordinate polygon. Rendering owns sprite choice and drawing. The model contains deterministic kid/monster positions, facing, walk/fight/defeated actions, fade and local light properties.

Import real source images only; do not generate new images or use paid generators. Keep original source attribution/path data in the import pipeline. Newly available grass and other artwork should be visible for inspection in Sprite Studio. Verify scheduler determinism, recurrence, empty maps, force, closure release, battle variety, preserved natural-disaster behavior, and actual traffic reroutes around haunted roads. Run typecheck, test and build before delivery. No commit or push was requested in this session.
