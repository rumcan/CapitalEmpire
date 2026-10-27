# Golden fescue: finished artwork handoff

The first material family has three independently painted, hash-bound appearance-approved sets. Use [canonicalselection.json](canonicalselection.json) or its immutable [selection-v2.json](selection-v2.json). Historical selection-v1 is retained and is superseded. No game runtime integration is claimed.

| Detail | Selected set | Four primary files | Optional extras | Proofs |
|---|---|---|---|---|
| NEAR | [near-v3](near-v3/review/appearance-decision.json) | [tile-01](near-v3/tile-01.png), [tile-03](near-v3/tile-03.png), [tile-06](near-v3/tile-06.png), [tile-08](near-v3/tile-08.png) | [tile-02](near-v3/tile-02.png), [tile-04](near-v3/tile-04.png), [tile-05](near-v3/tile-05.png), [tile-07](near-v3/tile-07.png) | [2native](handoff-proofs/near-two-tile-native.png), [4whole](handoff-proofs/near-four-tile-screen.png), [4native junction](handoff-proofs/near-four-tile-native-junction.png) |
| MID | [mid-v2](mid-v2/review/appearance-decision.json) | [tile-01](mid-v2/tile-01.png), [tile-02](mid-v2/tile-02.png), [tile-03](mid-v2/tile-03.png), [tile-04](mid-v2/tile-04.png) | None | [2native](handoff-proofs/mid-two-tile-native.png), [4whole](handoff-proofs/mid-four-tile-screen.png), [4native junction](handoff-proofs/mid-four-tile-native-junction.png) |
| FAR | [far-v4](far-v4/review/appearance-decision.json) | [tile-01](far-v4/tile-01.png), [tile-02](far-v4/tile-02.png), [tile-03](far-v4/tile-03.png), [tile-04](far-v4/tile-04.png) | None | [2native](handoff-proofs/far-two-tile-native.png), [4whole](handoff-proofs/far-four-tile-screen.png), [4native junction](handoff-proofs/far-four-tile-native-junction.png) |

All production PNGs are1742x902. All three proof types are1742x902: two-tile proofs show exact native windows; four-whole proofs uniformly reduce the four complete images for display; four-native proofs show unresampled corner windows. Proofs use only the actual selected PNGs. The NEAR primary order is01,03,06,08;02,04,05,07are preserved extras.

Lighting stays upper right toward lower left. Never flip, mirror or rotate. Show2–4visible tiles, switching to the next independently authored detail set before exceeding four. Heights are separate paintings, not mips or matching geography. Keep gameplay material layers separate; no runtime material blend or randomisation is implemented here.

Selection metadata lists exact PNG and source hashes, every selected raw's prompt/provenance, shared repair sources, export reports and independent appearance decisions. File presence alone never grants appearance acceptance. Earlier held versions remain archived; specifically FARv3is superseded by accepted FARv4.

Next priority: finish LAKE currently generating in MAIN, then the remaining twelve selected material families through the [batch workflow](../../../../MATERIAL-TEXTURE-BATCHES.md) and ALL14[queue-v2](../../../../material-texture-batches/queue-v2.json). Preserve valid images and use new versions only for held artwork. Buildings/cars/props remain subsequent work.
