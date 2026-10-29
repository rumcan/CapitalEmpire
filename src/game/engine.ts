import { CHUNK_H, CHUNK_W, DISTRICT_Z, HH, HW, MAP, MID_H, MID_W, PLANNER_Z, PLAN_H, PLAN_W, SPR_H, SPR_W, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clamp, clampZoom, planLevelFor, tileOf, worldX, worldY, mulberry } from './iso';
import { ATLAS_PAGES, GOLFER_BASE, GOLFER_FRAMES, GOLFER_PEOPLE, LIBRARY, SPECTATOR_BASE, SPECTATOR_FRAMES, SPECTATOR_PEOPLE, WALKER_BASE, WALKER_PEOPLE, WALK_DIRS, WALK_FRAMES } from './library';
import { galleryPeople, hash, queuePeople, walkerPeople, type CrowdPerson } from './crowdview';
import { FACING_ROW, Pedestrians, sidewalks, type Door, type WalkerView } from './ext/pedestrians';
import { GREENKEEPING } from './features';
import { GRASS_ACTION_NAME, GrassManagement, grassSurface, type GrassAction, type GrassCellView, type GrassScope, type GrassSettings } from './ext/grass-management';
import { drawGhostBlueprint, drawGhostHint, drawGhostPoly, drawGhostRing, drawRefusedMarks, ghostStatus, rgbaOf, type GhostBlueprint, type GhostView } from './ext/ghost-preview';
import { drawRefusedCross, strokeHatch } from './ext/refused-mark';
import { busGhostLabel, costLabel, markerGhost, structureGhost, tollGhostLabel } from './ext/event-ghost';
import { CourseCursor, type CursorView } from './ext/course-cursor';
import { browserCursorTexture } from './ext/course-cursor/tex';
import { getTournamentWeather } from './golf/weather';
import { clubTitle, type ClubTitle } from './golf/clubtitle';
import { CLASS, FLAG_COST, Grid, classOf, courseRoadOpen, courseTierNeeded, isCourseClass, JUNCTIONS, KEY_CLASSES, RoadNetwork, SLIP_CORNER_COST, SPEED_BONUS_KMH, RB_LANE, ringRadius, NARROWER, VARIANTS as CLASS_VARIANTS, WIDER, SK, add, dot, mul, norm, perp, sub, unionBox, variantCost, vlen, type AutoProp, type BBox, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type Pt, type PortalRec, type RoadClass, type Seg, type SegKind, type TypeId } from './network';
import { NetEditor, applyNodeEntry, netToOps, nodeEntry, straightChain } from './netops';
import { TIER_BADGE, flagRule, isLights, junctionCorners, slipPlan, slipsOn, type Corner } from './junctions';
import { MIN_SEP, checkLegs, replaceCuts, ringStubs, segDist as segSeg, snapPoint, type Snap } from './snap';
import { STRUCT_COST, STRUCT_MAX, groundClass, highwayRoute, longestRun, splitByTerrain, structureLengths } from './structures';
import { CULL_MIN_PX, FULL_UV, GLRenderer, POINT_STRIDE, SHADOW_STRIDE, SPRITE_STRIDE, VECTOR_STRIDE } from './gl';
import { GroundCache } from './ground-cache';
import { GAME_BOOT, clampCentre, flatTerrain, type BootOptions } from './boot';
import { TILE_BANDS, TILES_REVISION, anchorAt, bandAt, bandRange, bandsAhead, cellOf, cellsIn, coverageOf, drawnScale, nearUntil, nextBand, tiledFamily, tileIndex, tilePermutation, tileScreenPx, tileSize, tileSpec } from './painted-tiles';
import { onPaintedSurfaces, paintedSurfaces } from './painted-surfaces-live';
import { borderDefault, finishBorders, finishOf, finishStripeLook } from './course-finish';
import { chunkLayers, pictureCurrent, prebakeTargets } from './ground-layers';
import { clampGrassArt, grassZoomLevels, type GrassArt } from './painted-grass-lod';
import { lotBatch, type CourseTex, type LotPatch } from './ground-protocol';
import { BLOCK_MAX_AREA, enclosedBlocks } from './blocks';
import { blockLawn, lotLawn } from './lawns';
import { LAND_WHY, PaintTool } from './paint-tool';
import { collarTexes, courseLookSet, type BrushLooks, type LookStyle } from './course-look';
import { lookOfTex } from './painted-surfaces';
import { FACILITY_OWNERS, LOOK_KINDS, holeOwner, ownerHole, seedOwner, type FacilityOwner } from './golf/looks';
import { facilityAt } from './golf/practicebuild';
import { escapeLadder, numberKeyUse, pickTool, switchSideMode, type EscCard, type EscLadder, type SideMode } from './tool-modes';
import type { PresetProp } from './golf/holepreset';
import { OWNER_SCALE, STUDIO_SCALE } from './lots/scales';
import { sizeKey, turned } from './lots/preset-art';
import { FARMHOUSE_SUBJECTS, LOT_PLACES, clubScene, farmScene, lotPlaceHasArt, lotPlaceOf, lotScene, placeHasArt, placeScene, rangeNews, rangeScene, rangeSceneKeys, rangeViewOfKey, sceneArt, townFortune, type RangeSceneFacts, type RangeSceneView, type SceneCardView, type SceneRef } from './scenes';
import { homeStage } from './golf/rangesave';
import { RangeHost } from './golf/rangehost';
import { PropsTool } from './golf/propstool';
import { PracticeTool } from './golf/practicetool';
import { DECOR_BY_KEY, inPoly, lotTouches, propTuple, sellBack, tupleMarks } from './golf/decor';
import { CELL as POND_CELL, discOutline, lilyPads, normalizePondMarks, pieceKey, pondAt, pondId, shorePieces, type Pond, type PondPiece } from './golf/ponds';
import { fountainAt, fountainFrame } from './kit';
import { HALFWAY_COST, halfwaySpotWhy, halfwayTakings } from './golf/halfway';
import { RANGE_GUIDE, guideTable, newRangeGuide, rangeGuideCurrent, rangeGuideLines, rangeGuideOff, rangeGuideSkip, rangeGuideTick, type GuideEvent, type GuideLine } from './ext/progressive-ui/guide';
import { welcomeReady } from './golf/firstview';
/** the hints' anchors (T188: their Show me pulses the control) where the hint is no guide step */
const HINT_ANCHOR: Readonly<Record<string, string>> = { 'hint-range-open': 'range-chip', 'hint-range-upgrade': 'range-chip', 'hint-range-props': 'rail-facilities', 'hint-range-first-hole': 'new-hole' };
import { RANGE_LABEL_Z, defaultRangeBiz, parkLabel, rangeKeepOut, practiceAppeal, rangeMapLabel, rangeNewSeason, rangeStats, rangeStructures, type RangeCounts, type RangeUpgradeId } from './golf/rangebiz';
import { areaAt, brushTextures, toTuple, type BrushKind, type PaintTuple, type PaintTex } from './paint';
import { CELL_T, SURF, applyDiff, cellAt, cellCentre, diffBox, encodeGrid, fillPolygon, fitGrid, grassSlot, landGridBox, lookCellsDiff, looksUsed, makeGrid, paintDisc, paintStroke, setLook, type Grid as CourseGrid, type GridDiff, type GridSave } from './ext/course-grid';
import { PLAY_SURF, golfSurfaceOf, grassLooks, normalizeGrasses, type CustomGrass, type GrassPlay } from './golf/grasses';
import { STAIR_REACH } from './ext/course-walls';
import { SURFACE_TEX_ID, SURF_SURFACE, areaRank, growingHoles, ringArea, type GridArea } from './ext/course-grid/areas';
import { aimsFromPlans, decodePlans, encodePlans, frameView, planSeed, type FreeRect, type WizardGhost } from './ext/hole-wizard';
import type { HolePlan } from './ext/hole-plan';
import { FRAME_CONIFER_IDS, FRAME_RULES, FRAME_TREE_KEY, cartLanes, frameHole, framePrice, landingSpots, type FrameSite, type FrameTree } from './golf/holeframe';
import { FOREST_CLEAR, LABEL_FADE_ALPHA, LABEL_FADE_PX, TOWN_CLEAR, plantedTreeCleared, propTreeCleared, treesCleared, type NearTree } from './ext/hole-wizard/extras';
import { holeAreas, holeCard, markerMove, swapHoleNumbers, teeLengths, type HoleCardView, type HoleFix } from './golf/holecard';
import { captureHole, joinHoles, loadBrowserHoles, sameHole, saveBrowserHoles, type MyHole } from './golf/myholes';
import { isCourseArea, loadCourseGrid, migrateAreas } from './ext/course-grid/migrate';
import { COURSE_PATCH_REACH, courseChunksIn, courseEditReach, courseGrowKey, courseKey, courseStyles, drawnSurfaces, growStatic, roundReach, widestCollar, type CourseLooks, type CourseOwners } from './ext/course-grid/patch';
import { CourseContour, type CourseChunkOut } from './course-contour';
import { PRESETS, surfacePreset } from './paint-presets';
import { plantPoints, plantPool, type PlantBrushKind } from './plant';
import { ParkingTool } from './parking-tool';
import { gateSpots } from './parking-props';
import { drawParkingOverlay, type ParkOverlayView } from './parking-overlay';
import type { BayRowDef } from './event/rows';
import { inQuad, type CurbDef } from './event/curb';
import { CAR_SCALE, SpriteTiles, spriteRect, VECTOR, type Drawable } from './sprites';
import { releaseVectorMeshData, vectorMeshData } from './shadow-vector';
import { readSave, writeSave, withTourney, clearSave, backupTownSlot, SAVE_VERSION, segRec, exportSaveBytes, importSaveBytes, listSaveBackups, readBackup, deleteBackup, type SaveV5 } from './save';
import { CAR_COLOURS, carHeading, facings } from './traffic';
import { bayCar, bayFoot, isWagon } from './vehicles';
import { DayBook, clubCardView, dayCourse, dayPace, dayPlan, feeScale, normalizeDaySave, seasonPaceRep, type ClubCardView, type DayInputs, type DayRoster } from './golf/everyday';
import { choosePin, greenAt, pinIn, pinLine, pinReport, pinSlot, rollDayPins, withDayPins, type DayPin, type GreenShape } from './golf/daypins';
import { crewCells, crewGround, type CrewGround } from './golf/crewground';
import { crewDay, crewFlips, crewFor, fullyCut, holeWindows, normalizeCrewSave, rotaJobs, type CrewDay, type Veh as CrewVeh } from './golf/crew';
import { CrewView, cupSetAt } from './golf/crewview';
import { ROLE_NAME, WAGE, changeStaff, closeSeason, courseCondition, crewCard, crewNeed, freshStaff, payWages, pinReputation, qualityFactor, workDay, type CrewCardView, type StaffRole, type StaffState } from './golf/staff';
import { fairwayStripeLook } from './course-stripes';
import { DAY_CAR_CAP, DayView, type ClubGround } from './golf/everydayview';
import { carOwnerScale } from './ext/car-art';
import { SimClient, type LotView } from './sim/client';
import { localRate, townClockFor, townTimeOf } from './sim/townclock';
import { CADDIE_CAP, CART_CAP, LONG_DAY_MIN, NIGHT_S, PACE_KEY, WALK_CAP, capped, dayNight, paceOf, paceOfSetting, settingOf, type GolfPace, type PaceSetting } from './golf/pace';
import { Pacer } from './golf/play/pacer';
import type { PlayBall } from './golf/play/view';
import { ballPuff, ballSplash } from './golf/ballfx';
import { zoneOf } from './sim/routing';
import { lastRush, nextRush, windowOf, type Window } from './beforeafter';
import { placeStadium, siteAt, siteWhy, type Site } from './event/site';
import { BUSINESS, CLUBHOUSE_RANGE_COST, knownBusinesses, unlockedBy, unlockText, type BusinessId, type BusinessType, type Owned } from './business/catalogue';
import { snapFrontage, snapSegOf, type SnapSeg } from './ext/frontage-snap';
import { freshStats, ownedOf, type BizDef, type BizStats } from './business/state';
import { businessArt } from './business/art';
import { BAY_D, BAY_W, BOOTH_W, BUS_ROUTE_COST, BUS_SEATS, CARDS, DECK_SEATS, PD_CELL, PLAZA_LEN, START_BOOTHS, START_BUSES, TOLL_BASE_COST, TOLL_BOOTH_COST, tollPrice, type CardId } from './event/config';
import { Round, SIGNAL_TIER_YEAR, SPEED_TIER_YEAR, signalTierOpen, speedTierOpen } from './event/round';
import type { BusRouteDef } from './event/bus';
import { plazaEdge, plazaIslands, plazaKey, plazaLocal, plazaOutline, plazaPoint, plazaQuads, type TollDef } from './event/toll';
import { bayDrive, bayWalk, buildPark, parkCost, parkValid, type CarPark, type CarParkDef, type ParkView } from './event/carpark';
import { TC, classAt, generateTerrain, makeNoise, type Noise, type Terrain } from './terrain';
import { slopeField } from './terrain-paint';
import { CONIFER_IDS, FOREST_CELL, FOREST_VIEW_MARGIN, forestCell, forestCellRange, type ForestTree } from './forest';
import { CHUNK_CASTER_REACH, LIVING_PLANT_MARGIN, casterKind, casterOf, doorToward, pxAcross, waterTex, CK } from './living-ground';
import { LEAF_DENSITY_DEFAULT, clampLeafDensity } from './leaf-fall';
import { ROUGH_YARDS_DEFAULT, clampRoughYards, roughShare, roughSig, roughYard } from './rough-yards';
import { townTreeCell } from './towntrees';
import { BELT, beltField, riverBeltCell, type BeltField } from './river-trees';
/** T265: a frame plants its second tree cell only while its planting has taken under this (ms): two heavy cells (a forest cell with its belt)
 *  are planted a frame apart, so no frame carries both */
const PLANT_FRAME_MS = 1;
import type { BendMode, LibItem, LineStyle, Prop, Tool } from './types';
import { LK, LaneGraph, laneAt, laneOff } from './sim/lanes';
import { LU, LV, lotJobs, type LotTuple } from './lots/town';
import { rectPlot, surveyBlocks, surveyPatch } from './lots/survey';
/** T232: a bought block's survey line runs this far inside its edges (tiles), clear of a neighbour's line */
const LAND_SURVEY_INSET = 0.6;
import { acrossLines, compose, composeWhole, farmPreset, fenceOnly, isCarPark, lotModelVersion, lotPresets, pickedPreset, setLotModel, type ComposeState, type FenceLines, type LotGeom, type Placed } from './lots/compose';
import { LATEST as LATEST_LOT_MODEL } from './lots/lot-models';
import { stateOf, type PresetState } from './lots/presets';
import { LotMap } from './lots/lots';
import { PLACE_DEFS, duePlaces, findSite, placeBox, placeDef, placeGeom, placeName, placeTuples, placesFromTuples, type PlacedPlace, type SiteSeg } from './lots/iconic';
import { TOWN_BLOCKS, TOWN_POP, townCentres, townGrid } from './lots/seedtowns';
import { Names, RoadNames } from './ext/names';
import { FARM_MODEL, FarmMap, claimedLots, composeFarm, farmSeason, farmStandIns, parcelCorners, type FarmModel, type FarmParcel } from './ext/farms';
import { SIG, shown, sigKey } from './sim/signals';
import { Budget, DEBT_DAYS, LOAN, compensation, type Ledger } from './budget';
import { WIN_POP, classUnlocked, junctionUnlocked, tunnelsUnlocked, unlockOf } from './career';
import type { DisasterNote } from './city';
import type { DisasterKind } from './ext/disasters';
import { normalizeGolfSave, type GolfPlaySave, type GolfSave, type GolfView } from './golf/mode';
import { courseSlopeAt, createCourseHeightField, sampleCourseGrid, flattenCourseCorridor, loadCourseHeight, saveCourseHeight, unionBox as unionCourseBox, type CourseHeightField, type CourseHeightSaveChunk, type CourseTileBox } from './ext/course-height';
import { HEIGHT_LIGHT_STRENGTH, clampHeightLight } from './ext/course-height/light';
import { planGolfGame } from './golf/start';
import { RANGE_CAM_ZOOM, planRangeStart } from './golf/rangestart';
import { CLUB_REACH, clubhouseSpotWhy, plotOfFront, rangeLayout } from './golf/range';
import { PRACTICE_LOT_NAME, inPractice, practiceArea } from './golf/practice';
import { baysByDoor, servesOf, servingParks, type Serve, type Venue } from './golf/walkserve';
import { drawServePreview } from './walkserve-overlay';
import { hiddenBy, rangeKeepOutWhy, snapToRoad, type Building } from './golf/parkplace';
import { footStart, parkLook, type ParkLook } from './event/parklook';
import { dressCourse } from './golf/dressing';
import { FIRST_TEE, MONTH_LEN, SEASON_LEN, SEASON_START, monthIndexLabel, monthsLeft, seasonLabel, seasonMonth, yearOf } from './golf/calendar';
import { MonthMoney, golfersAMonth, type TopStats } from './golf/topstats';
import { afterRoute, driveOffer, driveStart, type DriveStopgap } from './golf/drivestopgap';
import { growReadyLabel, hintWithGrow } from './golf/growlabel';
import { computeTournamentCloseBook, computeYearEnd, type YearEndResult } from './golf/yearend';
import { countParkedCars } from './golf/parkingfee';
import { driveCuts, stopCut } from './street-marks';
import { TYPE_PAINTS, bodyOf, paintAt } from './car-paint';
import { baysBox, boxesMeet, workerBay, workerShown, type TileBox } from './parked-cars';
import { parkRideNeeds } from './golf/parkride';
import { applyCourseConsultantQuality, effectiveGrowInClockMonth, findGolfCard, isGolfCardId, parkRideNeedsWithCards } from './golf/golfcards';
import type { CourseFacts } from './golf/tour';
import { surfaceOfTex, unitBuildCost } from './golf/costs';
import { inSentence, inTheWay, rectPoly, ringWhy, routeObstacles, structureObstacles, type Obstacle, type Structure } from './route-obstacles';
import { judgeRing, rangePieceName, ringGrows, type RingProp, type RingVerdict } from './ring-clear';
import { isSecondTap, routeAct, type RouteInput, type Tap } from './route-input';
import { buyAdjacentBlock, COURSE_LAND_MSG, blockOnRoad, blockOnWater, pointInLand, polyInParcels, type LandRoad, type ParcelLandClass } from './golf/parcels';
import { BAND_LABEL, LandSale } from './golf/land-sale';
import { buildCourseStatsPanel, type CourseStatsPanel } from './golf/coursestats';
import { TILE_M, type CourseArea, type CourseLayout, type GolfSurface, type Pin, type TeeBoxRec, type TeeKind, type TeeMark } from './golf/types';
import { deriveHoles, surfaceAt, validateMarkerPlacement, type Hole } from './golf/holes';
import { FX_SAND, FX_SPLASH, ballRoll, type HeightAt } from './golf/play/roll';
import { CHEER_TILES, DayFinish, LiveGroup, OWNER_ADDRESS, OWNER_ART, OWNER_SKILL, POWER, PUTT_POWER, PlayView, allowedClubs, cartPaths, type CartPaths, type PlayCart, boardRows, carryM, championLine, dayRound, makeCourseView, powerFor, resultsDue, shortName as golferShort, stateAt, standings, toParText, waitText, waveLine, type BoardRow, type Club, type CourseView, type OwnerTurn, type RoundPlan, type Sex } from './golf/play';
import { holeViews, markerPlan, tagByHole, type HoleView, type MarkerKind } from './golf/holeview';
import { CAST, castShear, clampCast, type CastShadow } from './cast-shadow';
import { SPEC_LOOK, clampSpecLook, specGain, type SpecLook } from './lamp-reflect';
import { SHINE_KEY, SHINE_LOOK, clampShineLook, shineExponent, shineGain, type ShineLook, type ShineWeights } from './grass-shine';
import { WATER_MOTION, WATER_MOTION_KEY, clampWaterMotion, motionFrame, phasesAt, stepPhases, type WaterMotion } from './water-motion';
import { clampGrade, gradeFrame, loadGrade, saveGrade, type GradeSettings } from './grade';
import { glossGain } from './swamp';
import { contactLean } from './shadow-shape';
import { MARKER_SCALE, OLD_TEE_IDS, PIN_RED_ID, PIN_YELLOW_ID, teePropId } from './golf/dressing';
import { BOX_LEN_M, BOX_WID_M, TEE_KINDS, TEE_SET, addTeeSpot, layoutMarkers, markerWarnings } from './golf/teesets';
import { TEE_SCALE_STEP, TEE_TURN_DEG, boxAngle, boxOutline, clampTeeScale, dropHoleBoxes, handOver, layDown, oldBox, planTee, recStands, snapTurn, swapTeeBoxes, takeUp, teeAim, teeBoxM, teeCells, teeKey, type TeeCourse, type TeeOld, type TeePlan, type TeeRoad } from './golf/teeplace';
import { FALLBACK_STRUCTURE_SPRITE, STRUCTURE_SPRITE, STRUCTURE_SPRITE_OLD } from './golf/structure-art';
import { checkStructurePlacement, findStructureIndexAt, structureRect, structuresNeeds, type PlacedEventStructure, type StructurePlacementCheck } from './golf/eventtool';
import { STRUCTURE } from './golf/tents';
import { gallerySpots } from './golf/galleries';
import { invitedFacts, tierInfo, tournamentDue, type InviteCheck, type Need } from './golf/tour';
import { NightRenderer, clampNight, nightAt, nightDay, propLights, type NightLight, type NightSettings } from './night-light';
import { drawnAs } from './mirror';
import { TREE_MIRROR } from './tree-sun';
import { NEW_ART_ONLY, OLD_ART, lookOf, maxDrawScale, standInLabel } from './newart';
import { webpSource } from './atlas-gl';
import { ktx2Built, ktx2Source, pickFormat } from './atlas-ktx2';
import { neededLevel, type PageWant } from './atlas-pages';
import { HALF_T, courseBuilding, gridShown, loadMapGrid, saveMapGrid } from './ext/map-grid';
import { MapGridLayer } from './ext/map-grid/layer';
import { MoneyFloats, addCash, drawMoneyFloats, rangeFloat, type MoneyEvent } from './moneyfloats';
import { ColumnPlacer, PRI } from './label-place';
import { LABEL_OUTLINE, WorldLabels } from './world-labels';
import { FIRST_PAR3_M, JAM_ZONES, RANGE_CARD_SEEN, STUCK_PLAY_SEC, advanceProgress, computeProgressiveUiState, emptyProgress, fallbackTeeSpot, nextFirstRunHint, normalizeProgress, progressFacts, rampLock, rampToast, type FirstRunHint, type GuideFacts, type PlayerProgressFacts, type ProgressiveUiState } from './ext/progressive-ui';

/** New hole's camera framing eases this long at most (ms; P23 4.4) */
const CAM_EASE_MS = 400;
/** a sprite px is picked where its atlas alpha is above this (0..255) */
const PICK_ALPHA = 20;
/** the junction types in Tab order (Shift+Tab goes back): each roundabout ring-lane count is its own step */
const VARIANTS: { type: NodeType; rl: 1 | 2 | 3 }[] = [{ type: 'plain', rl: 1 }, { type: 'stop', rl: 1 }, { type: 'mini', rl: 1 }, { type: 'signal', rl: 1 }, { type: 'slip', rl: 1 }, { type: 'roundabout', rl: 1 }, { type: 'roundabout', rl: 2 }, { type: 'roundabout', rl: 3 }];
/** what the lights' upgrades cost, by the tier they reach (index = tier: 0 fixed-time is free, 1 actuated, 2 adaptive) */
export const UPGRADE_COST: readonly number[] = [0, 1500, 3000];
/** the upgrade each signal tier brings, for the year toasts (index = tier; 0 has none) */
const SIGNAL_TOAST = ['', 'actuated traffic lights (loop detectors)', 'adaptive traffic lights'];

/** a game day and a game hour, sim s (one sim second is one game minute) */
const GAME_DAY = 1440, GAME_HOUR = 60;
/** T233: how often the top bar's course rating works the course's quality out again (ms: Course stats derives the holes) */
const RATING_MS = 2000;
/** a range start's founding season as its season card shows it (plan P22 2.5.3): the season's year, the season's business takings ($: the range,
 *  and the clubhouse once placed), the residents, the invitation checklist at the season's end, and whether the tour had invited the player (too
 *  late for this season) */
export interface SeasonReport { year: number; takings: number; residents: number; check: InviteCheck; invited: boolean; /** the range business's season (P24, T129) */ range?: RangeCounts; /** T221: the residents the club's earnings make room for (City.townRoom) */ room?: number }
/** the most townspeople walking at once */
const PED_MAX = 3000;
/** the sim speeds the time controls offer (sim s per s); 0 is paused */
export const SPEEDS = [1, 2, 4, 8, 20] as const;
/** the flow colours by v/c (below 0.5, below 0.8, below 1, and 1 or more; the Bottlenecks legend) and the junction LOS badge colours, A to F */
export const FLOW_COLS = ['#3ddc84', '#ffd23f', '#ff8c1a', '#ff3b3b'];
/** the heat map's bands by speed against the limit: Flowing (75%+), Slow (50-75%), Heavy (25-50%), Stopped (under 25%); see Game.drawFlow */
export const HEAT_COLS = ['#0ca30c', '#fab219', '#ec835a', '#d03b3b'];
/** the rgb of k (0 to 1) on a ramp of evenly spaced colour stops */
function rampRGB(stops: number[][], k: number): number[] { const t = clamp(k, 0, 1) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(t)), f = t - i, a = stops[i]!, b = stops[i + 1]!; return [0, 1, 2].map(j => a[j]! + (b[j]! - a[j]!) * f); }
/** the congestion over time (drawHeatHist): 16 bins of k = log2(delay) / log2(60), clamped to 0 to 1 (k at each bin's middle): a glow (rgba, alpha 0.25 + 0.55 k),
 *  an opaque core, and a width (6 + 14 k); the ramp runs yellow, orange, red, deep magenta */
const HIST_BINS = 16, HIST_LOG = Math.log2(60);
/** the congestion ramp's colour stops (yellow, orange, red, deep magenta), also the legend's gradient */
export const HIST_RAMP = [[255, 226, 59], [255, 140, 26], [235, 40, 40], [150, 0, 110]];
const HIST_GLOW: string[] = [], HIST_CORE: string[] = [];
for (let b = 0; b < HIST_BINS; b++) {
  const k = (b + 0.5) / HIST_BINS, c = rampRGB(HIST_RAMP, k).map(v => Math.round(v));
  HIST_GLOW.push(`rgba(${c[0]},${c[1]},${c[2]},${(0.25 + 0.55 * k).toFixed(3)})`); HIST_CORE.push(`rgb(${c[0]},${c[1]},${c[2]})`);
}
/** the parking demand (drawParkDemand): 16 bins of k = min(1, log2(1 + cars per game hour) / log2(121)), blue (k 0), amber (0.5), red (1); the fill is rgba, alpha 0.15 + 0.35 k */
const PD_BINS = 16, PD_LOG = Math.log2(121);
const PD_FILL: string[] = Array.from({ length: PD_BINS }, (_, b) => {
  const k = (b + 0.5) / PD_BINS, c = rampRGB([[59, 130, 246], [255, 176, 32], [239, 68, 68]], k).map(v => Math.round(v));
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.15 + 0.35 * k).toFixed(3)})`;
});
export const LOS_COL: Record<string, string> = { A: '#3ddc84', B: '#3ddc84', C: '#ffd23f', D: '#ff8c1a', E: '#ff3b3b', F: '#ff3b3b' };
/** a fresh random map seed (Math.random is fine here: the generator itself is seeded) */
const newSeed = () => (Math.random() * 0x7fffffff) | 0 || 1;
/** the browser's localStorage, or null where it is unavailable */
const storageOf = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
/** a filled disc of radius r at (x, y) in device px (the overlay's identity transform), colour col */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
/** a bus stop's marker at (x, y) in device px: a rounded amber square of half side 6 px with a white B */
function busStop(ctx: CanvasRenderingContext2D, x: number, y: number, dpr: number) {
  const r = 6 * dpr;
  ctx.beginPath(); ctx.roundRect(x - r, y - r, 2 * r, 2 * r, 2.5 * dpr); ctx.fillStyle = '#ffbe3c'; ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = dpr; ctx.stroke();
  ctx.font = `bold ${9 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText('B', x, y + 0.5 * dpr);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
/** the distance, tiles, from point p to the rect (x, y, w, h): 0 inside it */
function rectDist(p: Pt, x: number, y: number, w: number, h: number): number { return Math.hypot(Math.max(x - p.x, 0, p.x - x - w), Math.max(y - p.y, 0, p.y - y - h)); }
/** a crowd person (crowdview.ts) as the mover out[k], made on first use and then reused: its 3D frame in the library (group 0 the spectators, 1 the
 *  golfers), at its point, unflipped, with the townspeople's 0.24-tile footprint */
function crowdDrawable(out: Drawable[], k: number, p: CrowdPerson) {
  const d = out[k] ?? (out[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: false });
  d.item = p.group ? GOLFER_BASE + (p.person * WALK_DIRS.length + p.row) * GOLFER_FRAMES + p.frame : SPECTATOR_BASE + (p.person * WALK_DIRS.length + p.row) * SPECTATOR_FRAMES + p.frame;
  d.x = p.x; d.y = p.y; d.x0 = p.x - 0.12; d.y0 = p.y - 0.12; d.x1 = p.x + 0.12; d.y1 = p.y + 0.12;
  // (T213: a slot may have held a caddie's bag or a hopping golfer last frame)
  d.lift = undefined; d.scale = 1; d.flip = false; d.moving = false; d.alpha = undefined;
}
/** T213: the caddie's stand-in (no caddie is packed yet: GOLF-ART-LIST item 176; the made `staff_caddie_m` waits in art/spectators), a spectator in a
 *  polo and visor, as an index into SPECTATOR_PEOPLE; and its label */
const CADDIE_ART = Math.max(0, SPECTATOR_PEOPLE.findIndex(p => p.id === 'spectator:spec_m_polo_visor')), CADDIE_LABEL = 'Stand In for caddie';
/** T213: the hire cart's two facings (GOLF-ART-LIST item 173 asks for eight: the nearest of the two is drawn), the caddie's bag (the bag trolley), and
 *  their scales (the studio's size, else the owner's table's) */
const libIndexOf = (id: string): number => LIBRARY.findIndex(it => it.id === id);
const CART_ART = [libIndexOf('business:golf-cart-sw'), libIndexOf('business:golf-cart-se')], BAG_ART = libIndexOf('business:golf-bag-trolley');
const artScale = (item: number, or: number): number => { const id = LIBRARY[item]?.id ?? ''; return STUDIO_SCALE[id] ?? OWNER_SCALE[id] ?? or; };
/** the golfer art (indices into GOLFER_PEOPLE) of a tag: the men's ids carry _m, the women's _w; with none of its own, a sex gets all the art */
const golferArt = (tag: string): number[] => { const a = GOLFER_PEOPLE.flatMap((p, i) => p.id.includes(tag) ? [i] : []); return a.length ? a : GOLFER_PEOPLE.map((_, i) => i); };
const GOLFER_ART: Record<'m' | 'w', number[]> = { m: golferArt('_m'), w: golferArt('_w') };
/** the owner's art index in GOLFER_PEOPLE (OWNER_ART by sex; a sex's first golfer art when that id is missing) */
const ownerArt = (sex: Sex): number => { const i = GOLFER_PEOPLE.findIndex(p => p.id === OWNER_ART[sex]); return i >= 0 ? i : GOLFER_ART[sex][0]!; };
/** the day's golf round (docs/GOLF-PLAY.md P2): its plan, course view and playback, the tournament's key (the round's count), each golfer's art index, and
 *  the owner's play (P4b; null when he is not in the day) */
/** the day's golf round as the engine plays it back: the plan, the course, the playback, the tournament key, each golfer's art, the end of the round (T210:
 *  the last group's moment and the round over, latched) and the owner's play */
interface GolfPlay { plan: RoundPlan; view: CourseView; pv: PlayView; key: number; art: number[]; finish: DayFinish; own: OwnerPlay | null; waves: number }
/** the owner's play in the day (docs/GOLF-PLAY.md decision 7, P4b): his golfer's id, sex and skill, his group's tee time, his live group (live.ts), his next
 *  turn (null once his group is done), and the count of inputs he had played when he handed to the caddie (null while he plays) */
interface OwnerPlay { id: number; sex: Sex; skill: number; tee: number; live: LiveGroup; turn: OwnerTurn | null; caddie: number | null; /** T254: his tee set */ tees?: TeeKind }
/** the owner's open shot (P4b, the shot panel): his turn and his input so far (the club, the aim point in tiles, the power: see powerFor) */
export interface ShotState { turn: OwnerTurn; input: { club: Club; aim: Pt; power: number } }
/** the day's leaderboard (docs/GOLF-PLAY.md decision 8): the game minute of the day, the top rows and the owner's (boardRows), the champion's line once
 *  everyone is done (else null), whether everyone is done, the tournament's name, and the owner's group's tee time (null without him) */
export interface PlayBoard { minute: number; rows: BoardRow[]; champion: string | null; done: boolean; event: string; ownerTee: number | null;
  /** T210: the last group's names (short) from its walk onto the final hole until the round is over (the board's banner offers to watch it); null otherwise */
  last: string[] | null;
  /** T210: the eval is in (the 15:00 kick-off) and its results wait for the last group (the board says so and offers them early) */
  waiting: boolean }
/** the leaderboard's rows shown (the top 8, and the owner's row below them) */
const BOARD_ROWS = 8;
/** T209: the longest a resumed tournament day waits for its play after the first frame (holdDay), ms */
const DAY_HOLD_MS = 3000;
/** T210: the end of the round (the last group's moment, the round over) is stepped at most this often, ms (at 20x about 4 game minutes) */
const FINISH_EVERY_MS = 200;
/** a closed path over a flat x y list, in the current transform's units */
function ring(ctx: CanvasRenderingContext2D, p: number[]) { ctx.moveTo(p[0]!, p[1]!); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i]!, p[i + 1]!); ctx.closePath(); }
/** the distance from p to the seg s, tiles */
function segDist(p: Pt, s: Seg): number { const d = sub(s.b, s.a), L2 = dot(d, d) || 1, k = Math.min(1, Math.max(0, dot(sub(p, s.a), d) / L2)); return vlen(sub(p, add(s.a, mul(d, k)))); }
/** a lot's rectangle as a box x0 y0 x1 y1 (tiles): its corner o, the unit sides u (length w) and n (length d) */
function lotBoxOf(o: ArrayLike<number>, u: ArrayLike<number>, n: ArrayLike<number>, w: number, d: number): number[] {
  const ax = o[0]! + u[0]! * w, ay = o[1]! + u[1]! * w, bx = o[0]! + n[0]! * d, by = o[1]! + n[1]! * d, cx = ax + n[0]! * d, cy = ay + n[1]! * d;
  return [Math.min(o[0]!, ax, bx, cx), Math.min(o[1]!, ay, by, cy), Math.max(o[0]!, ax, bx, cx), Math.max(o[1]!, ay, by, cy)];
}
/** T259: a farm parcel's box x0 y0 x1 y1 (tiles: its four corners) */
function parcelBox(p: FarmParcel): number[] { const c = parcelCorners(p); return [Math.min(c[0].x, c[1].x, c[2].x, c[3].x), Math.min(c[0].y, c[1].y, c[2].y, c[3].y), Math.max(c[0].x, c[1].x, c[2].x, c[3].x), Math.max(c[0].y, c[1].y, c[2].y, c[3].y)]; }
/** T259: the distance from tile (x, y) to a farm parcel (0 inside) */
function parcelGap(p: FarmParcel, x: number, y: number): number {
  const dx = x - p.o.x, dy = y - p.o.y, a = dx * p.u.x + dy * p.u.y, b = dx * p.n.x + dy * p.n.y;
  return Math.hypot(Math.max(0, -a, a - p.w), Math.max(0, -b, b - p.d));
}
/** the distance from tile (x, y) to a lot's rectangle (0 inside), the lot's frame as in lotBoxOf */
function lotGap(l: LotView, x: number, y: number): number {
  const dx = x - l.o[0], dy = y - l.o[1], a = dx * l.u[0] + dy * l.u[1], b = dx * l.n[0] + dy * l.n[1];
  return Math.hypot(Math.max(0, -a, a - l.w), Math.max(0, -b, b - l.d));
}
/** whether box b (x0 y0 x1 y1) comes within g tiles of the cell rectangle x0 y0 x1 y1 */
function boxNear(b: number[], x0: number, y0: number, x1: number, y1: number, g: number): boolean { return b[0]! < x1 + g && b[2]! > x0 - g && b[1]! < y1 + g && b[3]! > y0 - g; }
/** a toll gate's plaza as a box (its two ends, and the plaza's width at its booths, plus a margin) */
function tollBox(d: TollDef): number[] { const m = 10 + d.booths * BOOTH_W; return [Math.min(d.ax, d.bx) - m, Math.min(d.ay, d.by) - m, Math.max(d.ax, d.bx) + m, Math.max(d.ay, d.by) + m]; }
/** the box of a flat x y list of points (a paint area's outline or a ground patch), tiles */
function ptsBox(p: number[]): number[] { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]!); x1 = Math.max(x1, p[i]!); y0 = Math.min(y0, p[i + 1]!); y1 = Math.max(y1, p[i + 1]!); } return [x0, y0, x1, y1]; }
/** the golf surfaces trees never stand on (clearTreesOn): the playing surfaces and their collars, sand and water; rough, fescue and paths keep theirs */
const PLAYING_SURFACES: ReadonlySet<string> = new Set(['fairway', 'firstCut', 'fringe', 'green', 'tee', 'bunker', 'waste', 'water']);
/** how far past the golf land the course grid reaches, tiles (plan P21 3.1: the owned box plus a margin) */
const COURSE_GRID_PAD = 32;
/** the least time between two sends of the course chunks during a stroke, ms (paint-tool.ts SEND_MS) */
const COURSE_SEND_MS = 100;
/** T218: how often (ms) the holes' playing lines are compared with the last look (engine watchHoleLines), and how far round a line that moved
 *  its chunks are sent again (tiles: the fairway's stripes turn with it; a fairway lies within this of its line) */
const LINES_EVERY_MS = 250, LINES_REACH = 40;
/** T229: New hole's frame is worked out once its ghost has held still this long (ms) */
const FRAME_SETTLE_MS = 220;
/** T229: a hole's frame as it would go in now: the trees to plant, its frame trees now in play (they go) and how many it keeps */
interface FramePlan { hole: number; trees: FrameTree[]; stale: Prop[]; kept: number }
/** T229: the hole card's Frame with trees: the trees it would plant and their price, the frame trees it would take away and their refund, and
 *  how many frame trees the hole has */
export interface HoleFrameView { trees: number; price: number; stale: number; refund: number; has: number }
/** T229: what a frame did, as its toast says it */
function frameToast(n: number, r: { spent: number; planted: number; left: number; gone: number }): string {
  const parts = [r.planted ? `Hole ${n} framed with ${r.planted} tree${r.planted === 1 ? '' : 's'}` : `Hole ${n}'s frame`];
  if (r.gone) parts.push(`${r.gone} out of play taken away`);
  if (r.left) parts.push(`${r.left} left out: not enough money`);
  return `${parts.join(', ')}${r.spent > 0 ? ` (-$${r.spent.toLocaleString()})` : r.spent < 0 ? ` (+$${(-r.spent).toLocaleString()})` : ''}`;
}
/** the least time between two workings-out of the featured holes (the crowd follows the play, docs/GOLF-PLAY.md decision 6), real ms */
const FEATURED_EVERY_MS = 2000;
/** the welcome card shows only in a range game loaded with less play than this, seconds (P22 2.8: once per new game; older saves never see it) */
const WELCOME_PLAY_S = 120;
/** the toast when the clock is asked to move while the owner's shot is open: the game waits for his shot (the speed, the skips and the pause hold) */
const SHOT_HOLD = 'Your shot is open: the clock waits for it';
/** a course area as the golf rules read it (deriveHoles, holeViews, markerPlan, the stats, the upkeep): its surface, hole, a texture that
 *  reads back as the surface, and its planting */
type CourseAreaRec = CourseArea & { hole?: number; tex: PaintTex };
/** a piece of a screen-space label at (x, y), left-aligned, filled in col and outlined in the stroke style; returns the x after it */
/** T151: the world labels' keys for the labels with no object of their own (a town by its index, a zone, a gallery spot, a stop): a number per kind's
 *  range, so a label keeps its slot from frame to frame */
/** T200: Land for sale's price bands on the map: a fill, an edge and the label's ink (the band's $ label goes with it: never colour alone) */
/** T200: how long a brush's "not your land" refusal keeps its Land for sale button after the pointer moves on (ms) */
const LAND_REFUSAL_MS = 5000;
const LAND_BAND_COL = {
  cheap: { fill: 'rgba(52, 211, 153, 0.22)', edge: 'rgba(52, 211, 153, 0.9)', ink: '#d1fae5' },
  fair: { fill: 'rgba(250, 204, 21, 0.22)', edge: 'rgba(250, 204, 21, 0.9)', ink: '#fef9c3' },
  dear: { fill: 'rgba(251, 113, 133, 0.22)', edge: 'rgba(251, 113, 133, 0.9)', ink: '#ffe4e6' },
} as const;
const LABEL_KEY = { town: 1e6, growth: 2e6, stopped: 2.1e6, gallery: 3e6, waiting: 4e6, landHover: 6e6, stadium: 6e6 + 1 } as const; // (7e6: parking-overlay.ts's lots with no road)

interface Build { legs: Leg[]; cls: RoadClass; t0: number; dur: number; total: number; cum: number[] }
interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }
export interface Toast { id: number; text: string; t: number; kind: 'info' | 'warn' | 'good'; /** T242: its Set the scene button opens this place's picture card */ scene?: SceneRef }
export interface Camera { X: number; Y: number; z: number }
const AUTO_TREES = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];
/** a garden median's plants (P19): the beds' flowers and shrubs (lots/compose.ts FLOWERS and the bushes it scatters), picked by the prop's index */
const AUTO_GARDEN = ['town:hydrangea', 'town:fern', 'town:ornamental_grass', 'world:bush_2'];
/** the stand-in labels (T114) fade out between these zooms (gone below 8%, whole from 12%: the district view stays clear), and the view's query
 *  reaches this far below the screen (world px) for the tall pictures whose anchors lie under it */
const STANDIN_FADE = [0.08, 0.12] as const, STANDIN_REACH = 1200;
/** a golf structure's sprite scale: its picture fitted to the structure's footprint (tiles, turned when rotated), then the owner's size for
 *  that sprite from the studio (OWNER_SCALE). The stand-in sprites are much bigger than the structures they stand for; a smaller one keeps
 *  its own size (the entrance gate stood in by a 0.8-tile boom gate was drawn 7.8x) until the structure has its own art. */
function structureScale(typeId: string, it: LibItem, rotated: boolean) {
  const def = STRUCTURE[typeId], own = OWNER_SCALE[it.id] ?? 1; if (!def) return own;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) { const hx = (rotated ? b.hy : b.hx) / 2, hy = (rotated ? b.hx : b.hy) / 2, dx = (rotated ? b.dy : b.dx) / 2, dy = (rotated ? b.dx : b.dy) / 2; x0 = Math.min(x0, dx - hx); x1 = Math.max(x1, dx + hx); y0 = Math.min(y0, dy - hy); y1 = Math.max(y1, dy + hy); }
  const w = rotated ? def.footprint.h : def.footprint.w, h = rotated ? def.footprint.w : def.footprint.h, fw = x1 - x0, fh = y1 - y0;
  return (fw > 0 && fh > 0 ? Math.min(1, w / fw, h / fh) : 1) * own; // shrink to fit, never blow up: an upscaled stand-in is huge and blurry (past its 0.6x mip)
}
const autoKey = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`;
/** a natural disaster's area colour and name (see Game.drawDisasters, disasterText) */
const DISASTER_COL: Record<DisasterKind, string> = { flood: '#3b82f6', storm: '#9ca3af', landslide: '#92400e', wildfire: '#f97316', quake: '#a855f7', paranormal: '#b08aff' };
const DISASTER_NAME: Record<DisasterKind, string> = { flood: 'Flood', storm: 'Storm', landslide: 'Landslide', wildfire: 'Wildfire', quake: 'Earthquake', paranormal: 'Paranormal night' };
/** the toast for a disaster's note (see City.disasterFrame): the warning, the start, the end, and the repairs */
function disasterText(n: DisasterNote): string {
  const name = DISASTER_NAME[n.kind], money = `$${n.cost.toLocaleString()}`, roads = `${n.n} road${n.n === 1 ? '' : 's'}`;
  switch (n.k) {
    case 'warned': return n.kind === 'paranormal' ? `Nightfall in ${Math.round(n.secs)} s: kids are preparing for a monster outbreak; expect traffic diversions` : n.kind === 'flood' ? `Flood warning: roads near the river may close in ${Math.round(n.secs)} s` : `${name} warning: roads in the area may close in ${Math.round(n.secs)} s`;
    case 'started': return n.kind === 'paranormal' ? `Paranormal night: kids are fighting monsters; ${roads} closed and traffic is being diverted` : n.kind === 'quake' ? `Earthquake: ${roads} closed (bridges, tunnels); click a red X to pay for its repair` : n.kind === 'flood' ? `Flood: the low roads by the river are closed (${roads})` : `${name}: ${roads} closed`;
    case 'ended': return n.kind === 'paranormal' ? 'Dawn: the monsters have vanished and traffic routes are open again' : `${name} over: the roads are open again`;
    case 'repaired': return `Repaired for ${money}`;
    case 'unpaid': return `Repair needs ${money}: not enough money`;
  }
}
/** the living ground's prop caster cells (T111): CASTER_CELL tiles a side, CASTER_N a side of the map; and the reach (tiles) a chunk looks out
 *  for casters (a big tree's canopy past its trunk; living-ground.ts) */
const CASTER_CELL = 32, CASTER_N = MAP / CASTER_CELL, CASTER_REACH = CHUNK_CASTER_REACH;
const casterCellOf = (x: number, y: number) => clamp(Math.floor(y / CASTER_CELL), 0, CASTER_N - 1) * CASTER_N + clamp(Math.floor(x / CASTER_CELL), 0, CASTER_N - 1);
const BUILDING_KINDS: Record<string, number> = { house: 0, shop: 1, venue: 1, arcade: 1, landmark: 4, barn: 3 };
/** a town lot's use as the player reads it in the toasts (index LU: NONE, RES, COM, IND, TOUR, GOV) */
const LOT_NAME = ['lot', 'residential lot', 'commercial lot', 'industrial lot', 'tourist lot', 'civic lot'];
/** the planner's building refresh for the town's lots: at most one per this many ms; the contact sheet's block size, tiles */
const LOT_BLOCKS_MS = 5000, BLOCK = 40;
/** a street prop whose footprint centre lies inside a lay-by grown by this many tiles is not placed (its bay stands there) */
const LAYBY_PAD = 0.3;
/** the library index by id, and the props the town's lots add (auto 'lot:' + key) */
const LIB_INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const isLotProp = (p: Prop) => !!p.auto && (p.auto.startsWith('lot:') || p.auto.startsWith('farm:'));
/** the farms composed per frame at most (the rest wait in the queue), so a big network does not stall a frame; T259: and a frame composes no
 *  more farms once they took FARM_FRAME_MS (a farm composes in 0.2-0.4 ms, 1.5 at most) */
const FARMS_PER_FRAME = 4, FARM_FRAME_MS = 1;
/** T219: how long a place with no free site waits before the next search (ms) */
const PLACE_RETRY_MS = 30000;
/** the lot fills by use * 4 + decline (EMPTY, RES green, COM blue, IND orange, TOUR magenta, GOV white), darker with each decline step */
/** a business's rect fill by family (alpha 0.5): sports amber, leisure violet, tourism teal, transport sky blue, property lime */
const FAMILY_FILL: Record<BusinessType['family'], string> = { sports: 'rgba(245,158,11,0.5)', leisure: 'rgba(139,92,246,0.5)', tourism: 'rgba(20,184,166,0.5)', transport: 'rgba(14,165,233,0.5)', property: 'rgba(132,204,22,0.5)' };
const LOT_FILL = Array.from({ length: 24 }, (_, i) => { const k = [1, 0.75, 0.5, 0.3][i & 3]!, c = [[0, 0, 0], [76, 175, 80], [47, 123, 217], [255, 140, 26], [217, 70, 239], [255, 255, 255]][i >> 2]!; return `rgb(${Math.round(c[0]! * k)},${Math.round(c[1]! * k)},${Math.round(c[2]! * k)})`; });

/** whether node n's arms are small enough for a mini-roundabout: 2 lanes each way at most (a one-way road: 4 lanes) */
const miniFits = (n: Node): boolean => n.arms.every(a => a.cls.laneCentres.length <= (a.cls.oneway ? 4 : 2));

/** the props an undoable Paint or Course action added and removed */
type PropLog = { added: Prop[]; removed: Prop[] };

/** the tools' names as the rail and the panels say them (a locked tool's toast, P23 4.10) */
const TOOL_NAME: Partial<Record<Tool, string>> = { road: 'Roads', lane: 'Upgrade', downgrade: 'Downgrade', junction: 'Junctions', bus: 'Bus routes', park: 'Car parks', toll: 'Toll gates', paint: 'Paint', course: 'Holes', path: 'Cart paths & roads', buildings: 'Buildings', bulldoze: 'Bulldoze', practice: 'Practice' };

export class Game {
  gl: GLRenderer; ov: CanvasRenderingContext2D;
  dpr = 1; cw = 1; ch = 1; cssW = 1; cssH = 1;
  cam: Camera = { X: worldX(MAP / 2, MAP / 2), Y: worldY(MAP / 2, MAP / 2), z: 0.16 };
  /** the map seed (saved) and the valley generated from it */
  seed = 1; terrain!: Terrain;
  /** the road, town and place names of the map (src/game/ext/names): derived from the seed and stable keys, so never saved; rebuilt by genTerrain */
  names!: Names; roadNames!: RoadNames;
  /** the town sites' centres (tiles) in the terrain's order: the town index of the names module */
  townPts: Pt[] = [];
  net = new RoadNetwork(); edit = new NetEditor(this.net); lanes = new LaneGraph();
  props = new Set<Prop>(); nextUid = 1;
  private propGrid = new Grid<Prop>(8); private lampProps = new Set<Prop>(); private autoByKey = new Map<string, Prop>();
  sprites = new SpriteTiles();
  /** forest: slope field and clearing noise of the terrain; trees planted per FOREST_CELL cell (key cj * 32 + ci), drawn as sprites only, never in props */
  private slope: Float32Array = new Float32Array(0); private clearing: Noise = makeNoise(0); private forest = new Map<number, Prop[]>(); private forestItem = new Map<string, number>();
  /** town trees: the same cells (key cj * 32 + ci) planted on the free ground in and around the towns, sprites only; the clump noise; the boxes of the lots and painted areas last seen (a change drops the cells around them) */
  private townClump: Noise = makeNoise(0); private townTrees = new Map<number, Prop[]>(); private lotBoxes = new Map<string, number[]>(); private paintBoxes = new Map<string, number[]>();
  /** T265 (#794): the tree belts along the rivers and creeks (river-trees.ts), planted with each forest cell (plantCell: in its list, after its
   *  forest trees; beltN, how many of them a cell holds); the belts' field of the terrain; the dev switch window.__game.setRiverTrees(false) */
  private belt: BeltField | null = null; private beltN = new Map<number, number>(); private beltOn = true;
  /** tunnel mouths of the network: key of the last synced set, and the points themselves */
  private portalKey = ''; private portalPts: PortalRec[] = [];
  ground: GroundCache;
  /** lot ground edits made since the last frame (key -> patches, or null to drop), sent as one message per frame */
  private lotPending = new Map<string, LotPatch[] | null>();
  /** the atlas pages at full size (mip 0), loaded on first use for the 2D previews (the business ghost), so a preview is never drawn from mip 1 */
  private pageFull = new Map<number, HTMLImageElement>();
  private pageImage0(page: number): HTMLImageElement | null {
    let im = this.pageFull.get(page); if (!im) { im = new Image(); im.src = ATLAS_PAGES[page]![0]!; this.pageFull.set(page, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  /** each atlas page's alpha at mip 2 (512 px), for picking a prop by its pixels */
  /** each atlas page's opacity for picking at mip 2, one bit a px (alpha above PICK_ALPHA; T172: a bit, not the alpha byte: 2 MB, not 18) */
  private pageAlpha: ({ w: number; h: number; bits: Uint8Array } | null)[] = [];
  /** T080 atlas streaming (streamAtlas): screen px per cell this frame, the cells marked, the near cells (rebuilt every few frames) */
  private atlasMark = new Float32Array(0); private atlasTouched: number[] = []; private atlasNear: PageWant[] = []; private atlasNearAt = -1e9;
  ready = false; loadProgress = 0;
  /** when the game became ready (performance.now ms; T188: the welcome card's wait for the ground gives up after WELCOME_WAIT_MS) */
  readyAt = 0;
  // tools
  tool: Tool = 'road'; roadClass: ClassId = 'street'; bendMode: BendMode = 90; lineStyle: LineStyle = 0;
  /** the road tool's scope (T084): 'course' when the Course menu's Paths & drives opened it (it lays the course's cart paths and drives), 'town'
   *  from Roads; scopeClass: the class last picked in each scope, picked again on coming back to it */
  roadScope: 'town' | 'course' = 'town'; private scopeClass: Record<'town' | 'course', ClassId> = { town: 'street', course: 'cart-dirt' };
  /** the course tool's scope (plan P23 P1-E): 'buildings' when the rail's Buildings opened it (it places the clubhouse; no brush), else 'holes' */
  courseScope: 'holes' | 'buildings' = 'holes';
  /** the tool as the rail shows it: the road tool in the course scope is Paths ('path'), the course tool in its buildings scope is Buildings */
  get uiTool(): Tool { return this.tool === 'road' && this.roadScope === 'course' ? 'path' : this.tool === 'course' && this.courseScope === 'buildings' ? 'buildings' : this.tool; }
  /** Replace on (E): finishing a route first bulldozes the road pieces it would clash with (replaceCuts in snap.ts), then builds it */
  replaceMode = false;
  /** the junction tool's brush: 'select' (a click selects a junction), or a type that a click installs on the junction (plain, stop, mini, signal, roundabout) */
  brush: 'select' | 'plain' | 'stop' | 'mini' | 'signal' | 'roundabout' = 'select';
  /** the ring lanes a roundabout installed (or re-laned) by the junction tool gets; set by the Roundabout card's chips and by Tab */
  ringLanes: 1 | 2 | 3 = 1;
  /** the junction the tool has selected (its panel section and map overlay); read it with selectedNode, which follows the rebuilds */
  selectedJunction: Node | null = null;
  /** the year seen last frame (0: none yet): a signal tier's year coming in toasts (see yearCheck) */
  private seenYear = 0;
  selected: Prop | null = null; showLanes = false; showLots = false;
  /** the map grid (T100, ext/map-grid): the 2 m tiles as a subtle iso grid at all times, an evaluation option (G, the view toolbar, Settings;
   *  on in dev builds, off in production until the owner decides; remembered). Set it with setShowGrid */
  showGrid = false;
  setShowGrid(on: boolean) { this.showGrid = on; saveMapGrid(storageOf(), on); this.emit(); }
  /** the stand-in labels (T114, newart.ts standInLabel): "Stand In for Church" over each building drawn as a stand-in until its own art lands; on
   *  by default (the owner wants to see them), remembered. Set it with setShowStandIns */
  showStandIns = true;
  setShowStandIns(on: boolean) {
    this.showStandIns = on;
    try { localStorage.setItem('capitalempire.standins', String(on)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** T147, the money floats (moneyfloats.ts): green +$X rises where money comes in, red -$X where it goes out at a place or a sale is lost; on by
   *  default, remembered (the gear menu's Money floats). Set it with setShowMoneyFloats */
  showMoneyFloats = true;
  readonly floats = new MoneyFloats();
  /** T151, the map's world labels: collected over the overlay's frame, placed in one pass (none overlapping, stable) and written together; the
   *  money floats' columns are placed after them (floatCols) */
  readonly labels = new WorldLabels(); private floatCols = new ColumnPlacer();
  setShowMoneyFloats(on: boolean) {
    this.showMoneyFloats = on; if (!on) this.floats.clear();
    try { localStorage.setItem('capitalempire.moneyFloats', String(on)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** a money event floated at the camera's zoom now (none with the setting off) */
  floatMoney(e: MoneyEvent) { if (this.showMoneyFloats) this.floats.add(e, performance.now() / 1000, this.cam.z); }
  /** where a spend made now floats up (the map point clicked, set by pointerDown and pointerUp for their own spends; or spendAt's) */
  private moneySpot: Omit<MoneyEvent, 'amount' | 'kind'> | null = null;
  private moneyAt(p: Pt | null) { this.moneySpot = p ? { x: p.x, y: p.y } : null; if (p) queueMicrotask(() => { this.moneySpot = null; }); }
  /** spends n $ of kind with its float at p: a purchase or upkeep red, a refund green */
  private spendAt(p: Omit<MoneyEvent, 'amount' | 'kind'> | null, kind: 'construction' | 'upkeep', n: number) { const o = this.moneySpot; this.moneySpot = p; try { this.traffic.spend(kind, n); } finally { this.moneySpot = o; } }
  /** every spend (SimClient.onSpend): one placed (a map click, spendAt) floats up there; the business takings book (the range's) float as they are made */
  private spent(kind: 'construction' | 'compensation' | 'business' | 'upkeep', n: number) {
    const p = this.moneySpot; if (!p || kind === 'business' || !n) return;
    this.floatMoney({ ...p, amount: Math.abs(n), kind: n > 0 ? 'out' : 'in' });
  }
  /** the range's money place (merged over its shop at the mid zoom) */
  private rangeSpot(): Omit<MoneyEvent, 'amount' | 'kind'> | null { const c = this.range.scene?.counter; return c ? { x: c.x, y: c.y, group: 'range', gx: c.x, gy: c.y } : null; }
  /** a course building tool is on (T100): the Course menu's tools, Paths & drives, an event structure being placed; the course half grid shows */
  get courseBuilding() { return courseBuilding(this.tool, this.roadScope, this.eventTool && !!this.eventStructurePending); }
  /** the course land the half grid covers (the course and its parcels; none outside a golf game: the whole view), into a reused list */
  private gridLandBuf: [number, number, number, number][] = [];
  private gridLand(): readonly [number, number, number, number][] {
    const g = this.golf, out = this.gridLandBuf; out.length = 0;
    if (g) { out.push(g.course); if (g.parcels) for (const r of g.parcels) out.push(r); else out.push(g.parcel); }
    return out;
  }
  /** the road tool's grid step in tiles (T100): the course half grid (1 m) for Paths & drives, the map's 2 m lattice for town roads */
  roadStep() { return this.roadScope === 'course' ? HALF_T : 1; }
  /** the access overlay (key O): zones with built lots shaded by access; always on at the planner tier (below PLANNER_Z) */
  showAccess = false;
  /** the access overlay's growth state per zone, refreshed at most once a second (growthNow): the lots started within the last game day (growN), the lots declining (declN), and the totals */
  private growN = new Int32Array(256); private declN = new Int32Array(256); growTot = 0; declTot = 0; private growStamp = -Infinity;
  /** the flow overlay (key F, the Flow button, a jump): the live congestion heat map of each road direction (see drawFlow and setFlow) */
  showFlow = false;
  /** the flow overlay's view: 'time' the congestion over time (heat over hours, the default), 'now' the live bands */
  flowMode: 'time' | 'now' = 'time';
  /** the parking demand overlay (the Car park panel's toggle): cells shaded by the cars that wanted to park there per game hour */
  showParkDemand = false;
  /** the key (sigKey) of each main-thread signal plan, built once: the render loop reads it every frame */
  private sigKeys = new WeakMap<object, string>();
  /** the heat map's scratch: each dseg's band and lane key (255: not drawn), the keys in drawing order, and the counts, starts and fills per key */
  private heatKey = new Uint8Array(0); private heatOrd = new Int32Array(0);
  private histKey = new Uint8Array(0); private histOrd = new Int32Array(0);
  private histCnt = new Int32Array(HIST_BINS); private histStart = new Int32Array(HIST_BINS); private histFill = new Int32Array(HIST_BINS);
  private heatCnt = new Int32Array(32); private heatStart = new Int32Array(32); private heatFill = new Int32Array(32);
  /** the right-hand panel: the budget (the treasury), the bottlenecks (key B), or none */
  panel: 'budget' | 'bottlenecks' | null = null;
  /** the win's modal (App): set once when the career is won, cleared by its 'Keep building' */
  showWin = false;
  /** the range business on the map (range starts, plan P24, T129: golf/rangehost.ts): its scene, its golfers, its card */
  readonly range: RangeHost = new RangeHost({
    biz: () => (this.golf?.start === 'range' ? (this.golf.range ??= defaultRangeBiz()) : null),
    plot: () => { const g = this.golf, d = g?.start === 'range' ? this.bizDefs.find(b => b.type === 'range') : undefined; return g && d ? { rect: plotOfFront([d.x, d.y, d.w, d.h], g.dir), facing: g.dir } : null; },
    carPark: door => this.rangeCarPark(door), lots: door => this.lotsFor(door),
    // the car park building (T146) takes the lot's far half: the lot keeps its near half (the bays under the building go, the ground re-bakes)
    fitPark: r => {
      const d = this.rangeLotDef(); if (!d || (d.x === r[0] && d.y === r[1] && d.w === r[2] && d.h === r[3])) return;
      d.x = r[0]; d.y = r[1]; d.w = r[2]; d.h = r[3]; const b = this.golf?.range; if (b?.lot) b.lot = [r[0], r[1], r[2], r[3]]; this.syncParks(); this.scheduleSave();
    },
    // T239: the range car park's ground follows its upgrades: packed dirt and gravel are unpaved lots (loose bays, no lines, no barriers)
    parkGround: g => {
      const d = this.rangeLotDef(), want = g === 'paved' ? undefined : g; if (!d || d.ground === want) return;
      if (want) d.ground = want; else delete d.ground;
      this.syncParks();
    },
    pathLegs: b => { const out: { a: Pt; b: Pt }[] = []; for (const s of this.net.segsNear({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 }, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2)) if (s.cls.family === 'cart') out.push({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y } }); return out; },
    netVersion: () => this.net.version,
    addPiece: (p, key) => {
      const t = turned(p.id, p.q), item = LIB_INDEX.get(t.id); if (item === undefined) return null;
      // the studio's size wins; never past the pixels its atlas holds (sizes.ts), so the footprint and shadow match what is drawn
      const it = LIBRARY[item]!, scale = Math.min(maxDrawScale(item), STUDIO_SCALE[it.id] ?? (p.fit ? 64 * p.fit / it.w : p.scale ?? OWNER_SCALE[it.id] ?? 1));
      return this.addProp(item, p.x, p.y, t.flip, scale, key, p.lift || p.foot ? { lift: p.lift, foot: p.foot } : undefined);
    },
    removeProp: p => this.removeProp(p), setGround: (k, p) => this.setLotGround(k, p),
    layPaths: legs => { this.edit.addLegs(legs, classOf('cart-slab'), 0, undefined, true); this.commitNetwork(); },
    clearTrees: b => this.dropTownTrees(b[0], b[1], b[2], b[3]),
    money: () => this.money, spend: n => this.spendAt(this.rangeSpot(), 'construction', n), book: n => this.traffic.spend('business', -n),
    month: () => this.golfMonthIndex(), payUpkeep: n => this.spendAt(this.rangeSpot(), 'upkeep', n),
    demand: () => ({ tier: this.golf?.tier ?? 1, exits: this.golf?.exits?.length ?? 2, residents: this.traffic.pop, propsAppeal: this.decor.appeal(), practiceAppeal: this.golf?.range ? practiceAppeal(this.golf.range) : 0 }),
    dayLen: () => this.traffic.dayLen, simT: () => this.traffic.simTime(performance.now()),
    pace: () => { const T = this.traffic; return this.golfMode && T.town.prof ? localRate(T.town, T.simTime(performance.now())) * T.dayLen / 1440 : 1; }, // (T266)
    clock: () => { const c = this.clock(); return { hour: c.hour + c.minute / 60, day: c.day }; },
    save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), emit: () => this.emit(),
    // the range's tee box in the course grid (T130): tee cells of no hole, laid past the brush rules (the plot is the range's), so T127's banks raise it
    grid: () => this.courseGrid,
    layTee: pts => { const g = this.courseGrid; if (!g) return false; const q: Pt[] = []; for (let i = 0; i < pts.length; i += 2) q.push({ x: pts[i]!, y: pts[i + 1]! }); this.courseGridChanged(fillPolygon(g, q, SURF.tee, 0, 0), true); return true; },
  }, 0x7a29);
  /** the hint's Show me (T130): the camera on the practice area at 30% with the brush that builds its next facility */
  showPracticeArea() { const t = this.range.practiceTarget(); if (!t) return; this.lookAt(t.x, t.y, 0.3); this.armPractice(t.kind, true); this.emit(); } // T206: the facility's own tool, not the brush
  /** the range's car parks as the range's golfers park in them (T237: every car park that serves the range's door, golf/walkserve.ts: its nearest
   *  bay within WALK_SERVE_M; a car park further away adds no bays, so with none in reach the range's drivers turn away as at a full one): their
   *  bays nearest the door first (doorBays), each with its car park's entrance, cached while the serving parks stay the same */
  private rangeCarPark(door: Pt): { bays: { x: number; y: number; hx: number; hy: number; e: Pt; pid: number; drive: Pt[]; walk: Pt[] }[]; entrance: Pt; key: string } | null {
    const parks: CarPark[] = [];
    for (const pk of this.parkBuilt) if (pk && pk.entrances.length && pk.bays.length) parks.push(pk);
    const serving = servingParks(parks, door, pk => pk.bays);
    if (!serving.length) { this.rangePk = null; return null; }
    const key = `${Math.round(door.x * 4)},${Math.round(door.y * 4)}|${serving.map(s => `${s.park.id}:${s.park.bays.length}`).join(',')}`;
    if (this.rangePk?.v.key !== key || serving.some(s => !this.rangePk!.pks.has(s.park))) {
      // (T237: each bay with its drive from its car park's mouth along the aisles, and the walk from the car park's footpath along them)
      const all = serving.flatMap(s => { const f = this.footStart(s.park); return baysByDoor(s.park.bays, door).map(b => ({ x: b.x, y: b.y, hx: b.hx, hy: b.hy, e: s.park.entrances[0]!, pid: s.park.id, drive: bayDrive(s.park, b), walk: f ? bayWalk(s.park, b, f) : [] })); });
      this.rangePk = { pks: new Set(serving.map(s => s.park)), v: { bays: baysByDoor(all, door), entrance: serving[0]!.park.entrances[0]!, key } };
    }
    return this.rangePk.v;
  }
  private rangePk: { pks: Set<CarPark>; v: { bays: { x: number; y: number; hx: number; hy: number; e: Pt; pid: number; drive: Pt[]; walk: Pt[] }[]; entrance: Pt; key: string } } | null = null;
  /** T237: the range's own car park (the one its upgrades gravel and pave, and the car park building trims): the save's lot rect (a new game's,
   *  in the frontage strip), else the car park on the range's plot (an old save's) */
  private rangeLotDef(): CarParkDef | undefined {
    const r = this.golf?.range?.lot;
    if (r) return this.parkDefs.find(q => q.x === r[0] && q.y === r[1] && q.w === r[2] && q.h === r[3]);
    return this.parkDefs.find(q => this.onRangePlot(q.x + q.w / 2, q.y + q.h / 2));
  }
  /** T237: the venues a car park can serve (golf/walkserve.ts): the range's shop counter, the clubhouse's door, the first tee, the practice area's
   *  way in (once it is the player's: a guided start's is land for sale) and a tournament's gates */
  venues(): Venue[] {
    const g = this.golf; if (!g) return [];
    const out: Venue[] = [], sc = this.range.scene;
    if (sc) out.push({ id: 'range', door: sc.counter });
    if (this.bizDefs.some(d => d.type === 'clubhouse')) out.push({ id: 'clubhouse', door: g.clubhouse });
    let t1: Pt | null = null, h1 = Infinity;
    for (const t of g.tees) if (t.hole > 0 && t.hole < h1) { h1 = t.hole; t1 = { x: t.x, y: t.y }; }
    if (t1) out.push({ id: 'tee', door: t1 });
    if (sc && g.start === 'range' && !g.practiceLot) out.push({ id: 'practice', door: sc.practice.entry });
    for (const s of g.structures ?? []) if (s.typeId === 'gate') out.push({ id: 'gates', door: { x: s.x, y: s.y } });
    return out;
  }
  /** T237: the car parks within walking distance of a door (golf/walkserve.ts), nearest walk first: id, bays and walk (m) (the range's and the
   *  clubhouse's cards) */
  lotsFor(door: Pt): { id: number; bays: number; m: number }[] {
    const parks: CarPark[] = []; for (const pk of this.parkBuilt) if (pk && pk.bays.length) parks.push(pk);
    return servingParks(parks, door, pk => pk.bays).map(s => ({ id: s.park.id, bays: s.park.bays.length, m: s.m }));
  }
  /** T237: what a built car park serves (the venues within WALK_SERVE_M of its nearest bay, nearest first; golf/walkserve.ts) */
  parkServes(id: number): Serve[] {
    const k = this.parkDefs.findIndex(d => d.id === id), pk = k >= 0 ? this.parkBuilt[k] : null;
    return pk ? servesOf(pk.bays, this.venues()) : [];
  }
  /** T237: a car park's bays in the order its drivers take them: nearest the door of the nearest venue it serves first (the range's and the
   *  club's golfers take them from the front, the worker's cars there from the back: parkCarsOf); a car park serving nothing keeps its own order
   *  (nearest an entrance first). Cached per built park and the venues */
  private doorBays(pk: CarPark): CarPark['bays'] {
    const vs = this.venues(), vk = vs.map(v => `${v.id}${Math.round(v.door.x)},${Math.round(v.door.y)}`).join(';'), c = this.doorBaysOf.get(pk);
    if (c && c.vk === vk) return c.bays;
    const s = servesOf(pk.bays, vs)[0], bays = s ? baysByDoor(pk.bays, s.venue.door) : pk.bays;
    this.doorBaysOf.set(pk, { vk, bays });
    return bays;
  }
  private doorBaysOf = new WeakMap<CarPark, { vk: string; bays: CarPark['bays'] }>();
  /** a new range game's town day starts at 06:30 (P24 D16), so the first golfers turn in within the first minute */
  private rangeMorning() { if (this.golf?.start === 'range') this.traffic.setTownClock({ t0: this.traffic.simTime(performance.now()), m0: 390, rate: 1440 / this.traffic.dayLen }); }
  /** the range card (null: closed, or not a range start) */
  rangeCard() { return this.range.cardOpen ? this.range.view() : null; }
  openRangeCard(open = !this.range.cardOpen) {
    this.range.cardOpen = open && !!this.range.view(); if (this.range.cardOpen) this.clubCardOpen = false; // (T208: one card at a time)
    // the ramp's first hint moves on once the card has been seen (T132)
    const p = this.golf?.progress; if (this.range.cardOpen && p && !p.seen.includes(RANGE_CARD_SEEN)) { p.seen.push(RANGE_CARD_SEEN); this.scheduleSave(); }
    this.emit();
  }
  buyRangeUpgrade(id: RangeUpgradeId) { this.range.buy(id); }
  setRangePrice(price: number) { this.range.setPrice(price); }
  /** the Props tool (plan P24 Phase 3, T131: golf/propstool.ts): the decor the player places, moves, turns and sells; its appeal feeds the range */
  readonly decor: PropsTool = new PropsTool({
    golf: () => this.golfMode && !!this.golf, item: id => LIB_INDEX.get(id), idOf: p => LIBRARY[p.item]!.id,
    scaleOf: (item, want) => { const it = LIBRARY[item]!; return Math.min(maxDrawScale(item), want ?? STUDIO_SCALE[it.id] ?? OWNER_SCALE[it.id] ?? 1); },
    footprint: (item, x, y, k) => { const f = this.footprint(LIBRARY[item]!, x, y, false, k); return [f.x0, f.y0, f.x1, f.y1]; },
    spot: {
      owned: (x, y) => this.ownedAt(x, y),
      water: b => { for (let y = Math.floor(b[1]); y < Math.ceil(b[3]); y++) for (let x = Math.floor(b[0]); x < Math.ceil(b[2]); x++) { const c = this.terrain.cls[y * MAP + x]; if (c === TC.WATER || c === TC.CREEK || c === TC.BANK) return true; } const g = this.courseGrid; if (g) for (let y = b[1]; y <= b[3]; y += 0.5) for (let x = b[0]; x <= b[2]; x += 0.5) { const i = cellAt(g, x, y); if (i >= 0 && g.surf[i] === SURF.water) return true; } return false; },
      road: b => this.net.rectOcc(b[0] + 0.08, b[1] + 0.08, b[2] - 0.08, b[3] - 0.08) > 0 || this.parkDefs.some(d => b[0] < d.x + d.w && b[2] > d.x && b[1] < d.y + d.h && b[3] > d.y),
      course: (x, y) => { const g = this.courseGrid, i = g ? cellAt(g, x, y) : -1, v = i >= 0 ? g!.surf[i] : 0; return v === SURF.green ? 'green' : v === SURF.bunker ? 'bunker' : ''; },
      // T187: a town prop keeps off the town's lots (its houses grow there)
      lot: b => lotTouches(this.traffic.lots.values(), b),
      // T231: the fountain jet stands only in water: the map's lakes and rivers, the course's water and painted ponds
      wet: (x, y) => { const c = this.terrain.cls[Math.floor(y) * MAP + Math.floor(x)]; return c === TC.WATER || this.pondWet(Math.floor(x / POND_CELL), Math.floor(y / POND_CELL)); },
    },
    // T231: the ponds (golf/ponds.ts): the still water under a tile, the edge marks (undo carries them) and the Fountain pond's water
    pondAt: (x, y) => pondAt(x, y, this.pondWet),
    pondMarks: () => this.golf?.ponds ?? [], setPondMarks: m => this.setPondMarks(m),
    digPond: (x, y, r, where) => this.digPond(x, y, r, where),
    propsIn: b => this.propGrid.query(b), props: () => this.props, propName: p => (p.decor ? DECOR_BY_KEY.get(p.decor)?.name : p.auto === 'range:shop' ? 'the shop' : undefined) ?? LIBRARY[p.item]!.name,
    scene: () => this.range.scene,
    // T257: a natural prop the player mirrored (R) keeps that look; a tree's mirror is on top of its sun's (tree-sun.ts: drawn mirrored when its
    // art is lit from the left), so flipOf reads back the player's
    addProp: (item, x, y, k, flip = false) => this.addProp(item, x, y, this.treeLit(item) !== flip, k, undefined, { own: true }), removeProp: p => { this.removeProp(p); if (LIBRARY[p.item]!.kind === 'lamp') this.syncLamps(); },
    flipOf: p => p.flip !== this.treeLit(p.item),
    propAt: (mx, my) => this.propAt(mx, my), tileAt: (mx, my) => this.tileAt(mx, my),
    selected: () => this.selected, select: p => { this.selected = p; }, hover: p => { this.hoverProp = p; },
    money: () => this.money, spend: n => this.traffic.spend('construction', n),
    step: (label, run) => this.paint.step(label, run), undo: () => this.paint.undo(), redo: () => this.paint.redo(),
    save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), emit: () => this.emit(),
  });
  /** Facilities ▸ Practice (T206, #540: golf/practicetool.ts): the practice facilities' own building tools; the bulldozer takes a built one */
  readonly practice: PracticeTool = new PracticeTool({
    area: () => (this.golf?.start === 'range' ? this.range.scene?.practice ?? null : null), grid: () => this.courseGrid,
    owned: (x, y) => this.ownedAt(x, y) && !this.onRangePlot(x, y), open: k => this.range.practice?.[k].state === 'open', forSale: () => this.practiceForSale(),
    tileAt: (mx, my) => this.tileAt(mx, my), money: () => this.money, month: () => (this.golf ? this.golfMonthIndex() : 0),
    gridStep: (label, run) => this.paint.gridEdit(label, run), undo: () => this.paint.undo(), redo: () => this.paint.redo(),
    lookAt: (x, y, z) => this.lookAt(x, y, z),
    save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), emit: () => this.emit(),
  });
  /** a practice facility in hand (Facilities ▸ Practice, the range card's Build; null puts it down); show: the camera on the practice area */
  armPractice(kind: 'putting' | 'chipping' | null, show = false) {
    if (!kind) { this.practice.cancel(); this.emit(); return; }
    if (this.refuseLocked('practice')) return;
    if (this.tool !== 'practice') this.setTool('practice');
    if (this.tool === 'practice') this.practice.arm(kind, show);
  }
  /** what a placed prop sells for (the bulldozer, Delete): half a Props tool item's price (T131), else half its library price, nothing for a plant */
  private sellValue(p: Prop): number { const d = p.decor ? DECOR_BY_KEY.get(p.decor) : undefined; return d ? sellBack(d, this.decor.sizeOf(p, d)) : p.plant ? 0 : Math.round(LIBRARY[p.item]!.cost * 0.5); }
  /** T257: whether a library item is a tree drawn mirrored for its sun (tree-sun.ts: its art lit from the left) */
  private treeLit(item: number): boolean { const it = LIBRARY[item]!; return it.kind === 'tree' && TREE_MIRROR.has(it.id); }
  /** the before / after snapshot (the bottlenecks panel): the game hour it was taken at, the window before (null: no traffic on record yet), and the next rush, [start, end] in absolute game hours */
  snapshot: { at: number; before: Window | null; after: [number, number] } | null = null;
  /** a ring pulsed for 4 s where the camera jumped (see jumpTo): the tile and the time (performance.now, ms) */
  focus: { x: number; y: number; t: number } | null = null;
  /** the car inspected (its slot in the traffic client's arrays; -1: none; its info is traffic.car), and whether the camera follows it */
  inspecting = -1; followCar = false;
  hover: Pt | null = null; hoverProp: Prop | null = null; hoverNode: Node | null = null; hoverPiece: PieceSel | null = null;
  /** the select tool's road under the pointer when no prop is (its name; '' otherwise) */
  hoverRoad = '';
  route: Pt[] = [];
  /** the snaps of the route's first point and of its last click (see snap.ts: checkLegs judges the route against them) */
  routeFrom: Snap | null = null; routeLast: Snap | null = null;
  // economy (the books live in the city worker: traffic.budget, see the getters by the save)
  /** the sim speed (sim s per s; 0 = paused) and the last speed above 0 (what a resume goes back to) */
  speed = 1; private lastSpeed = 1; private lastFrame = 0;
  /** the dev sandbox (URL ?grow=N, ?stamp=0|1, ?money=0|1; the dev server defaults to grow 1 (the game's, since 2026-10-27), no stamp, money on; the bench forces the game's): the growth speed (1 = the game's),
   *  whether a new valley's towns are stamped to their residents, and unlimited money (sent to the city worker at init) */
  private sandboxGrow = 1; private stampOn = true; private sandboxMoney = false; private sandboxUnlock = false;
  /** how a new game starts (?start=): 'range' (the default: the county road and the driving range, plan P22), 'town' (the old start: a seeded
   *  town, the old nine and the clubhouse) or 'valley' (the classic three towns) */
  private startMode: 'range' | 'town' | 'valley' = 'range';
  /** a Space press that panned (held with the drag) does not also pause on release */
  private spacePanned = false;
  // fx
  builds: Build[] = []; particles: Particle[] = []; private growToast = -Infinity;
  toasts: Toast[] = []; toastId = 1;
  /** the city worker (cars, parcels, town): created with the game, so the town grows whenever the sim runs */
  traffic: SimClient;
  /** car light points, reused each frame (grown to 7 points per sim slot) */
  // perf
  /** the townspeople on the sidewalks (ext/pedestrians): the sidewalks follow the network (net.version), one walker per two
   *  built lots (at most PED_MAX), walking in real time while the game runs; drawn at the Street tier as movers */
  private peds = new Pedestrians(0x70656473, Math.max(1, WALKER_PEOPLE.length), PED_MAX, WALK_FRAMES - 1); private pedNet = -1; private pedTick = 0; private pedLots = -1;
  private pedView: WalkerView[] = []; private pedDraw: Drawable[] = [];
  /** the crowd's movers (crowdMovers) and its scratch people: the spectators, the golfers */
  private crowdDraw: Drawable[] = []; private crowdPeople: CrowdPerson[] = []; private crowdGolfers: CrowdPerson[] = [];
  /** the day's golf round (updatePlay, docs/GOLF-PLAY.md P2): built once per tournament; playTried is the key last tried, so a round with no holes is not rebuilt every frame */
  private play: GolfPlay | null = null; private playTried = -1;
  /** T208 everyday golf: the town days' play (the save, the booking: golf/everyday.ts DayBook), the day's playback (its town day and course key; null:
   *  none on the course now), the played course (rebuilt when the holes change: its key), and the clubhouse card's open state */
  private dayBook: DayBook | null = null; private dayPlay: { view: DayView; day: number; key: string } | null = null;
  private dayCourse: { view: CourseView; key: string; at: number } | null = null; clubCardOpen = false;
  /** T269: the greens the cups are cut on (by hole: the key of the grid's rev, the placed pin and the approach they were found for), the day pins'
   *  revision (bumped when a cup moves: the flags and the play follow), the revision the flags stand at, and when the cups were last checked */
  private greens = new Map<number, { key: string; g: GreenShape | null }>(); private pinRev = 0; private flagRev = -1; private pinsCheckedAt = 0; private pinsCheckKey = '';
  /** T233: the top bar's money chip: the treasury as the golf months go by (its change a month); the course rating's quality, worked out at most
   *  every RATING_MS (Course stats derives the holes) */
  private monthMoney = new MonthMoney(); private ratingAt = -Infinity; private ratingOf: { quality: number | null; holes: number } = { quality: null, holes: 0 };
  /** T208: the bench's busy day (?golfers=N: this many visitors in place of dailyGolfers; dev and bench only) */
  private dayBusy: number | undefined; private devSeed = 0; private dayOff = false;
  /** T251 (dev, ?tourney=1: the bench's tournament day and the ball captures): today plays the tournament's round as if its day had come */
  private devTourney = false;
  /** T266: golf's pace (golf/pace.ts): watchable (mix) by default, or the old fast pace (main), as the gear menu's Golf pace has it (remembered);
   *  the dev server's ?golfPace plays any of the prototype's options for the session */
  golfPace: GolfPace = 'mix';
  /** T266: the gear menu's Golf pace */
  get paceSetting(): PaceSetting { return settingOf(this.golfPace); }
  setPaceSetting(v: PaceSetting) {
    this.golfPace = v === 'fast' ? 'main' : 'mix';
    try { localStorage.setItem(PACE_KEY, v); } catch { /* storage may be unavailable */ }
    this.applyPace(); this.emit();
  }
  /** T266: the pace to the town clock (the day/night profile goes with the town day), the everyday playback (built again next frame) and the
   *  tournament's (its pacers) */
  private applyPace() {
    this.traffic.golfNight = dayNight(this.golfPace) ? NIGHT_S : null;
    this.traffic.setTownDay(this.townDay.minutes, this.townDay.traffic);
    this.dayPlay = null;
    this.play?.pv.setPace(this.playPace());
  }
  /** T266: the tournament play's pacers (the pros, their caddies and carts keep to a walk), or none on the fast pace */
  private playPace() { return capped(this.golfPace) ? { walkers: new Pacer(64, WALK_CAP), carts: new Pacer(32, CART_CAP), caddies: new Pacer(64, CADDIE_CAP) } : null; }
  /** the game hour of the tournament day the play last saved at (T209: the day saves itself each game hour, so a reload resumes near where it was); -1 none */
  private playSavedHr = -1;
  /** T209: a resumed tournament day waits, the sim paused at the save's moment, until its play is built again (the owner's shot may open at once): the
   *  speed to go on at and when the wait was first seen (performance.now(), 0 before the first frame); null when not waiting. See holdDay */
  private dayHold: { speed: number; at: number } | null = null;
  /** the owner's open shot (P4b: the shot panel; null when none is open) and the speed the sim had when it opened (it resumes at least at 1x) */
  private shot: ShotState | null = null; private shotSpeed = 1;
  /** the featured holes last sent to the city (featuredHoles; the City's set mirrors it) and the real ms they were last worked out at */
  private featured: number[] = []; private featuredAt = -Infinity;
  /** T210: the real ms the end of the round (GolfPlay.finish) was last stepped at, and whether the player asked for the results before the last group is
   *  in (today's early leave: the eval's screen as it opened at kick-off; reset when the round is free) */
  private finishAt = -Infinity; private resultsEarly = false;
  /** the leaderboard (playBoard), recomputed at most every 250 ms: the play it is for, the time, and the board */
  private boardCache: { play: GolfPlay; at: number; board: PlayBoard } | null = null;
  /** Local care and wear augment the existing base grass, lawn presets, paint and grow-in. */
  grass = (() => { const g = new GrassManagement(); if (!GREENKEEPING) g.configure({ enabled: false }); return g; })(); grassPanel = false; grassHeat = false; grassRadius = 12; grassArea = false; grassDose = 1; grassAngle = 0;
  grassAction: GrassAction | null = null; grassTarget: Pt | null = null;
  private grassZones = new Map<string, string[]>(); private grassDelta: GrassCellView[] = []; private grassSim = -1; private grassElapsed = 0; private grassTrafficT = -1;
  private grassVisible = false;
  private grassPedX = new Float32Array(PED_MAX); private grassPedY = new Float32Array(PED_MAX); private grassPedOut = new Uint8Array(PED_MAX);
  private grassCarX = new Float32Array(0); private grassCarY = new Float32Array(0); private grassCarAlive = new Uint8Array(0);
  perf = { fps: 0, frameMs: 0, cpuMs: 0, drawMs: 0, /** main-thread ms this frame: the course chunks' work, the lot ground's flush to the workers, and the last course send's lag after its first change */ courseMs: 0, lotFlushMs: 0, courseLagMs: 0, /** the last course chunk job: its worker ms and chunks; the last areas job: its worker ms and the main ms of taking its areas in */ courseJobMs: 0, courseJobChunks: 0, areasJobMs: 0, areasApplyMs: 0, instances: 0, draws: 0, chunksPending: 0, uploadKB: 0, frames: 0, tier: 'street' as 'street' | 'district' | 'planner', forest: 0, townTrees: 0, /** T265: the belt trees planted, and the most ms a frame's planting took (plantForest) */ belt: 0, plantMs: 0, simActive: 0, simTickMs: 0, simMaxTickMs: 0, pop: 0, jobs: 0, built: 0, lotProps: 0, /** T080: the atlas's GPU MB (fixed by its plan) and the share of this frame's on-screen sprite px drawn coarser than the zoom needs (streaming in) */ atlasMB: 0, atlasSoft: 0, /** T151: the label pass's ms this frame (place and write) and its labels (collected, shown) */ labelMs: 0, labels: 0, labelsShown: 0 };
  private frameTimes: number[] = [];
  // input
  /** a drag in progress; build: a right-button press in the road tool (released without moving, it builds the route, as Enter) */
  private dragging: null | { kind: 'pan' | 'bulldoze' | 'park'; sx: number; sy: number; camX: number; camY: number; moved: boolean; /** T207: a road tool right-click: on release without a drag it takes back the last point */ back?: boolean; aim?: Pt; /** a Select click's hole under it (0: none; T174) */ hole?: number; /** T200: a click on Land for sale's overlay (it opens the block's card on release, never buys) */ land?: Pt } = null;
  /** the Paint tool: painted ground areas, its settings and the outline being drawn (docs/PAINT-TOOL.md) */
  paint = new PaintTool({ collarDefault: s => borderDefault(s, finishOf(paintedSurfaces())), progress: () => this.bump('pieces'), setLotGround: (k, p) => { this.paintRev++; this.setLotGround(k, p); }, emit: () => this.emit(), save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), affine: o => this.paintAffine(o), placeProps: (ps, seed) => this.placePresetProps(ps, seed), golfMode: () => this.golfMode, money: () => this.money, spend: n => this.traffic.spend('construction', n), ownedLand: pts => !this.golf || polyInParcels(this.golf.parcels ?? [this.golf.parcel], pts), currentMonth: () => !this.golf ? 0 : this.golfMonthIndex(), plant: (ids, x, y, r, spacing, size, seed) => this.plantProps(ids, x, y, r, spacing, size, seed), unplant: (x, y, r) => this.unplantProps(x, y, r), plantPool: k => plantPool(LIBRARY, k), courseHeight: () => this.courseHeight, roadsNear: (x, y, r) => { let k = 0; return [...this.net.segsNear({ x, y }, r)].map(s => ({ id: ++k, ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, halfWidthTiles: s.cls.h + s.cls.walk })); }, roadRev: () => this.net.version, heightChanged:b => { this.courseHeightChanged(unionCourseBox(b, this.flattenRoadsIn(b))!); },
    journal: { begin: () => { this.propLog = { added: [], removed: [] }; }, end: () => { const j = this.propLog; this.propLog = null; return j && (j.added.length || j.removed.length) ? j : null; }, undo: j => this.swapProps(j as PropLog, true), redo: j => this.swapProps(j as PropLog, false) },
    changed: pins => this.syncCourseMarkers(pins),
    grid: () => this.courseGrid, gridChanged: (d, flush) => { this.range.practiceCells(this.courseGrid, d); this.courseGridChanged(d, flush); }, gridAreas: () => this.gridAreaList(),
    // the course keeps off the driving range's own plot (its hut, mats, car park and the field its golfers hit into), the rest of your land is
    // the course's; the brush's footprint and the wizard say which refusal it is
    practiceAt: (x, y) => this.golf?.start === 'range' && !!this.range.scene && inPractice(this.range.scene.practice, x, y), // T206
    ownedAt: (x, y) => this.ownedAt(x, y) && !this.onRangePlot(x, y), landWhy: (x, y) => (this.onRangePlot(x, y) ? 'range' : this.ownedAt(x, y) ? '' : 'off'), plans: () => this.golf?.plans ?? [], setPlans: p => this.setGolfPlans(p), pondMarks: () => this.golf?.ponds ?? [], setPondMarks: m => this.setPondMarks(m), holeBuilt: () => this.guideEvent('hole'), pinOf: n => this.golf?.pins.find(q => q.hole === n) ?? null,
    // New hole (P23 4.4, T119): the camera framing, the practice area (P24 D24), and what its warnings measure against
    fitView: (pts, zoomIn) => this.fitView(pts, zoomIn), practiceBox: () => (this.golf?.start === 'range' ? this.range.scene?.practice.box ?? null : null),
    // a range start's ramp (P24 Phase 4a, T132): New hole waits for the range, and the first hole is suggested as a par-3
    planLock: () => this.toolUi()?.newHoleLock ?? null,
    suggestM: () => (this.golf?.start === 'range' && !(this.golf.plans ?? []).length && !this.courseHoleViews().some(h => h.par > 0) ? FIRST_PAR3_M : 0),
    landBox: () => { const L = this.golf ? this.golfLand() : []; if (!L.length) return null; return [Math.min(...L.map(r => r[0])), Math.min(...L.map(r => r[1])), Math.max(...L.map(r => r[0] + r[2])), Math.max(...L.map(r => r[1] + r[3]))]; },
    publicRoads: b => [...this.net.segsNear({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 }, Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 4)].filter(s => s.kind !== SK.TUNNEL && !isCourseClass(s.cls.id)).map(s => ({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, name: this.roadNameOfSeg(s) })),
    treesCleared: () => this.ghostTrees.set.length, // T176
    frameBuilt: (h, p, layout) => this.frameBuilt(h, p, layout), frameGhost: () => this.wizardFrameTrees(), frameCost: () => this.wizardFrame()?.price ?? 0, // T229
    holeLines: () => { const g = this.golf; if (!g) return []; return g.pins.flatMap(p => { const t = g.tees.find(q => q.hole === p.hole && q.kind === 'back') ?? g.tees.find(q => q.hole === p.hole); return t ? [{ hole: p.hole, line: [{ x: t.x, y: t.y }, { x: p.x, y: p.y }] }] : []; }); },
    courseLook: () => this.resendCourse(),
    // T256 (#743): the looks book (each hole's, the property's and each facility's looks), the facility My looks edits, your land for Range ›
    // Build (the range's plot too), and an owner's look changed: its cells alone are drawn again
    lookBook: () => (this.golf ? (this.golf.looks ??= {}) : null), facility: () => (this.tool === 'practice' ? this.practice.kind : null),
    landAt: (x, y) => this.ownedAt(x, y), lookChanged: o => this.ownerLookChanged(o),
    // T271 (#812): the course's own grasses (the game save's), a new grass's family, and the first cut a grass's Border is laid in
    grasses: () => this.grasses(), setGrasses: (l, redraw) => this.setGrasses(l, redraw), grassFamily: (): string | null => this.fairwayFamily(), firstCutTex: (): CourseTex => collarTexes(this.paint.brush as BrushLooks)['first-cut'],
    frameTreePrice: () => DECOR_BY_KEY.get(FRAME_TREE_KEY)?.price ?? 0, placeFrame: (n, trees) => this.placeSavedFrame(n, trees),
    // T254 (#736): Edit Hole Layout moves the markers (one undo step with them), and its warnings read where they would stand
    layoutBuilt: (n, base, plan) => this.layoutBuilt(n, base, plan), placeTees: (n, tees) => this.placeTees(n, tees), markersKey: () => this.markersKey(), setMarkers: k => this.setMarkers(k),
    markersOf: n => ({ pin: this.golf?.pins.find(p => p.hole === n) ?? null, tees: this.golf?.tees.filter(t => t.hole === n) ?? [] }) });
  /** the hole plans change (a wizard build, edit or delete, or their undo and redo; T102): golf.aims follow the plans' bends, so the holes'
   *  playing lines run through them (no dogleg warning) */
  private setGolfPlans(p: unknown[]) {
    const g = this.golf; if (!g) return;
    const before = decodePlans(g.plans);
    g.plans = p; g.aims = aimsFromPlans(g.aims ?? [], before, decodePlans(p));
    this.scheduleSave();
  }
  /** the Paint and Holes tools drive the same PaintTool (Buildings, the course tool's other scope, does not paint) */
  get paintOn() { return this.tool === 'paint' || (this.tool === 'course' && this.courseScope === 'holes'); }
  /** the Course tool's hole strip: makes hole n current and moves the camera to its areas (when it has any) */
  // ---------- the hole card (plan P23-UX 6.2 P2-4, T174) ----------
  /** the hole whose card is open (null: none) */
  holeCardHole: number | null = null;
  /** a pin or tee marker of the card's hole is being dragged (it is selectedGolfMarker; dropped on release) */
  private markerDrag = false;
  private cardCache: { key: string; v: HoleCardView | null } | null = null;
  /** opens hole n's card (its Holes panel badge, or its area clicked with Select) and makes it the current hole */
  openHoleCard(n: number) { if (!this.golf || !this.courseHoleViews()[n - 1]?.started) return; this.holeCardHole = n; this.paint.setHole(n); this.emit(); }
  /** closes the card (its ✕, Esc, a click on open ground) */
  closeHoleCard() { if (this.holeCardHole === null) return; this.holeCardHole = null; this.markerDrag = false; this.selectedGolfMarker = null; if (this.teePlace && this.tool === 'select') this.teePlace = null; this.emit(); }
  /** the hole of the course under tile t: the course grid's cell (a playing surface or rough of a hole), else a painted area's hole; 0: none */
  courseHoleAt(t: Pt | null): number {
    const g = this.courseGrid; if (!t || !this.golf) return 0;
    if (g) { const i = cellAt(g, t.x, t.y); if (i >= 0 && g.surf[i]! > 0 && g.hole[i]!) return g.hole[i]!; }
    return areaAt(this.paint.areas, t.x, t.y)?.hole ?? 0;
  }
  /** the open card's facts (golf/holecard.ts), null when none is open or its hole is gone */
  holeCardView(): HoleCardView | null {
    const n = this.holeCardHole, g = this.golf; if (n === null || !g) return null;
    const views = this.courseHoleViews(), v = views[n - 1], now = this.growMonth();
    const key = `${n}|${this.gaRev}|${this.courseGrid?.rev ?? 0}|${now}|${this.golfMonthIndex()}|${views.length && v ? JSON.stringify(v) : ''}|${JSON.stringify([g.pins, g.tees])}|${this.paint.hasPlan(n)}`;
    if (this.cardCache?.key !== key) {
      this.cardCache = { key, v: v?.started ? holeCard(v, { pins: g.pins, tees: g.tees, aims: g.aims ?? [], areas: holeAreas(this.courseGrid, n, now, now - this.golfMonthIndex()), ready: this.holesGrowing().get(n) ?? null, planned: this.paint.hasPlan(n) }) : null };
    }
    return this.cardCache.v;
  }
  /** a Fix on the card: Edit hole; the brush armed with the missing surface on this hole; or the misplaced marker in hand (the next click on the
   *  map puts it, on its green or tee) */
  holeCardFix(f: HoleFix) {
    const n = this.holeCardHole; if (n === null) return;
    if (f.kind === 'edit') { this.editHole(n); return; }
    if (f.kind === 'brush') { this.setTool('course'); if (this.tool !== 'course') return; this.paint.setHole(n); this.paint.setBrush(f.surface, 0); this.emit(); return; }
    if (!this.holesTool) this.toggleHolesTool();
    // T254: the tees' Fix picks up the hole's first set (blue, white, yellow, red: the one off its tee first)
    const g = this.golf, areas = this.courseAreaList(), mine = TEE_KINDS.flatMap(k => g?.tees.find(t => t.hole === n && t.kind === k) ?? []);
    const tee = mine.find(t => surfaceAt(areas, t.x, t.y) !== 'tee') ?? mine[0];
    this.selectGolfMarker(n, f.marker === 'pin' ? 'pin' : tee?.kind ?? 'middle');
  }
  /** Edit hole (the hole card, the Holes panel's status line): New hole's editor on hole n's plan, framed by the camera, with a toast
   *  (PaintTool.editHole; T205: when it is already open it stays, drags and all); the card closes. False with a toast for a hole painted by
   *  hand (the card stays) */
  editHole(n: number): boolean {
    if (!this.paint.hasPlan(n)) { this.toast(`Hole ${n} was painted by hand: shape it with the brush`, 'info'); return false; }
    const shown = this.uiTool === 'course'; // the Holes panel is laid out already: the camera frames the map beside it
    this.setTool('course'); if (this.tool !== 'course') return false;
    this.closeHoleCard();
    if (!this.paint.editHole(n)) return false;
    // the panel opens with this press (from Select): frame the hole again once it is laid out, so it is not under the panel
    if (!shown && typeof requestAnimationFrame === 'function') { const pts = this.paint.wizard.planView(); requestAnimationFrame(() => this.fitView(pts, true)); }
    return true;
  }
  /** Delete (after the card's confirm; T256, #743): hole n with its paint, as one undo step (PaintTool.deleteHole): "Delete hole and its
   *  grass" (keep false) takes every cell of the hole back to the land, touch-ups included, with no refund, and its frame trees (T229) with
   *  it; "Delete hole, keep the grass" (keep true) leaves its cells as your property's paint and its frame trees as plain trees. Its plan and
   *  its looks go either way; the property's paint and the other holes' stay */
  deleteHole(n: number, keep = false): boolean {
    const ok = this.paint.deleteHole(n, keep, () => {
      for (const p of [...this.props]) {
        if (p.frame !== n) continue;
        this.removeProp(p);
        if (keep) { const q = this.addProp(p.item, p.x, p.y, p.flip, p.scale); if (p.decor) q.decor = p.decor; }
      }
      this.frameRev++;
      dropHoleBoxes(this.golf?.teeBoxes, n); this.teeRev++; // T268: its tee boxes' records go with it (undo brings the cells back as older boxes)
    });
    if (ok) { this.closeHoleCard(); this.holeCache = null; this.cardCache = null; }
    return ok;
  }
  // ---------- T256 (#743): Range › Build, My holes ----------
  /** Range › Build (and Facilities › Build on your property): the course tool with the property's brush (the same painting tools as the holes,
   *  painting cells of no hole: the range, the practice area, the rest of your land) */
  openPropertyPaint(kind: BrushKind = this.paint.brushKind === 'path' ? 'fairway' : this.paint.brushKind) {
    if (!this.golf || !this.courseGrid) { this.toast('Build paints a golf course\'s land', 'warn'); return; }
    if (this.range.cardOpen) this.openRangeCard(false);
    this.setTool('course'); if (this.tool !== 'course') return;
    this.paint.setProperty(true, kind); this.emit();
  }
  private myHolesMemo: { key: string; v: MyHole[] } | null = null; private myHolesRev = 0;
  /** My holes: this game's saved holes, then the browser's from other games (the same hole once) */
  myHoles(): MyHole[] {
    const key = `${this.myHolesRev}|${this.golf?.myHoles?.length ?? -1}`;
    if (this.myHolesMemo?.key !== key) this.myHolesMemo = { key, v: joinHoles(this.golf?.myHoles ?? [], loadBrowserHoles()) };
    return this.myHolesMemo.v;
  }
  /** Save hole (the hole card): hole n as a My holes entry named name, its frame trees with it when trees: kept in the game and the browser
   *  (one of the same name is replaced); false with a toast when the hole has no cell */
  saveMyHole(n: number, name: string, trees = true): boolean {
    const gs = this.golf, g = this.courseGrid; if (!gs || !g) return false;
    const plan = decodePlans(gs.plans ?? []).find(p => p.hole === n) ?? null, pin = gs.pins.find(p => p.hole === n) ?? null;
    let tee: Pt | null = plan?.tee ?? gs.tees.find(t => t.hole === n && t.kind === 'back') ?? gs.tees.find(t => t.hole === n) ?? null;
    if (!tee) { // a hole painted by hand with no marker yet: its tee cells' middle, else its first cell
      let x = 0, y = 0, k = 0, first = -1;
      for (let i = 0; i < g.hole.length; i++) { if (g.hole[i] !== n || g.surf[i] === SURF.none) continue; if (first < 0) first = i; if (g.surf[i] === SURF.tee) { const c = cellCentre(g, i); x += c.x; y += c.y; k++; } }
      tee = k ? { x: x / k, y: y / k } : first >= 0 ? cellCentre(g, first) : null;
    }
    if (!tee) { this.toast(`Hole ${n} has nothing to save yet`, 'warn'); return false; }
    const frame = trees ? [...this.props].filter(p => p.frame === n).map(p => ({ id: LIBRARY[p.item]!.id, x: p.x, y: p.y, flip: p.flip, scale: p.scale })) : [];
    const v = this.courseHoleViews()[n - 1], m = teeLengths(n, gs.pins, gs.tees, gs.aims ?? [])[0]?.m;
    const tees = gs.tees.filter(t => t.hole === n).map(t => ({ kind: t.kind, x: t.x, y: t.y })); // T254: its tee sets go with it
    const h = captureHole(n, { grid: g, plan, tee, pin, field: this.courseHeight, looks: gs.looks?.[holeOwner(n)] ?? null, frame, name: name || `Hole ${n}`, ...(v?.par ? { par: v.par } : {}), ...(m ? { m } : {}), tees });
    if (!h) { this.toast(`Hole ${n} has nothing to save yet`, 'warn'); return false; }
    gs.myHoles = joinHoles([...(gs.myHoles ?? []).filter(q => q.name !== h.name), h], []);
    saveBrowserHoles(joinHoles(loadBrowserHoles().filter(q => q.name !== h.name), [h]));
    this.myHolesRev++; this.scheduleSave(); this.emit();
    this.toast(`Hole ${n} saved to My holes as "${h.name}": New hole › From My holes builds it again`, 'good');
    return true;
  }
  /** takes a saved hole out of My holes (this game's and the browser's) */
  forgetMyHole(h: MyHole) {
    const gs = this.golf; if (gs?.myHoles) gs.myHoles = gs.myHoles.filter(q => !sameHole(q, h));
    saveBrowserHoles(loadBrowserHoles().filter(q => !sameHole(q, h)));
    this.myHolesRev++; this.scheduleSave(); this.emit();
  }
  /** a saved hole's frame trees planted for hole n (inside the placing undo step), each paid for as a frame tree while the money lasts;
   *  returns what it spent ($) */
  private placeSavedFrame(n: number, trees: readonly { id: string; x: number; y: number; flip: boolean; scale: number }[]): number {
    const d = DECOR_BY_KEY.get(FRAME_TREE_KEY), price = d?.price ?? 0; let spent = 0;
    for (const t of trees) {
      const i = LIB_INDEX.get(t.id); if (i === undefined || this.money - spent < price) continue;
      const k = Math.min(maxDrawScale(i), t.scale); if (this.canPlace(LIBRARY[i]!, t.x, t.y, false, k)) continue;
      const p = this.addProp(i, t.x, t.y, t.flip, k); p.decor = FRAME_TREE_KEY; p.frame = n; spent += price;
    }
    if (spent) this.traffic.spend('construction', spent);
    this.frameRev++; return spent;
  }
  /** renumbering (D4.12): hole a's badge dropped on hole b's: the two trade numbers wherever a number lives (golf/holecard.ts
   *  swapHoleNumbers: the grid's hole layer, the plans, the pins, tees and aim points, the painted areas); the markers' props follow; the
   *  routing (deriveHoles' walk to the next number) and the Holes panel's order follow the new numbers. Its own reverse: drag back */
  renumberHole(a: number, b: number) {
    const g = this.golf, grid = this.courseGrid; if (!g || a === b || a < 1 || b < 1) return;
    const before = grid ? grid.hole.slice() : null;
    const r = swapHoleNumbers(a, b, { grid, pins: g.pins, tees: g.tees, aims: g.aims ?? [], plans: decodePlans(g.plans ?? []), areas: this.paint.areas });
    // the markers' props are keyed by hole (the pin of hole 9 is yellow): drop both holes' and put them back under their new numbers
    for (const h of [a, b]) for (const k of ['pin', ...TEE_KINDS] as const) { const key = k === 'pin' ? 'pin:' + h : `tee:${h}:${k}`, pr = this.golfProps.get(key); if (pr) { this.removeProp(pr); this.golfProps.delete(key); } }
    g.pins = r.pins; g.tees = r.tees; g.aims = r.aims; g.plans = encodePlans(r.plans);
    if (g.teeBoxes) g.teeBoxes = swapTeeBoxes(g.teeBoxes, a, b); this.teeRev++; // T268: the tee boxes' records follow their sets
    if (g.dayPins) { const sw = (q: DayPin) => (q.hole === a ? { ...q, hole: b } : q.hole === b ? { ...q, hole: a } : q); g.dayPins = { ...g.dayPins, today: g.dayPins.today.map(sw), prev: g.dayPins.prev.map(sw) }; this.pinRev++; } // T269: so do the day's cups
    for (const p of this.props) if (p.frame === a) p.frame = b; else if (p.frame === b) p.frame = a; // T229: the frame trees follow their hole
    // T256: so do their looks
    const bk = g.looks; if (bk) { const la = bk[holeOwner(a)], lb = bk[holeOwner(b)]; if (lb) bk[holeOwner(a)] = lb; else delete bk[holeOwner(a)]; if (la) bk[holeOwner(b)] = la; else delete bk[holeOwner(b)]; this.paint.looksRev++; }
    for (const m of [...g.pins.filter(q => q.hole === a || q.hole === b).map(q => ({ ...q, kind: 'pin' as const })), ...g.tees.filter(q => q.hole === a || q.hole === b)]) {
      const item = LIB_INDEX.get(m.kind === 'pin' ? (m.hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID) : teePropId(m.kind));
      if (item !== undefined) this.golfProps.set(m.kind === 'pin' ? 'pin:' + m.hole : `tee:${m.hole}:${m.kind}`, this.addProp(item, m.x, m.y, false, MARKER_SCALE[m.kind]));
    }
    if (grid && before && r.cells.length) {
      // the cells whose hole changed, as a diff for the redraw and the hole areas (the surfaces and months stay)
      const n = r.cells.length, idx = Uint32Array.from(r.cells), sv = new Uint8Array(n), mv = new Uint16Array(n), h0 = new Uint8Array(n), h1 = new Uint8Array(n);
      r.cells.forEach((i, k) => { sv[k] = grid.surf[i]!; mv[k] = grid.month[i]!; h0[k] = before[i]!; h1[k] = grid.hole[i]!; });
      grid.rev++;
      this.courseGridChanged({ x0: grid.x0, y0: grid.y0, w: grid.w, n, idx, s0: sv, h0, m0: mv, s1: sv.slice(), h1, m1: mv.slice() }, true);
    }
    this.paintRev++; this.holeCache = null; this.cardCache = null;
    if (this.holeCardHole === a) this.holeCardHole = b; else if (this.holeCardHole === b) this.holeCardHole = a;
    if (this.paint.brushHole === a) this.paint.setHole(b); else if (this.paint.brushHole === b) this.paint.setHole(a);
    this.syncCourseGates(); this.scheduleSave(); this.emit();
    this.toast(`Holes ${a} and ${b} traded numbers: the routing follows`, 'good');
  }
  /** a press on the card's hole's pin or a tee marker (Select, the card open): the marker is in hand until the release drops it */
  private holeCardGrab(): boolean {
    const n = this.holeCardHole, g = this.golf, h = this.hover; if (n === null || !g || !h) return false;
    const pin = g.pins.find(p => p.hole === n && Math.hypot(h.x - p.x, h.y - p.y) <= 3);
    if (pin) { this.selectedGolfMarker = { hole: n, kind: 'pin', x: pin.x, y: pin.y }; this.markerDrag = true; this.emit(); return true; }
    // T268: a press on one of its tee boxes picks the box up with its markers: it goes down where the drag is let go (one undo step)
    const k = this.teeBoxAt(n, h.x, h.y);
    if (k) { const o = this.teeOld(n, k); return this.placeTee(n, k, { drag: true, grab: o ? { x: o.x - h.x, y: o.y - h.y } : { x: 0, y: 0 } }); }
    const tee = g.tees.find(t => t.hole === n && Math.hypot(h.x - t.x, h.y - t.y) <= 2);
    if (tee) { this.selectedGolfMarker = { hole: n, kind: tee.kind, x: tee.x, y: tee.y }; this.markerDrag = true; this.emit(); return true; }
    return false;
  }
  /** the release of a marker drag: the marker moves there when it lands on its green or tee (moveGolfMarker: no re-plan, no charge), else it
   *  stays and the toast says why */
  private holeCardDrop() {
    const s = this.selectedGolfMarker, h = this.hover; this.markerDrag = false;
    if (s && h && Math.hypot(h.x - s.x, h.y - s.y) > 0.25) this.moveGolfMarker(s.hole, s.kind, h.x, h.y);
    this.selectedGolfMarker = null; this.emit();
  }
  /** the hole badges drawn on the map last frame (css px boxes) and the one being dragged (T174: a click opens the card, a drop on another
   *  badge renumbers) */
  private badgeBoxes: { n: number; x: number; y: number; w: number; h: number }[] = [];
  private badgeDrag: { n: number; sx: number; sy: number; mx: number; my: number; moved: boolean } | null = null;
  /** the hole badges on the map (P23 4.3's badges, T174): at each hole's first tee, its number with its state's icon beside its colour (✓ ready,
   *  ◔ growing, ! needs attention); the card's hole ringed in gold; the badge being dragged follows the pointer. From the street tier down to 6% */
  private drawHoleBadges(ctx: CanvasRenderingContext2D) {
    this.badgeBoxes = [];
    const g = this.golf; if (!g || this.cam.z < 0.06) return;
    const views = this.courseHoleViews(), grow = this.holesGrowing(), d = this.dpr, font = `700 ${12 * d}px ui-sans-serif, system-ui, sans-serif`;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const v of views) {
      if (!v.started) continue;
      const t = g.tees.find(q => q.hole === v.n && q.kind === 'back') ?? g.tees.find(q => q.hole === v.n); if (!t) continue;
      const st = !v.ok ? { icon: '!', bg: '#b45309' } : grow.has(v.n) ? { icon: '◔', bg: '#0369a1' } : { icon: '✓', bg: '#15803d' };
      const drag = this.badgeDrag?.n === v.n && this.badgeDrag.moved, p = this.screen(t.x, t.y);
      const cx = drag ? this.badgeDrag!.mx * d : p.x, cy = drag ? this.badgeDrag!.my * d : p.y - 26 * d;
      const text = `${st.icon} ${v.n}`, w = ctx.measureText(text).width + 14 * d, h = 20 * d;
      ctx.globalAlpha = drag ? 0.85 : 1;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); ctx.fillStyle = st.bg; ctx.fill();
      ctx.lineWidth = (this.holeCardHole === v.n ? 3 : 1.5) * d; ctx.strokeStyle = this.holeCardHole === v.n ? '#fcd34d' : 'rgba(15,23,42,0.9)'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillText(text, cx, cy + 0.5 * d); ctx.globalAlpha = 1;
      if (!drag) this.badgeBoxes.push({ n: v.n, x: (cx - w / 2) / d, y: (cy - h / 2) / d, w: w / d, h: h / d });
    }
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** the badge under css point (mx, my), or 0 */
  private badgeAt(mx: number, my: number): number { for (let i = this.badgeBoxes.length - 1; i >= 0; i--) { const b = this.badgeBoxes[i]!; if (mx >= b.x - 3 && mx <= b.x + b.w + 3 && my >= b.y - 3 && my <= b.y + b.h + 3) return b.n; } return 0; }
  goToHole(n: number) { this.paint.setHole(n); const b = this.paint.holeBox(n); if (b) this.lookAt((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); }
  /** the golf land the town never builds on: the course and every parcel the player owns (tiles, [x, y, w, h]) */
  private golfLand(): [number, number, number, number][] { const g = this.golf; return g ? [g.course, ...(g.parcels ?? [g.parcel])] : []; }
  /** bumped whenever a painted area's ground is sent or removed (the hole views' cache key) */
  private paintRev = 0;
  private holeCache: { key: string; v: HoleView[] } | null = null;
  /** holes 1..18 as the Course panel shows them (par, lengths, checks; golf/holeview.ts), worked out again only when the areas or the markers change */
  courseHoleViews(): HoleView[] {
    const g = this.golf, areas = this.courseAreaList(), key = `${this.caCache?.key}:${g ? JSON.stringify([g.pins, g.tees, g.aims]) : ''}`;
    if (this.holeCache?.key !== key) this.holeCache = { key, v: holeViews(areas, g ? { pins: g.pins, tees: g.tees, aims: g.aims } : null) };
    return this.holeCache.v;
  }
  /** fits every hole's pin and tee markers to its painted green and tee (a golf game; golf/holeview.ts markerPlan): runs after each Course change,
   *  undo and redo, outside the undo journal (pins: a placed preset's flag spot by hole) */
  private syncCourseMarkers(pins?: Map<number, { x: number; y: number }>, quiet = false) {
    const g = this.golf; if (!g) return;
    if (this.areasPending) {
      // the grid's areas are being worked out off the main thread: the markers are fitted when they land (the preset pins kept)
      const m = this.gaMarkers, all = new Map([...(m?.pins ?? []), ...(pins ?? [])]);
      this.gaMarkers = { ...(all.size ? { pins: all } : {}), quiet: (m ? m.quiet : true) && quiet };
      this.gridAreaList(); return;
    }
    const ops = markerPlan(this.courseAreaList(), g.pins, g.tees, pins);
    if (!ops.length) return;
    const placed = new Set<number>();
    for (const o of ops) if (o.op === 'set') { this.setGolfMarker(o.hole, o.kind, o.x, o.y); placed.add(o.hole); } else this.removeGolfMarker(o.hole, o.kind);
    if (placed.size && !quiet) this.toast(`Hole ${[...placed].sort((a, b) => a - b).join(', ')}: pin and tee markers fitted to the green and tee`);
    this.syncCourseGates(); // the galleries follow the greens and tees
    this.scheduleSave(); this.emit();
  }
  /** places or moves a pin or tee marker with its prop, marked auto (it goes when its green or tee is gone); held (T254, Edit Hole Layout): it
   *  stays where it is put, off its turf or not */
  private setGolfMarker(hole: number, kind: MarkerKind, x: number, y: number, held = false) {
    const g = this.golf!; this.removeGolfMarker(hole, kind); this.teeRev++; // T268
    const sprId = kind === 'pin' ? (hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID) : teePropId(kind);
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) this.golfProps.set(kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`, this.addProp(item, x, y, false, MARKER_SCALE[kind]));
    if (kind === 'pin') g.pins.push({ hole, x, y, auto: !held, ...(held ? { held } : {}) }); else g.tees.push({ hole, kind, x, y, auto: !held, ...(held ? { held } : {}) });
    if (kind === 'pin') this.setTodayPin(hole, x, y); // T269: a pin put down is today's cup
    if (kind === 'pin' && g.start === 'range') this.sendGolf(); // T090: a new hole speeds a range start's town
  }
  /** removes a pin or tee marker and its prop (if there is one) */
  private removeGolfMarker(hole: number, kind: MarkerKind) {
    const g = this.golf!, key = kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`, prop = this.golfProps.get(key);
    if (prop) { this.removeProp(prop); this.golfProps.delete(key); }
    this.teeRev++; // T268
    const L: { hole: number; kind?: string }[] = kind === 'pin' ? g.pins : g.tees;
    for (let i = L.length - 1; i >= 0; i--) if (L[i]!.hole === hole && (kind === 'pin' || L[i]!.kind === kind)) L.splice(i, 1);
  }
  // ---------- T254 (#736): Edit Hole Layout and the four tee sets ----------
  /** Edit Hole Layout's Build (PaintTool.buildLayout, inside its undo step, the plan already saved): hole n's tee sets and flag go with the plan's tee
   *  and green (golf/teesets.ts layoutMarkers: held there, off their turf or not); no cell changes. Returns the warnings they now stand with */
  private layoutBuilt(n: number, base: HolePlan, plan: HolePlan): string[] {
    const g = this.golf; if (!g) return [];
    const pin = g.pins.find(p => p.hole === n) ?? null, tees = g.tees.filter(t => t.hole === n), r = layoutMarkers(base, plan, pin, tees);
    if (r.moved.pin && r.pin) this.setGolfMarker(n, 'pin', r.pin.x, r.pin.y, true);
    if (r.moved.tees) for (const t of r.tees) this.setGolfMarker(n, t.kind, t.x, t.y, true);
    this.holeCache = null; this.cardCache = null; this.syncCourseGates(); this.scheduleSave();
    return markerWarnings((x, y) => this.surfaceHere(x, y), r.pin, r.tees);
  }
  /** the course surface at tile (x, y): the course grid's where it is painted, else the painted areas' (null: none) */
  private surfaceHere(x: number, y: number): GolfSurface | null {
    const grid = this.courseGrid, i = grid ? cellAt(grid, x, y) : -1, k = i >= 0 && grid!.draw ? grassSlot(grid!.draw[i]!) : 0, p = k ? this.grassAt(k)?.plays : undefined;
    return (i >= 0 ? (p ? golfSurfaceOf(p) : SURF_SURFACE[grid!.surf[i]!]) : null) ?? surfaceAt(this.courseAreaList(), x, y); // (T271: a custom grass plays as its grass)
  }
  /** T271: each custom grass's play by slot */
  private grassPlays(): Map<number, GrassPlay> { return new Map(this.grasses().map(g => [g.k, g.plays])); }
  /** a saved hole placed as hole n (My holes, T256): its tee sets' markers where it had them (T254); the white alone when it saved none */
  private placeTees(n: number, tees: readonly { kind: TeeKind; x: number; y: number }[]) {
    const g = this.golf; if (!g || !tees.length) return;
    for (const t of g.tees.filter(q => q.hole === n)) this.removeGolfMarker(n, t.kind);
    dropHoleBoxes(g.teeBoxes, n); // T268: its boxes are the placed hole's own now
    for (const t of tees) this.setGolfMarker(n, t.kind, t.x, t.y);
    this.holeCache = null; this.cardCache = null; this.syncCourseGates(); this.scheduleSave();
  }
  /** the pins and tee markers as text (an Edit Hole Layout step's undo and redo carry them; T268: and the tee boxes' records, a Place step's) */
  private markersKey(): string { const g = this.golf; return JSON.stringify(g ? [g.pins, g.tees, g.teeBoxes ?? {}] : [[], [], {}]); }
  /** the pins and tee markers back as markersKey had them, their props with them */
  private setMarkers(key: string) {
    const g = this.golf; if (!g) return;
    let v: [Pin[], TeeMark[], Record<string, TeeBoxRec>?]; try { v = JSON.parse(key); } catch { return; }
    if (v[2] && Object.keys(v[2]).length) g.teeBoxes = v[2]; else if (v.length > 2) delete g.teeBoxes; // T268
    for (const p of [...g.pins]) this.removeGolfMarker(p.hole, 'pin');
    for (const t of [...g.tees]) this.removeGolfMarker(t.hole, t.kind);
    for (const p of v[0]) { this.setGolfMarker(p.hole, 'pin', p.x, p.y, !!p.held); const q = g.pins[g.pins.length - 1]!; if (p.auto === undefined) delete q.auto; else q.auto = p.auto; }
    for (const t of v[1]) { this.setGolfMarker(t.hole, t.kind, t.x, t.y, !!t.held); const q = g.tees[g.tees.length - 1]!; if (t.auto === undefined) delete q.auto; else q.auto = t.auto; }
    this.holeCache = null; this.cardCache = null; this.syncCourseGates(); this.scheduleSave(); this.emit();
  }
  /** "Add tee" (the hole card): hole n's set `kind` laid as a new 14 x 8 m tee box behind or ahead along the line of play (golf/teesets.ts
   *  addTeeSpot), painted as tee turf and priced like a tee (one undo step), its pair of markers on it. False with a toast when it cannot.
   *  T268: the quick Place: laid as Place lays a box (layTee: its record, its level pad), its refused cells left out as before */
  addTeeSet(n: number, kind: TeeKind): boolean {
    const g = this.golf; if (!g || !this.courseGrid) return false;
    const h = deriveHoles(this.courseAreaList(), g.tees, g.pins, g.aims ?? []).find(q => q.n === n);
    if (!h || h.line.length < 2) { this.toast(`Hole ${n} needs a flag and a tee before another tee set`, 'warn'); return false; }
    const at = addTeeSpot(kind, g.tees.filter(t => t.hole === n), h.line);
    if (!at) { this.toast(`Hole ${n} has the ${TEE_SET[kind].colour} tees already`, 'info'); return false; }
    const p = this.teePlan(n, kind, at.at.x, at.at.y, Math.atan2(at.dir.y, at.dir.x), 1, false, false);
    if (p.why) { this.toast(p.why === 'No room for a tee box there' ? 'No room for a tee box there: your land, the practice area or another hole is in the way' : `No room for a tee box there: ${p.why.toLowerCase()}`, 'warn'); return false; }
    if (!this.layTee(n, kind, p, `add the ${TEE_SET[kind].colour} tee to hole ${n}`)) return false;
    this.toast(`Hole ${n}: the ${TEE_SET[kind].colour} tee laid${p.cost ? ` for $${p.cost.toLocaleString()}` : ''} (${TEE_SET[kind].who})`, 'good');
    return true;
  }
  /** "Add tee"'s price: a 14 x 8 m tee box of tee turf at the brush's planting (Seed or Sod), the cells it lays (about; the real price counts the
   *  cells that change) */
  teeBoxPrice(): number { return Math.round(((BOX_LEN_M - BOX_WID_M) * BOX_WID_M + Math.PI * (BOX_WID_M / 2) ** 2) * unitBuildCost('tee', this.paint.plantKind)); }
  // ---------- T268 (#809): each tee set placed, moved and removed by hand (golf/teeplace.ts) ----------
  /** the tee set in hand (Place or Move on the hole card or in Edit Hole Layout, or its box dragged on the map with the card open): its hole and
   *  set, its turn off the line of play (degrees: R, Shift+R) and size (TEE_SCALE_MIN..MAX: [ ]); moving: the set has a box already, which goes
   *  from where it stands (its old ground back); drag: picked up by a press on its box, it goes down on the release; grab: the box's middle less
   *  the press (tiles); from: the press */
  teePlace: { hole: number; kind: TeeKind; turn: number; scale: number; moving: boolean; drag: boolean; grab: Pt; from: Pt | null } | null = null;
  /** bumped whenever a tee marker or a box record changes: the ghost's and the old box's cache keys (the markers' text is never built a frame) */
  private teeRev = 0;
  private teeGhostMemo: { key: string; v: TeePlan } | null = null;
  private teeOldMemo: { key: string; v: TeeOld | null } | null = null;
  /** Place and Move (the card's and Edit Hole Layout's buttons; opts.drag: a press on the set's box with the card open): hole n's set `kind` in
   *  hand as a ghost at the pointer, facing the line of play; a set the hole has already is moved, its size and turn kept. The next click (or the
   *  drag's release) lays it; Esc or a right click puts it down. False with a toast when the hole has no flag to face */
  placeTee(n: number, kind: TeeKind, opts: { drag?: boolean; grab?: Pt } = {}): boolean {
    const g = this.golf; if (!g || !this.courseGrid) return false;
    if (!g.pins.some(p => p.hole === n)) { this.toast(`Hole ${n} needs a flag before its tees are placed`, 'warn'); return false; }
    const moving = g.tees.some(t => t.hole === n && t.kind === kind), old = moving ? this.teeOld(n, kind) : null;
    const turn = old ? snapTurn(((old.a - boxAngle(old, teeAim(n, g.pins, g.aims ?? []), 0)) * 180) / Math.PI) : 0;
    this.teePlace = { hole: n, kind, turn, scale: old?.s ?? 1, moving, drag: !!opts.drag, grab: opts.grab ?? { x: 0, y: 0 }, from: this.hover ? { x: this.hover.x, y: this.hover.y } : null };
    this.teeGhostMemo = null; this.emit();
    if (!opts.drag) this.toast(`${moving ? 'Move' : 'Place'} hole ${n}'s ${TEE_SET[kind].colour} tee: click the map to lay it · R turns it · [ ] size it · Esc puts it down`, 'info');
    return true;
  }
  /** puts the tee set in hand down (nothing laid) */
  cancelTeePlace() { if (!this.teePlace) return; this.teePlace = null; this.teeGhostMemo = null; this.emit(); }
  /** R (back: Shift+R): the box in hand turns TEE_TURN_DEG */
  turnTeePlace(back = false) { const tp = this.teePlace; if (!tp) return; tp.turn = snapTurn(tp.turn + (back ? -TEE_TURN_DEG : TEE_TURN_DEG)); this.emit(); }
  /** ] and [: the box in hand a size step up or down, within the tee's limits (a toast at the limit) */
  sizeTeePlace(up: boolean) {
    const tp = this.teePlace; if (!tp) return;
    const s = clampTeeScale(tp.scale + (up ? TEE_SCALE_STEP : -TEE_SCALE_STEP));
    if (s === tp.scale) { const m = teeBoxM(s); this.toast(`A tee box goes no ${up ? 'bigger' : 'smaller'}: ${m.len} x ${m.wid} m`, 'info'); return; }
    tp.scale = s; this.emit();
  }
  /** the box in hand at the pointer (teePlan), worked out again only when the pointer's cell, the turn or size, the course, the ground, the roads,
   *  the money or the markers change: a frame draws it and no more */
  teeGhost(): TeePlan | null {
    const tp = this.teePlace, h = this.hover, g = this.golf, grid = this.courseGrid; if (!tp || !h || !g || !grid) return null;
    const x = Math.round((h.x + tp.grab.x) * 2) / 2, y = Math.round((h.y + tp.grab.y) * 2) / 2;
    const key = `${tp.hole}|${tp.kind}|${x}|${y}|${tp.turn}|${tp.scale}|${tp.moving}|${grid.rev}|${this.courseHeight?.rev ?? -1}|${this.net.version}|${this.paint.plantKind}|${Math.round(this.money)}|${this.teeRev}`;
    if (this.teeGhostMemo?.key !== key) this.teeGhostMemo = { key, v: this.teePlan(tp.hole, tp.kind, x, y, boxAngle({ x, y }, teeAim(tp.hole, g.pins, g.aims ?? []), tp.turn), tp.scale, tp.moving, true) };
    return this.teeGhostMemo.v;
  }
  /** the roads and cart paths within r of tile (x, y), for a tee box's refusal and its pad */
  private teeRoads(x: number, y: number, r: number): TeeRoad[] {
    return [...this.net.segsNear({ x, y }, r)].map(s => ({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, hw: s.cls.h + s.cls.walk, name: s.cls.name.toLowerCase() }));
  }
  /** whether tile (x, y) lies in the driving range's practice area (the paint host's practiceAt) */
  private teePractice(x: number, y: number): boolean { return this.golf?.start === 'range' && !!this.range.scene && inPractice(this.range.scene.practice, x, y); }
  /** the course a tee box is worked out on (golf/teeplace.ts TeeCourse): the grid and height field, the markers and the boxes' records, your land
   *  (the range's plot is not the course's), the practice area, the roads and cart paths, and the prices (a tee cell at the brush's Seed or Sod) */
  private teeCourse(): TeeCourse | null {
    const g = this.golf, grid = this.courseGrid; if (!g || !grid) return null;
    return {
      grid, field: this.courseHeight, pins: g.pins, tees: g.tees, aims: g.aims ?? [], boxes: g.teeBoxes ?? {},
      own: (x, y) => this.ownedAt(x, y) && !this.onRangePlot(x, y), landWhy: (x, y) => LAND_WHY[this.onRangePlot(x, y) ? 'range' : 'off'],
      practice: (x, y) => this.teePractice(x, y), roadsNear: (x, y, r) => this.teeRoads(x, y, r), golf: this.golfMode, unit: unitBuildCost('tee', this.paint.plantKind),
    };
  }
  /** hole n's set `kind` as a box at (x, y), heading a, size s (golf/teeplace.ts planTee: its cells, why not, its price, its length and par);
   *  moving: the set's box as it stands goes back first. strict false: Add tee's (refused cells left out) */
  private teePlan(n: number, kind: TeeKind, x: number, y: number, a: number, s: number, moving: boolean, strict: boolean): TeePlan {
    return planTee(this.teeCourse()!, n, kind, x, y, a, s, moving ? this.teeOld(n, kind) : null, strict);
  }
  /** hole n's set `kind`'s box as it stands and what a move or a removal puts back (golf/teeplace.ts oldBox), kept until the course, the ground or
   *  the markers change */
  private teeOld(n: number, kind: TeeKind): TeeOld | null {
    const c = this.teeCourse(); if (!c) return null;
    const key = `${n}|${kind}|${c.grid.rev}|${c.field?.rev ?? -1}|${this.teeRev}`;
    if (this.teeOldMemo?.key !== key) this.teeOldMemo = { key, v: oldBox(c, n, kind) };
    return this.teeOldMemo.v;
  }
  /** lays plan p (teePlan) for hole n's set `kind` as one undo step (PaintTool.teeStep, golf/teeplace.ts layDown): the set's old box goes back (a
   *  move: its cells and its pad's heights as they were), the box's cells become tee turf (Seed or Sod), its pad is levelled, the price is paid,
   *  and the set's marker stands in the box's middle with the box's record (GolfSave.teeBoxes; a set left on the old box takes the old record).
   *  False with a toast when p cannot go or the money is short */
  private layTee(n: number, kind: TeeKind, p: TeePlan, label: string): boolean {
    const g = this.golf, c = this.teeCourse(); if (!g || !c) return false;
    if (p.why) { this.toast(p.why, 'warn'); return false; }
    if (this.golfMode && p.cost > this.money) { this.toast(`Not enough money: the tee box costs $${p.cost.toLocaleString()} · you have $${Math.round(this.money).toLocaleString()}`, 'warn'); return false; }
    const ok = this.paint.teeStep(label, e => {
      const r = layDown(c, n, p, e);
      handOver((g.teeBoxes ??= {}), n, kind, p.old, r.rec); this.teeRev++;
      this.setGolfMarker(n, kind, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100);
    });
    if (!ok) return false;
    this.holeCache = null; this.cardCache = null; this.syncCourseGates(); this.scheduleSave(); this.emit();
    return true;
  }
  /** a click with a tee set in hand (or its drag's release): the ghost's box is laid there (layTee) and the toast gives the set's length, par and
   *  price; else the toast says why and the set stays in hand (a dragged box goes back where it was) */
  private placeTeeAt(): boolean {
    const tp = this.teePlace, gh = this.teeGhost(); if (!tp) return false;
    if (!gh) { if (tp.drag) this.cancelTeePlace(); return false; }
    const col = TEE_SET[tp.kind].colour, ok = this.layTee(tp.hole, tp.kind, gh, `${tp.moving ? 'move' : 'place'} hole ${tp.hole}'s ${col} tee`);
    if (ok) this.toast(`Hole ${tp.hole}: the ${col} tee ${tp.moving ? 'moved' : 'placed'}, ${gh.m} m, par ${gh.par}${gh.cost ? ` · $${gh.cost.toLocaleString()}` : ''}${gh.m3 >= 1 ? ` (a level pad, ${Math.round(gh.m3)} m³)` : ''}`, 'good');
    if (ok || tp.drag) { this.teePlace = null; this.teeGhostMemo = null; }
    this.emit(); return ok;
  }
  /** the release of a box dragged with the card open: laid where it is let go; a press that did not move puts it down */
  private teeDragDrop() {
    const tp = this.teePlace, h = this.hover; if (!tp?.drag) return;
    if (!h || !tp.from || Math.hypot(h.x - tp.from.x, h.y - tp.from.y) < 0.75) { this.cancelTeePlace(); return; }
    this.placeTeeAt();
  }
  /** Remove (the card's ✕): hole n's set `kind` goes, its marker and its box with it, the old ground back (a box another set stands on stays); never
   *  the hole's last set. One undo step, no refund */
  removeTeeSet(n: number, kind: TeeKind): boolean {
    const g = this.golf; if (!g || !this.courseGrid) return false;
    const mine = g.tees.filter(t => t.hole === n), col = TEE_SET[kind].colour;
    if (!mine.some(t => t.kind === kind)) return false;
    if (mine.length <= 1) { this.toast(`Hole ${n} keeps its last tee: place another set before the ${col} goes`, 'warn'); return false; }
    const old = this.teeOld(n, kind);
    if (this.teePlace?.hole === n && this.teePlace.kind === kind) this.teePlace = null;
    this.paint.teeStep(`remove hole ${n}'s ${col} tee`, e => {
      takeUp(old, e);
      if (g.teeBoxes) { handOver(g.teeBoxes, n, kind, old, null); if (!Object.keys(g.teeBoxes).length) delete g.teeBoxes; }
      this.removeGolfMarker(n, kind);
    });
    this.holeCache = null; this.cardCache = null; this.syncCourseGates(); this.scheduleSave(); this.emit();
    this.toast(`Hole ${n}: the ${col} tee removed${old?.shared.length ? ` (its box stays: the ${old.shared.map(k => TEE_SET[k].colour).join(' and ')} tee${old.shared.length > 1 ? 's stand' : ' stands'} on it)` : old?.back?.n ? ', the ground as it was' : ''}`);
    return true;
  }
  /** Edit Hole Layout's tee rows: hole n's sets with their lengths and pars (back to front) and the sets Add tee can lay */
  teeSetRows(n: number): { tees: { kind: TeeKind; m: number; par: 3 | 4 | 5 }[]; addable: TeeKind[] } {
    const g = this.golf; if (!g) return { tees: [], addable: [] };
    const tees = teeLengths(n, g.pins, g.tees, g.aims ?? []);
    return { tees, addable: tees.length ? TEE_KINDS.filter(k => !tees.some(t => t.kind === k)) : [] };
  }
  /** the set of hole n whose tee box holds tile (x, y) (its recorded box, else the older box its marker stands on: the nearest marker's), or null */
  private teeBoxAt(n: number, x: number, y: number): TeeKind | null {
    const g = this.golf, grid = this.courseGrid; if (!g || !grid) return null;
    const i = cellAt(grid, x, y); if (i < 0 || grid.surf[i] !== SURF.tee || grid.hole[i] !== n) return null;
    const mine = TEE_KINDS.flatMap(k => g.tees.find(t => t.hole === n && t.kind === k) ?? []);
    for (const t of mine) { const r = g.teeBoxes?.[teeKey(n, t.kind)]; if (r && recStands(grid, r, n) && inPoly(boxOutline(r.x, r.y, r.a, r.s), x, y)) return t.kind; }
    const cells = new Set(teeCells(grid, n, i));
    let best: TeeKind | null = null, bd = Infinity;
    for (const t of mine) { if (!cells.has(cellAt(grid, t.x, t.y))) continue; const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t.kind; } }
    return best;
  }
  /** a tee set's pair of markers (a small ball each side of the line, in the set's colour), lit from the upper right; r: the ball's radius (px) */
  private drawTeePair(ctx: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, kind: TeeKind, r: number) {
    const set = TEE_SET[kind], half = 1.6, d = this.dpr; // the pair stands 3.2 tiles (6.4 m) apart, across the line
    for (const sgn of [-1, 1]) {
      const p = this.screen(x - uy * half * sgn, y + ux * half * sgn);
      if (p.x < -r || p.y < -r || p.x > this.cw + r || p.y > this.ch + r) continue;
      ctx.beginPath(); ctx.ellipse(p.x - r * 0.35, p.y + r * 0.45, r * 1.05, r * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,30,40,0.28)'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y - r * 0.6, r, 0, Math.PI * 2); ctx.fillStyle = set.fill; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.9 * d); ctx.strokeStyle = set.rim; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x + r * 0.32, p.y - r * 0.95, r * 0.32, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    }
  }
  /** the tee set in hand at the pointer: its box in the set's colour (red and hatched where it cannot go, with the ✕), its pair of markers, and
   *  the label by the pointer (the set's length and par from there and the price, or why not). Worked out once a cell (teeGhost): a frame only
   *  draws a polygon, two balls and a label */
  private drawTeeGhost(ctx: CanvasRenderingContext2D) {
    const tp = this.teePlace; if (!tp) return;
    const gh = this.teeGhost(); if (!gh) return;
    const v = this.ghostView(ctx), set = TEE_SET[tp.kind], short = this.golfMode && gh.cost > this.money, bad = !!gh.why || short;
    drawGhostPoly(v, gh.pts, bad ? 'invalid' : 'valid', { fillColor: bad ? undefined : rgbaOf(set.fill, 0.42), lineWidthPx: 2 });
    if (!bad && this.cam.z >= 0.06) { const a = this.screen(0, 0), b = this.screen(1, 0), r = Math.max(2.2 * this.dpr, Math.hypot(b.x - a.x, b.y - a.y) * 0.22), aim = teeAim(tp.hole, this.golf!.pins, this.golf!.aims ?? []), u = boxAngle(gh, aim); this.drawTeePair(ctx, gh.x, gh.y, Math.cos(u), Math.sin(u), tp.kind, r); }
    const gm = this.ghostMouse; if (!gm) return;
    const size = teeBoxM(gh.s), label = gh.why ? gh.why : short ? `Not enough money: $${gh.cost.toLocaleString()}` : `${set.name} tee · ${gh.m} m, par ${gh.par} · ${size.len} x ${size.wid} m${gh.cost ? ` · $${gh.cost.toLocaleString()}` : ''}`;
    drawGhostHint(v, gm.mx, gm.my, label, bad);
  }
  /** each tee set's markers on the map (T254: a pair of small balls in the set's colour, drawn in code: the tee marker picture is still to come),
   *  across the line of play at each set's spot, lit from the upper right, their shadows to the lower left; from the street tier in */
  private drawTeeMarkers(ctx: CanvasRenderingContext2D) {
    const g = this.golf; if (!g || !g.tees.length || this.cam.z < 0.1) return;
    const d = this.dpr, a = this.screen(0, 0), b = this.screen(1, 0), tilePx = Math.hypot(b.x - a.x, b.y - a.y), r = Math.max(2.2 * d, tilePx * 0.22);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const tp = this.teePlace; // T268: a set being moved shows on its ghost alone
    for (const t of g.tees) {
      if (tp?.moving && tp.hole === t.hole && tp.kind === t.kind) continue;
      const pin = g.pins.find(p => p.hole === t.hole), aim = (g.aims ?? []).filter(q => q.hole === t.hole).sort((p, q) => p.order - q.order)[0] ?? pin;
      let ux = 1, uy = 0; if (aim) { const L = Math.hypot(aim.x - t.x, aim.y - t.y); if (L > 1e-6) { ux = (aim.x - t.x) / L; uy = (aim.y - t.y) / L; } }
      this.drawTeePair(ctx, t.x, t.y, ux, uy, t.kind, r);
    }
  }
  /** a golf game's painted course by hole (golf/holeview.ts tagByHole): untagged course areas take the hole they belong to (a hole tag, no
   *  brush kind), so the Course tool's strip and checks see the holes */
  private tagCourseHoles() {
    const g = this.golf; if (!g?.pins?.length) return;
    const tags = tagByHole(this.paint.areas, g.pins, g.tees ?? [], g.aims ?? []); let n = 0;
    this.paint.areas.forEach((a, i) => { if (tags[i]) { a.hole = tags[i]; n++; } });
    if (n) { this.paintRev++; this.scheduleSave(); }
  }

  // ---------- the course grid (plan P21, T078) ----------
  /** the golf game's course grid: one surface, hole and planting month per 1 m cell over the owned land plus COURSE_GRID_PAD tiles (null in
   *  a classic game); the Course tool paints into it and each 64-tile chunk of it is one lot-ground patch (cg:cx:cy) */
  courseGrid: CourseGrid | null = null;
  /** the course chunks on the ground, by key, with their grow key ('static': nothing grows; the month tick skips it) */
  private cgSent = new Map<string, string>();
  /** per course chunk key, the grow month it was last baked whole at (an edit in a later month re-bakes it whole: applyChunks) */
  private cgBaked = new Map<string, number>();
  /** the tile box whose chunks are waiting to be sent (an edit in progress), when it first changed, and when chunks last went out */
  private cgDirty: number[] | null = null;
  private cgDirtyAt = 0;
  private cgSentAt = 0;
  /** the course workers (T077b): one contours chunks, one works out the course areas, each with its own copy of the grid (so a long areas
   *  job never holds up the chunks under the brush); the grid object they hold; whether a chunk job is in flight and the chunks waiting
   *  for it (keys cx * 4096 + cy, the box the ground must re-bake: null for the whole chunk, and when their first change was made) */
  private contour = new CourseContour();
  private areaWorker = new CourseContour();
  private contourOf: CourseGrid | null = null;
  private cgJob = false;
  private cgWait: { chunks: Set<number>; stale: number[] | null; at: number } | null = null;
  /** per lot-ground key, the box its last update changed (a course edit: only that much of the ground re-bakes), until the next flush */
  private lotStale = new Map<string, BBox>();
  /** the course grass zones waiting to be registered (key: its patches, null: drop), a millisecond a frame */
  private grassWait = new Map<string, LotPatch[] | null>();
  /** the grid's course areas by hole (gridAreas), the holes to work out again (null: all of them), a revision bumped by every grid change,
   *  the list's own version (bumped when new areas land), the list, an areas job in flight (and whether another is wanted after it), and
   *  the marker fit waiting for the areas (the pins a placed preset asked for; quiet: no toast) */
  private gaByHole = new Map<number, GridArea[]>();
  private gaDirty: Set<number> | null = null;
  private gaRev = 0;
  private gaVer = 0;
  private gaList: GridArea[] = [];
  private gaJob = false;
  private gaAgain = false;
  private gaMarkers: { pins?: Map<number, { x: number; y: number }>; quiet: boolean } | null = null;
  /** the course's areas as the golf rules read them (grid areas, then the painted areas), and the key they were made for */
  private caCache: { key: string; v: CourseAreaRec[] } | null = null;
  /** the grid's save, kept until the grid changes */
  private gridSaveCache: { g: CourseGrid; rev: number; s: GridSave } | null = null;
  /** whether tile (x, y) lies on the golf game's own land (the course and its parcels) */
  ownedAt(x: number, y: number): boolean {
    const q = this.golf?.practiceLot; if (q && x >= q[0] && x < q[0] + q[2] && y >= q[1] && y < q[1] + q[3]) return false; // T239: for sale until bought
    for (const [rx, ry, rw, rh] of this.golfLand()) if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return true; return false;
  }
  /** T239: Land for sale opened on the practice area for sale, its card open (the hint's and the guide's Show me) */
  showPracticeSale() {
    const q = this.golf?.practiceLot; if (!q) return;
    const x = q[0] + q[2] / 2, y = q[1] + q[3] / 2; this.setTool('select'); if (this.range.cardOpen) this.openRangeCard(false);
    this.openLandSale(); this.lookAt(x, y, 0.15); this.land.click(x, y); this.emit();
  }
  /** T239: whether a guided range start's practice area is still land for sale */
  practiceForSale(): boolean { return !!this.golf?.practiceLot; }
  /** the grid box the golf land needs, grown to hold extra (a tile box: the painted areas a migration lays in), as x0, y0 (tiles) and w, h
   *  (cells): the bounds plus COURSE_GRID_PAD, on the map */
  private courseGridBox(extra?: readonly number[] | null): [number, number, number, number] | null { return landGridBox(this.golfLand(), COURSE_GRID_PAD, MAP, extra); }
  /** grows the grid to hold the golf land (land was bought) and extra; a new grid when there is none. Undo diffs made on the old box still apply */
  private fitCourseGrid(extra?: readonly number[] | null) {
    const b = this.courseGridBox(extra); if (!b) return;
    const g = this.courseGrid;
    if (!g) { this.courseGrid = makeGrid(b[0], b[1], b[2], b[3]); return; }
    const ng = fitGrid(g, b); if (!ng) return;
    this.courseGrid = ng;
    this.gaDirty = null; this.gaRev++;
  }
  /** a golf game's grid after a load or a new game (afterLoad): the saved grid, else a new one with the golf-surface painted areas laid into it
   *  (the migration of plan 3.7: the grid is made big enough for all of them, their paint keys go, fringe and first-cut bands are dropped,
   *  collars are automatic now); then every chunk is sent and the markers fitted (quietly) */
  private setupCourseGrid() {
    if (!this.golf) return;
    if (!this.courseGrid) {
      let box: number[] | null = null;
      for (const a of this.paint.areas) if (isCourseArea(a)) { const b = ptsBox(a.pts); box = box ? [Math.min(box[0]!, b[0]!), Math.min(box[1]!, b[1]!), Math.max(box[2]!, b[2]!), Math.max(box[3]!, b[3]!)] : b; }
      this.fitCourseGrid(box);
      const g = this.courseGrid; if (!g) return;
      // the cells first: taking the areas out replants the trees round them, and the grid must already keep them off the course
      const gone = new Set(migrateAreas(g, this.paint.areas));
      if (gone.size) { this.paint.takeAreas(a => gone.has(a)); this.paintRev++; this.scheduleSave(); }
    } else this.fitCourseGrid();
    this.dropOrphanLooks(); // T271
    this.gaDirty = null; this.gaRev++;
    this.seedLooks(); // T256: every owner wears today's looks as its own (an old save changes nothing)
    this.resendCourse();
    this.syncCourseMarkers(undefined, true);
  }
  /** the textures the grid's surfaces wear: the Course brushes' looks (texture, scale, angle, exposure and Blend with: course-look.ts; T261 the
   *  waste area's too), the course presets for fescue and the collars, each surface's own collar band (its Border texture, scale, angle and
   *  exposure) */
  private courseLooks(): CourseLooks {
    const pre = (s: string, old: string) => ({ tex: surfacePreset(s) ?? old, sc: 1, a: 0 });
    // the bank is laid in the rough's grass (the renderer paints its wet soil and stones, T099); the Border, Shadow and Height sliders ride along.
    // T227: with the course finish a bunker sits in the fairway's first cut (its lip band's grass), unless the player gave it a Border texture.
    // T252: course-look.ts surfaceBands works the bands out (the Holes swatches and the brush cursor's chip show the same borders).
    // T256: the course default's looks are the base; each hole, the property and each facility wear their own (courseOwners)
    // T253: each surface's Round off rides along (the course default's; an owner's in its own looks)
    const { surf, collar, band, lipGrass, round } = courseLookSet(this.paint.brush, pre), own = this.courseOwners(pre);
    const looks: CourseLooks = { surf, collar, band, border: this.courseBorders(), shadow: this.paint.courseShadows(), height: this.paint.surfaceHeights(), ...(lipGrass ? { lipGrass } : {}), ...(own ? { own } : {}), ...(round ? { round } : {}) };
    return this.withGrasses(looks);
  }
  /** T271 (#812): the course's own grasses (golf/grasses.ts) into the looks, at their draw ids: each one's fill, its band (the course's first
   *  cut), Border, Shadow and Round off, the surface it plays as and its stripes; the looks as they were with none */
  private withGrasses(looks: CourseLooks): CourseLooks {
    const list = this.golf?.grasses; if (!list?.length) return looks;
    const gl = grassLooks(list, looks.collar['first-cut'], this.grassArt === 'photo');
    const put = <T,>(a: readonly (T | undefined)[] | undefined, b: readonly (T | undefined)[]): (T | undefined)[] => { const o = a ? a.slice() : []; b.forEach((v, s) => { if (v !== undefined) o[s] = v; }); return o; };
    return { ...looks, surf: put(looks.surf, gl.surf), band: put(looks.band, gl.band), border: put(looks.border, gl.border), shadow: put(looks.shadow, gl.shadow), round: put(looks.round, gl.round), base: gl.base, ...(gl.stripes ? { stripes: gl.stripes } : {}) };
  }
  /** T271: the course's own grasses (the game save's; [] outside a golf game) */
  grasses(): readonly CustomGrass[] { return this.golf?.grasses ?? []; }
  /** T271: the custom grass in slot k, or null */
  grassAt(k: number): CustomGrass | null { return this.golf?.grasses?.find(g => g.k === k) ?? null; }
  /** T271: the grasses as a whole changed (made, edited, deleted, or an undo of one): saved, and the course drawn again in them */
  private setGrasses(list: readonly CustomGrass[], redraw = true) {
    const g = this.golf; if (!g) return;
    const next = normalizeGrasses(list);
    if (next.length) g.grasses = next; else delete g.grasses;
    this.paint.looksRev++; this.scheduleSave(); if (redraw) this.resendCourse(); this.emit();
  }
  /** T271: the painted family the fairway wears now (a new grass starts in it), null when it is laid as its photo */
  private fairwayFamily(): string | null {
    const st = this.paint.lookOf(this.paint.lookOwner, 'fairway');
    return lookOfTex(st.tex, paintedSurfaces(), PRESETS)?.family ?? null;
  }
  /** T271: a custom grass slot a cell names with no grass in the save (a save edited by hand) goes back to its surface's own look: the cells
   *  keep what they play as. A grid with no custom cell is not touched */
  private dropOrphanLooks() {
    const g = this.courseGrid; if (!g?.look) return;
    const have = new Set(this.grasses().map(q => q.k));
    for (const k of looksUsed(g)) if (!have.has(k)) applyDiff(g, lookCellsDiff(g, k), false);
    if (!looksUsed(g).size) setLook(g, null);
  }
  /** T256 (#743): the looks each owner wears on the course grid (golf/looks.ts): the property's (the cells of no hole), each hole's and each
   *  practice facility's (the cells of no hole in its footprint, zones); owners that look alike share one entry; undefined when every owner
   *  looks as the course default does (the chunks lay exactly as before T256) */
  private courseOwners(pre: (s: string, old: string) => CourseTex): CourseOwners | undefined {
    const book = this.golf?.looks; if (!book) return undefined;
    const base = JSON.stringify(courseLookSet(this.paint.brush, pre)), keys = new Map<string, number>(), looks: CourseOwners['looks'][number][] = [];
    const idx = (o: string): number => {
      if (!book[o]) return -1;
      const v: Partial<Record<BrushKind, { style: LookStyle }>> = {};
      for (const k of LOOK_KINDS) v[k] = { style: this.paint.lookOf(o, k) };
      const set = courseLookSet(v, pre), key = JSON.stringify(set); if (key === base) return -1;
      let i = keys.get(key); if (i === undefined) { i = looks.length; keys.set(key, i); looks.push(set); }
      return i;
    };
    const hole: number[] = [idx('property')];
    for (const o of Object.keys(book)) { const n = ownerHole(o); if (n) hole[n] = idx(o); }
    const zones: number[] = [];
    for (const f of FACILITY_OWNERS) { const k = idx(f), b = k === hole[0] ? null : this.facilityBox(f); if (b) zones.push(k, b[0], b[1], b[2], b[3]); }
    if (!looks.length) return undefined;
    for (let n = 0; n < hole.length; n++) hole[n] ??= -1;
    return { looks, hole, ...(zones.length ? { zones } : {}) };
  }
  private facBoxes: { rev: number; g: CourseGrid; v: Map<string, [number, number, number, number] | null> } | null = null;
  /** T256: a built practice facility's footprint (its green, bunker and chip mat's cells, practicebuild facilityAt) as a tile box grown by
   *  its fringe and lip, or null (none built); kept until the grid changes */
  facilityBox(f: FacilityOwner): [number, number, number, number] | null {
    const g = this.courseGrid, sc = this.range.scene; if (!g || !sc || this.golf?.start !== 'range') return null;
    if (this.facBoxes?.g !== g || this.facBoxes.rev !== g.rev) this.facBoxes = { rev: g.rev, g, v: new Map() };
    const m = this.facBoxes.v; if (m.has(f)) return m.get(f)!;
    const c = this.range.practice?.[f]?.centre, at = c ? facilityAt(g, sc.practice.box, c.x, c.y) : null;
    let b: [number, number, number, number] | null = null;
    if (at?.cells.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of at.cells) { const p = cellCentre(g, i); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      const pad = 2.5; b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    }
    m.set(f, b); return b;
  }
  /** T256: the looks book of a golf game: an old save's (or a new game's) owners take today's course default as their own (the property, the
   *  facilities and every hole on the grid or in a plan), so nothing changes on load; a new hole is given its own on its first paint */
  private seedLooks() {
    const gs = this.golf; if (!gs) return;
    const book = gs.looks ??= {}, g = this.courseGrid, holes = new Set<number>();
    if (g) for (let i = 0; i < g.hole.length; i++) { const h = g.hole[i]!; if (h && g.surf[i] !== SURF.none) holes.add(h); }
    for (const p of decodePlans(gs.plans ?? [])) holes.add(p.hole);
    for (const o of ['property', ...FACILITY_OWNERS, ...[...holes].map(h => holeOwner(h))]) seedOwner(book, o, this.paint.dflt);
    this.paint.looksRev++;
  }
  /** T256: owner o's looks changed: only its cells are drawn again (a hole's box; a facility's; the property's: every chunk) */
  private ownerLookChanged(o: string) {
    const n = ownerHole(o), b = n ? this.paint.holeBox(n) : o === 'putting' || o === 'chipping' ? this.facilityBox(o) : null;
    if (b) this.sendCourseChunks(b); else this.resendCourse();
  }
  /** the collar widths the course is laid with, by surface id: the Border slider's where the player set one, else the defaults (course-finish
   *  finishBorders: T227's first cut and fringe with the course finish, BLOB_STYLE's without; T260: none round a tee, a bunker or a pond) */
  private courseBorders(): (number | undefined)[] { return finishBorders(this.paint.courseBorders(), finishOf(paintedSurfaces())); }
  /** T227: the finish's collar widths the course was last laid with (a surfaces save that changes them lays every chunk again) */
  private finishCollars = '';
  private finishCollarKey(): string { return finishBorders([], finishOf(paintedSurfaces())).join(','); }
  private watchFinish(): () => void {
    this.finishCollars = this.finishCollarKey();
    return onPaintedSurfaces(() => { const k = this.finishCollarKey(); if (k !== this.finishCollars) { this.finishCollars = k; this.resendCourse(); } });
  }
  private cpCache: { ver: number; g: CourseGrid; segs: number[] } | null = null;
  /** the cart paths and drives near the course grid as flat segments ax, ay, bx, by (tiles): the tees' stairs face the nearest (T127) */
  private coursePaths(): number[] {
    const g = this.courseGrid; if (!g) return [];
    if (this.cpCache && this.cpCache.ver === this.net.version && this.cpCache.g === g) return this.cpCache.segs;
    const R = STAIR_REACH, x0 = g.x0 - R, y0 = g.y0 - R, x1 = g.x0 + g.w * CELL_T + R, y1 = g.y0 + g.h * CELL_T + R, segs: number[] = [];
    for (const sg of this.net.segs) {
      if (sg.cls.family !== 'cart' && sg.cls.family !== 'course') continue;
      if (Math.max(sg.a.x, sg.b.x) < x0 || Math.min(sg.a.x, sg.b.x) > x1 || Math.max(sg.a.y, sg.b.y) < y0 || Math.min(sg.a.y, sg.b.y) > y1) continue;
      segs.push(sg.a.x, sg.a.y, sg.b.x, sg.b.y);
    }
    this.cpCache = { ver: this.net.version, g, segs };
    return segs;
  }
  /** the roads changed in box: the tees within a stair's reach turn their stairs to the paths as they now are (T127) */
  private courseRoadsChanged(d: readonly number[]) {
    const g = this.courseGrid; if (!g || !this.golf) return;
    const R = STAIR_REACH, box = [d[0]! - R, d[1]! - R, d[2]! + R, d[3]! + R];
    const i0 = Math.max(0, Math.floor((box[0]! - g.x0) / CELL_T)), i1 = Math.min(g.w, Math.ceil((box[2]! - g.x0) / CELL_T)), j0 = Math.max(0, Math.floor((box[1]! - g.y0) / CELL_T)), j1 = Math.min(g.h, Math.ceil((box[3]! - g.y0) / CELL_T));
    let tee = false;
    for (let j = j0; j < j1 && !tee; j++) for (let i = i0, k = j * g.w + i0; i < i1; i++, k++) if (g.surf[k] === SURF.tee) { tee = true; break; }
    if (tee) this.sendCourseChunks(box);
  }
  /** each hole's playing line (back tee, aim points, pin) as flat tiles, for the fairway's mowing stripes */
  private holeLines(): Map<number, number[]> {
    const g = this.golf, out = new Map<number, number[]>(); if (!g) return out;
    for (const pin of g.pins) {
      const t = g.tees.find(q => q.hole === pin.hole && q.kind === 'back') ?? g.tees.find(q => q.hole === pin.hole); if (!t) continue;
      const line = [t.x, t.y]; for (const a of g.aims.filter(q => q.hole === pin.hole).sort((p, q) => p.order - q.order)) line.push(a.x, a.y);
      line.push(pin.x, pin.y); out.set(pin.hole, line);
    }
    return out;
  }
  /** T218: each hole's playing line as last looked at (its numbers as a key, and its box), null until the first look */
  private linesSeen: Map<number, { key: string; box: number[] }> | null = null; private linesAt = 0;
  /** T218: the fairway's stripes follow each hole's playing line, which the chunks carry: when one moves (a pin or tee moved, a plan's bends
   *  changed, a hole made or gone), the chunks round its old and new line are sent again. Looked at every LINES_EVERY_MS (the frame loop) */
  private watchHoleLines(now: number) {
    if (now - this.linesAt < LINES_EVERY_MS) return; this.linesAt = now;
    if (!this.courseGrid) { this.linesSeen = null; return; }
    const cur = new Map<number, { key: string; box: number[] }>();
    for (const [h, l] of this.holeLines()) {
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let k = 0; k + 1 < l.length; k += 2) { box[0] = Math.min(box[0]!, l[k]!); box[1] = Math.min(box[1]!, l[k + 1]!); box[2] = Math.max(box[2]!, l[k]!); box[3] = Math.max(box[3]!, l[k + 1]!); }
      cur.set(h, { key: l.join(','), box });
    }
    const seen = this.linesSeen; this.linesSeen = cur; if (!seen) return;
    const moved: number[][] = [];
    for (const [h, q] of cur) { const was = seen.get(h); if (!was) moved.push(q.box); else if (was.key !== q.key) moved.push(was.box, q.box); }
    for (const [h, was] of seen) if (!cur.has(h)) moved.push(was.box);
    const R = LINES_REACH;
    for (const b of moved) this.sendCourseChunks([b[0]! - R, b[1]! - R, b[2]! + R, b[3]! + R]);
  }
  private growCache: { g: CourseGrid; rev: number; now: number; v: Map<number, number> } | null = null;
  /** the holes still growing in, each with the game month (golfMonthIndex's scale) it is grown in (T121; worked out again when the grid or
   *  the month changes) */
  holesGrowing(): Map<number, number> {
    const g = this.courseGrid; if (!g || !this.golf) return new Map();
    const now = this.growMonth(), c = this.growCache;
    if (c?.g !== g || c.rev !== this.gaRev || c.now !== now) {
      const v = growingHoles(g, now), bonus = now - this.golfMonthIndex();
      for (const [h, r] of v) v.set(h, r - bonus);
      this.growCache = { g, rev: this.gaRev, now, v };
    }
    return this.growCache!.v;
  }
  /** a hole's grow-in (P23 4.6, T135): 'growing · ready Mar 1985', or '' once it is grown in. The one source of the badge's, the Holes panel's
   *  status line's and the course hint pill's words (golf/growlabel.ts) */
  holeGrowLabel(n: number): string { return growReadyLabel(this.holesGrowing().get(n)); }
  /** the effective game month for grow-in (the grow cards included) */
  private growMonth(): number { return this.golf ? effectiveGrowInClockMonth(this.golfMonthIndex(), this.golf.cards ?? this.traffic.round.cards) : 0; }
  /** the course grid, with both workers holding a copy of this very grid object (a new or grown grid goes to them whole first) */
  private contourGrid(): CourseGrid | null {
    const g = this.courseGrid;
    if (this.contourOf !== g) { this.contour.setGrid(g); this.areaWorker.setGrid(g); this.contourOf = g; }
    return g;
  }
  /** re-contours the course chunks a tile box touches (grown by how far an edit reaches) and sends their patches (cg:cx:cy; none: dropped).
   *  stale: the box is an edit, and only it (grown by the outlines' and the drawing's reach) of the ground re-bakes; else whole chunks.
   *  The work is the contour worker's: the patches land a few ms later, all of one job in the same frame */
  sendCourseChunks(box: readonly number[], stale = false, at = performance.now()) {
    const g = this.contourGrid(); if (!g) return;
    // a wide Border reaches further, and so does Round off's wider kernel (T253)
    const lk = this.courseLooks(), reach = courseEditReach(widestCollar(courseStyles(lk.border, lk.base))) + roundReach(lk), R = reach + COURSE_PATCH_REACH; // (T271: a custom grass's Border too)
    this.queueChunks(courseChunksIn(g, box, reach), stale ? [box[0]! - R, box[1]! - R, box[2]! + R, box[3]! + R] : null, at);
  }
  /** chunks for the contour worker: a job now, or (one in flight) merged into the next */
  private queueChunks(chunks: readonly [number, number][], stale: number[] | null, at: number) {
    if (!chunks.length) return;
    const w = this.cgWait ?? (this.cgWait = { chunks: new Set(), stale, at });
    for (const [cx, cy] of chunks) w.chunks.add(cx * 4096 + cy);
    w.stale = w.stale && stale ? [Math.min(w.stale[0]!, stale[0]!), Math.min(w.stale[1]!, stale[1]!), Math.max(w.stale[2]!, stale[2]!), Math.max(w.stale[3]!, stale[3]!)] : null;
    w.at = Math.min(w.at, at);
    if (!this.cgJob) this.runChunks();
  }
  /** posts the waiting chunks as one job; its patches are applied together when it comes back */
  private runChunks() {
    const w = this.cgWait, g = this.contourGrid(); if (!w || !g) return;
    this.cgWait = null; this.cgJob = true;
    const chunks: number[] = []; for (const k of w.chunks) chunks.push(Math.floor(k / 4096), k % 4096);
    const now = this.growMonth();
    this.contour.chunks({ chunks, looks: this.courseLooks(), now, lines: [...this.holeLines()], paths: this.coursePaths(), flips: [...this.mowFlips()] }, (out, ms) => {
      this.perf.courseJobMs = ms; this.perf.courseJobChunks = chunks.length / 2;
      const t0 = performance.now();
      this.cgJob = false;
      if (this.courseGrid) this.applyChunks(out, w.stale, w.at, now); // a reset forgets the job (drop), a grown grid keeps its results
      if (this.cgWait) this.runChunks();
      this.cMs += performance.now() - t0;
    });
    this.cgSentAt = performance.now();
  }
  /** a chunk job's results onto the ground: each patch (or its drop), the box it changed, its grow key; the lag after the first change */
  private applyChunks(out: readonly CourseChunkOut[], stale: number[] | null, at: number, now: number) {
    for (const o of out) {
      const key = courseKey(o.cx, o.cy);
      if (o.patch) {
        // an edit re-bakes only its box, unless the chunk's grow-in moved on since it was last baked whole: then all of it, or the cells
        // outside the box kept the old month's look while the grow key (now this month's) told the month tick there was nothing to redo
        const was = this.cgSent.get(key), whole = !stale || (was !== undefined && !growStatic(was) && this.cgBaked.get(key) !== now);
        this.setLotGround(key, [o.patch]); this.cgSent.set(key, o.grow);
        if (whole) this.cgBaked.set(key, now);
        else if (stale) { const b = this.lotStale.get(key); this.lotStale.set(key, b ? [Math.min(b[0], stale[0]!), Math.min(b[1], stale[1]!), Math.max(b[2], stale[2]!), Math.max(b[3], stale[3]!)] : [stale[0]!, stale[1]!, stale[2]!, stale[3]!]); }
      } else if (this.cgSent.has(key)) { this.setLotGround(key, null); this.cgSent.delete(key); }
    }
    this.perf.courseLagMs = performance.now() - at;
  }
  /** how many course chunks are on the ground (the benchmark's log) */
  courseChunkCount(): number { return this.cgSent.size; }
  /** every chunk of the grid again (a load, a new look); chunks sent before that are now off the grid are dropped */
  resendCourse() {
    const g = this.courseGrid; if (!g) return;
    this.linesSeen = null; // every chunk takes the lines as they are now (T218: the watch starts again from them)
    this.sendCourseChunks([g.x0, g.y0, g.x0 + g.w * CELL_T, g.y0 + g.h * CELL_T]);
  }
  /** the grid changed (the Course tool, undo, redo): the workers get the cells, its box waits to be sent (flush: now; else within the frame
   *  loop's 120 ms), the holes it touched are worked out again and the trees on its new playing surfaces go */
  private courseGridChanged(d: GridDiff | null, flush: boolean) {
    const t0 = performance.now(), b = d ? diffBox(d) : null, g = this.courseGrid;
    if (b && d && g) {
      if (this.contourOf === g) { this.contour.cells(g, d); this.areaWorker.cells(g, d); }
      if (!this.cgDirty) this.cgDirtyAt = t0;
      this.cgDirty = this.cgDirty ? [Math.min(this.cgDirty[0]!, b.x0), Math.min(this.cgDirty[1]!, b.y0), Math.max(this.cgDirty[2]!, b.x1), Math.max(this.cgDirty[3]!, b.y1)] : [b.x0, b.y0, b.x1, b.y1];
      if (this.gaDirty) for (let k = 0; k < d.n; k++) { this.gaDirty.add(d.h0[k]!); this.gaDirty.add(d.h1[k]!); }
      this.gaRev++;
    }
    if (flush || performance.now() - this.cgSentAt >= this.courseSendMs) this.flushCourse();
    this.cMs += performance.now() - t0;
  }
  /** sends the waiting chunks (the frame loop calls it too) and clears the town and painted trees off the cells that became playing surfaces */
  private flushCourse() {
    const b = this.cgDirty; if (!b) return; this.cgDirty = null;
    this.sendCourseChunks(b, true, this.cgDirtyAt);
    this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!);
    this.clearTreesOnGrid(b);
    this.scheduleSave();
  }
  /** the least ms between two course chunk sends during a stroke (COURSE_SEND_MS; the benchmark tries others) */
  courseSendMs = COURSE_SEND_MS;
  /** the main-thread ms spent on the course grid's chunks this frame (the perf counter courseMs) */
  private cMs = 0;
  /** a dab of surface s (radius r tiles) from (ax, ay) to (bx, by) straight into the grid, as the Course brush lays one (the benchmark's
   *  scripted stroke; no undo, no price); returns how many cells changed */
  courseDab(ax: number, ay: number, bx: number, by: number, r: number, s: number): number {
    const g = this.courseGrid; if (!g) return 0;
    const d = paintStroke(g, ax, ay, bx, by, r, s, 0, 0, { over: 'below' });
    this.courseGridChanged(d, false);
    return d.n;
  }
  // ---------- New hole's ghost extras (plan P23-UX 6.2 P2-10, T176) ----------
  /** the trees New hole's ghost would clear: the ghost they were worked out for, when (ms), and the trees (tinted on the map) */
  private ghostTrees: { ghost: WizardGhost | null; at: number; set: Prop[] } = { ghost: null, at: 0, set: [] };
  /** the trees the ghost's Build would clear (the info row's count; the same rules the clearing uses: ext/hole-wizard/extras.ts) */
  wizardTrees(): Prop[] { return this.ghostTrees.set; }
  /** each frame: with New hole's ghost up, the trees its Build would clear are worked out again when the ghost changes (at most every 150 ms,
   *  the checks' throttle) and tinted; without one, the tint goes */
  private ghostTreesCheck() {
    const c = this.ghostTrees, gh = this.tool === 'course' && this.paint.planOpen ? this.paint.wizard.ghost() : null, now = performance.now();
    if (gh === c.ghost || (gh && c.ghost && now - c.at < 150)) return;
    const next = gh ? this.treesUnder(gh) : [];
    const keep = new Set(next);
    for (const p of c.set) if (!keep.has(p) && p.tint) { p.tint = false; if (this.sprites.has(p)) this.sprites.update(p); } // a cleared tree is not put back
    const was = new Set(c.set);
    for (const p of next) if (!was.has(p) || !p.tint) { p.tint = true; if (this.sprites.has(p)) this.sprites.update(p); }
    const changed = next.length !== c.set.length;
    this.ghostTrees = { ghost: gh, at: now, set: next };
    if (changed) this.emit();
  }
  /** the trees ghost gh's Build would clear: the planted forest and town trees and the placed tree props near its cells, read against the grid as
   *  it will be once built (the ghost's diff over today's cells) */
  private treesUnder(gh: WizardGhost): Prop[] {
    const g = this.courseGrid, d = gh.diff; if (!g || !d.n || d.w !== g.w || d.x0 !== g.x0 || d.y0 !== g.y0) return [];
    const changed = new Map<number, number>(); for (let k = 0; k < d.n; k++) changed.set(d.idx[k]!, d.s1[k]!);
    const after = (x: number, y: number) => { const i = cellAt(g, x, y); return i < 0 ? 0 : changed.get(i) ?? g.surf[i]!; };
    const b = diffBox(d); if (!b) return [];
    const pad = TOWN_CLEAR + 1, x0 = b.x0 - pad, y0 = b.y0 - pad, x1 = b.x1 + pad, y1 = b.y1 + pad;
    const near: NearTree[] = [], props: Prop[] = [], N = MAP / FOREST_CELL;
    for (const [map, r] of [[this.forest, FOREST_CLEAR], [this.townTrees, TOWN_CLEAR]] as const) {
      for (const [k, ps] of map) {
        const ci = k % N, cj = Math.floor(k / N);
        if (!boxNear([x0, y0, x1, y1], ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, 0)) continue;
        for (const p of ps) {
          // the trunk, as treeSprites anchored the sprite on it
          const it = LIBRARY[p.item]!, bx = it.boxes[0]!, tx = p.x + bx.dx * p.scale / 2, ty = p.y + bx.dy * p.scale / 2;
          if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
          near.push({ x: tx, y: ty, planted: true, r }); props.push(p);
        }
      }
    }
    for (const p of this.propGrid.query([x0, y0, x1, y1])) {
      if (LIBRARY[p.item]?.kind !== 'tree') continue;
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2; if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
      near.push({ x: cx, y: cy, planted: false, r: 0 }); props.push(p);
    }
    return treesCleared(near, after).map(i => props[i]!);
  }
  /** the tree props whose foot stands on a playing surface cell of the grid in box (fairway, green, tee, bunker, waste, water) go */
  private clearTreesOnGrid(b: readonly number[]) {
    const g = this.courseGrid; if (!g) return;
    for (const p of [...this.propGrid.query([b[0]!, b[1]!, b[2]!, b[3]!])]) {
      if (LIBRARY[p.item]?.kind !== 'tree') continue;
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2; if (cx < b[0]! || cx > b[2]! || cy < b[1]! || cy > b[3]!) continue;
      if (propTreeCleared((x, y) => this.courseSurfAt(x, y), cx, cy)) this.removeProp(p); // T176: the ghost reads the same rule
    }
  }
  /** the grid's surface id at tile (x, y) (0: none or no grid) */
  courseSurfAt(x: number, y: number): number { const g = this.courseGrid; if (!g) return 0; const i = cellAt(g, x, y); return i >= 0 ? g.surf[i]! : 0; }
  // ---------- T229: trees frame the holes (golf/holeframe.ts; the hole card's and New hole's Frame with trees) ----------
  /** bumped when frame trees are planted or taken away (the card's frame is worked out again) */
  private frameRev = 0;
  /** the hole card's frame (its key: the hole, the grid, the frame trees, the props, the markers) */
  private cardFrame: { key: string; v: HoleFrameView | null } | null = null;
  /** New hole's frame for its ghost: worked out once the ghost has held still for FRAME_SETTLE_MS (a drag does not wait on it) */
  private ghostFrame: { ghost: WizardGhost | null; since: number; done: boolean; v: FramePlan | null; pts?: { of: FramePlan; pts: { x: number; y: number; conifer: boolean }[] } } = { ghost: null, since: 0, done: true, v: null };
  /** what a hole's frame stands on: the course grid as it is (or as New hole's ghost would leave it), the holes' lines of play and the cart
   *  lanes, and the map's own checks (the land, water, paths and roads, car parks and buildings, painted ground, props and planted trees near);
   *  own: the hole's frame trees planted already. Null without a course grid or a line for the hole */
  private frameSite(n: number, o: { ghost?: WizardGhost | null; plan?: HolePlan | null } = {}): { site: FrameSite; own: Prop[] } | null {
    const gs = this.golf, g = this.courseGrid; if (!gs || !g || n < 1) return null;
    let surf = (i: number) => g.surf[i]!, hole = (i: number) => g.hole[i]!;
    const d = o.ghost?.diff;
    if (d && d.n && d.w === g.w && d.x0 === g.x0 && d.y0 === g.y0) {
      const at = new Map<number, number>(); for (let k = 0; k < d.n; k++) at.set(d.idx[k]!, k);
      surf = i => { const k = at.get(i); return k === undefined ? g.surf[i]! : d.s1[k]!; };
      hole = i => { const k = at.get(i); return k === undefined ? g.hole[i]! : d.h1[k]!; };
    }
    // the lines of play (T218's: the back tee, the aim points, the pin); a plan in hand gives this hole's
    const lines = new Map<number, Pt[]>();
    for (const [h, l] of this.holeLines()) { const pts: Pt[] = []; for (let k = 0; k + 1 < l.length; k += 2) pts.push({ x: l[k]!, y: l[k + 1]! }); lines.set(h, pts); }
    const pl = o.plan ?? decodePlans(gs.plans ?? []).find(p => p.hole === n) ?? null;
    // a plan in hand, or a built plan whose markers have not landed yet (they are fitted after the Build): the plan's tee, bends and green
    if (pl && (o.plan || !lines.has(n))) lines.set(n, [pl.tee, ...pl.bends, pl.green].map(p => ({ x: p.x, y: p.y })));
    const line = lines.get(n); if (!line || line.length < 2) return null;
    let L = 0; for (let k = 1; k < line.length; k++) L += Math.hypot(line[k]!.x - line[k - 1]!.x, line[k]!.y - line[k - 1]!.y);
    const lanes = cartLanes([...lines].map(([h, l]) => ({ hole: h, tee: l[0]!, pin: l[l.length - 1]! })), gs.clubhouse ?? null);
    // the box the frame can reach, and what stands in it: the hole's own frame trees, the planted forest and town trees, the painted areas
    const R = FRAME_RULES, reach = R.corridor + R.bandOut + R.landingPush + 4;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of line) { x0 = Math.min(x0, p.x - reach); y0 = Math.min(y0, p.y - reach); x1 = Math.max(x1, p.x + reach); y1 = Math.max(y1, p.y + reach); }
    const box: BBox = [x0, y0, x1, y1], own: Prop[] = [];
    for (const p of this.propGrid.query(box)) if (p.frame === n && p.decor === FRAME_TREE_KEY) own.push(p);
    own.sort((a, b) => a.uid - b.uid);
    const mine = new Set(own), trunks = new Map<number, number[]>(), N = MAP / FOREST_CELL, B = 4, key = (x: number, y: number) => Math.floor(y / B) * 4096 + Math.floor(x / B);
    for (const map of [this.forest, this.townTrees]) for (const [k, ps] of map) {
      const ci = k % N, cj = Math.floor(k / N);
      if (!boxNear(box, ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, 0)) continue;
      for (const p of ps) {
        const bx = LIBRARY[p.item]!.boxes[0]!, tx = p.x + bx.dx * p.scale / 2, ty = p.y + bx.dy * p.scale / 2;
        let l = trunks.get(key(tx, ty)); if (!l) trunks.set(key(tx, ty), l = []); l.push(tx, ty);
      }
    }
    const paints = this.paint.areas.filter(a => boxNear(ptsBox(a.pts), x0, y0, x1, y1, 2));
    const pb = gs.start === 'range' ? this.range.scene?.practice.box ?? null : null, m2 = R.treeMin * R.treeMin;
    const ok = (x: number, y: number): boolean => {
      if (!this.ownedAt(x, y) || this.onRangePlot(x, y)) return false;
      if (pb && x > pb[0] - 2 && x < pb[2] + 2 && y > pb[1] - 2 && y < pb[3] + 2) return false;
      // water within a tile: the map's (lakes, creeks, banks) and the course's ponds
      for (let ty = Math.floor(y - 1); ty <= Math.floor(y + 1); ty++) for (let tx = Math.floor(x - 1); tx <= Math.floor(x + 1); tx++) {
        if (tx < 1 || ty < 1 || tx >= MAP - 1 || ty >= MAP - 1) return false;
        const c = this.terrain.cls[ty * MAP + tx]; if (c === TC.WATER || c === TC.CREEK || c === TC.BANK) return false;
      }
      for (let k = 0; k < 9; k++) { const i = cellAt(g, x + (k % 3) - 1, y + Math.floor(k / 3) - 1); if (i >= 0 && surf(i) === SURF.water) return false; }
      // a road, a cart path, a drive or a sidewalk within 1.5 tiles (T213's carts drive the paths), a car park or a building within 2
      if (this.net.rectOcc(x - 1.5, y - 1.5, x + 1.5, y + 1.5)) return false;
      for (const b of this.parkDefs) if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return false;
      for (const b of this.bizDefs) if (x > b.x - 2 && x < b.x + b.w + 2 && y > b.y - 2 && y < b.y + b.h + 2) return false;
      if (paints.length && areaAt(paints, x, y)) return false;
      // a prop near (a bench, a marker, another hole's frame tree; this hole's own are its keep): treeMin from its foot, a tile off a big one
      for (const p of this.propGrid.query([x - 3, y - 3, x + 3, y + 3])) {
        if (mine.has(p)) continue;
        if (LIBRARY[p.item]!.big) { if (x > p.x0 - 1 && x < p.x1 + 1 && y > p.y0 - 1 && y < p.y1 + 1) return false; continue; }
        if (((p.x0 + p.x1) / 2 - x) ** 2 + ((p.y0 + p.y1) / 2 - y) ** 2 < m2) return false;
      }
      // a planted forest or town tree within treeMin: the woods frame it there already
      for (let j = Math.floor((y - 3) / B); j <= Math.floor((y + 3) / B); j++) for (let i = Math.floor((x - 3) / B); i <= Math.floor((x + 3) / B); i++) {
        const l = trunks.get(j * 4096 + i); if (!l) continue;
        for (let k = 0; k < l.length; k += 2) if ((l[k]! - x) ** 2 + (l[k + 1]! - y) ** 2 < m2) return false;
      }
      return true;
    };
    const site: FrameSite = {
      hole: n, seed: pl?.seed || planSeed(n), line, others: [...lines].filter(([h]) => h !== n).map(([, l]) => l), lanes, ok,
      grid: { x0: g.x0, y0: g.y0, w: g.w, h: g.h, surf, hole },
      ...(pl ? { landings: landingSpots(L * 2, pl.widths) } : {}),
    };
    return { site, own };
  }
  /** hole n's frame as it would go in now (see frameSite): the trees to plant, its frame trees now in play (to go) and how many it keeps */
  private framePlan(n: number, o: { ghost?: WizardGhost | null; plan?: HolePlan | null } = {}): FramePlan | null {
    const s = this.frameSite(n, o); if (!s) return null;
    const r = frameHole(s.site, s.own.map(p => ({ x: p.x, y: p.y })));
    return { hole: n, trees: r.trees, stale: r.stale.map(i => s.own[i]!), kept: s.own.length - r.stale.length };
  }
  /** a frame plan planted (inside the caller's undo step): its stale trees go (half their price back, as the bulldozer), then its clumps go in,
   *  whole clumps while the money lasts (free: the dev's and the bench's frame); returns what it spent ($, net), the trees planted and left out */
  private plantFrame(f: FramePlan, free = false): { spent: number; planted: number; left: number; gone: number } {
    const d = DECOR_BY_KEY.get(FRAME_TREE_KEY)!, price = free ? 0 : d.price;
    let spent = 0, planted = 0, left = 0;
    for (const p of f.stale) { this.removeProp(p); if (!free) spent -= sellBack(d); }
    const clumps = new Map<number, FrameTree[]>(); for (const t of f.trees) { let l = clumps.get(t.clump); if (!l) clumps.set(t.clump, l = []); l.push(t); }
    let money = free ? Infinity : this.money - spent;
    for (const ts of clumps.values()) {
      const go = ts.flatMap(t => { const i = LIB_INDEX.get(t.id); if (i === undefined) return []; const k = Math.min(maxDrawScale(i), t.scale); return this.canPlace(LIBRARY[i]!, t.x, t.y, false, k) ? [] : [{ i, t, k }]; });
      if (go.length < FRAME_RULES.min || go.length * price > money) { left += ts.length; continue; }
      for (const { i, t, k } of go) { const p = this.addProp(i, t.x, t.y, false, k); p.decor = FRAME_TREE_KEY; p.frame = f.hole; }
      planted += go.length; spent += go.length * price; money -= go.length * price;
    }
    if (spent) this.traffic.spend('construction', spent);
    if (planted || f.stale.length) { this.frameRev++; this.scheduleSave(); }
    return { spent, planted, left, gone: f.stale.length };
  }
  /** the hole card's Frame with trees (T229): what it would plant now and for what, what it takes away, and how many frame trees the hole has */
  holeFrameView(n: number): HoleFrameView | null {
    const g = this.golf, cg = this.courseGrid; if (!g || !cg) return null;
    const key = `${n}|${cg.rev}|${this.frameRev}|${this.props.size}|${this.gaRev}|${JSON.stringify(g.pins.filter(p => p.hole === n))}|${JSON.stringify(g.tees.filter(t => t.hole === n))}|${g.plans?.length ?? 0}`;
    if (this.cardFrame?.key === key) return this.cardFrame.v;
    const f = this.framePlan(n), d = DECOR_BY_KEY.get(FRAME_TREE_KEY)!;
    const v = f ? { trees: f.trees.length, price: framePrice(f.trees.length, d.price), stale: f.stale.length, refund: f.stale.length * sellBack(d), has: f.kept + f.stale.length } : null;
    this.cardFrame = { key, v };
    return v;
  }
  /** Frame with trees on hole n (the hole card): its frame planted as one undo step (Ctrl+Z takes the trees and the money back); the toast says
   *  what it did. free: the dev's and the bench's frame (?frame=1) */
  frameHoleTrees(n: number, free = false): number {
    const f = this.framePlan(n); if (!f) { if (!free) this.toast(`Hole ${n} has no line of play to frame yet`, 'warn'); return 0; }
    if (!f.trees.length && !f.stale.length) { if (!free) this.toast(`Hole ${n} is framed already: no room for more clumps`, 'info'); return 0; }
    let r = { spent: 0, planted: 0, left: 0, gone: 0 };
    if (free) r = this.plantFrame(f, true);
    else this.paint.step(`frame hole ${n}`, () => (r = this.plantFrame(f)).spent);
    if (!free) this.toast(frameToast(n, r), r.left ? 'warn' : 'good');
    this.emit(); return r.planted;
  }
  /** every hole with a line of play framed, in number order (free: the dev's ?frame=1 and the bench); returns the trees planted */
  frameAllHoles(free = false): number {
    const holes = new Set([...this.holeLines().keys(), ...decodePlans(this.golf?.plans ?? []).map(p => p.hole)]);
    let n = 0; for (const h of [...holes].sort((a, b) => a - b)) n += this.frameHoleTrees(h, free);
    return n;
  }
  /** New hole's Build with Frame with trees on (PaintTool.buildPlan, inside its undo step): the new or edited hole's frame on the built grid;
   *  returns what it spent and the trees it planted and left out (Build's toast says them) */
  private frameBuilt(n: number, plan: HolePlan, layout = false): { spent: number; planted: number; left: number } {
    const f0 = this.framePlan(n, { plan }), f = f0 && layout ? { ...f0, trees: [] } : f0; // T254: a layout edit plants none, it only takes the trees now in play
    if (!f || (!f.trees.length && !f.stale.length)) return { spent: 0, planted: 0, left: 0 };
    return this.plantFrame(f);
  }
  /** New hole's frame for its ghost (the panel's Frame with trees row): trees and price, or null while it is worked out or the toggle is off */
  wizardFrame(): { trees: number; price: number; stale: number } | null {
    const f = this.ghostFrame.v; if (!f || !this.paint.frameTrees) return null;
    const d = DECOR_BY_KEY.get(FRAME_TREE_KEY)!;
    return { trees: f.trees.length, price: framePrice(f.trees.length, d.price) - f.stale.length * sellBack(d), stale: f.stale.length };
  }
  /** each frame: New hole's frame is worked out again once its ghost has held still for FRAME_SETTLE_MS (the toggle on) */
  private ghostFrameCheck(now: number) {
    const c = this.ghostFrame, on = this.paint.frameTrees && this.tool === 'course' && this.paint.planOpen;
    const gh = on ? this.paint.wizard.ghost() : null;
    if (gh !== c.ghost) { c.ghost = gh; c.since = now; c.done = !gh; if (!gh && c.v) { c.v = null; this.emit(); } return; }
    if (c.done || now - c.since < FRAME_SETTLE_MS) return;
    const pl = this.paint.wizard.plan; c.done = true;
    const fp = gh && pl ? this.framePlan(pl.hole, { ghost: gh, plan: pl }) : null;
    c.v = fp && this.paint.wizard.base ? { ...fp, trees: [] } : fp; // T254: Edit Hole Layout plants no trees (it takes the ones now in play)
    this.emit();
  }
  /** the frame New hole's ghost would plant, for its overlay: the trees' points (tiles) and whether each is a conifer, or none */
  wizardFrameTrees(): readonly { x: number; y: number; conifer: boolean }[] {
    const c = this.ghostFrame; if (!this.paint.frameTrees || !c.ghost || !c.v) return [];
    if (c.pts?.of !== c.v) c.pts = { of: c.v, pts: c.v.trees.map(t => ({ x: t.x, y: t.y, conifer: FRAME_CONIFER_IDS.has(t.id) })) };
    return c.pts.pts;
  }
  /** the grid's course areas (gridAreas), in draw order. The holes an edit touched are worked out again by the areas worker: until they
   *  land this is the list as it was (the panel and the markers follow when they do) */
  gridAreaList(): GridArea[] {
    if (!this.courseGrid) return [];
    if (this.gaDirty === null || this.gaDirty.size) this.refreshAreas();
    return this.gaList;
  }
  /** asks the areas worker for the dirty holes' areas (one job at a time; edits made meanwhile ask again after it) */
  private refreshAreas() {
    const g = this.contourGrid(); if (!g) return;
    if (this.gaJob) { this.gaAgain = true; return; }
    const todo = this.gaDirty; this.gaDirty = new Set(); this.gaJob = true;
    this.areaWorker.areas(todo ? [...todo] : null, (areas, ms) => {
      const t0 = performance.now(); this.perf.areasJobMs = ms;
      this.gaJob = false;
      if (!todo) this.gaByHole.clear(); else for (const h of todo) this.gaByHole.delete(h);
      for (const a of areas) { let l = this.gaByHole.get(a.hole); if (!l) this.gaByHole.set(a.hole, l = []); l.push(a); }
      this.gaList = [...this.gaByHole.values()].flat().sort((p, q) => areaRank(p) - areaRank(q));
      this.gaVer++;
      if (this.gaAgain || this.gaDirty === null || this.gaDirty.size) { this.gaAgain = false; this.refreshAreas(); return; }
      const m = this.gaMarkers; this.gaMarkers = null;
      if (m) this.syncCourseMarkers(m.pins, m.quiet);
      this.emit();
      this.perf.areasApplyMs = performance.now() - t0;
    });
  }
  /** the grid's areas are out of date and being worked out off the main thread (the marker fit waits for them) */
  private get areasPending(): boolean { return !!this.courseGrid && this.areaWorker.async && (this.gaJob || this.gaDirty === null || this.gaDirty.size > 0); }
  /** the course's areas as the golf rules read them (holes, markers, stats, quality, upkeep): the grid's, then the painted areas (each with
   *  its golf surface, 'other' when it has none), worked out again when either changes */
  courseAreaList(): CourseAreaRec[] {
    const grid = this.gridAreaList(), key = `${this.gaVer}:${this.paintRev}:${this.paint.areas.length}`;
    if (this.caCache?.key === key) return this.caCache.v;
    const v: CourseAreaRec[] = [...grid, ...this.paint.areas.map(a => ({ id: a.id, hole: a.hole, tex: a.tex, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts, plantKind: a.plantKind, plantedMonth: a.plantedMonth }))];
    this.caCache = { key, v };
    return v;
  }
  /** the grid as saved (encodeGrid), kept until it changes */
  private gridSave(): GridSave | undefined {
    const g = this.courseGrid; if (!g) return undefined;
    let c = this.gridSaveCache;
    if (!c || c.g !== g || c.rev !== g.rev) this.gridSaveCache = c = { g, rev: g.rev, s: encodeGrid(g) };
    return c.s;
  }
  /** drops the grid and its chunks (a reset); the workers' jobs in flight are forgotten */
  private dropCourseGrid() {
    for (const k of this.cgSent.keys()) this.setLotGround(k, null);
    this.contour.drop(); this.areaWorker.drop(); this.cgJob = false; this.cgWait = null; this.gaJob = false; this.gaAgain = false; this.gaMarkers = null;
    this.cgSent.clear(); this.cgBaked.clear(); this.cgDirty = null; this.courseGrid = null; this.gaByHole.clear(); this.gaDirty = null; this.gaRev++; this.gaList = []; this.gaVer++; this.caCache = null; this.gridSaveCache = null;
    this.contourGrid();
  }
  /** the month tick: the chunks whose grow key changed (a seeded cell reached its next quarter) are sent again (whole chunks re-bake) */
  private courseMonth() {
    const g = this.contourGrid(); if (!g || !this.cgSent.size) return;
    const now = this.growMonth(), todo: [number, number][] = [];
    for (const [key, gk] of this.cgSent) {
      if (growStatic(gk)) continue;
      const [, sx, sy] = key.split(':'), cx = +sx!, cy = +sy!;
      if (courseGrowKey(g, cx, cy, now) !== gk) todo.push([cx, cy]);
    }
    this.queueChunks(todo, null, performance.now());
  }
  /** registers the waiting course grass zones (each chunk's turf rings), at most budget ms a frame: the grass care needs them, the
   *  picture does not wait for them */
  private courseGrass(budget: number) {
    const t0 = performance.now();
    for (const [key, patches] of this.grassWait) {
      this.grassWait.delete(key);
      const keep: string[] = [];
      for (const p of patches ?? []) for (const l of p.course?.layers ?? []) {
        const k = grassSlot(l.s), p = k ? this.grassAt(k)?.plays : undefined; // T271: a custom grass is cared for as the grass it plays as
        const surface = grassSurface(SURFACE_TEX_ID[p ? golfSurfaceOf(p) : SURF_SURFACE[l.s] ?? 'other']); if (!surface) continue;
        l.fill.forEach((r, k) => { if (ringArea(r) <= 0) return; const id = `${key}/${l.s}/${k}`, step = Math.ceil(r.length / 2000), pts: number[] = []; for (let j = 0; j + 1 < r.length; j += 2 * step) pts.push(r[j]!, r[j + 1]!); keep.push(id); this.grass.register(id, pts, surface, 'maintained'); });
      }
      for (const id of this.grassZones.get(key) ?? []) if (!keep.includes(id)) this.grass.remove(id);
      if (keep.length) this.grassZones.set(key, keep); else this.grassZones.delete(key);
      if (performance.now() - t0 > budget) break;
    }
  }
  /** the props added and removed while the Paint tool's action is open (undo), or null */
  private propLog: PropLog | null = null;
  /** undo (back) or redo of a prop journal: the props it added go, the props it removed come back (new objects); returns the journal for the opposite step */
  private swapProps(j: PropLog, back: boolean): PropLog {
    const kill = back ? j.added : j.removed, revive = back ? j.removed : j.added;
    for (const p of kill) this.removeProp(p);
    const out = revive.map(p => { const q = this.addProp(p.item, p.x, p.y, p.flip, p.scale, undefined, p.decor ? { own: true } : undefined); if (p.plant) q.plant = p.plant; if (p.decor) q.decor = p.decor; if (p.frame) q.frame = p.frame; return q; });
    if (j.added.some(p => p.frame) || j.removed.some(p => p.frame)) this.frameRev++; // T229
    this.scheduleSave();
    return back ? { added: kill, removed: out } : { added: out, removed: kill };
  }
  /** the Paint tool's projection into css px (its handles' hit tests): tile (x, y) is at (o[0] + x*o[2] + y*o[4], o[1] + x*o[3] + y*o[5]) */
  private paintAffine(o: number[]) { const s = this.screen(0, 0), ex = this.screen(1, 0), ey = this.screen(0, 1), d = this.dpr; o[0] = s.x / d; o[1] = s.y / d; o[2] = (ex.x - s.x) / d; o[3] = (ex.y - s.y) / d; o[4] = (ey.x - s.x) / d; o[5] = (ey.y - s.y) / d; }
  /** the Paint tool's snap distance: 10 css px in tiles */
  private get paintTol() { return 10 / (Math.hypot(HW, HH) * this.cam.z); }
  /** the Car park tool's bay rows, on-street runs and fee (docs/PARKING.md) */
  parking = new ParkingTool({ setLotGround: (k, p) => this.setLotGround(k, p), emit: () => this.emit(), save: () => this.scheduleSave(), toast: (t, k) => this.toast(t, k), money: () => this.money, spend: n => this.traffic.spend('construction', n), sendParking: (r, c, f) => { this.traffic.setParking(r, c, f); this.parkingChanged(); }, net: () => this.net, terrain: () => this.terrain.cls, mapSize: MAP, tollKeys: () => new Set(this.tollDefs.map(plazaKey)),
    occupied: q => { const xs = [q[0]!, q[2]!, q[4]!, q[6]!], ys = [q[1]!, q[3]!, q[5]!, q[7]!], r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }, s = this.site;
      return this.lotsUnder(r) ? 'buildings stand there' : s && r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y ? 'on the stadium site' : ''; } });
  /** the parks the bay rows' lots and on-street runs make (parking.lots(), then parking.curbParks()), as the City has them; their gates and parked cars follow */
  extraParks: CarPark[] = [];
  /** the ids of the extra parks whose parked cars are on the map (their cars go when the park does) */
  private extraCarIds = new Set<number>();
  /** the entrance gates, P signs and pay machines by key gate:{id}:{k} (auto props, never saved) */
  private gateProps = new Map<string, Prop>();
  /** the overlay's view of this engine (its canvas is set each frame; reused, so the render loop allocates nothing) */
  private parkView: ParkOverlayView = { ctx: null as unknown as CanvasRenderingContext2D, dpr: 1, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y) };
  /** the brush's cursor (T081, T108, T109): the cells a click paints on the half grid (by the grid's brush rules, the skipped ones with their
   *  reason, the price; re-run when the grid, the hole or Rub out change), the course grid round them and the surface chip beside the pointer */
  /** T252: the brush cursor's photo source (the painted looks' pictures, loaded once): its chip and the Holes swatches' pucks share it */
  readonly cursorTexture = browserCursorTexture();
  private courseCursor = new CourseCursor({ texture: this.cursorTexture, finish: () => finishOf(paintedSurfaces()), looks: paintedSurfaces, why: () => this.paint.brushSkipWhy(), cost: () => this.paint.brushCellCost(), rev: () => (this.courseGrid?.rev ?? 0) * 64 + this.paint.brushHole * 2 + (this.paint.rubOut ? 1 : 0), money: () => this.money, zone: (x, y) => this.range.zoneAt(x, y) });
  private cursorView: CursorView = { ze: 1, camX: 0, camY: 0, cw: 1, ch: 1, dpr: 1 };
  /** the hint pill's words for the Course brush (T118: what a click does: the surface, the hole it joins or starts, the price a cell, and the state); '' otherwise */
  courseHint(): string {
    const m = this.paint.mode; if (!(this.tool === 'course' && this.paintOn && this.brushOpen && (m === 'brush' || m === 'draw') && !this.clubPlacing && !this.halfwayPlacing)) return '';
    // a growing hole's pill says so after the hole's name (P23 4.6, T135): 'Painting Fairway · Hole 1 · growing · ready Mar 1985 · $2 a cell'
    const n = this.paint.brushHole; return hintWithGrow(this.courseCursor.hint, n, this.holeGrowLabel(n));
  }
  /** whether the Paint tool or Holes may lay what is in hand: Holes at stage 1 is New hole only (P23 4.2, 4.3), so outside New hole its brush,
   *  hidden with Shape by hand, lays nothing and draws no footprint or disc */
  get brushOpen(): boolean { if (this.tool !== 'course' || this.paint.planOpen || this.paint.property || this.paint.mode === 'myhole') return true; /* T256: Range › Build and From My holes are open from the start */ const ui = this.toolUi(); return !ui || ui.shapeByHand; }
  /** the cursor hint's change last told to the UI, and when (the pill follows within 100 ms, never more than ten times a second) */
  private hintSeen = 0; private hintEmitAt = 0;
  /** the map grid and the course half grid (T100), drawn between the ground and the sprites */
  private gridLayer = new MapGridLayer();
  /** a dev tool's lines on the ground (the lot lab's Lot grid, T148: src/game/dev/lot-grid.ts), drawn after the map grid and before the shadows and
   *  sprites with the frame's camera; true when it drew. Null outside the dev tools */
  devGround: ((gl: WebGL2RenderingContext, v: { X: number; Y: number; ze: number; cw: number; ch: number }) => boolean) | null = null;
  /** the car park drag (the park tool, left button): the tile where it began and the one under the pointer (x1, y1), the rect it makes (def, id 0),
   *  its built park (null if not valid), the verdict (why: the reason it cannot be built, '' if it can) and the cost; mx, my: the cursor (CSS px) */
  private parkDrag: null | { x0: number; y0: number; x1: number; y1: number; def: CarParkDef; park: CarPark | null; why: string; cost: number; mx: number; my: number } = null;
  /** the car parks as the player placed them (saved; ids 1..n), and their builds on the network by index (null: no frontage now, drawn red) */
  parkDefs: CarParkDef[] = []; private parkBuilt: (CarPark | null)[] = [];
  /** T219 (P27): the iconic places on the map (saved; lots/iconic.ts), their props by id, when the next site search may run (ms: none free
   *  waits PLACE_RETRY_MS), and the place whose card is open */
  places: PlacedPlace[] = []; private placeProps = new Map<string, Prop[]>(); private placeTryAt = 0; selectedPlace: string | null = null;
  /** the parked car props by key park:{id}:{i}, and the time of the last sync of them (ms) */
  private parkCars = new Map<string, Prop>(); private parkSyncAt = -Infinity;
  /** the toll gates as the player placed them (saved; ids 1..n), their plaza segs by id (only while the gate stands), their ground keys, the booths a new gate gets,
   *  whether R has flipped the way in, and the toll tool's plan at the cursor (seg null: no road within 4 tiles; why: the reason it cannot be built, '' if it can) */
  tollDefs: TollDef[] = []; private tollSegs = new Map<number, Seg>(); private tollGround = new Set<string>(); tollBooths = START_BOOTHS; private tollFlip = false;
  private tollHover: null | { mx: number; my: number; seg: Seg | null; a: Pt; b: Pt; why: string; cost: number; booths: number } = null;
  /** the businesses as the player placed them (saved; ids 1..n in the save's order): the main thread's copy, the city worker gets each change
   *  (setBusinesses); the stadium's site (siteAt, cached: see setBizDefs) */
  bizDefs: BizDef[] = []; private stadiumSite: Site | null = null;
  /** the types open to build at the last businesses message (null: none yet, or a new valley or a load: the next one only records them; see bizUnlocks) */
  private bizOpenSeen: Set<BusinessId> | null = null;
  /** the type in hand: the Business tool builds it (see selectBizType) */
  bizType: BusinessId = 'stadium';
  /** the business tool: whether R has turned the footprint (bizRot), and its ghost at the cursor (null: none; def: the business it would be, id 0;
   *  site: its site; why: the reason it cannot be built, '' if it can) */
  private bizRot = false;
  private bizHover: null | { mx: number; my: number; def: BizDef; site: Site; why: string } = null;
  /** the cursor in css px for the ghosts' labels (T019); null off the canvas */
  private ghostMouse: { mx: number; my: number } | null = null;
  /** the last event/marker ghost and the hover state it was built for (rebuilt when the key changes) */
  private ghostCache: { key: string; bp: GhostBlueprint } | null = null;
  /** the road route's price for the cursor label, kept while the route is unchanged (routeCost walks the route's structures) */
  private routeCostCache: { key: string; cost: number } | null = null;
  /** the add-lane tool's plan at the cursor: the straight run of road under it (segs; none on a toll plaza), the class it widens to (null: already the widest),
   *  its cost ($, as the road tool charges the upgrade) and why it cannot be built ('' if it can) */
  laneHover: null | { segs: Seg[]; to: RoadClass | null; cost: number; why: string; down: boolean; /** T224: the compensation for the buildings the rings at the run's ends grow into, and what each takes (or is refused by) */ comp: number; rings: RingVerdict<Prop>[] } = null;
  /** the shuttle bus routes as the player drew them (saved; ids 1..n, a route's index is its sim index), the bus tool's first stop once it is chosen (its
   *  road point, tiles, its car park's id, and its town when the stop is beside a town's car park lot; null until then), and the tool's plan at the cursor
   *  (see busUpdate: the stop it would place, x, y, its car park or town, and why not) */
  busDefs: BusRouteDef[] = []; busPick: { x: number; y: number; park: number; town?: number } | null = null;
  /** the taken cards applied so far (saved: a card is never applied twice; see applyCards), the buses a new route gets and the seats of a bus */
  cardsApplied = 0; busFleet = START_BUSES; busSeats = BUS_SEATS;
  private busHover: null | { mx: number; my: number; x: number; y: number; park: number; why: string; town?: number } = null;
  keys = new Set<string>();
  private listeners = new Set<() => void>();
  private saveTimer = 0; private blocksTimer = 0;
  /** set when the slot holds a save we could neither read nor back up: never write over it (T042) */
  private saveBlocked = false;
  /** the town's lots: their props by key, the keys queued to apply, the lots staged by the contact sheet (stageLots; they win until a reset) */
  private lotProps = new Map<string, Prop[]>(); private lotQueue = new Set<string>(); private staged = new Map<string, { g: LotGeom; st: ComposeState }>();
  /** the lay-bys' quads by their 'curb:' key (their pts), and the boxes (grown by a tile) of the lay-bys that went or changed since the lots last heard */
  private laybys = new Map<string, number[]>(); private laybyDirty: number[][] = [];
  /** the farms (ext/farms): the accepted parcels follow the network; their props by key (auto 'farm:' + key, never saved), the keys queued to compose, the dev switch */
  private farmMap = new FarmMap(); private farmProps = new Map<string, Prop[]>(); private farmQueue = new Set<string>(); private farmsEnabled = true; private farmTick = 0;
  /** T259 (#759): the farm model new farms compose with (ext/farms FARM_MODEL: the farmstead set back on its lane, the fields by the month); a
   *  save from before T259 has none, and its farms keep model 1 until they are rebuilt (a road edit that moves a parcel, a new farm on a new road:
   *  farmsNew, saved with it). farmPropKey: each farm prop's place in its composition (a month's change keeps every prop that stands where it
   *  stood); the ground each farm last sent; the month the farms show; each farm's season (farmSeason) as composed; its stand-in labels */
  private farmModel: FarmModel = FARM_MODEL; private farmsNew = new Set<string>(); private farmPropKey = new WeakMap<Prop, string>(); private farmGround = new Map<string, string>();
  private farmMonthNow = -1; private farmSeasons = new Map<string, string>(); private farmLabels = new Map<string, { p: Drawable; text: string; box: number[] }[]>();
  /** T259 (dev): the calendar month the farms show (window.__game.farmMonthOverride = 0..11, 0 January; setFarmMonth); null: the season clock's */
  farmMonthOverride: number | null = null;
  /** scratch for the starter check (the lot's box, the props found); the planner's last building refresh (ms) and the timer of the town's lot refresh */
  private lotBox: BBox = [0, 0, 0, 0]; private lotHits = new Set<Prop>(); private blocksAt = -Infinity; private lotBlocksTimer = 0;
  private raf = 0; private last = 0;
  private mask: OffscreenCanvas | null = null;
  /** Natural hazards and recurring monster nights; the settings preference survives reloads. */
  disastersEnabled = true;
  setDisasters(on: boolean) {
    this.disastersEnabled = on; this.traffic.disastersOn(on);
    try { localStorage.setItem('capitalempire.disasters', String(on)); } catch { /* storage may be unavailable */ }
    this.emit();
  }

  /** the night (night-light.ts: TrickOrTreat's moonlight and light pools): the owner's settings, which survive reloads */
  night: NightSettings = clampNight(null);
  private nightRenderer = new NightRenderer();
  /** the lights of the props round the view, in world px (placed on screen every frame), and what they were gathered for */
  private nightLights: NightLight[] = []; private nightKey = ''; private nightAt = -Infinity;
  setNight(n: Partial<NightSettings>) {
    this.night = clampNight({ ...this.night, ...n, types: { ...this.night.types, ...n.types } }); this.nightKey = '';
    try { localStorage.setItem('capitalempire.night', JSON.stringify(this.night)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** the night the player skipped (Skip night: its day, nightDay), which stays light */
  private skippedNight = NaN;
  /** how dark the clock's night is now (0 day .. 1 night; 0 on the days between nights and on a skipped night) */
  clockNight(): number {
    const c = this.clock(), h = c.hour + c.minute / 60, n = nightAt(this.night, h, c.day);
    return n > 0 && this.night.mode === 'clock' && nightDay(this.night, h, c.day) === this.skippedNight ? 0 : n;
  }
  /** Skip night (the HUD button while it is dark by the clock): daylight until the next night; the sim's clock runs on as it was */
  skipNight() {
    const c = this.clock(); this.skippedNight = nightDay(this.night, c.hour + c.minute / 60, c.day); this.nightKey = ''; this.emit();
  }
  /** how dark it is now (0 day .. 1 night): the clock's night */
  nightAmount() {
    return this.clockNight();
  }
  /** the night pass over the finished frame: the lights of the props in view (gathered again when the camera, the props or the settings
   *  change, at most every quarter second), then the moonlight */
  private drawNight(ctx: CanvasRenderingContext2D, now: number) {
    const amount = this.nightAmount(); if (!(amount > 0)) return;
    const ze = this.cam.z * this.dpr, W = ctx.canvas.width, H = ctx.canvas.height;
    // gathered over three screens round the view, again once the view has moved a screen, zoomed, or the props or settings changed
    const hw = W / ze, hh = H / ze, key = `${Math.round(this.cam.X / hw)},${Math.round(this.cam.Y / hh)},${Math.round(Math.log2(ze) * 4)},${W},${H},${this.props.size}`;
    if (key !== this.nightKey && (now - this.nightAt > 150 || !this.nightLights.length)) {
      this.nightKey = key; this.nightAt = now; const out: NightLight[] = [], world = (x: number, y: number) => ({ x: worldX(x, y), y: worldY(x, y) });
      for (const p of this.props) {
        const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, X = worldX(cx, cy), Y = worldY(cx, cy);
        if (Math.abs(X - this.cam.X) > 1.5 * hw || Math.abs(Y - this.cam.Y) > 1.5 * hh) continue;
        // the new-art pictures (the default, and ?newart) light the picture they draw (newart.ts): a hidden building lights nothing
        const l = lookOf(p); if (l.hidden) continue; const q = l === p ? p : { ...p, ...l }, it = LIBRARY[q.item]; if (it) propLights(q, it, this.night, world, 1, out);
      }
      this.nightLights = out;
    }
    const ox = this.cw / 2 - this.cam.X * ze, oy = this.ch / 2 - this.cam.Y * ze;
    const placed = this.nightLights.map(l => ({ ...l, sx: l.sx * ze + ox, sy: l.sy * ze + oy, rx: l.rx * ze, ry: l.ry * ze }));
    const lights = placed;
    this.nightRenderer.apply(ctx, this.canvas, this.night, amount, lights);
  }

  /** the cast shadows (cast-shadow.ts): cast-shadow.json, as the baked lots have them, or the owner's tweak in the gear menu (survives reloads) */
  cast: CastShadow = CAST;
  setCast(c: Partial<CastShadow>) {
    this.cast = clampCast({ ...this.cast, ...c });
    try { localStorage.setItem('capitalempire.cast', JSON.stringify(this.cast)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** T226 (grade.ts): the golden-hour colour grade (the gear menu's Colour grade: on or off, its strength 0..150%, the edge blur), remembered.
   *  The plain game only: a light boot (the lot lab) draws its scene ungraded, as before (its exam shots compare lots across the screen) */
  grade: GradeSettings = loadGrade(storageOf());
  setGrade(p: Partial<GradeSettings>) {
    const was = this.grade; this.grade = clampGrade({ ...this.grade, ...p }); saveGrade(storageOf(), this.grade);
    // (the targets go when their switch does: the scene target with the grade, the half-size pair with the edge blur)
    if (was.on && !this.grade.on) this.gl.releaseGrade(); else if (was.edgeBlur && !this.grade.edgeBlur) this.gl.releaseGrade(true);
    this.emit();
  }
  /** the contact shadows' darkness (shadow-shape.ts; 1 = TrickOrTreat's builder, 0 = none); the settings preference survives reloads */
  shadowStrength = 1.1;
  setShadowStrength(v: number) {
    this.shadowStrength = Math.max(0, Math.min(2, v));
    try { localStorage.setItem('capitalempire.shadows', String(this.shadowStrength)); } catch { /* storage may be unavailable */ }
    this.emit();
  }
  /** the hand-drawn vector shadows (T142, shadow-vector.ts): on, every picture with a drawn shape casts it; off, T141's rule shapes and
   *  silhouettes everywhere (the gear menu's comparison); survives reloads */
  vectorShadows = true;
  setVectorShadows(on: boolean) {
    this.vectorShadows = VECTOR.on = on;
    try { localStorage.setItem('capitalempire.vectorShadows', on ? '1' : '0'); } catch { /* storage may be unavailable */ }
    this.sprites.repack(); this.emit();
  }
  /** the ground art: 'painted', the hand-painted families on every surface (painted-surfaces.ts; the owner, 2026-10-25: "i dont want to see
   *  old textures anymore"), always; 'photo', the photo and procedural textures the game had before, only for comparisons on the dev server
   *  (?grass=photo, or window.__game.setGrassArt('photo') from the console); nothing the player sees offers it, and nothing remembers it */
  grassArt: GrassArt = clampGrassArt(null);
  setGrassArt(v: GrassArt) {
    this.grassArt = clampGrassArt(v);
    this.ground.setGrassArt(this.grassArt);
    this.emit();
  }

  /** boot: what this engine boots with (boot.ts): the plain game's (GAME_BOOT), or a light boot (the lot lab's, T157: dev/lab-boot.ts) */
  constructor(public canvas: HTMLCanvasElement, public overlay: HTMLCanvasElement, readonly boot: Readonly<BootOptions> = GAME_BOOT) {
    this.gl = new GLRenderer(canvas);
    this.ov = overlay.getContext('2d')!;
    this.paint.puckCursor = true;
    this.net.paintData = false;
    this.ground = new GroundCache(this.gl, boot.groundWorkers ?? undefined);
    this.ground.budgetPx = boot.groundPx;
    if (boot.tileMB != null) this.ground.tileBytes = Math.round(boot.tileMB * 1e6); // (T272: a dev build's ?boot=tileMB:N, MB as groundPx's)
    // the ground workers' limits and levers (T157 the lab's; T166 the game's too: its workers make their textures on first use)
    this.ground.limits = { tiles: boot.tileSources, painted: boot.paintedSources, eager: boot.eagerPhotos ? [...boot.eagerPhotos] : null, saveCache: boot.saveTextureCache, readCache: boot.readTextureCache, soft: boot.softCanvases, lazy: boot.lazyTextures, tints: boot.lazyTints };
    this.traffic = new SimClient(boot.sim);
    try { this.disastersEnabled = localStorage.getItem('capitalempire.disasters') !== 'false'; } catch { /* default on */ }
    try { this.showStandIns = localStorage.getItem('capitalempire.standins') !== 'false'; } catch { /* default on */ }
    try { this.showMoneyFloats = localStorage.getItem('capitalempire.moneyFloats') !== 'false'; } catch { /* default on */ }
    if (!boot.moneyFloats) this.showMoneyFloats = false;
    // T147: the money floats' sources: every spend (placed ones float), the range's sales and lost golfers
    this.traffic.onSpend = (k, n) => this.spent(k, n);
    // T090: a range start's town success after a tournament, kept in the save (sent back with the golf state on load)
    this.traffic.onTownBoost = v => { if (this.golf?.start === 'range') { this.golf.townBoost = v; this.scheduleSave(); } };
    this.range.sim.onMoney = e => { const c = this.range.scene?.counter, f = rangeFloat(e, c ?? null); if (f) this.floatMoney(f); };
    try { const v = parseFloat(localStorage.getItem('capitalempire.shadows') ?? ''); if (Number.isFinite(v)) this.shadowStrength = Math.max(0, Math.min(2, v)); } catch { /* default 1.1 */ }
    try { this.vectorShadows = VECTOR.on = localStorage.getItem('capitalempire.vectorShadows') !== '0'; } catch { /* default on */ }
    this.gl.initVector(vectorMeshData()); releaseVectorMeshData(); // T172: the mesh's data is on the GPU now
    try { localStorage.removeItem('capitalempire.grassArt'); } catch { /* the old gear menu's Grass setting: gone, the painted art always */ }
    this.grassArt = import.meta.env.DEV && new URLSearchParams(location.search).get('grass') === 'photo' ? 'photo' : 'painted';
    this.ground.grassArt = this.grassArt;
    // T262: the grass shine's look as the player left it (the gear menu's Grass shine; on by default), and ?grassShine=off|on (the dev server:
    // the bench's before and after)
    // (SHINE_KEY v2: the softer look after the owner's tees, 2026-10-28; a look saved before it is dropped, so the new defaults reach everyone)
    try { localStorage.removeItem('capitalempire.grassShine'); const s = localStorage.getItem(SHINE_KEY); if (s) this.shine = clampShineLook(JSON.parse(s)); } catch { /* the default look */ }
    { const q = new URLSearchParams(location.search).get('grassShine'); if (import.meta.env.DEV && (q === 'on' || q === 'off')) this.shine = { ...this.shine, on: q === 'on' }; }
    this.ground.grassShine = this.shine.on; this.ground.shineWeights = { ...this.shine.weights };
    // T248: the water's motion as the player left it (the gear menu's Water motion; on by default), and ?waterMotion=off|on (the dev server)
    try { const s = localStorage.getItem(WATER_MOTION_KEY); if (s) this.waterLook = clampWaterMotion(JSON.parse(s)); } catch { /* the default look */ }
    { const q = new URLSearchParams(location.search).get('waterMotion'); if (import.meta.env.DEV && (q === 'on' || q === 'off')) this.waterLook = { ...this.waterLook, on: q === 'on' }; }
    this.ground.waterMotion = this.waterLook.on;
    try { this.groundVariety = localStorage.getItem('capitalempire.groundVariety') !== '0'; } catch { /* the default, on */ }
    this.ground.living = { on: this.groundVariety, debug: false };
    try { const v = parseFloat(localStorage.getItem('capitalempire.slopeLight') ?? ''); if (Number.isFinite(v)) this.slopeLight = clampHeightLight(v); } catch { /* light.json's */ }
    this.ground.slopeLight = this.slopeLight;
    try { const v = parseFloat(localStorage.getItem('capitalempire.leafDensity') ?? ''); if (Number.isFinite(v)) this.leafDensity = clampLeafDensity(v); } catch { /* the default */ }
    this.ground.leafDensity = this.leafDensity;
    this.unfinish?.(); this.unfinish = this.watchFinish();
    try { const v = parseFloat(localStorage.getItem('capitalempire.roughYards') ?? ''); if (Number.isFinite(v)) this.roughYards = clampRoughYards(v); } catch { /* the default */ }
    try { const n = localStorage.getItem('capitalempire.night'); if (n) this.night = clampNight(JSON.parse(n)); } catch { /* the defaults */ }
    try { const d = JSON.parse(localStorage.getItem('capitalempire.townday') ?? 'null'); if (d && typeof d === 'object') this.townDay = { minutes: Math.min(30, Math.max(0.5, +d.minutes || 10)), traffic: Math.min(4, Math.max(0, Number.isFinite(+d.traffic) ? +d.traffic : 1)) }; } catch { /* the defaults */ }
    // T266 (#800): golf's pace, the gear menu's (remembered; watchable by default), or the dev server's ?golfPace=main|daynight|walk|long|mix for
    // the session (golf/pace.ts; long plays a longer town day, not remembered)
    try { this.golfPace = paceOfSetting(localStorage.getItem(PACE_KEY)); } catch { /* the default */ }
    { const q = import.meta.env.DEV ? paceOf(new URLSearchParams(location.search).get('golfPace')) : null; if (q) this.golfPace = q; }
    if (this.golfPace === 'long') this.townDay = { ...this.townDay, minutes: LONG_DAY_MIN };
    this.traffic.golfNight = dayNight(this.golfPace) ? NIGHT_S : null;
    this.traffic.setTownDay(this.townDay.minutes, this.townDay.traffic);
    try { const c = localStorage.getItem('capitalempire.cast'); if (c) this.cast = clampCast(JSON.parse(c)); } catch { /* cast-shadow.json */ }
    this.showGrid = loadMapGrid(storageOf(), import.meta.env.DEV, location.search);
    // the dev sandbox options (see sandboxGrow): the URL, else the defaults of the dev server or the build
    const q = new URLSearchParams(location.search), dev = import.meta.env.DEV;
    this.sandboxGrow = Number(q.get('grow') ?? 1) || 1; // the game's speed everywhere (the owner, 2026-10-27: the dev server's default of 20 grew the town too fast); ?grow=N still speeds it for tests
    this.startMode = q.get('start') === 'town' ? 'town' : q.get('start') === 'valley' ? 'valley' : 'range'; { const gb = Number(q.get('golfers')); if (import.meta.env.DEV && q.has('golfers') && gb >= 0) this.dayBusy = gb; const sd = Number(q.get('seed')); if (import.meta.env.DEV && sd > 0) this.devSeed = Math.floor(sd); if (import.meta.env.DEV && q.get('everyday') === '0') this.dayOff = true; if (import.meta.env.DEV && q.get('tourney') === '1') this.devTourney = true; } // T208: ?golfers=N, a busy everyday day; ?seed=N, the old start's map; ?everyday=0, no everyday golf (dev, the bench's before and after)
    this.stampOn = q.has('stamp') ? q.get('stamp') === '1' : !dev;
    this.sandboxMoney = q.has('money') ? q.get('money') === '1' : dev;
    // every road class, junction (the roundabout without its card), tunnel and signal tier open from the start (?unlock=0 plays the unlocks)
    this.sandboxUnlock = q.has('unlock') ? q.get('unlock') === '1' : dev;
    this.traffic.onGrow = (legs) => this.townGrow(legs);
    this.traffic.onTown = (events) => { for (const e of events) this.lotQueue.add(e.key); this.townFirsts(events); this.placesCheck(); this.roughCheck(); };
    // a lot whose road was widened (or narrowed) keeps its house but moves back to the new verge: composed again there, not left over the road
    this.traffic.onLotsMoved = (keys) => { for (const k of keys) this.lotQueue.add(k); };
    this.traffic.onLedger = (l) => {
      this.foundingSeasonEnd(l);
      // the range business's season closes with the books (P24, T129): the season card read it, the next season counts from zero
      if (this.golf?.range) rangeNewSeason(this.golf.range);
      if (this.bankrupt && this.traffic.budget.debtDays === DEBT_DAYS) { this.setSpeed(0); this.toast('Bankrupt: the town is out of money', 'warn'); }
      else if (this.bankrupt) { /* already bankrupt: the player keeps watching */ }
      else if (l.money < 0 && !this.traffic.unlimited) this.toast(`In the red: bankrupt in ${DEBT_DAYS - this.traffic.budget.debtDays} days unless the books recover`, 'warn');
      else this.toast(`Day ${l.day}: ${l.net >= 0 ? '+' : '−'}$${Math.abs(l.net).toLocaleString()}`, l.net >= 0 ? 'good' : 'info');
      this.scheduleSave(); this.emit();
    };
    if (NEW_ART_ONLY) setTimeout(() => this.toast('New-art preview: only the new four-view buildings and generated trees are drawn (?newart)', 'info'), 4000);
    else if (OLD_ART) setTimeout(() => this.toast('Old art: buildings without their four new views show their old pictures (?oldart)', 'info'), 4000);
    this.traffic.onDisasters = (notes) => { for (const n of notes) this.toast(disasterText(n), n.k === 'repaired' ? 'good' : n.k === 'ended' ? 'info' : 'warn'); };
    this.traffic.onMilestone = (newly, won) => {
      for (const m of newly) {
        const what = [...m.classes.map(id => classOf(id).name), ...m.junctions.map(id => JUNCTIONS.find(j => j.id === id)!.name), ...(m.tunnels ? ['tunnels'] : [])].join(', ');
        this.toast(`${m.name}${what ? `: ${what}` : ''}${m.grant ? `, grant $${m.grant.toLocaleString()}` : ''}`, 'good');
      }
      if (won) { this.showWin = true; this.toast(`${WIN_POP.toLocaleString()} residents: the Career is won`, 'good'); }
      this.scheduleSave(); this.emit();
    };
    this.traffic.onBiz = () => this.bizUnlocks();
  }
  get cls() { return classOf(this.roadClass); }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { for (const l of this.listeners) l(); }
  toast(text: string, kind: Toast['kind'] = 'info', scene?: SceneRef) {
    this.toasts.push({ id: this.toastId++, text, t: performance.now(), kind, ...(scene ? { scene } : {}) });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  async init(opts: { bench?: number } = {}) {
    const tick = (p: number) => { this.loadProgress = p; this.emit(); };
    if (opts.bench) this.disastersEnabled = false;
    if (opts.bench) { this.sandboxGrow = 1; this.stampOn = true; this.sandboxMoney = false; this.sandboxUnlock = false; }
    this.traffic.sandbox(this.sandboxGrow, this.sandboxMoney); // before the terrain: the city worker reads its options from the first messages
    this.resize();
    // the atlas within GAME-PLAN's GPU budget (T080, atlas-pages.ts): a coarse mip of every page resident, the finer mips streamed per cell
    // as the view needs them; mip 0 on every screen above 1x (sizes.ts atlasMip0: at the closest zoom a dpr-1.25 screen needs 0.375 device px
    // per display px, more than mip 1 holds; the owner, 2026-10-24: nothing painted blurry or pixelated)
    // the pages as GPU blocks (BC7 / ASTC / ETC2, transcoded from the build's KTX2) where the build has them and the GPU takes one, else RGBA8
    const ktx = ktx2Built() ? pickFormat(this.gl.gl) : null;
    const atlas = this.gl.initAtlas(this.dpr, ktx ? [ktx2Source(ATLAS_PAGES, ktx), webpSource(ATLAS_PAGES)] : [webpSource(ATLAS_PAGES)], this.boot.atlasMB, this.boot.atlasKeep);
    // the alpha for picking, from mip 2 (the old mip-1 images halved): no page kept decoded as an image
    this.pageAlpha = await Promise.all(ATLAS_PAGES.map(async row => {
      try {
        const b = await createImageBitmap(await (await fetch(row[2]!)).blob()), w = b.width, h = b.height, g = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
        g.drawImage(b, 0, 0); b.close();
        const rgba = g.getImageData(0, 0, w, h).data, bits = new Uint8Array((w * h + 7) >> 3);
        for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3]! > PICK_ALPHA) bits[i >> 3]! |= 1 << (i & 7);
        return { w, h, bits };
      } catch { return null; }
    }));
    tick(0.3);
    await atlas; this.perf.atlasMB = (this.gl.atlas?.bytes ?? 0) / 1048576; tick(0.5); if (this.dead) return;
    // a light boot without a save (the lot lab) never reads one and never writes one
    if (!this.boot.save) this.saveBlocked = true;
    // the dev-only ?fixture= save (T098, dev/fixtures.ts; ?fixture=range20: the range start's grown town at year 20, the course land empty and
    // green): loaded in place of the stored save, which is then neither read nor written over (saving is off). With ?bench, the grown-town scene
    const fixName = import.meta.env.DEV ? new URLSearchParams(location.search).get('fixture') : null;
    const fixture = import.meta.env.DEV && fixName ? await (await import('./dev/fixtures')).devFixture(fixName) : null; if (this.dead) return;
    if (fixName) this.saveBlocked = true;
    // the bench's game scenes (T098, bench.ts benchGame): ?bench&start=range tours a new range start, ?bench&fixture=range20 the grown town;
    // a plain ?bench builds the synthetic city. Neither scene ever saves
    const benchScene = !opts.bench ? null : fixture ? 'fixture' as const : new URLSearchParams(location.search).get('start') === 'range' ? 'range' as const : new URLSearchParams(location.search).get('start') === 'town' ? 'golf' as const : null;
    if (benchScene) { this.benchMode = true; this.saveBlocked = true; }
    const read = opts.bench || fixName || !this.boot.save ? null : await readSave(); if (this.dead) return;
    const save = fixture ?? read?.save ?? null;
    // T042: an unreadable save is kept as a backup (then a new game starts); if the backup failed, the slot is never written over
    let readNote: { text: string; kind: Toast['kind'] } | null = null;
    if (read && (read.status === 'future' || read.status === 'otherMap' || read.status === 'corrupt')) {
      if (!read.backedUp) { this.saveBlocked = true; readNote = { text: 'The save could not be read or backed up: saving is off for this session so it is not overwritten.', kind: 'warn' }; }
      else readNote = { text: read.status === 'future' ? `This save is from a newer build (v${read.version}). It is kept as a backup; a new game started.` : read.status === 'otherMap' ? 'This save is for another map size. It is kept as a backup; a new game started.' : 'The save could not be read. It is kept as a backup; a new game started.', kind: 'warn' };
    }
    // the store could not even be read: we cannot know what the slot holds, so never write over it (a private window cannot save anyway)
    if (read && read.status === 'none' && !read.backedUp) this.saveBlocked = true;
    let loaded: SaveV5 | null = null;
    if (opts.bench && !benchScene) { this.genTerrain(1); const { buildBenchmark } = await import('./bench'); buildBenchmark(this, opts.bench); }
    else if (this.boot.map === 'flat') { this.golf = null; this.useTerrain(flatTerrain(), 0); } // a light boot's flat map: no town, course or range
    else if (!save && this.newGame()) { /* a new golf game: the range start's road and range, or the old start's town and course (see newGame) */ }
    else if (!save || !this.load(save)) {
      // a save that read fine but failed to load: keep its bytes before the new game's autosave (T042), or never save over it
      if (save) { if (await backupTownSlot('loadfailed')) readNote = { text: 'The save could not be loaded. It is kept as a backup; a new game started.', kind: 'warn' }; else { this.saveBlocked = true; readNote = { text: 'The save could not be loaded or backed up: saving is off for this session so it is not overwritten.', kind: 'warn' }; } if (this.dead) return; }
      setLotModel(LATEST_LOT_MODEL); this.farmModel = FARM_MODEL; this.farmsNew.clear(); this.golf = null; this.genTerrain(newSeed()); this.seedTowns();
    }
    else loaded = save;
    tick(0.7);
    const tl = performance.now();
    this.ground.init(this.terrain);
    this.sendTerrain(); this.afterLoad();
    if (import.meta.env.DEV && this.golf && new URLSearchParams(location.search).get('frame') === '1') this.frameAllHoles(true); // T229: ?frame=1, every hole framed (the bench's after)
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    if (loaded) {
      this.traffic.townState(loaded.lots ?? [], loaded.simT ?? 0, loaded.budget, loaded.money, loaded.career, loaded.shift ?? 0, loaded.round, loaded.bizStats); this.traffic.setTownClock(loaded.townClock ?? townClockFor(this.traffic.dayLen));
      // the tournament day under way at the save resumes (T209): the round in its surge or eval, its clocks, the crowd and the car parks (the worker checks it);
      // the sim waits at that moment until the day's play is built again (holdDay), so the field does not play on while the game boots
      if (loaded.tourney) { this.dayHold = { speed: this.speed || this.lastSpeed, at: 0 }; this.setSpeed(0); this.traffic.resumeDay(loaded.round, loaded.tourney); }
    }
    else this.rangeMorning();
    if (opts.bench) console.log('[bench] after load', Math.round(performance.now() - tl), 'ms');
    if (fixture && !opts.bench) readNote = { text: `Dev fixture ${fixName}: saving is off for this session, so your own save is kept.`, kind: 'info' };
    if (benchScene) { const { benchGame } = await import('./bench'); if (this.dead) return; benchGame(this, benchScene); }
    await new Promise<void>(res => { const wait = () => (this.ground.ready || this.dead ? res() : setTimeout(wait, 30)); wait(); });
    if (this.dead) return;
    this.ready = true; this.readyAt = performance.now(); tick(1);
    if (readNote) this.toast(readNote.text, readNote.kind);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  /** generate the valley for a seed (about 0.3–0.6 s) */
  private genTerrain(seed: number) { this.useTerrain(generateTerrain(seed), seed); }
  /** a map to play on (a generated valley, or a light boot's flat map), with the seed the save keeps */
  private useTerrain(t: Terrain, seed: number) {
    this.seed = seed; this.terrain = t;
    this.names = new Names(seed); this.townPts = townCentres(this.terrain); this.roadNames = new RoadNames(this.names, this.townPts);
    for (const ps of this.forest.values()) for (const p of ps) this.sprites.remove(p);
    this.forest.clear(); this.perf.forest = 0; this.slope = slopeField(this.terrain.height); this.clearing = makeNoise(this.terrain.seed ^ 0x5f0e);
    for (const ps of this.townTrees.values()) for (const p of ps) this.sprites.remove(p);
    this.townTrees.clear(); this.perf.townTrees = 0; this.townClump = makeNoise(this.terrain.seed ^ 0x7c1a); this.lotBoxes.clear(); this.paintBoxes.clear();
    this.belt = beltField(this.terrain.seed, this.terrain.waters); this.beltN.clear(); this.perf.belt = 0;
    this.ground.dropCasters('f:'); this.ground.dropCasters('t:');
  }
  /** a new game by the start mode (?start=): a range start, else (or with ?start=town) the old start; true when a golf game was laid. False
   *  (?start=valley, or no seed fits either) leaves the caller to make the classic valley */
  private newGame(): boolean {
    // a new town composes its house lots with the latest shipped lot model (T160; the save records it: lotModel)
    setLotModel(LATEST_LOT_MODEL);
    // T259: and its farms with the latest farm model (the save records it: farmModel)
    this.farmModel = FARM_MODEL; this.farmsNew.clear();
    if (this.startMode === 'valley') return false;
    return (this.startMode === 'range' && this.newRangeGame()) || this.newGolfGame();
  }
  /** a new range start (plan P22 2.1, golf/rangestart.ts): the first seed of up to 8 whose valley has a site. Lays the county road edge to edge
   *  (free town road segs, bridged over water) and the range's gravel drive, places the driving range (its front is the business) and its car
   *  park, and sets the golf state (start 'range', the exits). The camera goes to the range's hut at the street zoom and the Course tool opens.
   *  No town streets, lots, stamp, course or clubhouse: the town grows from its seed across the road. False, with nothing laid, when no seed fits */
  private newRangeGame(): boolean {
    for (let k = 0; k < 8; k++) {
      const seed = k === 0 && this.devSeed ? this.devSeed : newSeed(); // (T266: ?seed=N on the dev server, the same range start before and after)
      this.genTerrain(seed);
      const s = planRangeStart(this.terrain, seed);
      if (!s) continue;
      const { road, site } = s;
      this.townPts = [site.centre]; this.roadNames = new RoadNames(this.names, this.townPts);
      this.edit.addLegs(road.legs, CLASS.road, 0, road.kinds, true);
      this.edit.addLegs(site.drive, classOf('drive-gravel'), 0, undefined, true);
      const [fx, fy, fw, fh] = site.rangeFront, [px, py, pw, ph] = site.carpark;
      this.setBizDefs([{ id: 1, type: 'range', x: fx, y: fy, w: fw, h: fh }]);
      this.parkDefs = [{ id: 1, x: px, y: py, w: pw, h: ph, ground: 'dirt' }]; // T239: the car park starts as packed dirt
      // the ramp from the range to the first hole starts at the range card (P24 Phase 4a, T132)
      this.golf = s.save; this.golf.progress = { ...emptyProgress(), ramp: 0, guide: newRangeGuide() }; // T239: the guided build's card
      // the range business (P24, T129): the starting range (T239: the guided build: no walkway laid, the player lays its path; the practice area
      // beside the car park is land for sale until bought)
      // (T237: its plot set back from the road, its car park in the frontage strip that leaves)
      this.golf.range = { ...defaultRangeBiz(), setback: site.setback, lot: [px, py, pw, ph] };
      const pb = practiceArea(site.rangePlot, site.dir).box; this.golf.practiceLot = [Math.round(pb[0]), Math.round(pb[1]), Math.round(pb[2] - pb[0]), Math.round(pb[3] - pb[1])];
      const [hx, hy, hw, hh] = rangeLayout(site.rangePlot, site.dir).hut.rect, cx = hx + hw / 2, cy = hy + hh / 2;
      this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy); this.cam.z = RANGE_CAM_ZOOM;
      this.setTool(this.toolLock('course') ? 'select' : 'course'); // the range card first: Holes opens with the first upgrade (T132)
      return true;
    }
    console.warn('golf: none of 8 seeds has a range start; the old start instead');
    return false;
  }
  /** whether tile (x, y) lies on the driving range's plot (a range start's course keeps off it: the course grid's brushes refuse its cells) */
  private onRangePlot(x: number, y: number): boolean {
    const g = this.golf, d = g?.start === 'range' ? this.bizDefs.find(b => b.type === 'range') : undefined;
    if (!g || !d) return false;
    const [rx, ry, rw, rh] = plotOfFront([d.x, d.y, d.w, d.h], g.dir);
    return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
  }
  /** a new golf game (golf/start.ts): the first seed of up to 8 whose valley has a course beside its town. Lays the town's streets (its avenue and
   *  gravel, free town roads), the gravel drive, the camera on the centre, the clubhouse and car park, the course's paints and the golf state. False,
   *  with nothing laid, when no seed fits (the caller then makes a classic game). */
  private newGolfGame(): boolean {
    for (let k = 0; k < 8; k++) {
      const seed = k === 0 && this.devSeed ? this.devSeed : newSeed(); // (T208: ?seed=N, the bench's same map before and after)
      this.genTerrain(seed);
      const s = planGolfGame(this.terrain, seed);
      if (!s) continue;
      this.townPts = [s.centre]; this.roadNames = new RoadNames(this.names, this.townPts);
      const byClass = new Map<ClassId, Leg[]>();
      s.town.legs.forEach((l, i) => { const id = s.town.cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
      for (const [id, legs] of byClass) this.edit.addLegs(legs, classOf(id), 0, undefined, true);
      this.edit.addLegs(s.drive, classOf('drive-gravel'), 0, undefined, true);
      this.cam.X = worldX(s.centre.x, s.centre.y); this.cam.Y = worldY(s.centre.x, s.centre.y);
      if (this.stampOn) this.stampPending = true;
      const [vx, vy, vw, vh] = s.venue, [px, py, pw, ph] = s.carpark;
      this.setBizDefs([{ id: 1, type: 'clubhouse', x: vx, y: vy, w: vw, h: vh }]);
      this.parkDefs = [{ id: 1, x: px, y: py, w: pw, h: ph }];
      this.paint.load(s.paints.map((a, i) => toTuple({ id: i + 1, ...a })));
      this.golf = s.save; this.golf.progress = emptyProgress();
      for (const p of dressCourse(s.layout, seed)) {
      const i = LIB_INDEX.get(p.id);
      if (i !== undefined) {
      const prop = this.addProp(i, p.x, p.y, p.flip, p.scale);
      const pin = s.layout.pins.find(q => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
      if (pin && (p.id === PIN_RED_ID || p.id === PIN_YELLOW_ID)) {
      this.golfProps.set('pin:' + pin.hole, prop);
      } else {
      const tee = s.layout.tees.find(q => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
      if (tee) this.golfProps.set(`tee:${tee.hole}:${tee.kind}`, prop);
      }
      }
      }
      return true;
      }
      console.warn('golf: none of 8 seeds has a course beside its town; a classic game instead');
    return false;
  }
  dead = false;
  /** T227: stops watching the surfaces file for the course finish's collar widths */
  private unfinish: (() => void) | null = null;
  destroy() { this.dead = true; this.unfinish?.(); this.unfinish = null; cancelAnimationFrame(this.raf); clearTimeout(this.saveTimer); clearTimeout(this.blocksTimer); clearTimeout(this.lotBlocksTimer); this.ground.terminate(); this.traffic?.terminate(); this.contour.terminate(); this.areaWorker.terminate(); }

  // ---------- geometry helpers ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.cw = Math.max(1, Math.round(r.width * this.dpr)); this.ch = Math.max(1, Math.round(r.height * this.dpr));
    for (const c of [this.canvas, this.overlay]) if (c.width !== this.cw || c.height !== this.ch) { c.width = this.cw; c.height = this.ch; }
  }
  tileAt(mx: number, my: number) {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    return tileOf(X, Y);
  }
  screen(x: number, y: number) {
    const ze = this.cam.z * this.dpr;
    return { x: (worldX(x, y) - this.cam.X) * ze + this.cw / 2, y: (worldY(x, y) - this.cam.Y) * ze + this.ch / 2 };
  }
  setIso(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr;
    ctx.setTransform(HW * ze, HH * ze, -HW * ze, HH * ze, this.cw / 2 - this.cam.X * ze, this.ch / 2 - this.cam.Y * ze);
  }
  footprint(it: LibItem, x: number, y: number, flip: boolean, k: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of it.boxes) {
      const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
      x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
    }
    return { x0, y0, x1, y1 };
  }
  canPlace(it: LibItem, x: number, y: number, flip: boolean, k: number, ignore?: Prop): string {
    const f = this.footprint(it, x, y, flip, k);
    if (f.x0 < 1 || f.y0 < 1 || f.x1 > MAP - 1 || f.y1 > MAP - 1) return 'Outside the town limits';
    for (let y = Math.floor(f.y0); y < Math.ceil(f.y1); y++) for (let x = Math.floor(f.x0); x < Math.ceil(f.x1); x++) {
      const c = this.terrain.cls[y * MAP + x]; if (c === TC.WATER || c === TC.CREEK || c === TC.BANK) return 'Not on water';
    }
    const occ = this.net.rectOcc(f.x0 + 0.08, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08);
    if (it.kind === 'car') { if (occ === 3) return 'Not on the median'; }
    else if (it.big) { if (occ) return 'Keep buildings off the road and sidewalk'; }
    else if (occ === 2) return 'Not on the asphalt';
    for (const p of this.propGrid.query([f.x0, f.y0, f.x1, f.y1])) {
      if (p === ignore) continue;
      const pit = LIBRARY[p.item];
      if (!(it.big || pit.big)) continue;
      if (f.x0 < p.x1 - 0.05 && f.x1 > p.x0 + 0.05 && f.y0 < p.y1 - 0.05 && f.y1 > p.y0 + 0.05) return 'Overlaps ' + pit.name;
    }
    return '';
  }
  /** places a golf hole's props (golf/holepreset.ts): a flag, trees, bushes and flowers from the library, picked and turned and sized by a seeded rnd; a prop that cannot be placed is skipped. Returns how many were placed */
  placePresetProps(ps: PresetProp[], seed: number): number {
    const trees = LIBRARY.flatMap((it, i) => it.kind === 'tree' && !/dead/.test(it.id) ? [i] : []), bushes = LIBRARY.flatMap((it, i) => it.kind === 'bush' ? [i] : []);
    const flowers = ['town:hydrangea', 'town:fern', 'town:ornamental_grass'].flatMap(id => LIB_INDEX.get(id) ?? []);
    const flag = LIB_INDEX.get(PIN_RED_ID);
    const rnd = mulberry(seed * 7919); let n = 0;
    for (const q of ps) {
      if (q.id !== undefined) {
        const i = LIB_INDEX.get(q.id); if (i === undefined) continue;
        const flip = q.flip ?? false, scale = q.scale ?? (OWNER_SCALE[q.id] ?? 1);
        if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
        this.addProp(i, q.x, q.y, flip, scale); n++; continue;
      }
      const pool = q.kind === 'tree' ? trees : q.kind === 'bush' ? bushes : q.kind === 'flower' ? flowers : flag === undefined ? [] : [flag];
      if (!pool.length) continue;
      const i = pool[Math.floor(rnd() * pool.length)]!, flip = q.kind === 'flag' ? false : rnd() < 0.5;
      const scale = q.kind === 'flag' ? OWNER_SCALE[LIBRARY[i]!.id] ?? MARKER_SCALE.pin : (OWNER_SCALE[LIBRARY[i]!.id] ?? 1) * (0.9 + 0.2 * rnd());
      if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
      this.addProp(i, q.x, q.y, flip, scale); n++;
    }
    this.scheduleSave(); return n;
  }
  /** a plant brush dab (paint-tool.ts, plant.ts): sprites from ids at the candidate spots of the circle, each at least 0.9 x spacing from
   *  every prop (planted, lot, town or forest) and where canPlace allows; sized lo..hi times the sprite's map scale; free, like Paint. Returns how many */
  plantProps(ids: string[], x: number, y: number, r: number, spacing: number, size: [number, number], seed: number): number {
    const pool = ids.flatMap(id => LIB_INDEX.get(id) ?? []); if (!pool.length) return 0;
    const rnd = mulberry(seed * 7919 + 13), s2 = (0.9 * spacing) ** 2; let n = 0;
    for (const q of plantPoints(x, y, r, spacing, seed)) {
      if (q.x < 1 || q.y < 1 || q.x > MAP - 1 || q.y > MAP - 1) continue;
      let near = false;
      for (const p of this.propGrid.query([q.x - spacing, q.y - spacing, q.x + spacing, q.y + spacing])) if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 < s2) { near = true; break; }
      if (near) continue;
      // never bigger than the picture's pixels allow (newart.ts maxDrawScale), so a plant's footprint is its picture's
      const i = pool[Math.floor(rnd() * pool.length)]!, flip = rnd() < 0.5, scale = Math.min(maxDrawScale(i), (OWNER_SCALE[LIBRARY[i]!.id] ?? 1) * (size[0] + (size[1] - size[0]) * rnd()));
      if (this.canPlace(LIBRARY[i]!, q.x, q.y, flip, scale)) continue;
      this.addProp(i, q.x, q.y, flip, scale).plant = 1; n++;
    }
    if (n) this.scheduleSave(); return n;
  }
  /** the sprites a plant brush can use (the Paint panel's picks) */
  plantPool(kind: PlantBrushKind) { return plantPool(LIBRARY, kind); }
  /** how many props the plant brushes have placed */
  plantedCount() { let n = 0; for (const p of this.props) if (p.plant) n++; return n; }
  /** the plant brush's Rub out: removes the props placed by a plant brush (Prop.plant) whose anchor is inside the circle; never other props. Returns how many */
  unplantProps(x: number, y: number, r: number): number {
    let n = 0;
    for (const p of [...this.propGrid.query([x - r, y - r, x + r, y + r])]) if (p.plant && (p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) { this.removeProp(p); n++; }
    if (n) this.scheduleSave(); return n;
  }
  /** o (T133, the range's scene): lift, drawn this high above its spot (world px); foot, its footprint (world tiles x0 y0 x1 y1) in place of its
   *  library boxes' (business art's boxes are 1 x 1 placeholders, too small for the painter's order of what stands round it); own (T257): a
   *  Props tool prop */
  addProp(item: number, x: number, y: number, flip: boolean, scale: number, auto?: string, o?: { lift?: number; foot?: readonly [number, number, number, number]; own?: boolean }): Prop {
    // no building is ever mirrored (mirror.ts): a flip draws the four-view art turned (its partner view), any other building unflipped
    const [id, f0] = drawnAs(LIBRARY[item]!, flip); if (id !== LIBRARY[item]!.id) item = LIB_INDEX.get(id) ?? item; flip = f0;
    // no tree is mirrored at random: the sun comes from the right, so a tree is drawn mirrored only when its art is lit from the left (tree-sun.ts);
    // a Props tool tree too (the owner, 2026-10-28: "make sure we never mirror a bush or tree or plant. always sun from top right")
    if (LIBRARY[item]!.kind === 'tree') flip = TREE_MIRROR.has(LIBRARY[item]!.id);
    const f = o?.foot ? { x0: o.foot[0], y0: o.foot[1], x1: o.foot[2], y1: o.foot[3] } : this.footprint(LIBRARY[item], x, y, flip, scale);
    const p: Prop = { uid: this.nextUid++, item, x, y, flip, scale, ...f };
    if (auto) p.auto = auto;
    if (o?.lift) p.lift = o.lift; // drawn above its spot (T133: the range's upper deck)
    if (bodyOf(item) >= 0) p.paint = paintAt(x, y); // a car's paint from where it stands (T228, car-paint.ts: a bay or a lot's spot keeps its colour)
    this.props.add(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.add(p); this.casterTouched(p);
    if (this.propLog) this.propLog.added.push(p);
    if (LIBRARY[item].kind === 'lamp') this.lampProps.add(p);
    if (LIBRARY[item].kind === 'fountain') this.fountainProps.add(p); // T231: the jets loop their frames (animateFountains)
    if (LIBRARY[item].big && LIBRARY[item].kind !== 'car') this.scheduleBlocks(isLotProp(p)); // cars are not building blocks (sendBlocks skips them)
    return p;
  }
  removeProp(p: Prop) {
    if (!this.props.delete(p)) return;
    if (this.propLog) { const k = this.propLog.added.indexOf(p); if (k >= 0) this.propLog.added.splice(k, 1); else this.propLog.removed.push(p); }
    this.propGrid.remove(p); this.sprites.remove(p); this.lampProps.delete(p); this.fountainProps.delete(p); this.casterTouched(p);
    if (p.auto) this.autoByKey.delete(p.auto);
    if (this.selected === p) this.selected = null;
    if (LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car') this.scheduleBlocks(isLotProp(p));
  }
  /** after moving, flipping or scaling a prop */
  /** plant the forest and town-tree cells near the view (world px rectangle, grown by g tiles): nearest to the view centre first, at most two
   *  cells per frame (forest and town together). A town cell has key + N * N (N cells a side) */
  private plantForest(X0: number, Y0: number, X1: number, Y1: number, g = FOREST_VIEW_MARGIN) {
    const N = MAP / FOREST_CELL, NN = N * N, [ci0, cj0, ci1, cj1] = forestCellRange(X0, Y0, X1, Y1, g);
    let todo: number[] | null = null; this.perf.plantMs = 0;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const key = cj * N + ci;
      if (!this.forest.has(key)) { if (!todo) todo = []; todo.push(key); }
      if (!this.townTrees.has(key)) { if (!todo) todo = []; todo.push(key + NN); }
    }
    if (!todo) return;
    // a light boot (the lot lab, T157) plants no forest or town trees, its map is plain grass: the cells are planted empty, at once (the
    // living ground bakes a chunk only once the cells round it are planted: casterReady)
    if (!this.boot.trees) { for (const q of todo) { if (q >= NN) this.townTrees.set(q % NN, []); else this.forest.set(q, []); } return; }
    const m = tileOf((X0 + X1) / 2, (Y0 + Y1) / 2), mx = clamp(Math.floor(m.x / FOREST_CELL), 0, N - 1), my = clamp(Math.floor(m.y / FOREST_CELL), 0, N - 1);
    const dd = (q: number) => { const k = q % NN; return ((k % N) - mx) ** 2 + (Math.floor(k / N) - my) ** 2; };
    todo.sort((p, q) => dd(p) - dd(q));
    const t0 = performance.now();
    for (let k = 0; k < Math.min(2, todo.length); k++) {
      if (k > 0 && performance.now() - t0 > PLANT_FRAME_MS) break; // (T265: a second cell only while the frame's planting is short: no two heavy cells in one frame)
      const q = todo[k]!, key = q % NN;
      if (q >= NN) this.plantTownCell(key, key % N, Math.floor(key / N)); else this.plantCell(key, key % N, Math.floor(key / N));
    }
    this.perf.plantMs = performance.now() - t0; // (T265: the bench's hitch check)
  }
  /** plant one forest cell as sprites (not props: no selection, bulldozing or saving), without the trees on or beside anything built (T025b) */
  private plantCell(key: number, ci: number, cj: number) {
    const { free } = this.treeClearance(ci, cj);
    const out = this.treeSprites(forestCell(this.terrain.seed, this.terrain.cls, this.terrain.height, this.slope, this.clearing, ci, cj).filter(t => free(t.x, t.y, 1)));
    // T265: the cell's belt along its rivers and creeks (river-trees.ts), cleared as the forest is (free, FOREST_CLEAR)
    const belt = this.beltOn && this.belt ? this.treeSprites(riverBeltCell(this.terrain.seed, this.terrain.cls, this.slope, this.belt, ci, cj, free, FOREST_CLEAR)) : [];
    if (belt.length) { out.push(...belt); this.beltN.set(key, belt.length); this.perf.belt += belt.length; }
    this.forest.set(key, out); this.perf.forest += out.length - belt.length; this.ground.casters([['f:' + key, this.casterRecs(out)]]);
  }
  /** T265: the belts (river-trees.ts) take the ground near the water: a town tree is not planted where the belt is thick (within BELT.full + 3
   *  tiles of the bank, outside its open stretches), so their trunks never stand in each other */
  private beltClaims(x: number, y: number): boolean {
    const f = this.belt; if (!this.beltOn || !f) return false;
    const q = f.water.nearest(f.water.near(x, y, x, y), x, y, { d: 0, kind: 0, nx: 0, ny: 0 });
    return q.d - (q.kind === 0 ? BELT.river.bank : BELT.creek.bank) < BELT.full + 3;
  }
  /** T265 (#794): the tree belts along the rivers and creeks on (the default) or off (the dev switch window.__game.setRiverTrees(false): the
   *  forest and the town trees as before): every planted cell is dropped and planted again as the camera reaches it */
  setRiverTrees(on: boolean) { if (on === this.beltOn) return; this.beltOn = on; this.dropTownTrees(0, 0, MAP, MAP); }
  get riverTrees() { return this.beltOn; }
  /** the sprites of planted trees (not props), skipping the ones in front of a tunnel mouth */
  private treeSprites(trees: ForestTree[]): Prop[] {
    const out: Prop[] = [];
    for (const tr of trees) {
      if (this.inPortal(tr.x, tr.y)) continue;
      let item = this.forestItem.get(tr.id);
      if (item === undefined) { item = LIBRARY.findIndex(i => i.id === tr.id); this.forestItem.set(tr.id, item); }
      if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], ax = tr.x - b.dx * tr.scale / 2, ay = tr.y - b.dy * tr.scale / 2, flip = TREE_MIRROR.has(it.id); // the sun from the right (tree-sun.ts)
      const p: Prop = { uid: this.nextUid++, item, x: ax, y: ay, flip, scale: tr.scale, ...this.footprint(it, ax, ay, flip, tr.scale) };
      this.sprites.add(p); out.push(p);
    }
    return out;
  }
  /** what keeps trees off the ground near cell (ci, cj), for the town trees and the forest alike (T025b): the lots near the cell, and free(x, y, r): no lot, road, business, car park, toll plaza, painted area or tunnel mouth within r tiles of (x, y) */
  private treeClearance(ci: number, cj: number): { lots: LotView[]; free: (x: number, y: number, r: number) => boolean } {
    const x0 = ci * FOREST_CELL, y0 = cj * FOREST_CELL, x1 = x0 + FOREST_CELL, y1 = y0 + FOREST_CELL, g = 30;
    const lots: LotView[] = [];
    for (const l of this.traffic.lots.values()) if (boxNear(lotBoxOf(l.o, l.u, l.n, l.w, l.d), x0, y0, x1, y1, g)) lots.push(l);
    const bizs = this.bizDefs.filter(d => boxNear([d.x, d.y, d.x + d.w, d.y + d.h], x0, y0, x1, y1, g));
    const parks = this.parkDefs.filter(d => boxNear([d.x, d.y, d.x + d.w, d.y + d.h], x0, y0, x1, y1, g));
    const tolls: [TollDef, Seg][] = [];
    for (const d of this.tollDefs) { const s = this.tollSegs.get(d.id); if (s && boxNear(tollBox(d), x0, y0, x1, y1, g)) tolls.push([d, s]); }
    const paints = this.paint.areas.filter(a => boxNear(ptsBox(a.pts), x0, y0, x1, y1, g));
    const cg = this.courseGrid, grid = !!cg && boxNear([cg.x0, cg.y0, cg.x0 + cg.w * CELL_T, cg.y0 + cg.h * CELL_T], x0, y0, x1, y1, g);
    const rb = this.range.scene?.box, pb = this.range.scene?.practice.box; // the driving range's plot and its practice area keep clear of trees (P24, T129, T130)
    const lab = this.labClear; // the lot lab's lot and street keep clear of trees (stageLab): only the lot's own art shows round its props
    const places = this.placeBoxes().filter(b => boxNear(b, x0, y0, x1, y1, g)); // T219: the iconic places keep clear of trees
    // T259: a model 2 farm keeps the river belts and the town trees off its land (its windbreak, orchard, fields and yard are its own planting)
    const farms: FarmParcel[] = []; for (const [k, f] of this.farmMap.farms) if (this.farmModelOf(k) === 2 && boxNear(parcelBox(f.p), x0, y0, x1, y1, g)) farms.push(f.p);
    // T229: a hole's frame trees (props): a planted tree keeps 2 tiles off them, so the woods never grow through a frame
    const frames: number[] = []; if (grid) for (const p of this.propGrid.query([x0 - g, y0 - g, x1 + g, y1 + g])) if (p.frame) frames.push(p.x, p.y);
    const free = (x: number, y: number, r: number) => {
      for (let k = 0; k < frames.length; k += 2) if ((frames[k]! - x) ** 2 + (frames[k + 1]! - y) ** 2 < (r + 2) ** 2) return false;
      for (const b of places) if (x > b[0]! - r && x < b[2]! + r && y > b[1]! - r && y < b[3]! + r) return false;
      if (lab && x > lab[0] - r && x < lab[2] + r && y > lab[1] - r && y < lab[3] + r) return false;
      if (rb && x > rb[0] - r && x < rb[2] + r && y > rb[1] - r && y < rb[3] + r) return false;
      if (pb && x > pb[0] - r && x < pb[2] + r && y > pb[1] - r && y < pb[3] + r) return false;
      for (const l of lots) if (lotGap(l, x, y) < r) return false;
      for (const f of farms) if (parcelGap(f, x, y) < r) return false;
      const p = { x, y };
      for (const s of this.net.segsNear(p, r + 16)) if (segDist(p, s) < s.cls.h + s.cls.walk + r + 0.5) return false;
      for (const d of bizs) if (x > d.x - r && x < d.x + d.w + r && y > d.y - r && y < d.y + d.h + r) return false;
      for (const d of parks) if (x > d.x - r - 1 && x < d.x + d.w + r + 1 && y > d.y - r - 1 && y < d.y + d.h + r + 1) return false;
      for (const [d, s] of tolls) { const f = plazaLocal(d, x, y); if (f.t >= -r && f.t <= PLAZA_LEN + r && f.o >= -s.cls.h - r && f.o <= plazaEdge(d.booths, laneOff(s, 0)) + r) return false; }
      if (paints.length) for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4; if (areaAt(paints, x + (k < 8 ? Math.cos(a) * r : 0), y + (k < 8 ? Math.sin(a) * r : 0))) return false; }
      if (grid && plantedTreeCleared((px, py) => this.courseSurfAt(px, py), x, y, r)) return false; // the course grid's cells (T176: the ghost reads the same rule)
      return !this.inPortal(x, y);
    };
    return { lots, free };
  }
  /** plant one town-tree cell as sprites: the predicates are built from the lots, roads, businesses, car parks, toll plazas, painted areas and portals near the cell */
  private plantTownCell(key: number, ci: number, cj: number) {
    const { lots, free } = this.treeClearance(ci, cj);
    const near = (x: number, y: number) => { if (this.beltClaims(x, y)) return false; for (const l of lots) if (lotGap(l, x, y) <= 24) return true; return false; };
    const out = this.treeSprites(townTreeCell(this.terrain.seed, this.terrain.cls, this.townClump, ci, cj, free, near));
    this.townTrees.set(key, out); this.perf.townTrees += out.length; this.ground.casters([['t:' + key, this.casterRecs(out)]]);
  }
  /** the town-tree and forest cells whose box (30 tiles around the cell) touches the box x0 y0 x1 y1 lose their trees: plantForest plants them again (around what was built) */
  private dropTownTrees(x0: number, y0: number, x1: number, y1: number) {
    const N = MAP / FOREST_CELL, g = 30;
    for (const [k, ps] of this.townTrees) {
      const ci = k % N, cj = Math.floor(k / N);
      if (!boxNear([x0, y0, x1, y1], ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, g)) continue;
      for (const p of ps) this.sprites.remove(p);
      this.perf.townTrees -= ps.length; this.townTrees.delete(k);
    }
    for (const [k, ps] of this.forest) {
      const ci = k % N, cj = Math.floor(k / N);
      if (!boxNear([x0, y0, x1, y1], ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, g)) continue;
      for (const p of ps) this.sprites.remove(p);
      const nb = this.beltN.get(k) ?? 0; this.perf.forest -= ps.length - nb; this.perf.belt -= nb; this.beltN.delete(k); this.forest.delete(k);
    }
  }
  /** a lot's rectangle changed (or went): the town trees around its old and new box are dropped (a change of level alone does not move the trees) */
  private townLotChanged(key: string, box: number[] | null) {
    const old = this.lotBoxes.get(key);
    if (old && box && old.every((v, i) => v === box[i])) return;
    if (old) this.dropTownTrees(old[0]!, old[1]!, old[2]!, old[3]!);
    if (box) { this.dropTownTrees(box[0]!, box[1]!, box[2]!, box[3]!); this.lotBoxes.set(key, box); } else this.lotBoxes.delete(key);
  }
  /** no trees in front of a tunnel mouth: a short strip out of the portal, as wide as its road plus margin */
  private inPortal(x: number, y: number): boolean {
    for (const p of this.portalPts) {
      const dx = x - p.x, dy = y - p.y, t = dx * p.dir.x + dy * p.dir.y, lat = Math.abs(-dx * p.dir.y + dy * p.dir.x);
      if (t > -6 && t < 8 && lat < p.hw + 3) return true;
    }
    return false;
  }
  /** after a network rebuild: the forest cells near a tunnel mouth (old or new) re-plant without the trees in the way */
  private syncPortals() {
    const ps = this.net.portals(), key = ps.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).sort().join(';');
    if (key === this.portalKey) return;
    const pts = [...this.portalPts, ...ps], N = MAP / FOREST_CELL, g = 14;
    for (const [k, trees] of this.forest) {
      const x0 = (k % N) * FOREST_CELL - g, y0 = Math.floor(k / N) * FOREST_CELL - g, x1 = x0 + FOREST_CELL + 2 * g, y1 = y0 + FOREST_CELL + 2 * g;
      if (!pts.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) continue;
      for (const p of trees) this.sprites.remove(p);
      this.perf.forest -= trees.length; this.forest.delete(k);
    }
    this.portalKey = key; this.portalPts = ps;
  }
  private propChanged(p: Prop) { const it = LIBRARY[p.item]; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, p.scale)); this.propGrid.remove(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.update(p); this.casterTouched(p); if (it.big) this.scheduleBlocks(); }

  // ---------- the living ground's casters (T111, living-ground.ts) ----------
  /** the props' caster cells (CASTER_CELL tiles a side) whose records the ground workers have not had yet, and the cell each prop was last sent in */
  private casterDirty = new Set<number>(); private propCasterCell = new WeakMap<Prop, number>();
  /** a prop was placed, moved or removed: the cells it was and is in send their casters again (only the props that cast: fences, hedges,
   *  walls, trees, bushes, buildings) */
  private casterTouched(p: Prop) {
    const it = LIBRARY[p.item]; if (!it || !casterKind(it)) return;
    const was = this.propCasterCell.get(p); if (was !== undefined) this.casterDirty.add(was);
    if (this.props.has(p)) { const c = casterCellOf((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2); this.casterDirty.add(c); this.propCasterCell.set(p, c); } else this.propCasterCell.delete(p);
  }
  /** the caster records of the given things (props, or the forest's and town's tree sprites) */
  private casterRecs(ps: Iterable<Prop>): Float32Array {
    const out: number[] = [];
    for (const p of ps) {
      const it = LIBRARY[p.item]; if (!it) continue;
      const kind = casterKind(it); if (!kind) continue;
      let x0 = p.x0, y0 = p.y0, x1 = p.x1, y1 = p.y1;
      // a baked lot casts from its house (its block), not from its whole lot
      if (it.block) { const b = it.block, f = p.flip, s = p.scale / 2, hx = (f ? b.hy : b.hx) * s, hy = (f ? b.hx : b.hy) * s, cx = p.x + (f ? b.dy : b.dx) * s, cy = p.y + (f ? b.dx : b.dy) * s; x0 = cx - hx; y0 = cy - hy; x1 = cx + hx; y1 = cy + hy; }
      const door = kind === CK.BUILDING ? doorToward(x0, y0, x1, y1, this.nearestRoad((x0 + x1) / 2, (y0 + y1) / 2, 18)) : null;
      casterOf({ kind: it.kind, id: it.id, cat: it.cat, big: it.big, x0, y0, x1, y1, across: pxAcross((it.quad[2] - it.quad[0]) * p.scale), door, conifer: CONIFER_IDS.has(it.id) }, out);
    }
    return new Float32Array(out);
  }
  /** the nearest point on a road's centre line within r tiles of (x, y), or null */
  private nearestRoad(x: number, y: number, r: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bd = r * r;
    for (const s of this.net.segsNear({ x, y }, r)) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / l2)) : 0, qx = s.a.x + dx * t, qy = s.a.y + dy * t, d2 = (qx - x) ** 2 + (qy - y) ** 2;
      if (d2 < bd) { bd = d2; best = { x: qx, y: qy }; }
    }
    return best;
  }
  /** one prop cell's casters to the ground (queued; sent at the next pump, before any chunk it asks for) */
  private flushCasterCell(c: number) {
    this.casterDirty.delete(c);
    const x0 = (c % CASTER_N) * CASTER_CELL, y0 = Math.floor(c / CASTER_N) * CASTER_CELL, mine: Prop[] = [];
    for (const p of this.propGrid.query([x0, y0, x0 + CASTER_CELL, y0 + CASTER_CELL])) if (this.propCasterCell.get(p) === c) mine.push(p);
    this.ground.casters([['p:' + c, this.casterRecs(mine)]]);
  }
  /** the dirty prop cells, a few milliseconds a frame (a chunk about to bake flushes its own first: casterReady) */
  private flushCasters(budgetMs = 3) {
    if (!this.casterDirty.size) return;
    const t0 = performance.now();
    for (const c of this.casterDirty) { this.flushCasterCell(c); if (performance.now() - t0 > budgetMs) break; }
  }
  /** a ground chunk may bake with the living ground: its prop cells are sent (sent now when dirty) and the forest and town-tree cells within reach
   *  are planted (plantForest plants them, nearest first, as far out as this reach: LIVING_PLANT_MARGIN), so it never bakes once without its
   *  trees and again with them */
  /** the zooms ahead of z that prebake readies (T197), nearest first: out to the planner map's switch (a zoom out uncovers ground round the
   *  view, and crosses into the district chunks), and one step in (the middle of the view at the next finer level) */
  static readonly PREBAKE_ZOOMS = [1 / 1.6, 1 / 3, 1 / 6, 1 / 10, 1.6];
  /** chunks prebake asks for at most at once (it asks again only when they are baked: GroundCache.idle) */
  static readonly PREBAKE_PER_FRAME = 3;
  /** prebake waits this long after the zoom last changed, ms */
  static readonly PREBAKE_SETTLE_MS = 350;
  /** the zoom prebake last saw, and the time before which it waits */
  private prebakeZ = 0; private prebakeHold = 0;
  /** T197 (the owner: "zooming in and out glitches the textures alot"): a zoom showed the planner map, a blurry low-detail picture, under every
   *  chunk it brought into view until that chunk baked (about half the frames of a zoom sweep, up to 120 chunks at once). While the view's
   *  ground is done (GroundCache.idle) the chunks of the views a zoom reaches next (PREBAKE_ZOOMS) are asked for at the lowest priority, a few
   *  a frame: the other tier's over the whole view there, this tier's only off the screen (a chunk on screen keeps its picture: one picture a
   *  chunk, so readying another level would blur it now). Their pictures count against the cache's pixel budget as any (evict: the least
   *  recently used go first) */
  private prebake(z: number, kind: 'g' | 'm' | 'p', X0: number, Y0: number, X1: number, Y1: number, now: number) {
    const cam = this.cam, view = { X: cam.X, Y: cam.Y, cw: this.cw, ch: this.ch, dpr: this.dpr, z, kind, box: [X0, Y0, X1, Y1] as const, band: this.tileBand };
    const levels = { levels: (zz: number) => grassZoomLevels(zz, this.dpr), spec: (zz: number, b: number | null) => tileSpec(nextBand(zz, b), this.dpr), zMin: PLANNER_Z, zMax: ZOOM_MAX, chunk: { g: [CHUNK_W, CHUNK_H] as [number, number], m: [MID_W, MID_H] as [number, number] } };
    const has = (k: 'g' | 'm', i: number, j: number) => { const t = this.ground.tile(k, i, j); return !!t.tex && !t.stale; };
    for (const p of prebakeTargets(view, levels, Game.PREBAKE_ZOOMS, has, Game.PREBAKE_PER_FRAME)) {
      const w = p.kind === 'm' ? MID_W : CHUNK_W, h = p.kind === 'm' ? MID_H : CHUNK_H;
      if (this.ground.castersUsed && !this.casterReady(p.i * w, p.j * h, (p.i + 1) * w, (p.j + 1) * h)) continue;
      this.ground.need(this.ground.tile(p.kind, p.i, p.j), p.L, p.pri, now, p.artL, p.ts);
    }
  }
  private casterReady(X0: number, Y0: number, X1: number, Y1: number): boolean {
    const a = tileOf(X0, Y0), b = tileOf(X1, Y0), c = tileOf(X0, Y1), d = tileOf(X1, Y1), g = CASTER_REACH;
    const tx0 = Math.min(a.x, b.x, c.x, d.x) - g, tx1 = Math.max(a.x, b.x, c.x, d.x) + g, ty0 = Math.min(a.y, b.y, c.y, d.y) - g, ty1 = Math.max(a.y, b.y, c.y, d.y) + g;
    if (this.casterDirty.size) for (let cy = clamp(Math.floor(ty0 / CASTER_CELL), 0, CASTER_N - 1); cy <= clamp(Math.floor(ty1 / CASTER_CELL), 0, CASTER_N - 1); cy++) for (let cx = clamp(Math.floor(tx0 / CASTER_CELL), 0, CASTER_N - 1); cx <= clamp(Math.floor(tx1 / CASTER_CELL), 0, CASTER_N - 1); cx++) { const k = cy * CASTER_N + cx; if (this.casterDirty.has(k)) this.flushCasterCell(k); }
    const N = MAP / FOREST_CELL, [ci0, cj0, ci1, cj1] = forestCellRange(X0, Y0, X1, Y1, g);
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) { const k = cj * N + ci; if (!this.forest.has(k) || !this.townTrees.has(k)) return false; }
    return true;
  }
  /** the living ground (T111): the gear menu's Ground variety (on by default, kept across reloads) and the dev debug view of its influence maps */
  groundVariety = true; groundDebug = false;
  setGroundVariety(on: boolean) {
    this.groundVariety = on;
    try { localStorage.setItem('capitalempire.groundVariety', on ? '1' : '0'); } catch { /* storage may be unavailable */ }
    this.ground.setLiving(on, this.groundDebug); this.emit();
  }
  setGroundDebug(on: boolean) { this.groundDebug = on; this.ground.setLiving(this.groundVariety, on); this.emit(); }
  /** the course height light's strength (T126): the gear menu's Slope light, 0 (off) to 2 (kept across reloads), else light.json's */
  slopeLight = HEIGHT_LIGHT_STRENGTH;
  setSlopeLight(v: number) {
    this.slopeLight = clampHeightLight(v);
    try { localStorage.setItem('capitalempire.slopeLight', String(this.slopeLight)); } catch { /* storage may be unavailable */ }
    this.ground.setSlopeLight(this.slopeLight); this.emit();
  }
  /** T220: the fallen leaves' density, the gear menu's Fallen leaves: 0 (none: the ground as before T220) to 2, 1 the default (kept across reloads) */
  leafDensity = LEAF_DENSITY_DEFAULT;
  setLeafDensity(v: number) {
    this.leafDensity = clampLeafDensity(v);
    try { localStorage.setItem('capitalempire.leafDensity', String(this.leafDensity)); } catch { /* storage may be unavailable */ }
    this.ground.setLeafDensity(this.leafDensity); this.emit();
  }
  /** T222: the share of the town's house lots that wear a rough yard (rough-yards.ts), the gear menu's Rough yards: 0 (all mown) to 2, 1 the
   *  default schedule (about 40% in a new town, falling to about 10% by 3,000 residents); kept across reloads */
  roughYards = ROUGH_YARDS_DEFAULT;
  setRoughYards(v: number) {
    this.roughYards = clampRoughYards(v);
    try { localStorage.setItem('capitalempire.roughYards', String(this.roughYards)); } catch { /* storage may be unavailable */ }
    this.roughCheck(true); this.emit();
  }
  /** each placed house lot's yard inputs and whether it is rough now (placeLot), to find the yards the share has crossed */
  private yardRough = new Map<string, { seed: number; home: boolean; state: PresetState | null; sig: string }>();
  /** the share (in hundredths) the yards were last checked at */
  private roughAt = -1;
  /** the town grew (or the knob moved): when the rough share has moved by a hundredth, the lots whose yard it crossed are composed again (a rough
   *  yard turns to lawn as the town grows, never back; their props are the same: compose draws from the lot's seed alone) */
  private roughCheck(force = false) {
    const q = Math.round(roughShare(this.traffic.pop, this.roughYards) * 100);
    if (!force && q === this.roughAt) return;
    this.roughAt = q;
    for (const [key, y] of this.yardRough) if (roughSig(roughYard(y.seed, y.home, y.state, this.traffic.pop, this.roughYards)) !== y.sig) this.lotQueue.add(key);
  }
  // ---------------------------------------------------------------- T231: the ponds' stone edges, lily pads and fountain jets (golf/ponds.ts)
  /** the fountain jets on the map (props of kind fountain) */
  private fountainProps = new Set<Prop>();
  /** what the laid edges were laid for (the course grid, the painted areas, the marks and the jets), and the frame count to the next look */
  private pondKey = ''; private pondTick = 0;
  /** the painted water areas (boxed) and the paint revision they were read at */
  private pondPaint: { rev: number; n: number; areas: { pts: number[]; b: [number, number, number, number] }[] } | null = null;
  /** still water on the ponds' 1 m lattice: the course's water cells and the painted water areas (the map's lakes and rivers are no pond) */
  private pondWet = (cx: number, cy: number): boolean => {
    const x = (cx + 0.5) * POND_CELL, y = (cy + 0.5) * POND_CELL, g = this.courseGrid;
    if (g) { const i = cellAt(g, x, y); if (i >= 0 && g.surf[i] === SURF.water) return true; }
    let pp = this.pondPaint;
    if (!pp || pp.rev !== this.paintRev || pp.n !== this.paint.areas.length) {
      const areas = this.paint.areas.filter(a => waterTex(a.tex)).map(a => { const b = ptsBox(a.pts); return { pts: a.pts, b: [b[0]!, b[1]!, b[2]!, b[3]!] as [number, number, number, number] }; });
      pp = this.pondPaint = { rev: this.paintRev, n: this.paint.areas.length, areas };
    }
    for (const a of pp.areas) if (x >= a.b[0] && x <= a.b[2] && y >= a.b[1] && y <= a.b[3] && inPoly(a.pts, x, y)) return true;
    return false;
  };
  /** sets the ponds' edge marks (the Props tool's Stone pond edge and Fountain pond; undo and redo): the edges are laid again */
  private setPondMarks(m: number[]) {
    if (!this.golf) return;
    const n = normalizePondMarks(m); if (n.length) this.golf.ponds = n; else delete this.golf.ponds;
    this.pondTick = Infinity; this.scheduleSave();
  }
  /** the Fountain pond's water at (x, y), r tiles round, inside the open undo step: the course's water cells on your land (the course grid),
   *  a painted water area in the town; false when nothing could be dug */
  private digPond(x: number, y: number, r: number, where: 'course' | 'town'): boolean {
    if (where === 'course') {
      if (!this.courseGrid) return false;
      let n = 0; const m = this.golfMonthIndex();
      this.paint.gridEdit('dig a pond', g => { const d = paintDisc(g, x, y, r, SURF.water, 0, m); n = d.n; return { diffs: [d], spent: 0 }; });
      return n > 0;
    }
    this.paint.addArea(discOutline(x, y, r), { tex: 'waterDark', border: 0, radius: 0 });
    return true;
  }
  /** once a frame: the edges are laid again when what they stand on changed (looked at every 15 frames), and the jets step their frames */
  private pondsFrame(now: number) {
    if (++this.pondTick >= 15) {
      this.pondTick = 0;
      const jets = [...this.fountainProps].map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join(';');
      const key = `${this.courseGrid?.rev ?? -1}|${this.paintRev}|${this.paint.areas.length}|${(this.golf?.ponds ?? []).join(',')}|${jets}`;
      if (key !== this.pondKey) { this.pondKey = key; this.layPonds(); }
    }
    this.animateFountains(now);
  }
  /** lays every stone-edged pond's stones and lily pads (auto props pond:..., never saved): the pieces whose key did not change stay, the
   *  others go or come; a pond with two marks is laid once */
  private layPonds() {
    const marks = this.golf?.ponds ?? [], want = new Map<string, PondPiece>(), seen = new Set<number>();
    const jets = [...this.fountainProps].map(p => ({ x: p.x, y: p.y }));
    for (let k = 0; k + 1 < marks.length; k += 2) {
      const pond: Pond | null = pondAt(marks[k]!, marks[k + 1]!, this.pondWet); if (!pond) continue;
      const id = pondId(pond); if (seen.has(id)) continue; seen.add(id);
      for (const q of [...shorePieces(pond), ...lilyPads(pond, jets)]) want.set(pieceKey(q), q);
    }
    for (const [key, p] of [...this.autoByKey]) if (key.startsWith('pond:') && !want.has(key)) this.removeProp(p);
    for (const [key, q] of want) {
      if (this.autoByKey.has(key)) continue;
      const item = LIB_INDEX.get(q.id); if (item === undefined) continue;
      this.autoByKey.set(key, this.addProp(item, q.x, q.y, false, q.s, key));
    }
  }
  /** the jets loop their four frames (each its own phase, so two side by side do not pulse together) */
  private animateFountains(now: number) {
    if (!this.fountainProps.size) return;
    const t = now / 1000;
    for (const p of this.fountainProps) {
      const item = LIB_INDEX.get(fountainAt(t, (p.uid * 5) % 4));
      if (item === undefined || item === p.item || fountainFrame(LIBRARY[p.item]!.id) < 0) continue;
      p.item = item; this.sprites.update(p);
    }
  }
  /** street lamps light the road: their reflection pools are part of the ground picture */
  syncLamps() {
    const pts = [...this.lampProps].map(p => ({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }));
    const changed = this.net.setLamps(pts);
    this.ground.lamps(new Float32Array(pts.flatMap(p => [p.x, p.y])));
    for (const b of changed) this.ground.invalidate(b, false, 0, 'gm');
  }
  /** a lot's ground patches (driveways, walks, car parks, yards); null drops them. Batched: the ground hears of them once per frame */
  setLotGround(key: string, patches: LotPatch[] | null) {
    const keep: string[] = [];
    for (let i = 0; i < (patches?.length ?? 0); i++) { const p = patches![i], surface = (p.paint || p.lawn) && grassSurface(p.tex, !!p.lawn, surfaceOfTex(p.tex as PaintTex)); if (!surface) continue; const id = `${key}/${i}`; keep.push(id); this.grass.register(id, p.pts, surface, /worn|dry/i.test(p.tex) ? 'stressed' : 'maintained'); }
    // a course chunk's turf (each grass surface's outer fill rings, at most 1,000 corners each) waits for courseGrass, a millisecond a frame
    if (key.startsWith('cg:')) this.grassWait.set(key, patches);
    else {
      for (const id of this.grassZones.get(key) ?? []) if (!keep.includes(id)) this.grass.remove(id);
      if (keep.length) this.grassZones.set(key, keep); else this.grassZones.delete(key);
    }
    this.lotStale.delete(key);
    if (key.startsWith('paint:')) this.paintChanged(key, patches);
    if (key.startsWith('curb:')) this.laybyChanged(key, patches);
    this.lotPending.set(key, patches);
  }
  /** a curb's lay-by quad went, came or changed: it is kept for placeLot, and its old and new outline (grown by a tile) marks the lots to compose again */
  private laybyChanged(key: string, patches: LotPatch[] | null) {
    const old = this.laybys.get(key), q = patches?.find(p => p.layby)?.pts;
    if (old) this.laybyDirty.push(this.grownBox(ptsBox(old)));
    if (q) { this.laybys.set(key, q); this.laybyDirty.push(this.grownBox(ptsBox(q))); } else this.laybys.delete(key);
  }
  /** a box grown by a tile on each side (a new array: the dirty list keeps it) */
  private grownBox(b: number[]): number[] { return [b[0]! - 1, b[1]! - 1, b[2]! + 1, b[3]! + 1]; }
  /** the lots whose box touches a changed lay-by are queued to compose again (one pass a frame that a lay-by changed; applyLotQueue does the rest) */
  private laybyLots() {
    const d = this.laybyDirty; if (!d.length) return;
    for (const [key, b] of this.lotBoxes) for (const e of d) if (b[0]! <= e[2]! && b[2]! >= e[0]! && b[1]! <= e[3]! && b[3]! >= e[1]!) { this.lotQueue.add(key); break; }
    d.length = 0;
  }
  /** a street prop stands in a lay-by's bays: its footprint centre (as addProp's footprint) lies inside a lay-by grown by LAYBY_PAD */
  private inLayby(item: number, q: Placed): boolean {
    if (!this.laybys.size) return false;
    const f = this.footprint(LIBRARY[item]!, q.x, q.y, q.flip, q.scale), cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
    for (const p of this.laybys.values()) if (inQuad(p, cx, cy, LAYBY_PAD)) return true;
    return false;
  }
  /** a painted area went or came: the town trees around its old and new outline are dropped */
  private paintChanged(key: string, patches: LotPatch[] | null) {
    const old = this.paintBoxes.get(key);
    if (old) this.dropTownTrees(old[0]!, old[1]!, old[2]!, old[3]!);
    if (patches?.length) { const b = ptsBox(patches[0]!.pts); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); this.paintBoxes.set(key, b); this.clearTreesOn(key); } else this.paintBoxes.delete(key);
  }
  /** the tree props standing on a painted playing surface go (the owner, 2026-10-24: trees stood in a freshly painted fairway and in a pond): the
   *  hole dressing's and the player's trees whose foot is inside a fairway, green, tee, collar, bunker or water area; the forest and town trees
   *  are kept off painted areas by treeClearance when dropTownTrees replants their cells */
  private clearTreesOn(key: string) {
    const a = this.paint.areas.find(q => 'paint:' + q.id === key); if (!a) return;
    const s = a.kind ?? surfaceOfTex(a.tex); if (!s || !PLAYING_SURFACES.has(s)) return; // its brush kind, else its texture's surface (a collar)
    const [x0, y0, x1, y1] = ptsBox(a.pts);
    for (const p of [...this.props]) {
      if (LIBRARY[p.item]?.kind !== 'tree') continue;
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && areaAt([a], cx, cy)) this.removeProp(p);
    }
  }
  private flushLotGround() { if (!this.lotPending.size) return; const t0 = performance.now(); const { set, drop } = lotBatch(this.lotPending); this.lotPending.clear(); this.ground.lotGround(set, drop, this.lotStale); this.lotStale = new Map(); this.perf.lotFlushMs = performance.now() - t0; }
  /** the town's lots: up to 40 queued keys a frame (more while the queue is over 2,000, up to 400), so a loaded city fills in */
  private applyLotQueue() {
    const q = this.lotQueue; if (!q.size) return;
    const n = q.size > 2000 ? Math.min(400, 40 + Math.ceil((q.size - 2000) / 4)) : 40;
    let k = 0;
    for (const key of q) { if (k++ >= n) break; q.delete(key); this.applyLot(key); }
  }
  /** a lot follows the town: composed from its town state; dropped when EMPTY, gone or holding a starter building (a staged lot is as it was staged) */
  private applyLot(key: string) {
    const st = this.staged.get(key);
    const v = st ? undefined : this.traffic.lots.get(key);
    this.townLotChanged(key, st ? lotBoxOf([st.g.o.x, st.g.o.y], [st.g.u.x, st.g.u.y], [st.g.n.x, st.g.n.y], st.g.w, st.g.d) : v ? lotBoxOf(v.o, v.u, v.n, v.w, v.d) : null);
    if (st) { this.placeLot(key, st.g, st.st); return; }
    if (!v) { this.dropLot(key); return; }
    const g: LotGeom = { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d };
    // an empty lot, or one a starter house stands on, keeps only its share of the fence grid (none on the golf land): a starter house's lot all
    // the lines it owns, an empty lot only those it shares with a lot that has a house
    const starter = v.level !== LV.EMPTY && this.starterIn(v);
    this.houseChanged(key, v, v.level >= LV.BUILT || starter);
    if (v.level === LV.EMPTY || starter) {
      if (this.onGolfLand(lotBoxOf(v.o, v.u, v.n, v.w, v.d)) || this.onPlace(lotBoxOf(v.o, v.u, v.n, v.w, v.d))) { this.dropLot(key); return; }
      const across = acrossLines(g), lines: FenceLines = starter ? { side: true, back: true } : { side: this.houseAt(across.side, key), back: !!across.back && this.houseAt(across.back, key) };
      if (lines.side || lines.back) this.placeFence(key, g, v.seed, lines); else this.dropLot(key);
      return;
    }
    this.placeLot(key, g, { use: v.use, level: v.level, decline: v.decline, seed: v.seed });
  }
  /** a lot's share of the fence grid alone (compose fenceOnly): panels that would stand in a building or another prop are left out */
  private placeFence(key: string, g: LotGeom, seed: number, lines: FenceLines) {
    this.dropLot(key);
    const ps: Prop[] = [];
    for (const q of fenceOnly(g, seed, lines).props) { const i = LIB_INDEX.get(q.id); if (i !== undefined && !this.canPlace(LIBRARY[i]!, q.x, q.y, q.flip, q.scale)) ps.push(this.addProp(i, q.x, q.y, q.flip, q.scale, 'lot:' + key)); }
    this.lotProps.set(key, ps); this.perf.lotProps += ps.length;
  }
  /** the lots with a house on them (built, or a starter house): an empty neighbour fences the line it shares with one */
  private houseLots = new Set<string>();
  /** is the point inside a lot (not `self`) that has a house on it (built, or a starter house) */
  private houseAt(p: { x: number; y: number }, self: string): boolean {
    for (const v of this.traffic.lots.values()) {
      if (v.key === self) continue;
      const rx = p.x - v.o[0], ry = p.y - v.o[1], a = rx * v.u[0] + ry * v.u[1], b = rx * v.n[0] + ry * v.n[1];
      if (a >= 0 && a <= v.w && b >= 0 && b <= v.d) return v.level >= LV.BUILT || (v.level !== LV.EMPTY && this.starterIn(v));
    }
    return false;
  }
  /** a lot got or lost its house: its empty neighbours (lots whose boxes touch its own) compose again, so their shared lines follow */
  private houseChanged(key: string, v: LotView, house: boolean) {
    if (house === this.houseLots.has(key)) return;
    if (house) this.houseLots.add(key); else this.houseLots.delete(key);
    const b = lotBoxOf(v.o, v.u, v.n, v.w, v.d);
    for (const w of this.traffic.lots.values()) {
      if (w.key === key || w.level !== LV.EMPTY) continue;
      const c = lotBoxOf(w.o, w.u, w.n, w.w, w.d);
      if (c[0]! <= b[2]! + 1 && c[2]! >= b[0]! - 1 && c[1]! <= b[3]! + 1 && c[3]! >= b[1]! - 1) this.lotQueue.add(w.key);
    }
  }
  /** a box (tiles [x0, y0, x1, y1]) that overlaps the golf land by more than half a tile */
  private onGolfLand(b: ArrayLike<number>): boolean {
    return this.golfLand().some(([x, y, w, h]) => Math.min(b[2]!, x + w) - Math.max(b[0]!, x) > 0.5 && Math.min(b[3]!, y + h) - Math.max(b[1]!, y) > 0.5);
  }
  /** a non-auto building (not a car) in the lot's box: the starter town's houses win over the lot */
  private starterIn(v: LotView): boolean {
    const x = v.o[0], y = v.o[1], ax = v.u[0] * v.w, ay = v.u[1] * v.w, bx = v.n[0] * v.d, by = v.n[1] * v.d, b = this.lotBox;
    b[0] = Math.min(x, x + ax, x + bx, x + ax + bx); b[1] = Math.min(y, y + ay, y + by, y + ay + by);
    b[2] = Math.max(x, x + ax, x + bx, x + ax + bx); b[3] = Math.max(y, y + ay, y + by, y + ay + by);
    this.lotHits.clear(); this.propGrid.query(b, this.lotHits);
    for (const p of this.lotHits) { const it = LIBRARY[p.item]; if (!p.auto && it.big && it.kind !== 'car') return true; }
    return false;
  }
  // ---------- T232: the player's land pegged out (lots/survey.ts; the concept: "bought land is bare dirt inside a white dashed line")
  /** the survey lines on the ground, by ground key ('survey:' + the plot), the signature they were laid for, and the frame count of the check */
  private surveyKeys = new Set<string>(); private surveySig = ''; private surveyTick = 0;
  /** the player's empty land pegged out until it is built on (checked twice a second, laid again only when something it reads changed): every
   *  block bought through Land for sale (T200: the parcels after the first, the start's land) with its survey line and its own ground; every town
   *  lot the bulldozer cleared on the player's land (golf.cleared) with the line and bare dirt (the Dirt surface). A cleared plot built on is
   *  done with (dropped from the save); a bought block shows its line again if all on it goes */
  private syncSurvey() {
    const g = this.golf;
    const sig = g ? `${(g.parcels ?? []).length}|${g.practiceLot ? 'p' : ''}|${(g.cleared ?? []).length}|${this.courseGrid?.rev ?? 0}|${this.paintRev}|${this.net.version}|${this.props.size}|${(g.structures ?? []).length}` : '';
    if (sig === this.surveySig) return;
    this.surveySig = sig;
    const want = new Map<string, LotPatch[]>();
    if (g) {
      // (adjacent empty blocks pegged out as one plot: surveyBlocks leaves out the sides they share)
      const empty = (g.parcels ?? []).slice(1).filter(r => !this.builtOn([r[0], r[1], r[0] + r[2], r[1] + r[3]]));
      for (const s of surveyBlocks(empty, LAND_SURVEY_INSET)) if (s) want.set(`survey:${s.lines!.join(',')}`, [s]);
      // T239: the practice area for sale is pegged out too (Land for sale shows its price)
      if (g.practiceLot) { const s = surveyPatch(rectPlot(g.practiceLot), LAND_SURVEY_INSET); if (s) want.set(`survey:practice:${g.practiceLot.join(',')}`, [s]); }
      if (g.cleared?.length) {
        g.cleared = g.cleared.filter(c => !this.builtOn(lotBoxOf([c[0]!, c[1]!], [c[2]!, c[3]!], [c[4]!, c[5]!], c[6]!, c[7]!)));
        for (const c of g.cleared) {
          const plot = { o: { x: c[0]!, y: c[1]! }, u: { x: c[2]!, y: c[3]! }, n: { x: c[4]!, y: c[5]! }, w: c[6]!, d: c[7]! }, s = surveyPatch(plot);
          const P = (a: number, b: number) => [plot.o.x + plot.u.x * a + plot.n.x * b, plot.o.y + plot.u.y * a + plot.n.y * b], e = 0.1;
          const dirt: LotPatch = { pts: [P(e, e), P(plot.w - e, e), P(plot.w - e, plot.d - e), P(e, plot.d - e)].flat(), tex: 'dirt' };
          want.set(`survey:c:${c.join(',')}`, s ? [dirt, s] : [dirt]);
        }
        if (!g.cleared.length) delete g.cleared;
      }
    }
    for (const k of this.surveyKeys) if (!want.has(k)) this.setLotGround(k, null);
    for (const [k, p] of want) if (!this.surveyKeys.has(k)) this.setLotGround(k, p);
    this.surveyKeys = new Set(want.keys());
  }
  /** whether the player has built anything on a box of its land (tiles x0 y0 x1 y1): a course surface in the grid, a painted area, a structure,
   *  a building of its own (a big prop that is no car), a road or cart path */
  private builtOn(b: readonly number[]): boolean {
    const [x0, y0, x1, y1] = b as [number, number, number, number], cg = this.courseGrid;
    if (cg) for (let y = y0 + 0.25; y < y1; y += 1) for (let x = x0 + 0.25; x < x1; x += 1) { const i = cellAt(cg, x, y); if (i >= 0 && cg.surf[i] !== SURF.none) return true; }
    for (const a of this.paint.areas) { const q = ptsBox(a.pts); if (q[0]! < x1 && q[2]! > x0 && q[1]! < y1 && q[3]! > y0) return true; }
    for (const s of this.golf?.structures ?? []) if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) return true;
    for (const p of this.propGrid.query([x0, y0, x1, y1])) { const it = LIBRARY[p.item]!; if (!p.auto && it.big && it.kind !== 'car') return true; }
    for (const s of this.net.segsNear({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, Math.hypot(x1 - x0, y1 - y0) / 2 + 2)) {
      for (let k = 0; k <= 8; k++) { const x = s.a.x + (s.b.x - s.a.x) * k / 8, y = s.a.y + (s.b.y - s.a.y) * k / 8; if (x > x0 && x < x1 && y > y0 && y < y1) return true; }
    }
    return false;
  }
  /** the road blocks' lawns on the ground (lawns.ts), by ground key ('lawn:' + block key), and the timer of the next sync after an edit */
  private blockLawns = new Set<string>(); private blockLawnTimer = 0;
  /** every road block gets its lawn (lawns.ts blockLawn): blocks that went lose theirs, new ones get one; a block whose corners stayed keeps it */
  private syncBlockLawns() {
    const keep = new Set<string>();
    for (const b of enclosedBlocks(this.net, BLOCK_MAX_AREA)) {
      const k = 'lawn:' + b.key; keep.add(k); if (this.blockLawns.has(k)) continue;
      const p = blockLawn(b); if (p) { this.setLotGround(k, [p]); this.blockLawns.add(k); }
    }
    for (const k of [...this.blockLawns]) if (!keep.has(k)) { this.setLotGround(k, null); this.blockLawns.delete(k); }
  }
  /** after a road edit: the blocks' lawns again in a moment (a drag of edits makes one sync) */
  private scheduleBlockLawns() { clearTimeout(this.blockLawnTimer); this.blockLawnTimer = window.setTimeout(() => this.syncBlockLawns(), 400); }
  /** the lot's props and ground go */
  private dropLot(key: string) {
    const old = this.lotProps.get(key);
    if (old) { for (const p of old) if (this.props.has(p)) { this.removeProp(p); this.perf.lotProps--; } this.lotProps.delete(key); }
    this.setLotGround(key, null); this.yardRough.delete(key);
  }
  // ---------- the dev lot editor's hooks (P20 / T071: src/game/dev/lot-editor.ts, dev builds only)
  /** the preset prop each lot prop drawn from a preset came from (compose Placed.from): the dev editor maps a sprite back to its preset */
  readonly lotFrom = new WeakMap<Prop, { preset: string; prop: number }>();
  /** a lot's geometry and state as it is composed (a staged lot's, else the town's), or null for no such lot */
  lotOf(key: string): { g: LotGeom; st: ComposeState } | null {
    const s = this.staged.get(key); if (s) return s;
    const v = this.traffic.lots.get(key); if (!v) return null;
    return { g: { o: { x: v.o[0], y: v.o[1] }, u: { x: v.u[0], y: v.u[1] }, n: { x: v.n[0], y: v.n[1] }, w: v.w, d: v.d }, st: { use: v.use, level: v.level, decline: v.decline, seed: v.seed } };
  }
  /** the props a lot has now */
  propsOfLot(key: string): readonly Prop[] { return this.lotProps.get(key) ?? []; }
  /** the key of the lot (staged, else the town's) whose rectangle holds the tile point (x, y), or null */
  lotKeyAt(x: number, y: number): string | null {
    for (const k of new Set([...this.staged.keys(), ...this.traffic.lots.keys()])) {
      const at = this.lotOf(k); if (!at) continue;
      const { o, u, n, w, d } = at.g, rx = x - o.x, ry = y - o.y, a = rx * u.x + ry * u.y, b = rx * n.x + ry * n.y;
      if (a >= 0 && a <= w && b >= 0 && b <= d) return k;
    }
    return null;
  }
  /** composes lots again after the lot presets changed: `now` at once (the lot being edited), the others through the lot queue: with `preset`,
   *  only the lots drawn from that preset (an edit to one preset re-bakes their ground alone), else every lot (a library size, a reload) */
  recomposeLots(now: string[] = [], preset?: string) {
    for (const k of now) this.applyLot(k);
    for (const k of new Set([...this.staged.keys(), ...this.traffic.lots.keys()])) {
      if (now.includes(k)) continue;
      if (preset !== undefined) { const at = this.lotOf(k); if (!at || pickedPreset(at.g, at.st)?.id !== preset) continue; }
      this.lotQueue.add(k);
    }
    // the farms too, for every lot or an edit to a farm preset: an approved farm preset replaces a parcel's procedural farm (farmPreset)
    if (preset === undefined || lotPresets().find(p => p.id === preset)?.use === 'farm') for (const k of this.farmProps.keys()) this.farmQueue.add(k);
    this.flushLotGround(); this.emit();
  }
  /** a prop the dev editor moved, scaled or turned: its footprint, grids and sprites follow, and the game saves (player props) */
  devPropChanged(p: Prop) { this.propChanged(p); if (!p.auto) this.scheduleSave(); this.emit(); }
  /** composes a lot and adds its props (auto 'lot:' + key: never saved, and the tools ignore them) and its ground patches */
  private placeLot(key: string, g: LotGeom, st: ComposeState) {
    this.dropLot(key);
    const c = compose(g, st), ps: Prop[] = [];
    for (const q of c.props) {
      const i = LIB_INDEX.get(q.id); if (i === undefined || (q.street && this.inLayby(i, q))) continue;
      const p = this.addProp(i, q.x, q.y, q.flip, q.scale, 'lot:' + key, q.foot ? { foot: q.foot } : undefined); ps.push(p); // q.foot: a parked car of the mix (T236, vehicles.ts parkedAs) on its body footprint
      if (q.from) this.lotFrom.set(p, q.from);
    }
    this.lotProps.set(key, ps); this.perf.lotProps += ps.length;
    // a yard of its own only where a building stands (a big sprite that is not a car, as sendBlocks counts buildings, or a baked house lot); an
    // empty lot shows its block's grass
    const built = ps.some(p => { const it = LIBRARY[p.item]!; return !!it.block || (it.big && it.kind !== 'car'); });
    // the lawn wears its look state's (T155: built the fairway, upgraded the putting green, declined the rough)
    // T222: a new or poor town's house lots wear rough yards in patches (rough-yards.ts: from the lot's own seed and the town's size; upgraded lots stay mown)
    const state = stateOf(st.level, st.decline), home = st.use === LU.RES, rough = built ? roughYard(st.seed, home, state, this.traffic.pop, this.roughYards) : null;
    if (built) this.yardRough.set(key, { seed: st.seed, home, state, sig: roughSig(rough) });
    // (T228: and the cuts its driveways make in the road's white edge lines)
    const lawn = built ? lotLawn(key, g, undefined, state, rough) : null, cuts = driveCuts(g, c.ground);
    this.setLotGround(key, lawn || cuts.length ? [...(lawn ? [lawn] : []), ...c.ground, ...cuts] : c.ground);
  }
  // ---------- T219 (P27): the iconic places (lots/iconic.ts)
  /** the iconic places' footprints (world tiles) */
  private placeBoxes(): [number, number, number, number][] { const out: [number, number, number, number][] = []; for (const p of this.places) { const d = placeDef(p.id); if (d) out.push(placeBox(p, d)); } return out; }
  /** a box (tiles [x0, y0, x1, y1]) overlapping an iconic place by more than half a tile */
  private onPlace(b: ArrayLike<number>): boolean {
    for (const q of this.placeBoxes()) if (Math.min(b[2]!, q[2]) - Math.max(b[0]!, q[0]) > 0.5 && Math.min(b[3]!, q[3]) - Math.max(b[1]!, q[1]) > 0.5) return true;
    return false;
  }
  /** a golf town that has reached a place's residents and has not got it gets it now, on the best free frontage (findSite); one place a check,
   *  and none while no site is free (tried again PLACE_RETRY_MS later). Classic games have none */
  private placesCheck() {
    if (!this.golf || !this.terrain || this.benchMode || performance.now() < this.placeTryAt) return;
    const def = duePlaces(this.traffic.pop, new Set(this.places.map(p => p.id)))[0]; if (!def) return;
    const centre = this.townPts[0] ?? this.townCentreOfLots(); if (!centre) return;
    const segs: SiteSeg[] = [];
    for (const s of this.net.segs) {
      if (s.kind !== 0 || s.cls.family === 'course' || s.cls.family === 'cart') continue;
      segs.push({ key: `${Math.round(s.a.x * 10)},${Math.round(s.a.y * 10)}|${Math.round(s.b.x * 10)},${Math.round(s.b.y * 10)}`, ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, off: s.cls.h + s.cls.walk, order: s.cls.order });
    }
    const site = findSite(def, { segs, centre, seed: this.seed, free: b => this.placeFree(b) });
    if (!site) { this.placeTryAt = performance.now() + PLACE_RETRY_MS; return; }
    this.places.push(site); this.syncPlaces(); this.scheduleSave();
    this.toast(`${placeName(def, this.townName(0))} has opened`);
  }
  /** the centre of the town's built lots (a game without a town point), or null */
  private townCentreOfLots(): { x: number; y: number } | null {
    let x = 0, y = 0, n = 0;
    for (const l of this.traffic.lots.values()) if (l.level >= LV.BUILT) { x += l.o[0]; y += l.o[1]; n++; }
    return n ? { x: x / n, y: y / n } : null;
  }
  /** is a place's footprint free: on the map, no road (its verge included), water, golf land, stadium site, business, car park, painted area,
   *  other place, lot that is not EMPTY, or a prop that is neither a lot's nor an auto tree */
  private placeFree(b: [number, number, number, number]): boolean {
    if (b[0] < 4 || b[1] < 4 || b[2] > MAP - 4 || b[3] > MAP - 4) return false;
    if (this.net.rectOcc(b[0] + 0.5, b[1] + 0.5, b[2] - 0.5, b[3] - 0.5) > 0) return false;
    for (let y = Math.floor(b[1]); y < b[3]; y += 2) for (let x = Math.floor(b[0]); x < b[2]; x += 2) { const c = this.terrain.cls[y * MAP + x]; if (c === TC.WATER || c === TC.CREEK || c === TC.BANK) return false; }
    if (this.onGolfLand(b) || this.onPlace([b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2])) return false;
    const hit = (x: number, y: number, w: number, h: number, m: number) => x - m < b[2] && x + w + m > b[0] && y - m < b[3] && y + h + m > b[1];
    if (this.bizDefs.some(d => hit(d.x, d.y, d.w, d.h, 2)) || this.parkDefs.some(d => hit(d.x, d.y, d.w, d.h, 2))) return false;
    if (this.paint.areas.some(a => { const q = ptsBox(a.pts); return hit(q[0]!, q[1]!, q[2]! - q[0]!, q[3]! - q[1]!, 1); })) return false;
    if (this.lotsUnder({ x: b[0] + 0.6, y: b[1] + 0.6, w: b[2] - b[0] - 1.2, h: b[3] - b[1] - 1.2 })) return false;
    const hits = new Set<Prop>(); this.propGrid.query(b, hits);
    for (const p of hits) { if (p.auto?.startsWith('lot:')) continue; if (!p.auto || LIBRARY[p.item]!.kind !== 'tree') return false; }
    return true;
  }
  /** the places' land to the city worker (the town never builds there), and each place's props and ground composed again */
  private syncPlaces() {
    this.traffic.setPlaces(this.placeBoxes().map(b => [b[0], b[1], b[2] - b[0], b[3] - b[1]]));
    for (const id of [...this.placeProps.keys()]) if (!this.places.some(p => p.id === id)) this.dropPlace(id);
    for (const p of this.places) this.placePlace(p);
  }
  /** the stand-in labels of the places' props (the first prop of each stand-in id of a place: "Stand In for <its art>") */
  private placeStandIns: { p: Prop; text: string }[] = [];
  /** a place's props, labels and ground go */
  private dropPlace(id: string) {
    const ps = this.placeProps.get(id), key = 'place:' + id;
    if (ps) { for (const p of ps) if (this.props.has(p)) this.removeProp(p); this.placeProps.delete(id); }
    this.setLotGround(key, null);
    this.placeStandIns = this.placeStandIns.filter(l => l.p.auto !== key);
  }
  /** a place composes (compose.ts composeWhole) as auto props ('place:' + id, never saved) and its ground; the auto trees in its footprint go,
   *  the town trees round it are planted again, the empty lots under it are drawn again (they draw nothing now) */
  private placePlace(pl: PlacedPlace) {
    const def = placeDef(pl.id); if (!def) return;
    this.dropPlace(pl.id);
    const g = placeGeom(pl, def), box = placeBox(pl, def), key = 'place:' + pl.id, c = composeWhole(g, def.preset, this.seed ^ 0x219), ps: Prop[] = [], seen = new Set<string>();
    const hits = new Set<Prop>(); this.propGrid.query(box, hits);
    for (const p of hits) if (p.auto && !p.auto.startsWith('place:') && !p.auto.startsWith('lot:') && LIBRARY[p.item]?.kind === 'tree') { this.removeProp(p); if (this.autoByKey.get(p.auto) === p) this.autoByKey.delete(p.auto); }
    for (const q of c.props) {
      const i = LIB_INDEX.get(q.id); if (i === undefined) continue;
      const p = this.addProp(i, q.x, q.y, q.flip, q.scale, key, q.foot ? { foot: q.foot } : undefined); ps.push(p); // q.foot: a picture fixed in art-fix.ts stands on its true footprint
      const src = q.from ? def.preset.props[q.from.prop]?.id : undefined, si = src ? def.standIns[src] : undefined;
      if (src && si && !seen.has(src)) { seen.add(src); this.placeStandIns.push({ p, text: `Stand In for ${si}` }); }
    }
    this.placeProps.set(pl.id, ps); this.setLotGround(key, c.ground);
    this.dropTownTrees(box[0], box[1], box[2], box[3]);
    for (const l of this.traffic.lots.values()) { const b = lotBoxOf(l.o, l.u, l.n, l.w, l.d); if (b[0]! < box[2] && b[2]! > box[0] && b[1]! < box[3] && b[3]! > box[1]) this.lotQueue.add(l.key); }
  }
  /** the iconic places' names over their centres (world labels of the first rank, as the businesses', on a dark plate), from the district zoom in */
  private drawPlaceNames() {
    if (this.cam.z < DISTRICT_Z || !this.places.length) return;
    const dpr = this.dpr, font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`, town = this.townName(0);
    for (const p of this.places) {
      const def = placeDef(p.id); if (!def) continue;
      const b = placeBox(p, def), c = this.screen((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
      const l = this.labels.text('place:' + p.id, PRI.name, placeName(def, town), c.x, c.y, font, 12 * dpr, '#fde68a', LABEL_OUTLINE, 3 * dpr);
      l.bg = 'rgba(2,6,23,0.72)'; l.radius = 5 * dpr; l.w = l.w1 + 12 * dpr; l.h = 19 * dpr;
    }
  }
  /** the open place card (T219): the place's name, what it is, the residents it opened at, its size (m) and its stand-ins; null when none is open */
  placeCard(): { id: string; name: string; kind: string; pop: number; w: number; d: number; standIns: string[]; town: number } | null {
    const id = this.selectedPlace; if (!id) return null;
    const p = this.places.find(q => q.id === id), def = placeDef(id); if (!p || !def) return null;
    return { id, name: placeName(def, this.townName(0)), kind: def.kind, pop: def.pop, w: def.preset.w * 2, d: def.preset.d * 2, standIns: [...new Set(Object.values(def.standIns))], town: this.traffic.pop };
  }
  closePlaceCard() { this.selectedPlace = null; this.emit(); }

  // ---------- T242 (#702, P28 3): set the scene (scenes.ts: the places, the picture for their state, the lines and numbers; ui/SceneCard.tsx)
  /** the picture card open (null: none), and its view kept half a second (its numbers move with the day; nothing is read while it is shut) */
  sceneRef: SceneRef | null = null; private sceneCache: { ref: SceneRef; at: number; v: SceneCardView | null } | null = null;
  /** opens the card on a place (null shuts it); a place with no picture for its state opens nothing (never a placeholder) */
  openScene(ref: SceneRef | null) { this.sceneRef = ref; this.sceneCache = null; if (ref && !this.sceneCard()) this.sceneRef = null; this.emit(); }
  closeScene() { if (!this.sceneRef) return; this.sceneRef = null; this.sceneCache = null; this.emit(); }
  /** the card's tab (the range's road, bays, shop, green or home; a business's Outside or Inside) */
  sceneView(view: string) { const r = this.sceneRef; if (!r || r.kind === 'farm') return; this.sceneRef = { ...r, view }; this.sceneCache = null; this.emit(); }
  /** whether the range or the clubhouse has any picture (the cards' Set the scene buttons), or an iconic place */
  sceneArt(kind: 'range' | 'club'): boolean { return kind === 'range' ? this.golf?.start === 'range' && sceneArt('range') : !!this.golf && sceneArt('club'); }
  placeSceneArt(id: string): boolean { return placeHasArt(id); }
  sceneCard(): SceneCardView | null {
    const r = this.sceneRef; if (!r) return null;
    const now = performance.now(), c = this.sceneCache;
    if (c && c.ref === r && now - c.at < 500) return c.v;
    const v = this.sceneOf(r); this.sceneCache = { ref: r, at: now, v }; return v;
  }
  private sceneOf(r: SceneRef): SceneCardView | null {
    const town = this.townName(0) ?? 'the town';
    switch (r.kind) {
      case 'range': { const f = this.rangeSceneFacts(); return f && rangeScene(f, r.view); }
      case 'club': {
        const g = this.golf, bk = this.dayBook; if (!g || !bk || !sceneArt('club') || !this.bizDefs.some(d => d.type === 'clubhouse')) return null;
        const v = clubCardView(bk, this.dayPlay?.view ?? null, this.dayMinute, this.traffic.round.stage === 'free', g.rep, feeScale(this.traffic.dayLen));
        return clubScene({ tier: g.tier, members: v.clubMembers, visitors: v.today.visitors, fees: v.today.fees, rounds: v.season.members + v.season.visitors }, r.view);
      }
      case 'lot': {
        const l = this.traffic.lots.get(r.key), p = LOT_PLACES.find(q => q.id === r.place); if (!l || !p) return null;
        return lotScene(p, { level: l.level, decline: l.decline, jobs: lotJobs(l), town, pop: this.traffic.pop }, r.view);
      }
      case 'farm': { const f = this.farmMap.farms.get(r.key); return f ? farmScene({ ha: (f.p.w * f.p.d * 4) / 10000, town, fortune: townFortune(this.traffic.lots.values()) }) : null; }
      case 'place': { const pc = this.places.find(q => q.id === r.id), def = placeDef(r.id); return pc && def ? placeScene({ id: r.id, name: placeName(def, this.townName(0)), pop: def.pop, w: def.preset.w * 2, d: def.preset.d * 2, fortune: townFortune(this.traffic.lots.values()) }, r.view) : null; }
    }
  }
  /** the range's facts for its card (from the range card's view) */
  private rangeSceneFacts(): RangeSceneFacts | null {
    const v = this.golf?.start === 'range' ? this.range.view() : null; if (!v) return null;
    const put = v.practice.find(p => p.id === 'putting');
    return {
      owned: v.biz.owned, putting: put?.state === 'open', home: v.home.stage, homeName: v.home.name, homeNext: v.home.next, lifetime: v.home.total,
      golfers: v.today.golfers, playing: v.today.playing, queue: v.today.queue, lost: v.today.lost, bays: v.stats.bays, price: v.biz.price,
      seasonTakings: v.biz.season.takings, seasonBuckets: v.biz.season.buckets, shopExtra: v.stats.extra, green: { today: put?.today ?? 0, golfers: put?.golfers ?? 0, takings: put?.takings ?? 0 },
    };
  }
  /** the building a library picture shows (a view's, a turned set's, an east picture's own subject; a variation keeps its id: scenes.ts reads it) */
  private sceneSubject(item: number): string {
    const s = sizeKey(LIBRARY[item]?.id ?? ''); const v = /^view:(.+):(ne|nw|se|sw)$/.exec(s);
    return v ? v[1]! : s.startsWith('east:') ? s.slice(5) : s;
  }
  /** a click on the map with Select inspects what it hit (the map press shut the card first): a range piece's view (its ground: the road), the
   *  clubhouse, an iconic place, a business's building on its lot, a farm's farmhouse. Each opens only when it has a picture */
  private inspectScene(p: Prop | null, club = false): void {
    const a = p?.auto ?? '';
    if (club) { if (this.sceneArt('club')) this.openScene({ kind: 'club' }); return; }
    if (a.startsWith('range:') || !p) { if (this.sceneArt('range')) this.openScene({ kind: 'range', view: a ? rangeViewOfKey(a.slice(6)) : 'road' }); return; }
    if (a.startsWith('place:')) { if (placeHasArt(a.slice(6))) this.openScene({ kind: 'place', id: a.slice(6) }); return; }
    // (T270: a lot is the business it is drawn as: the picture newart.ts lookOf draws, else its own)
    const drawn = this.sceneSubject(lookOf(p).item), own = this.sceneSubject(p.item);
    if (a.startsWith('lot:')) { const pl = lotPlaceOf(drawn) ?? lotPlaceOf(own); if (pl && lotPlaceHasArt(pl)) this.openScene({ kind: 'lot', key: a.slice(4), place: pl.id }); return; }
    if (a.startsWith('farm:') && (FARMHOUSE_SUBJECTS.has(drawn) || FARMHOUSE_SUBJECTS.has(own))) this.openScene({ kind: 'farm', key: a.slice(5) });
  }
  /** the range's pictures as last read (null: not yet, so a load never toasts), and the tick that reads them about once a second */
  private sceneKeys: Record<RangeSceneView, string> | null = null; private sceneTick = 0;
  /** an event turned a range view's picture (an upgrade built, the putting green open, the home smartened or moved): a toast offers its card */
  private sceneNewsCheck() {
    const b = this.golf?.range; if (this.golf?.start !== 'range' || !b || ++this.sceneTick % 6) return;
    const f = { owned: b.owned, putting: this.range.practiceFacts()?.putting === 'open', home: homeStage(b), lifetime: b.total.takings }, k = rangeSceneKeys(f), was = this.sceneKeys;
    this.sceneKeys = k; if (!was) return;
    const view = (Object.keys(k) as RangeSceneView[]).find(v => k[v] && k[v] !== was[v]);
    if (view) this.toast(rangeNews(view, f), 'good', { kind: 'range', view });
  }
  /** the places every map gets (dev: window.__game.placeDefs) */
  readonly placeDefs = PLACE_DEFS;
  /** the farms follow the network (ext/farms): the parcels of the changed country roads are derived again (all after a load or a
   *  new valley); the parcels that went lose their props and ground, the new ones queue to compose */
  private farmsUpdate(full = false, load = false) {
    if (!this.farmsEnabled || !this.terrain) return;
    // (T259: the model 2 farms' parcels keep the river belts and the town trees off them: treeClearance; the trees round a farm that came or went
    //  are planted again)
    const before = new Map<string, number[]>(); for (const [k, f] of this.farmMap.farms) if (this.farmModelOf(k) === 2) before.set(k, parcelBox(f.p));
    const { added, removed } = this.farmMap.update(this.net, { cls: this.terrain.cls, seed: this.seed }, { towns: this.townPts, site: this.site, parks: this.farmParks() }, this.traffic.lots, full || this.net.lastFull);
    // T259: an old save's farm that is rebuilt (its parcel changed, or a new farm on a new road) takes the new model; a load composes each as saved
    const added2 = new Set(added);
    for (const k of removed) { this.dropFarm(k); if (!added2.has(k)) this.farmsNew.delete(k); }
    for (const k of added) { if (!load && this.farmModel === 1) this.farmsNew.add(k); this.farmQueue.add(k); }
    if (!load) {
      for (const k of removed) { const b = before.get(k); if (b) this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); }
      for (const k of added) { const f = this.farmMap.farms.get(k); if (f && this.farmModelOf(k) === 2) { const b = parcelBox(f.p); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); } }
    }
  }
  /** T259: the model a farm composes with: the game's (a new game's FARM_MODEL), or the new one for an old save's farm rebuilt since */
  private farmModelOf(key: string): FarmModel { return this.farmModel === 1 && !this.farmsNew.has(key) ? 1 : FARM_MODEL; }
  /** T259: the calendar month the farms show (0 January): the season clock's (golf/calendar.ts seasonMonth; on tournament day read a unit
   *  earlier, as golfMonthIndex does), or the dev override */
  farmMonth(): number {
    if (this.farmMonthOverride !== null) return ((Math.floor(this.farmMonthOverride) % 12) + 12) % 12;
    const r = this.traffic.round, c = this.traffic.clockTime(performance.now()) - (r.stage !== 'free' ? 1 : 0);
    return seasonMonth(c);
  }
  /** T259: the month moved on: the model 2 farms whose look changes (a field's crop state, the orchard's leaves: farmSeason) compose again,
   *  FARMS_PER_FRAME a frame, each keeping every prop and patch that did not change */
  private farmSeasonTick() {
    const m = this.farmMonth(); if (m === this.farmMonthNow) return;
    this.farmMonthNow = m;
    for (const [k, f] of this.farmMap.farms) { const model = this.farmModelOf(k); if (model !== 2 || !this.farmProps.has(k)) continue; if (farmSeason(f.p, f.seed, model, m) !== this.farmSeasons.get(k)) this.farmQueue.add(k); }
  }
  /** T259 (dev, the shots and the bench): the farms show calendar month m (0 January; null: the season clock again) */
  setFarmMonth(m: number | null) { this.farmMonthOverride = m; this.farmSeasonTick(); }
  /** T259 (dev, the bench's before and after): every farm composes with model m (1: T005's, as before T259; 2: the new); a save then keeps it */
  setFarmModel(m: FarmModel) { this.farmModel = m; this.farmsNew.clear(); for (const k of this.farmMap.farms.keys()) this.farmQueue.add(k); this.dropTownTrees(0, 0, MAP, MAP); this.scheduleSave(); }
  /** T259: the farms waiting to compose (the bench and the shots wait for none) */
  get farmsPending(): number { return this.farmQueue.size; }
  /** what the farms keep clear of besides the town and the site: the car parks, and in golf mode the course's rect too (the farm map's update and stale checks read the same list) */
  private farmParks(): { x: number; y: number; w: number; h: number }[] {
    if (!this.golf) return this.parkDefs;
    if (!this.golf.course) return this.parkDefs;
    const [x, y, w, h] = this.golf.course;
    return [...this.parkDefs, { x, y, w, h }];
  }
  /** a farm's props and ground go, and it leaves the compose queue */
  private dropFarm(key: string) {
    this.farmQueue.delete(key);
    const ps = this.farmProps.get(key);
    if (ps) { for (const p of ps) if (this.props.has(p)) this.removeProp(p); this.farmProps.delete(key); }
    this.setLotGround('farm:' + key, null);
    this.farmGround.delete(key); this.farmSeasons.delete(key); this.farmLabels.delete(key);
  }
  /** every farm goes (a reset, the farms switched off) */
  private dropAllFarms() {
    for (const k of [...this.farmMap.farms.keys(), ...this.farmProps.keys()]) this.dropFarm(k);
    this.farmMap.clear(); this.farmQueue.clear();
  }
  /** a farm composes on apply: its farmhouse, barn and fields as auto props ('farm:' + key, never saved) and its ground patches; at most FARMS_PER_FRAME a frame */
  private applyFarmQueue() {
    const q = this.farmQueue; if (!q.size) return;
    let k = 0; const t0 = performance.now();
    // (T259: and no more once the frame's farms took FARM_FRAME_MS: a month's change composes every farm whose fields turned, a few a frame)
    for (const key of q) { if (k++ >= FARMS_PER_FRAME || (k > 1 && performance.now() - t0 > FARM_FRAME_MS)) break; q.delete(key); this.placeFarm(key); }
  }
  /** a farm composes (its model, the month: T259) as auto props ('farm:' + key, never saved) and its ground patches. Composed before (a new
   *  month), the props that stand where they stood stay and only the rest go and come (a month moves only the orchard's trees), and the ground
   *  is sent only when it changed (a field's crop state) */
  private placeFarm(key: string) {
    const f = this.farmMap.farms.get(key); if (!f) return;
    this.farmQueue.delete(key);
    const model = this.farmModelOf(key), month = this.farmMonth(), pk = 'farm:' + key;
    const fp = farmPreset(f.p), c = fp ? compose({ o: f.p.o, u: f.p.u, n: f.p.n, w: f.p.w, d: f.p.d }, { use: LU.NONE, level: LV.BUILT, decline: 0, seed: f.seed, preset: fp.id }) : composeFarm(f.p, f.seed, { model, month });
    const old = new Map<string, Prop[]>(), ps: Prop[] = [];
    for (const p of this.farmProps.get(key) ?? []) { const k = this.farmPropKey.get(p); if (k === undefined || !this.props.has(p)) { if (this.props.has(p)) this.removeProp(p); continue; } const l = old.get(k); if (l) l.push(p); else old.set(k, [p]); }
    for (const q of c.props) {
      const k = `${q.id}|${q.x}|${q.y}|${q.flip ? 1 : 0}|${q.scale}|${q.foot ? q.foot.join(',') : ''}`, kept = old.get(k)?.pop();
      if (kept) { ps.push(kept); continue; }
      const i = LIB_INDEX.get(q.id); if (i === undefined) continue;
      const p = this.addProp(i, q.x, q.y, q.flip, q.scale, pk, q.foot ? { foot: q.foot } : undefined); this.farmPropKey.set(p, k); ps.push(p);
    }
    for (const l of old.values()) for (const p of l) if (this.props.has(p)) this.removeProp(p);
    this.farmProps.set(key, ps);
    const gs = JSON.stringify(c.ground); if (this.farmGround.get(key) !== gs) { this.setLotGround(pk, c.ground); this.farmGround.set(key, gs); }
    this.farmSeasons.set(key, fp ? '' : farmSeason(f.p, f.seed, model, month));
    // T259: the model 2 farm's stand-in labels ("Stand In for <art>": the windbreak's and the orchard's first tree, each crop state's biggest field, the lane)
    if (fp || model !== 2) { this.farmLabels.delete(key); return; }
    const labels: { p: Drawable; text: string; box: number[] }[] = [], at = LIB_INDEX.get('world:mailbox') ?? 0;
    for (const s of farmStandIns(f.p, f.seed, month)) {
      let p: Drawable | null = null, best = 9;
      if (s.id) for (const q of ps) { if (LIBRARY[q.item]!.id !== s.id) continue; const d = Math.hypot(q.x - s.x, q.y - s.y); if (d < best) { best = d; p = q; } }
      if (s.id && !p) continue;
      p ??= { item: at, x: s.x, y: s.y, flip: false, scale: 1e-4, x0: s.x, y0: s.y, x1: s.x, y1: s.y };
      labels.push({ p, text: s.text, box: [s.x - 2, s.y - 2, s.x + 2, s.y + 2] });
    }
    this.farmLabels.set(key, labels);
  }
  /** the dev switch (window.__game.farmsOn(false)): farms on (the default) or off; off removes every farm's props and ground */
  farmsOn(on: boolean) { this.farmsEnabled = on; if (on) { this.farmsUpdate(true, true); this.dropTownTrees(0, 0, MAP, MAP); } else this.dropAllFarms(); }
  /** median trees, roundabout trees and traffic lights follow the road network (only what the last rebuild changed) */
  /** the town street lamps waiting for houses near them (AutoProp.town), by key: tried again when the lots change (sendBlocks) */
  private lampWait = new Map<string, AutoProp>();
  private syncAutoProps(added: AutoProp[], removed: AutoProp[]) {
    let lamps = false;
    for (const a of removed) { const k = autoKey(a); this.lampWait.delete(k); const p = this.autoByKey.get(k); if (p) { this.removeProp(p); this.autoByKey.delete(k); lamps ||= a.kind === 'lamp'; } }
    for (const a of added) {
      const k = autoKey(a); if (this.autoByKey.has(k)) continue;
      // a town road's lamp stands only where the town has houses within 12 tiles
      if (a.town) { let near = false; for (const p of this.propGrid.query([a.x - 12, a.y - 12, a.x + 12, a.y + 12])) { const kind = LIBRARY[p.item]?.kind; if (kind === 'lot' || kind === 'house') { near = true; break; } } if (!near) { this.lampWait.set(k, a); continue; } this.lampWait.delete(k); }
      const id = a.kind === 'tree' ? AUTO_TREES[a.i % AUTO_TREES.length] : a.kind === 'garden' ? AUTO_GARDEN[a.i % AUTO_GARDEN.length] : a.kind === 'rbtree' ? 'world:tree_oak_0' : a.kind === 'lamp' ? 'world:streetlamp' : 'town:traffic_light';
      const item = LIBRARY.findIndex(i => i.id === id); if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], scale = a.kind === 'tree' ? 0.85 : a.kind === 'garden' ? 0.6 : a.kind === 'rbtree' ? 1.2 : a.kind === 'lamp' ? 0.9 : 1, x = a.x - b.dx * scale / 2, y = a.y - b.dy * scale / 2;
      // a street lamp gives way to whatever already stands there (a lot's own lamps, a tree, a building)
      if (a.kind === 'lamp' && this.canPlace(it, x, y, false, scale)) continue;
      const p = this.addProp(item, x, y, false, scale); p.auto = k; this.autoByKey.set(k, p); lamps ||= a.kind === 'lamp';
    }
    if (lamps) this.syncLamps();
  }
  /** building footprints for the planner map (debounced: many edits, one message); the town's lots wait, at most one refresh per LOT_BLOCKS_MS */
  private scheduleBlocks(lot = false) {
    if (!this.ready) return;
    if (lot) { if (!this.lotBlocksTimer) this.lotBlocksTimer = window.setTimeout(() => { this.lotBlocksTimer = 0; this.sendBlocks(true); }, Math.max(0, this.blocksAt + LOT_BLOCKS_MS - performance.now())); return; }
    clearTimeout(this.blocksTimer); this.blocksTimer = window.setTimeout(() => this.sendBlocks(true), 400);
  }
  private sendBlocks(invalidate: boolean) {
    if (this.lampWait.size) this.syncAutoProps([...this.lampWait.values()], []);
    const out: number[] = [];
    for (const p of this.props) {
      const it = LIBRARY[p.item]; if (!it.big || it.kind === 'car') continue;
      // a baked lot shows its house (block, metres around the anchor; mirrored with the lot), not the whole lot
      if (it.block) { const b = it.block, f = p.flip, s = p.scale / 2, hx = (f ? b.hy : b.hx) * s, hy = (f ? b.hx : b.hy) * s, cx = p.x + (f ? b.dy : b.dx) * s, cy = p.y + (f ? b.dx : b.dy) * s; out.push(cx - hx, cy - hy, cx + hx, cy + hy, BUILDING_KINDS.house ?? 0); continue; }
      out.push(p.x0, p.y0, p.x1, p.y1, BUILDING_KINDS[it.kind] ?? 2);
    }
    this.blocksAt = performance.now();
    this.ground.blocks(new Float32Array(out));
    if (invalidate) this.ground.invalidate([0, 0, MAP, MAP], false, 0, 'p');
  }

  // ---------- network edits ----------
  /** send the edits to the workers, refresh what depends on the network and mark the changed ground stale */
  private commitNetwork(keepPrev = false, until = 0) {
    const ops = this.edit.commit(); this.lanes.update(this.net);
    this.ground.netOps(ops); this.traffic.netOps(ops);
    if (this.net.lastDirty) { const d = this.net.lastDirty; this.ground.invalidate([d[0] - 2, d[1] - 2, d[2] + 2, d[3] + 2], keepPrev, until); this.dropTownTrees(d[0], d[1], d[2], d[3]); }
    if (this.net.lastDirty) { const hb = this.flattenRoadsIn(this.net.lastDirty); if (hb) this.courseHeightChanged(hb); this.courseRoadsChanged(this.net.lastDirty); }
    this.syncAutoProps(this.net.autoAdded, this.net.autoRemoved); this.syncPortals(); this.farmsUpdate(); this.scheduleBlockLawns();
    this.syncLamps(); if (this.parkDefs.length) this.syncParks(); this.parking.sync(); if (this.tollDefs.length) this.syncTolls(); if (this.busDefs.length) this.traffic.setBusRoutes(this.busDefs);
    if (this.busDefs.length || this.stopCuts.size) this.syncStopCuts();
    this.scheduleSave(); this.emit();
  }
  /** flattens the course height under every road near box (its asphalt and verge, feathered over 2 tiles); returns the changed box */
  private flattenRoadsIn(box: CourseTileBox | BBox): CourseTileBox | null {
    const f = this.courseHeight; if (!f.rev) return null; // never edited: flat
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2, r = Math.max(box[2] - box[0], box[3] - box[1]) / 2 + 16;
    let out: CourseTileBox | null = null;
    for (const s of this.net.segsNear({ x: cx, y: cy }, r)) out = unionCourseBox(out, flattenCourseCorridor(f, { ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, halfWidthTiles: s.cls.h + s.cls.walk, marginTiles: 2 }));
    return out;
  }
  /** the course height changed in box: save, and the workers take the new heights and re-bake the ground there */
  private courseHeightChanged(box: CourseTileBox) { this.scheduleSave(); this.ground.courseHeight(this.courseHeight.data, box); }
  private afterLoad() {
    const ops = this.edit.commit(true); this.lanes.update(this.net);
    // the city worker gets the whole network (the bench commits its own edits before this, so `ops` can be empty)
    this.ground.netOps(ops); this.traffic.netOps(netToOps(this.net)); this.syncPortals();
    this.syncAutoProps(this.net.autoProps, []);
    this.syncLamps(); this.sendBlocks(false); this.syncBlockLawns();
    this.ground.invalidateAll(); this.ground.courseHeight(this.courseHeight.data, [0, 0, MAP, MAP]); this.syncParks(); this.parking.sync(); this.traffic.setBusinesses(this.bizDefs); this.syncTolls(true); this.traffic.setBusRoutes(this.busDefs); this.syncStopCuts();
    this.farmMonthNow = -1; this.farmsUpdate(true, true);
    this.syncPlaces();
    // the worker's golf state (a new game or a load of one; a classic game turns it off)
    this.sendGolf();
    this.syncGolfProps();
    this.tagCourseHoles();
    this.setupCourseGrid(); // after the tags: an old save's golf areas move into the grid with their holes
    this.paint.newGame(); // the New hole wizard numbers from this game's holes (the last game's plan and number went in reset or load)
    }
    golfProps = new Map<string, Prop>();
    golfStructureProps = new Map<number, Prop>();
    eventTool = false;
    eventStructurePending: { typeId: string; mode: 'rent' | 'buy' } | null = null;
    toggleEventTool() { this.toggleSideMode('eventTool'); }
    setPendingStructure(typeId: string, mode: 'rent' | 'buy') {
    this.eventStructurePending = { typeId, mode };
    const def = STRUCTURE[typeId];
    this.toast(`Selected ${def ? def.name : typeId} (${mode}). Click open owned land to place it.`);
    this.emit();
    }
    /** checkStructurePlacement for a candidate against the course's holes, placed structures and owned parcels (the click and the ghost share it) */
    private structureCheck(candidate: { typeId: string; x: number; y: number; mode: 'rent' | 'buy'; rotated?: boolean }): StructurePlacementCheck {
    const g = this.golf!;
    const holes = this.courseStatsView() ? deriveHoles(this.courseAreaList(), g.tees, g.pins, g.aims) : [];
    return checkStructurePlacement(candidate, { tier: g.tier, holes, existing: g.structures ?? [], parcels: g.parcels ?? [g.parcel] });
    }
    placeEventStructure(candidate: { typeId: string; x: number; y: number; mode: 'rent' | 'buy'; rotated?: boolean }): boolean {
    if (!this.golf) return false;
    const check = this.structureCheck(candidate);
    if (!check.ok) {
    this.toast(check.reason ?? 'Cannot place structure here', 'warn');
    return false;
    }
    if (this.money < check.cost) {
    this.toast(`Not enough money ($${check.cost.toLocaleString()} required)`, 'warn');
    return false;
    }
    if (candidate.mode === 'buy' && check.cost > 0) {
    this.traffic.spend('construction', check.cost);
    }
    const id = Math.max(0, ...(this.golf.structures ?? []).map(s => s.id)) + 1;
    const placed: PlacedEventStructure = { id, ...candidate };
    if (!this.golf.structures) this.golf.structures = [];
    this.golf.structures.push(placed); this.syncCourseGates(); this.bump('structures');
    const sprId = STRUCTURE_SPRITE[candidate.typeId] ?? FALLBACK_STRUCTURE_SPRITE;
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) {
    // the sprite sits on the middle of the structure's rectangle (x, y is its corner)
    const [rx, ry, rw, rh] = structureRect(placed);
    const prop = this.addProp(item, rx + rw / 2, ry + rh / 2, Boolean(candidate.rotated), structureScale(candidate.typeId, LIBRARY[item]!, Boolean(candidate.rotated)));
    this.golfStructureProps.set(id, prop);
    }
    const def = STRUCTURE[candidate.typeId];
    this.toast(candidate.mode === 'rent' ? `Placed ${def ? def.name : candidate.typeId} (rent $${check.cost.toLocaleString()}/yr at tournament)` : `Placed ${def ? def.name : candidate.typeId} ($${check.cost.toLocaleString()})`);
    this.eventStructurePending = null;
    this.scheduleSave();
    this.emit();
    return true;
    }
    removeStructure(i: number) {
    if (!this.golf?.structures) return;
    const s = this.golf.structures[i]!;
    const def = STRUCTURE[s.typeId];
    const refund = s.mode === 'buy' && def?.buy ? Math.round(def.buy * 0.5) : 0;
    const prop = this.golfStructureProps.get(s.id);
    if (prop) this.removeProp(prop);
    this.golfStructureProps.delete(s.id);
    this.golf.structures.splice(i, 1); this.syncCourseGates();
    if (refund > 0) this.traffic.spend('construction', -refund);
    this.scheduleSave();
    this.toast(`Removed ${def ? def.name : s.typeId}${refund > 0 ? ` (+$${refund.toLocaleString()})` : ''}`);
    this.emit();
    }
    holesTool = false;
    selectedGolfMarker: { hole: number; kind: MarkerKind; x: number; y: number } | null = null;
    toggleHolesTool() { this.toggleSideMode('holesTool'); }
    selectGolfMarker(hole: number, kind: MarkerKind) {
    if (!this.golf) return;
    const pt = kind === 'pin' ? this.golf.pins.find(p => p.hole === hole) : this.golf.tees.find(t => t.hole === hole && t.kind === kind);
    if (pt) {
    this.selectedGolfMarker = { hole, kind, x: pt.x, y: pt.y };
    this.jumpTo(pt.x, pt.y);
    this.toast(`Selected Hole ${hole} ${kind === 'pin' ? 'pin' : TEE_SET[kind].colour + ' tee'}. Click a new position on the course to move it.`);
    this.emit();
    }
    }
    /** the course's gates to the sim (LEAD.md M2.1): every placed structure of kind 'gate', at its rectangle's middle, its capacity as lanes */
    private syncCourseGates() {
    const gates: { x: number; y: number; lanes: number }[] = [];
    for (const s of this.golf?.structures ?? []) { const def = STRUCTURE[s.typeId]; if (def?.kind !== 'gate') continue; const [x, y, w, h] = structureRect(s); gates.push({ x: x + w / 2, y: y + h / 2, lanes: Math.max(1, def.capacity) }); }
    this.traffic.setGates(gates);
    // the galleries (LEAD.md M2.2): the greens and tees of the course and the placed grandstands and tents
    this.traffic.setSpots(this.golf ? gallerySpots(this.golf.tees ?? [], this.golf.pins ?? [], this.golf.structures ?? []) : []);
    }
    private syncGolfProps() {
    this.golfProps.clear();
    this.golfStructureProps.clear();
    this.syncCourseGates();
    if (!this.golf) return;
    for (const pin of this.golf.pins ?? []) {
    const key = 'pin:' + pin.hole;
    const id = pin.hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID;
    const item = LIB_INDEX.get(id);
    // (T269: the flag stands on the day's cup, today's or yesterday's, else on the placed pin)
    const dp = this.golf.dayPins, at = [pin, ...(dp ? [pinIn(dp.today, pin.hole), pinIn(dp.prev, pin.hole)] : [])].filter((q): q is DayPin | typeof pin => !!q);
    for (const p of this.props) {
    if (p.item === item && at.some(q => Math.hypot(p.x - q.x, p.y - q.y) < 2)) { this.golfProps.set(key, p); break; }
    }
    }
    this.flagRev = -1; // (T269: the flags are put on today's cups again)
    // the pictures that stood in for the tee markers before T111 (a flagstick, the bag trolley): a save's prop of one on a tee goes (never a pin's)
    const oldTee = new Set(OLD_TEE_IDS.flatMap(id => LIB_INDEX.get(id) ?? [])), pinProps = new Set(this.golfProps.values()), tees = this.golf.tees ?? [];
    for (const p of [...this.props]) if (oldTee.has(p.item) && !pinProps.has(p) && tees.some(t => Math.hypot(p.x - t.x, p.y - t.y) < 2)) this.removeProp(p);
    for (const tee of tees) {
    const key = `tee:${tee.hole}:${tee.kind}`;
    const id = teePropId(tee.kind);
    const item = LIB_INDEX.get(id);
    if (item === undefined) continue; // no tee marker picture yet (golf/dressing.ts TEE_MARKER_ID)
    for (const p of this.props) {
    if (p.item === item && Math.hypot(p.x - tee.x, p.y - tee.y) < 2) { this.golfProps.set(key, p); break; }
    }
    }
    // a save keeps the size a marker was placed at (the marker fit placed them at scale 1, a flagstick drawn 6 m tall): refit them to MARKER_SCALE
    for (const [key, p] of this.golfProps) {
    const s = MARKER_SCALE[(key.startsWith('pin:') ? 'pin' : key.slice(key.lastIndexOf(':') + 1)) as keyof typeof MARKER_SCALE];
    if (s !== undefined && Math.abs(p.scale - s) > 1e-6) { p.scale = s; this.propChanged(p); }
    }
    const claimed = new Set<Prop>();
    for (const s of this.golf.structures ?? []) {
    const sprId = STRUCTURE_SPRITE[s.typeId] ?? FALLBACK_STRUCTURE_SPRITE;
    const item = LIB_INDEX.get(sprId);
    if (item === undefined) continue;
    let found: Prop | undefined;
    const [rx, ry, rw, rh] = structureRect(s), cx = rx + rw / 2, cy = ry + rh / 2;
    const at = (p: Prop) => Math.hypot(p.x - cx, p.y - cy) < 2 || Math.hypot(p.x - s.x, p.y - s.y) < 2;
    for (const p of this.props) {
    if (!claimed.has(p) && p.item === item && at(p)) { found = p; break; }
    }
    // a save's prop of the picture this structure had before T111 (STRUCTURE_SPRITE_OLD) goes: today's picture is placed instead
    const old = LIB_INDEX.get(STRUCTURE_SPRITE_OLD[s.typeId] ?? '');
    if (!found && old !== undefined) for (const p of this.props) if (!claimed.has(p) && p.item === old && at(p)) { this.removeProp(p); break; }
    const scale = structureScale(s.typeId, LIBRARY[item]!, Boolean(s.rotated));
    if (!found) found = this.addProp(item, cx, cy, Boolean(s.rotated), scale);
    else if (Math.abs(found.scale - scale) > 1e-6) { found.scale = scale; this.propChanged(found); } // a save keeps the size it was drawn at: refit it to today's rule
    claimed.add(found);
    this.golfStructureProps.set(s.id, found);
    }
    }
    moveGolfMarker(hole: number, kind: MarkerKind, x: number, y: number): boolean {
    if (!this.golf) return false;
    const areas: CourseArea[] = this.courseAreaList();
    // the move itself is golf/holecard.ts markerMove (T174): the markers only, never a re-plan or a charge; refused off its surface
    const r = markerMove(this.golf, areas, hole, kind, x, y);
    if (!r.ok) {
    this.toast(r.reason, 'warn');
    return false;
    }
    const key = kind === 'pin' ? 'pin:' + hole : `tee:${hole}:${kind}`;
    const oldProp = this.golfProps.get(key);
    if (oldProp) this.removeProp(oldProp);
    const sprId = kind === 'pin' ? (hole === 9 ? PIN_YELLOW_ID : PIN_RED_ID) : teePropId(kind);
    const item = LIB_INDEX.get(sprId);
    if (item !== undefined) {
    const newProp = this.addProp(item, x, y, false, MARKER_SCALE[kind]);
    this.golfProps.set(key, newProp);
    }
    const holes0 = this.holesBuilt();
    this.golf.pins = r.pins; this.golf.tees = r.tees;
    if (kind === 'pin') this.setTodayPin(hole, x, y); // T269: the pin dragged is today's cup
    if (this.golf.start === 'range' && this.holesBuilt() !== holes0) this.sendGolf(); // T090: a new hole speeds a range start's town
    this.selectedGolfMarker = null;
    this.scheduleSave();
    this.emit();
    this.toast(`Hole ${hole}'s ${kind === 'pin' ? 'pin' : TEE_SET[kind].colour + ' tee marker'} moved: no re-plan, no charge`); // T174: the player's words (P23 4.9)
    return true;
    }

  // ---------- road routing ----------
  setTool(t: Tool) { if (t !== 'course') this.paint.setProperty(false); /* T256: Range › Build ends with the course tool */ const wasGk = this.tool === 'greenkeeping'; if (t === 'business' && this.golfMode) return; /* golf mode: the game places the clubhouse, so no Business tool */ if (this.refuseLocked(t)) return; /* P23 4.10: a locked tool says what unlocks it */ const scope = t === 'path' ? 'course' : t === 'road' ? 'town' : this.roadScope; if (t === 'path') t = 'road'; /* T084: Paths & drives is the road tool on the course */ const cScope = t === 'buildings' ? 'buildings' : t === 'course' ? 'holes' : this.courseScope; if (t === 'buildings') t = 'course'; /* P23 P1-E: Buildings is the course tool's clubhouse scope */ if (this.tool !== t || scope !== this.roadScope || cScope !== this.courseScope) { this.paint.cancel(); this.cancelRoute(); this.teePlace = null; /* T268 */ this.selected = null; this.selectedPlace = null; this.selectedJunction = null; this.parkDrag = null; this.parking.drag = null; this.tollHover = null; this.bizHover = null; this.busPick = null; this.busHover = null; this.laneHover = null; this.decor.cancel(); this.practice.cancel(); } this.tool = t; if (pickTool(this, t)) this.tidySideModes(); /* P23 P1-A: a build tool closes the Grass panel, Land, Holes and Event */ if (t === 'road') this.setRoadScope(scope); if (t === 'course') this.courseScope = cScope; if (t !== 'course' || cScope === 'holes') { this.clubPlacing = false; this.halfwayPlacing = false; } else if (this.golf && !this.bizDefs.some(d => d.type === 'clubhouse')) this.clubPlacing = true; /* Buildings arms the clubhouse until it stands */ if (t === 'course') { this.paint.enterCourse(); this.ground.prewarm(brushTextures()); /* T168: what its brushes lay, made ahead */ } else if (t === 'paint') this.paint.enterPaint(); /* T175: Greenkeeping's panel is the Grass panel; leaving it puts its care down */ if (t === 'greenkeeping') this.grassPanel = true; else if (wasGk) { this.grassPanel = false; this.grassAction = null; } this.emit(); }
  /** the snap radius in tiles: about 14 screen px (at least 2 tiles) */
  private snapRadius() { return Math.max(2, 14 / (HW * this.cam.z)); }
  /** the road tool's snap under the cursor, or null with no cursor */
  private cursorSnap(): Snap | null { return this.hover ? snapPoint(this.net, this.hover, this.snapRadius(), this.roadStep()) : null; }
  /** why the preview route cannot be built ('' when it can): see checkLegs; before the first click, a town road's start inside the course land */
  routeBlock(legs: Leg[] = this.previewLegs()): string {
    if (!legs.length) { const cs = this.route.length ? null : this.cursorSnap(); return cs && this.startOnLand(cs.p) ? COURSE_LAND_MSG : ''; }
    // judged exactly as a click at the cursor would be (roadClick refuses such a point), or, with the cursor on the last point, as finishing does
    const c0 = this.cursorSnap(), last = this.route[this.route.length - 1], cs = c0 && last ? this.aim(last, c0) : c0, onLast = !!cs && !!last && cs.p.x === last.x && cs.p.y === last.y;
    return checkLegs(this.net, legs, this.routeFrom, onLast || !cs ? this.routeLast : cs, this.cls, new Set(this.routeCuts(legs).map(c => c.seg)), this.golfLand()) || (this.routeInWay(legs)?.why ?? '');
  }
  /** what a route of the class in hand may not run into (T207, route-obstacles.ts): a course road (cart paths and drives) the range's
   *  structures, the other businesses and the car parks' insides; a town road every business's and car park's padded rectangle; both the toll
   *  plazas (a leg along a plaza's own centre line passes: upgrading its road) */
  private routeObstacles(course = isCourseClass(this.cls.id)): Obstacle[] {
    const tolls: Obstacle[] = [];
    for (const d of this.tollDefs) {
      const s = this.tollSegs.get(d.id); if (!s) continue;
      const h = s.cls.h, W = plazaEdge(d.booths, laneOff(s, 0)), q = (t0: number, t1: number, o0: number, o1: number) => [plazaPoint(d, t0, o0), plazaPoint(d, t1, o0), plazaPoint(d, t1, o1), plazaPoint(d, t0, o1)].flatMap(p => [p.x, p.y]);
      const onLine = (p: Pt) => Math.abs(plazaLocal(d, p.x, p.y).o) < 0.05;
      tolls.push({ why: 'Roads cannot cross a toll plaza', name: 'a toll plaza', zone: q(-1, PLAZA_LEN + 1, -h - 1, W + 1), outline: q(0, PLAZA_LEN, -h, W), pass: l => onLine(l.a) && onLine(l.b) });
    }
    return routeObstacles({ course, biz: this.bizDefs, parks: this.parkDefs, structures: this.rangeStructs(), tolls, places: this.placeStructures() });
  }
  /** the range's buildings and pieces with a footprint (golf/rangebiz.ts rangeStructures), none outside a range start */
  private rangeStructs(): Structure[] {
    const g = this.golf, rd = g?.start === 'range' ? this.bizDefs.find(b => b.type === 'range') : undefined;
    return g && rd ? rangeStructures(plotOfFront([rd.x, rd.y, rd.w, rd.h], g.dir), g.dir, g.range ??= defaultRangeBiz()) : [];
  }
  /** the iconic places (T219) as named footprints: no road or ring crosses one (T224); "the Drive-In" in a town with no name, else the town's own */
  private placeStructures(): Structure[] {
    const out: Structure[] = [], town = this.townName(0);
    for (const p of this.places) { const d = placeDef(p.id); if (d) out.push({ name: inSentence(placeName(d, town)), box: placeBox(p, d) }); }
    return out;
  }
  /** the first thing in the way of a route of the class in hand, why, and its outline (null: nothing): what is in the way, or a big placed prop
   *  (bulldoze it first). The preview (routeBlock), each click that adds a point (roadClick) and Build (finishRoute) all judge by it (T207) */
  routeInWay(legs: Leg[]): { why: string; outline: readonly number[] } | null {
    if (!legs.length) return null;
    const hw = this.cls.h + this.cls.walk, o = inTheWay(legs, hw, this.routeObstacles()); if (o) return o;
    const p = this.propsNearLegs(legs, hw).find(q => !q.auto && LIBRARY[q.item].big && LIBRARY[q.item].kind !== 'car');
    return p ? { why: `${LIBRARY[p.item].name} is in the way — bulldoze it first`, outline: rectPoly(p.x0, p.y0, p.x1, p.y1) } : null;
  }
  /** whether a route of the class in hand may not start at p (T124): a town road inside the course land, where only the course's cart paths
   *  and drives are built (a point on the land's edge is fine: a town road may meet a course drive there) */
  private startOnLand(p: Pt): boolean { return !isCourseClass(this.cls.id) && pointInLand(this.golfLand(), p.x, p.y); }
  /** the road pieces the route bulldozes: with Replace on, those it clashes with (see replaceCuts); always, the hidden stubs inside a ring it joins (see ringStubs) */
  private routeCuts(legs: Leg[]): PieceSel[] {
    if (!legs.length) return [];
    const stubs = ringStubs(this.net, legs), cuts = this.replaceMode ? replaceCuts(this.net, legs, this.cls) : [];
    return [...stubs, ...cuts.filter(c => !stubs.some(x => x.seg === c.seg))];
  }
  /** legs from `from` to `p`: a right-angle bend, or (45° mode) a diagonal followed by a straight */
  private legsTo(from: Pt, p: Pt, straight = false): Leg[] {
    const dx = p.x - from.x, dy = p.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ax && !ay) return [];
    if (straight) {
      const st = this.roadStep(), k = Math.round((ax + ay) / 2 / st) * st;
      if (ax >= 2.4 * ay || ay >= 2.4 * ax) return [{ a: from, b: ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y } }];
      return [{ a: from, b: { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k } }];
    }
    if (!ax || !ay) return [{ a: from, b: p }];
    if (this.bendMode === 45) {
      const k = Math.min(ax, ay), corner = { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k };
      if (corner.x === p.x && corner.y === p.y) return [{ a: from, b: p }];
      return [{ a: from, b: corner }, { a: corner, b: p }];
    }
    const corner = ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
    return [{ a: from, b: corner }, { a: corner, b: p }];
  }
  /** a snap onto a road, seen from the route's last point: the point on that road square across from `from`, so the new road meets it
   *  straight (a T) instead of an L whose corner and last stretch would lie on the road itself; the snap as it is when that foot is off the
   *  road's span (within MIN_SEP of its ends) or `from` lies on the road's line */
  private aim(from: Pt, s: Snap): Snap {
    if (s.kind !== 'road' || !s.seg) return s;
    const a = s.seg.a, b = s.seg.b, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1e-6) return s;
    const t = ((from.x - a.x) * dx + (from.y - a.y) * dy) / L, q = { x: a.x + dx * t / L, y: a.y + dy * t / L };
    if (t < MIN_SEP || t > L - MIN_SEP || Math.hypot(from.x - q.x, from.y - q.y) < 1) return s;
    return { ...s, p: q };
  }
  previewLegs(): Leg[] {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) legs.push({ a: this.route[i - 1], b: this.route[i] });
    const cs = this.cursorSnap();
    if (this.route.length && cs) { const last = this.route[this.route.length - 1]!; legs.push(...this.legsTo(last, this.aim(last, cs).p, this.keys.has('Shift'))); }
    return legs;
  }
  /** what the route under the pointer costs: the new road less the value of the pieces Replace (or a ring's hidden stubs) takes away (negative: a refund) */
  routeCost() { const legs = this.previewLegs(); return Math.round(this.structured(legs).cost - this.piecesValue(this.routeCuts(legs))); }
  /** the value of a road seg: its length x its class's cost x its kind's factor (STRUCT_COST: a bridge or a tunnel costs more), what building it charged */
  private segValue(s: Seg) { return vlen(sub(s.b, s.a)) * s.cls.cost * STRUCT_COST[s.kind]; }
  /** the value of every road on the map (see segValue): the bulldozer and Replace refund the fall in it, so the dead ends tidyEnds trims count too */
  private roadValue() { let v = 0; for (const s of this.net.segs) v += this.segValue(s); return v; }
  /** the value of road pieces (a part of a seg each), before they are cut */
  private piecesValue(cuts: PieceSel[]) { let v = 0; for (const c of cuts) v += vlen(sub(c.p1, c.p0)) * c.seg.cls.cost * STRUCT_COST[c.seg.kind]; return v; }
  /** the town's built-up lots (BUILDING or more) that the legs' centre lines run through: sampled every half tile, a point counts when it is
   *  at least half a tile inside the lot's rectangle (o, along u, away n, w by d) */
  private lotsInLegs(legs: Leg[]): LotView[] {
    const hit: LotView[] = [];
    if (!legs.length) return hit;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of legs) { x0 = Math.min(x0, l.a.x, l.b.x); y0 = Math.min(y0, l.a.y, l.b.y); x1 = Math.max(x1, l.a.x, l.b.x); y1 = Math.max(y1, l.a.y, l.b.y); }
    for (const v of this.traffic.lots.values()) {
      if (v.level < LV.BUILDING) continue;
      const [ox, oy] = v.o, [ux, uy] = v.u, [nx, ny] = v.n, R = Math.hypot(v.w, v.d) / 2 + 0.5;
      const cx = ox + (ux * v.w + nx * v.d) / 2, cy = oy + (uy * v.w + ny * v.d) / 2;
      if (cx < x0 - R || cx > x1 + R || cy < y0 - R || cy > y1 + R) continue;
      if (legs.some(l => {
        const k = Math.max(1, Math.ceil(vlen(sub(l.b, l.a)) / 0.5));
        for (let i = 0; i <= k; i++) {
          const x = l.a.x + (l.b.x - l.a.x) * i / k - ox, y = l.a.y + (l.b.y - l.a.y) * i / k - oy, a = x * ux + y * uy, b = x * nx + y * ny;
          if (a >= 0.5 && a <= v.w - 0.5 && b >= 0.5 && b <= v.d - 0.5) return true;
        }
        return false;
      })) hit.push(v);
    }
    return hit;
  }
  /** the compensation the route being drawn would cost: the built-up lots it runs through, and their total $ */
  routeCompensation(): { n: number; comp: number } {
    const hit = this.lotsInLegs(this.structured(this.previewLegs()).parts);
    return { n: hit.length, comp: hit.reduce((s, v) => s + compensation(v), 0) };
  }
  /** the road tool's last click (T207: the double-click's second click adds no point) */
  private routeTap: Tap | null = null;
  /** the road tool's right-click, Backspace, double-click and Enter (T207, route-input.ts): take back the last point (the first: drop the route),
   *  or build */
  routeInput(input: Exclude<RouteInput, 'click'>) {
    if (this.tool !== 'road') return;
    const a = routeAct(input, this.route.length);
    if (a === 'back') this.undoRoutePoint(); else if (a === 'cancel') this.cancelRoute(); else if (a === 'build') this.finishRoute();
  }
  private roadClick(mx: number, my: number) {
    // the double-click's second click adds no point: the double-click builds what the preview shows (T207)
    const tap = { t: performance.now(), mx, my }, second = isSecondTap(this.routeTap, tap); this.routeTap = second ? null : tap;
    if (routeAct('click', this.route.length, second) === 'none') return;
    let s = snapPoint(this.net, this.tileAt(mx, my), this.snapRadius(), this.roadStep());
    if (this.route.length) s = this.aim(this.route[this.route.length - 1]!, s);
    if (!this.route.length) { if (this.startOnLand(s.p)) { this.toast(COURSE_LAND_MSG, 'warn'); return; } this.routeFrom = s; this.route.push(s.p); this.routeLast = s; this.emit(); return; }
    const last = this.route[this.route.length - 1], add = this.legsTo(last, s.p, this.keys.has('Shift'));
    // a point the route could not be built with is refused at once (the preview shows it red with the same reason)
    const legs: Leg[] = []; for (let i = 1; i < this.route.length; i++) legs.push({ a: this.route[i - 1]!, b: this.route[i]! });
    const all = [...legs, ...add], why = add.length ? checkLegs(this.net, all, this.routeFrom, s, this.cls, new Set(this.routeCuts(all).map(c => c.seg)), this.golfLand()) || (this.routeInWay(all)?.why ?? '') : '';
    if (why) { this.toast(why, 'warn'); return; }
    for (const l of add) this.route.push(this.weld(l.b));
    this.routeLast = s; this.emit();
  }
  /** a route point within 0.05 tiles of a node lands on it: a 45° bend's corner a few hundredths off one was judged the same point by the rules
   *  but made a second node, and a road piece a few hundredths long (the road builder's stress test, 2026-10-19) */
  private weld(p: Pt): Pt {
    for (const s of this.net.segsNear(p, 0.2)) for (const n of [s.a, s.b]) if (Math.hypot(n.x - p.x, n.y - p.y) < 0.05) return { x: n.x, y: n.y };
    return p;
  }
  undoRoutePoint() { this.route.pop(); this.emit(); }
  cancelRoute() { this.route = []; this.routeFrom = this.routeLast = null; this.emit(); }
  /** strip test: does the prop footprint touch a leg's corridor of half width hw? */
  private propInLegs(p: Prop, legs: Leg[], hw: number) {
    const pts = [{ x: p.x0, y: p.y0 }, { x: p.x1, y: p.y0 }, { x: p.x0, y: p.y1 }, { x: p.x1, y: p.y1 }, { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }];
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d), u = mul(d, 1 / L), n = perp(u);
      for (const q of pts) { const w = sub(q, l.a), t = u.x * w.x + u.y * w.y, s = Math.abs(n.x * w.x + n.y * w.y); if (t > -hw && t < L + hw && s < hw) return true; }
    }
    return false;
  }
  /** does a road corridor of half width hw run into a business? (the stadium's footprint padded by 2 tiles, the others' by 1) */
  private crossesBiz(legs: Leg[], hw: number): boolean {
    if (!this.bizDefs.length) return false;
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o;
        for (const b of this.bizDefs) { const p = b.type === 'stadium' ? 2 : 1; if (x >= b.x - p && x < b.x + b.w + p && y >= b.y - p && y < b.y + b.h + p) return true; }
      }
    }
    return false;
  }
  /** does a road corridor of half width hw cross the river? (creeks and banks are fine: culverts, riverside roads); or a business */
  private blockedForRoad(legs: Leg[], hw: number): boolean {
    if (this.crossesBiz(legs, hw)) return true;
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o, c = classAt(this.terrain, x, y);
        if (c === TC.WATER) return true;
      }
    }
    return false;
  }
  /** the legs split into ground, bridge and tunnel pieces, with their cost (money) and an error ('' if fine) */
  private structured(legs: Leg[]) {
    const { legs: parts, kinds } = splitByTerrain(legs, this.cls.h + this.cls.walk, (x, y) => groundClass(classAt(this.terrain, x, y)));
    // a split point (a bank, a tunnel mouth) within 2 tiles of a node on the route moves on to it: just off it, it left a road piece under a tile
    for (let i = 0; i + 1 < parts.length; i++) {
      const q = parts[i]!.b, r = parts[i + 1]!.a; if (Math.hypot(q.x - r.x, q.y - r.y) > 1e-6) continue;
      for (const s of this.net.segsNear(q, 2.5)) for (const m of [s.a, s.b]) { const d = Math.hypot(m.x - q.x, m.y - q.y); if (d > 1e-6 && d < 2 && segDist(m, { a: parts[i]!.a, b: parts[i + 1]!.b } as Seg) < 0.02) { parts[i]!.b = { x: m.x, y: m.y }; parts[i + 1]!.a = { x: m.x, y: m.y }; } }
    }
    let raw = 0; for (let i = 0; i < parts.length; i++) raw += vlen(sub(parts[i].b, parts[i].a)) * this.cls.cost * STRUCT_COST[kinds[i]];
    const cost = Math.round(raw), lens = structureLengths(parts, kinds);
    let err = '';
    if (longestRun(parts, kinds, SK.BRIDGE) > STRUCT_MAX[SK.BRIDGE]) err = `Bridges can span at most ${STRUCT_MAX[SK.BRIDGE] * 2} m`;
    else if (longestRun(parts, kinds, SK.TUNNEL) > STRUCT_MAX[SK.TUNNEL]) err = `Tunnels can be at most ${STRUCT_MAX[SK.TUNNEL] * 2} m long`;
    return { parts, kinds, cost, lens, err };
  }
  private propsNearLegs(legs: Leg[], hw: number) {
    let bb: BBox | null = null; for (const l of legs) bb = unionBox(bb, [Math.min(l.a.x, l.b.x) - hw, Math.min(l.a.y, l.b.y) - hw, Math.max(l.a.x, l.b.x) + hw, Math.max(l.a.y, l.b.y) + hw]);
    return bb ? [...this.propGrid.query(bb)].filter(p => this.propInLegs(p, legs, hw)) : [];
  }
  finishRoute() {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) if (this.route[i].x !== this.route[i - 1].x || this.route[i].y !== this.route[i - 1].y) legs.push({ a: this.route[i - 1], b: this.route[i] });
    if (!legs.length) { this.cancelRoute(); return; }
    const cuts = this.routeCuts(legs), block = checkLegs(this.net, legs, this.routeFrom, this.routeLast, this.cls, new Set(cuts.map(c => c.seg)), this.golfLand()) || (this.routeInWay(legs)?.why ?? '');
    if (block) { this.toast(block, 'warn'); return; }
    const cls = this.cls, st = this.structured(legs), { parts, kinds, cost: build, lens } = st, cost = Math.round(build - this.piecesValue(cuts));
    const hit = this.lotsInLegs(parts), comp = hit.reduce((s, v) => s + compensation(v), 0);
    if (!this.classOpen(cls.id)) { this.toast(this.classLockWhy(cls.id), 'warn'); return; }
    if (kinds.includes(SK.TUNNEL) && !this.tunnelsOpen()) { const lk = unlockOf('tunnel')!; this.toast(`Tunnels unlock at ${lk.pop.toLocaleString()} residents (${lk.name})`, 'warn'); return; }
    if (cost + comp > this.money) { this.toast(`Not enough money: the route costs $${cost.toLocaleString()}${comp ? ` and $${comp.toLocaleString()} compensation` : ''}`, 'warn'); return; }
    if (st.err) { this.toast(st.err, 'warn'); return; }
    // what is in the way (businesses, the range's structures, car parks, toll plazas, big props) was judged with checkLegs above (routeInWay, T207)
    const total = this.net.legsLength(parts);
    const hw = cls.h + cls.walk, near = this.propsNearLegs(legs, hw);
    const cleared = near.filter(p => !p.auto && !LIBRARY[p.item].big);
    for (const p of cleared) this.removeProp(p);
    const now = performance.now(), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of parts) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    // Replace charges the new road less the value of what it takes away: the cut pieces and the dead ends tidyEnds trims after them, measured
    let removed = this.roadValue();
    for (const c of cuts) this.edit.removePiece(c);
    removed -= this.roadValue();
    this.edit.addLegs(parts, cls, this.lineStyle, kinds);
    if (cuts.length) { const v = this.roadValue(); this.tidyEnds(cuts.flatMap(c => [c.p0, c.p1, c.seg.a, c.seg.b])); removed += v - this.roadValue(); }
    const paid = Math.round(build - removed);
    this.commitNetwork(true, now + dur + 150); this.bump('roads');
    this.builds.push({ legs: parts, cls, t0: now, dur, total, cum });
    this.traffic.spend('construction', paid);
    if (comp) this.traffic.spend('compensation', comp);
    this.route = [];
    const structs = [lens[SK.BRIDGE] ? `${Math.round(lens[SK.BRIDGE] * 2)} m bridge` : '', lens[SK.TUNNEL] ? `${Math.round(lens[SK.TUNNEL] * 2)} m tunnel` : ''].filter(Boolean);
    this.toast(`Built ${Math.round(total * 2)} m of ${cls.name.toLowerCase()}${structs.length ? ` (${structs.join(', ')})` : ''} ${paid < 0 ? `(refund $${(-paid).toLocaleString()})` : `for $${paid.toLocaleString()}`}${comp ? `, $${comp.toLocaleString()} compensation for ${hit.length} building${hit.length > 1 ? 's' : ''}` : ''}${cleared.length ? ` (cleared ${cleared.length} item${cleared.length > 1 ? 's' : ''})` : ''}${cuts.length ? `, replaced ${cuts.length} road piece${cuts.length > 1 ? 's' : ''} worth $${Math.round(removed).toLocaleString()}` : ''}`, 'good');
    this.clubDriveBuilt(cls); // T175: the clubhouse stopgap's drive
    // a one-way road that ends in a dead end traps cars: warned, not refused
    if (cls.oneway && parts.length && [parts[0]!.a, parts[parts.length - 1]!.b].some(p => this.net.nodeAt(p)?.segs.length === 1)) this.toast('A one-way road that ends in a dead end traps cars', 'warn');
  }
  /** the obstacles a ring at node n is judged by (T224): the route obstacles of its class (a ring whose arms are all course roads is on the player's
   *  own land: the course rules; any other ring the town's, with the range's structures too), the one list the road preview, each click and Build use */
  private ringObstacles(n: Node): Obstacle[] {
    const course = n.arms.length > 0 && n.arms.every(a => isCourseClass(a.cls.id)), obs = this.routeObstacles(course);
    return course ? obs : [...structureObstacles(this.rangeStructs()), ...obs];
  }
  /** the placed (not a lot's, not a tree's) props near a ring of outer edge rb and widest walk, with what each does to it: a placed prop goes (the
   *  big ones refuse it: bulldoze them first), a piece of the range's scene refuses it, named (the iconic places refuse by their footprint: placeStructures) (T224) */
  private ringPropList(n: Node, rb: number, walk: number, kind: string): RingProp<Prop>[] {
    const R = rb + walk, out: RingProp<Prop>[] = [];
    for (const p of this.propGrid.query([n.x - R, n.y - R, n.x + R, n.y + R])) {
      let refuse: string | null = null;
      if (p.auto) {
        if (p.auto.startsWith('range:')) refuse = ringWhy(kind, rangePieceName(p.auto));
        else continue; // an iconic place's pieces are inside its footprint, which refuses (placeStructures); the town's trees and a lot's props follow the network and the lot
      } else if (LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car') refuse = `${LIBRARY[p.item].name} is in the way — bulldoze it first`;
      out.push({ p, box: [p.x0, p.y0, p.x1, p.y1], refuse });
    }
    return out;
  }
  /** what a ring of type t (rl ring lanes) at node n takes in (T224), by the arms' half widths hs and widest walk it would have: its disc against the
   *  route obstacles, the props under it, the built lots its circle reaches and their compensation. Null for a type that is no ring, and for a
   *  ring that does not grow (re-laned down: everything it covers is covered now) */
  private ringJudge(n: Node, t: NodeType, rl: 1 | 2 | 3, hs: number[] = n.arms.map(a => a.h), walk = Math.max(0, ...n.arms.map(a => a.walk))): RingVerdict<Prop> | null {
    if (t !== 'roundabout' && t !== 'mini') return null;
    const rb = t === 'roundabout' ? (n.arms.length >= 2 ? ringRadius(hs, rl) : 0) : (n.arms.length >= 3 ? Math.max(4, Math.max(...hs) + 1) : 0);
    if (!(rb > 0)) return null;
    const name = t === 'roundabout' ? 'A roundabout' : 'A mini-roundabout', now = n.rb > 0 ? { type: n.type, rb: n.rb, walk: Math.max(0, ...n.arms.map(a => a.walk)) } : null;
    if (!ringGrows(now, t, rb, walk)) return null; // nothing new is covered: no judging
    return judgeRing({ x: n.x, y: n.y, rb, walk, kind: t, name, obstacles: this.ringObstacles(n), props: this.ringPropList(n, rb, walk, name), lots: this.traffic.lots.values(), now });
  }
  /** the physical rules of a ring of type t (rl ring lanes) at node n, in the order they are told: what the ring takes in (ringJudge: a business, a car
   *  park, the range, an iconic place, a big prop refuse it), arms too short for it, another road in its circle. why: '' when it can be built */
  private ringPhysical(n: Node, t: NodeType, rl: 1 | 2 | 3): { why: string; hit: Seg[]; ring: RingVerdict<Prop> | null } {
    const ring = this.ringJudge(n, t, rl);
    if (ring?.why) return { why: ring.why, hit: [], ring };
    // an arm that ends inside the ring (another junction or a bend within its radius plus 2 tiles): its road would run on to the island and cars
    // turned at its end there (the owner's 3-lane ring, 2026-10-19: an arterial met the street 10 tiles from the junction made a ring)
    // (a multi-lane ring needs its radius plus 6 tiles: closer, its entries and exits squeezed into the next junction; this was only a warning after
    // the build, the owner: "why does it tell me it needs longer approaches but builds it anyway")
    if (t === 'roundabout' && n.arms.some(a => a.len < ringRadius(n.arms.map(b => b.h), rl) + (rl > 1 ? 6 : 2))) {
      const need = ringRadius(n.arms.map(b => b.h), rl) + (rl > 1 ? 6 : 2), short = n.arms.filter(a => a.len < need), a = short.reduce((p, q) => (q.len < p.len ? q : p));
      return { why: `Too close to the next junction or bend: a ${rl}-lane ring needs arms of ${Math.ceil(need * 2)} m (one is ${Math.round(a.len * 2)} m)`, hit: short.map(x => x.seg), ring };
    }
    // a ring (or a mini's island) at n must not take in another road or junction: the owner's rings may not run over an unrelated street
    const hit = t === 'roundabout' || t === 'mini' ? this.ringClash(n, t, rl) : [];
    return { why: hit.length ? 'Another road is in the way of the ring' : '', hit, ring };
  }
  /** what installing type t on node n costs (a roundabout re-laned pays the difference: a fall is free) and why it cannot be done: locked, already so,
   *  too few roads, what a ring would cover (T224), or not enough money ('' when it can). rl: the ring lanes of a roundabout. comp: the compensation
   *  for the built lots a ring takes in (added to the price, as a road's is); ring: what it takes (its props, lots and outlines) */
  installCheck(n: Node, t: NodeType, rl: 1 | 2 | 3): { cost: number; why: string; hit: Seg[]; comp: number; ring: RingVerdict<Prop> | null } {
    const spec = JUNCTIONS.find(j => j.id === t)!, same = t === 'signal' ? isLights(n) : n.type === t, relane = t === 'roundabout' && n.type === 'roundabout';
    const cost = relane ? Math.max(0, variantCost(t, rl) - variantCost(t, n.rl ?? 1)) : variantCost(t, rl);
    let why = '', hit: Seg[] = [], ring: RingVerdict<Prop> | null = null;
    if (!this.junctionOpen(t)) { const lk = unlockOf('junction', t)!; why = this.eventMode ? `${spec.name} needs the Roundabout card` : `${spec.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})`; }
    else if (same && (t !== 'roundabout' || (n.rl ?? 1) === rl)) why = t === 'signal' ? 'It already has traffic lights' : t === 'plain' ? 'It is already plain' : t === 'stop' ? 'It is already an all-way stop' : t === 'mini' ? 'It is already a mini-roundabout' : `It already has a ${rl}-lane ring`;
    else if (n.arms.length < spec.minDeg) why = t === 'roundabout' ? 'A roundabout needs a junction or a bend in the road' : 'Needs a junction of three or more roads';
    else if (t === 'mini' && !miniFits(n)) why = 'Too big for a mini-roundabout (2 lanes each way at most)';
    else if (t === 'roundabout' || t === 'mini') ({ why, hit, ring } = this.ringPhysical(n, t, rl));
    const comp = ring?.comp ?? 0;
    if (!why && cost + comp > this.money) why = `Not enough money: ${relane ? `the ${rl}-lane ring` : spec.name.toLowerCase()} costs $${cost.toLocaleString()}${comp ? ` and $${comp.toLocaleString()} compensation` : ''}`;
    return { cost, why, hit, comp, ring };
  }
  /** the radius (tiles) a roundabout of rl ring lanes, or a mini (t), would have at node n: its circle */
  ringOf(n: Node, t: NodeType, rl: 1 | 2 | 3): number { const hs = n.arms.map(a => a.h); return t === 'roundabout' ? ringRadius(hs, rl) : Math.max(4, Math.max(...hs) + 1); }
  /** the segs in the way when a roundabout (or mini) of type t at node n, with rl ring lanes, would take in a road that is not one of n's arms: a seg within its
   *  circle plus the widest arm's walk (an arm's own continuation may meet the circle at its far end only), or a node within that reach that is not
   *  an arm's far end */
  private ringClash(n: Node, t: NodeType, rl: 1 | 2 | 3): Seg[] {
    const R = this.ringOf(n, t, rl) + Math.max(0, ...n.arms.map(a => a.walk)), out: Seg[] = [];
    const far = (m: Node) => n.arms.some(a => a.other === m);
    for (const s of this.net.segsNear(n, R + 12)) {
      if (s.a === n || s.b === n) continue;
      if (segDist(n, s) < R + (far(s.a) || far(s.b) ? 0 : s.cls.h + s.cls.walk) || [s.a, s.b].some(m => m !== n && !far(m) && Math.hypot(m.x - n.x, m.y - n.y) < R)) out.push(s);
    }
    return out;
  }
  /** installs type t on node n, as the brush, the Type control and the ring-lane chips do: the money is spent, new lights get the best tier open this
   *  year (lights already there keep their tier), a roundabout's ring lanes are set. The junction is selected even when refused (the panel says why) */
  private installType(n: Node, t: NodeType, rl: 1 | 2 | 3): boolean {
    this.selectedJunction = n;
    const { cost, why, comp, ring } = this.installCheck(n, t, rl);
    // the junction already is that type: the click just selects it (no warning)
    if (why && /^It (already|is already)/.test(why)) { this.emit(); return false; }
    if (why) { this.toast(why, 'warn'); this.emit(); return false; }
    const relane = n.type === 'roundabout' && t === 'roundabout', name = JUNCTIONS.find(j => j.id === t)!.name;
    // what the ring takes in goes, as under a new road (T224): the small placed items for nothing, the built lots for their compensation (the
    // worker's partition drops them with the commit below; the big props, the businesses, the range and the iconic places refused it: installCheck)
    const took = this.ringTaken(ring, comp);
    this.traffic.spend('construction', cost);
    if (n.type !== t) this.edit.setNodeType(n, t);
    if (t === 'signal') this.edit.setSignal(n, this.signalTier(), undefined);
    if (t === 'roundabout') { this.edit.setNodeFlags(n, !!n.wide, !!n.tl, rl); this.ringLanes = rl; }
    else if ((t === 'stop' || t === 'mini') && (n.wide || n.tl)) this.edit.setNodeFlags(n, false, false, n.rl ?? 1); // no options on a stop or a mini: its flags go
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const m = this.net.nodeAt({ x: n.x, y: n.y }) ?? n; this.selectedJunction = m;
    const warn = this.armWarn(m);
    if (warn) this.toast(warn, 'warn');
    else this.toast((relane ? `Roundabout: ${rl} ring lane${rl > 1 ? 's' : ''}` : `${name} installed`) + took, 'good');
    return true;
  }
  /** a ring's click takes what it covers (T224): its props are removed, its compensation is spent; the words for the toast (" · 2 buildings cleared, $9,000
   *  compensation · 3 items cleared"), '' when it took nothing */
  private ringTaken(ring: RingVerdict<Prop> | null, comp: number): string {
    if (!ring) return '';
    for (const p of ring.props) this.removeProp(p);
    if (comp) this.traffic.spend('compensation', comp);
    const nl = ring.lots.length, np = ring.props.length;
    return `${nl ? ` · ${nl} building${nl > 1 ? 's' : ''} cleared, $${comp.toLocaleString()} compensation` : ''}${np ? ` · ${np} item${np > 1 ? 's' : ''} cleared` : ''}`;
  }
  /** the Type control: the selected junction takes type t (a roundabout with ringLanes), as the brush would install it */
  setSelectedType(t: NodeType) { const n = this.selectedNode(); if (n) this.installType(n, t, this.ringLanes); this.emit(); }
  /** why a flag cannot go on at node n ('' when it can): its rule (flagRule), then the money */
  flagWhy(n: Node, k: 'wide' | 'tl'): string {
    const cost = FLAG_COST[k];
    return flagRule(n, k) || (cost > this.money ? `Not enough money: ${k === 'wide' ? 'widened turns' : 'turn lanes'} cost $${cost.toLocaleString()}` : '');
  }
  /** a flag on node n (widened turns, turn lanes): on costs FLAG_COST (refused by flagWhy), off is free. The junction is selected */
  setFlag(n: Node, k: 'wide' | 'tl', on: boolean) {
    this.selectedJunction = n;
    const name = k === 'wide' ? 'Widened turns' : 'Turn lanes', cost = FLAG_COST[k];
    if (on) { const why = this.flagWhy(n, k); if (why) { this.toast(why, 'warn'); this.emit(); return; } this.traffic.spend('construction', cost); }
    this.edit.setNodeFlags(n, k === 'wide' ? on : !!n.wide, k === 'tl' ? on : !!n.tl);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.toast(on ? `${name} added` : `${name} removed`, 'good');
  }
  /** the slipways of lights node n: the corners whose degs are in on have one, the others none (see slipPlan). Each corner that turns on pays
   *  SLIP_CORNER_COST; the last one off makes plain lights ('signal'). The junction is selected */
  setSlipways(n: Node, on: number[]) {
    this.selectedJunction = n;
    const cur = slipsOn(n), adds = on.filter(d => !cur.includes(d)).length, cost = adds * SLIP_CORNER_COST, plan = slipPlan(n, on);
    if (cost > this.money) { this.toast(`Not enough money: ${adds > 1 ? `${adds} slipways cost` : 'a slipway costs'} $${cost.toLocaleString()}`, 'warn'); this.emit(); return; }
    if (cost) this.traffic.spend('construction', cost);
    if (plan.type === 'signal') { if (n.type !== 'signal') this.edit.setNodeType(n, 'signal'); }
    else { if (n.type !== 'slip') this.edit.setNodeType(n, 'slip'); this.edit.setSlipOff(n, plan.off); }
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const dn = on.length - cur.length, pl = dn < 0 ? `${-dn > 1 ? `${-dn} slipways` : 'Slipway'} removed` : `${dn > 1 ? `${dn} slipways` : 'Slipway'} added for $${cost.toLocaleString()}`;
    this.toast(dn === 0 ? 'Slipways unchanged' : plan.type === 'signal' && dn < 0 ? `${pl}: plain lights again` : pl, dn === 0 ? 'info' : 'good');
  }
  /** a click on a corner's + or × (see cornerHit): that corner's slipway turns on (SLIP_CORNER_COST) or off (free), the others kept */
  private slipClick(n: Node, c: Corner) { const cur = slipsOn(n); this.setSlipways(n, c.on ? cur.filter(d => d !== c.deg) : [...cur, c.deg]); }
  /** the Upgrade (or Downgrade) tool's plan at tile t (null: no tile): the straight run of road under it (see straightChain; a toll plaza has none), the
   *  class it goes to (one step along WIDER, or back along NARROWER), what it costs (the difference between the two classes over the run; negative on a
   *  downgrade: a refund) and why it cannot be done */
  private laneUpdate(t: Pt | null) {
    const down = this.tool === 'downgrade', piece = t ? this.net.pieceNear(t) : null;
    if (!piece) { this.laneHover = t ? { segs: [], to: null, cost: 0, why: 'Point at a road', down, comp: 0, rings: [] } : null; return; }
    const tolls = [...this.tollSegs.values()], seg = piece.seg;
    const segs = straightChain(seg, x => tolls.includes(x)), next = (down ? NARROWER : WIDER)[seg.cls.id], to = next ? classOf(next) : null;
    let raw = 0; if (to) for (const s of segs) raw += vlen(sub(s.b, s.a)) * (to.cost - s.cls.cost) * STRUCT_COST[s.kind];
    const cost = Math.round(raw);
    let why = '', rg: { comp: number; rings: RingVerdict<Prop>[] } = { comp: 0, rings: [] };
    if (tolls.includes(seg)) why = down ? 'Toll plazas cannot be narrowed' : 'Toll plazas cannot be widened';
    else if (!to) why = down ? `${seg.cls.name} is already the smallest road of its kind` : `${seg.cls.name} is already the biggest road of its kind (more in Phase 7)`;
    else if (!down && !this.classOpen(to.id)) why = this.classLockWhy(to.id);
    else if (to.h + to.walk > seg.cls.h + seg.cls.walk && this.widenClash(segs, to)) why = 'No room to widen: another road is too close';
    else if (!down && (rg = this.widenRings(segs, to)).rings.some(r => r.why)) why = rg.rings.find(r => r.why)!.why;
    else if (cost + rg.comp > this.money) why = `Not enough money: ${to.name.toLowerCase()} costs $${cost.toLocaleString()} more${rg.comp ? ` and $${rg.comp.toLocaleString()} compensation` : ''}`;
    this.laneHover = { segs, to, cost, why, down, comp: why ? 0 : rg.comp, rings: rg.rings };
  }
  /** T224: widening a run to class `to` grows every roundabout (and mini) at its ends, a ring being as wide as its widest arm: each is judged as a ring
   *  placed there would be (what it would cover refuses it, the buildings it takes are paid for). The verdicts, and the compensation of those that can go */
  private widenRings(segs: Seg[], to: RoadClass): { comp: number; rings: RingVerdict<Prop>[] } {
    const run = new Set(segs), done = new Set<Node>(), rings: RingVerdict<Prop>[] = []; let comp = 0;
    for (const sg of segs) for (const m of [sg.a, sg.b]) {
      if (done.has(m) || !(m.rb > 0) || (m.type !== 'roundabout' && m.type !== 'mini')) continue;
      done.add(m);
      const v = this.ringJudge(m, m.type, m.rl ?? 1, m.arms.map(a => (run.has(a.seg) ? to.h : a.h)), Math.max(0, ...m.arms.map(a => (run.has(a.seg) ? to.walk : a.walk))));
      if (v) { rings.push(v); comp += v.why ? 0 : v.comp; }
    }
    return { comp, rings };
  }
  /** true when widening the run segs to class to would make their corridors meet a road they do not meet already (a new overlap, not the contact a
   *  junction has), or would put a seg through the circle of a roundabout or mini the run does not touch (a ring the run ends at re-sizes itself) */
  private widenClash(segs: Seg[], to: RoadClass): boolean {
    const run = new Set(segs), ends = new Set(segs.flatMap(s => [s.a, s.b])), wide = to.h + to.walk; // a ring the run touches is its own arm: it re-sizes itself
    for (const s of segs) {
      const L = vlen(sub(s.b, s.a)), mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, ws = s.cls.h + s.cls.walk;
      for (const t of this.net.segsNear(mid, L / 2 + 14)) {
        if (run.has(t) || t.a === s.a || t.a === s.b || t.b === s.a || t.b === s.b) continue;
        const gap = segSeg(s.a, s.b, t.a, t.b), tw = t.cls.h + t.cls.walk;
        if (gap < wide + tw - 0.5 && gap >= ws + tw - 0.5) return true;
      }
      for (const t of this.net.segsNear(mid, L / 2 + 30)) for (const n of [t.a, t.b]) if (n.rb > 0 && !ends.has(n) && segDist(n, s) < n.rb + wide) return true;
      // a ring the run is an arm of grows with its widest arm: every arm must still be long enough for it (see installCheck)
      for (const n of [s.a, s.b]) if (n.type === 'roundabout' && n.rb > 0) { const rl = n.rl ?? 1, need = ringRadius(n.arms.map(a => (a.seg === s ? to.h : a.h)), rl) + (rl > 1 ? 6 : 2); if (n.arms.some(a => a.len < need)) return true; }
    }
    return false;
  }
  /** the Upgrade (Downgrade) tool's click: every seg of the run goes one class up (down), its kind and line style kept, and the difference is charged
   *  (refunded); the network rebuilds at once */
  private laneClick() {
    const h = this.laneHover; if (!h) return;
    if (!h.segs.length || !h.to || h.why) { this.toast(h.why || 'Point at a road', 'warn'); return; }
    const took = h.rings.map(r => this.ringTaken(r, r.comp)).join(''); // the buildings and items the grown rings take (T224)
    this.traffic.spend('construction', h.cost);
    let tiles = 0;
    const from = h.segs[0]!.cls.name.toLowerCase();
    for (const s of h.segs) { tiles += vlen(sub(s.b, s.a)); this.edit.addLegs([{ a: s.a, b: s.b }], h.to, s.style, [s.kind]); }
    this.commitNetwork(); this.puff(h.segs[0]!.a.x, h.segs[0]!.a.y, 8);
    const price = h.cost < 0 ? `refund $${(-h.cost).toLocaleString()}` : `$${h.cost.toLocaleString()}`;
    this.toast(`${h.down ? 'Downgraded' : 'Upgraded'} ${Math.round(tiles * 2)} m of ${from} to ${h.to.name.toLowerCase()} (${price})${took}`, 'good');
    this.laneUpdate(this.hover);
  }
  /** the Upgrade and Downgrade tools' right-click: the one-way straight run under the pointer is reversed (each seg replaced with its b-to-a, free); a two-way road is refused */
  private laneReverse(mx: number, my: number) {
    this.laneUpdate(this.tileAt(mx, my));
    const h = this.laneHover; if (!h || !h.segs.length) { this.toast('Point at a road', 'warn'); return; }
    const s0 = h.segs[0]!;
    if (!s0.cls.oneway) { this.toast('Only one-way roads can be reversed', 'warn'); return; }
    let tiles = 0;
    for (const s of h.segs) { tiles += vlen(sub(s.b, s.a)); this.edit.addLegs([{ a: s.b, b: s.a }], s.cls, s.style, [s.kind]); }
    this.commitNetwork();
    this.toast(`Reversed ${Math.round(tiles * 2)} m of one-way ${classOf(s0.cls.base).name.toLowerCase()}`, 'good');
    this.laneUpdate(this.hover);
  }
  /** the junction tool's badges (street and district zoom, drawn while the tool is open): one label per junction in view, dark like the old tags: its control
   *  (F, A or Ad for lights; RB and the ring lanes for a roundabout) and its options (W, TL, and SL with the slipways on). A plain junction with none has no label */
  private drawJunctionBadges(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = `600 ${11 * this.dpr}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const d = this.dpr, W = this.cw, H = this.ch;
    for (const n of this.net.nodes.values()) {
      if (n.type === 'plain' && !n.wide && !n.tl) continue;
      const s = this.screen(n.x, n.y);
      if (s.x < -40 * d || s.x > W + 40 * d || s.y < -40 * d || s.y > H + 40 * d) continue;
      const parts: string[] = [];
      if (isLights(n)) parts.push(TIER_BADGE[n.sig ?? 1]!);
      if (n.type === 'roundabout') parts.push(`RB ${n.rl ?? 1}`);
      if (n.type === 'stop') parts.push('4S');
      if (n.type === 'mini') parts.push('MR');
      if (n.wide) parts.push('W');
      if (n.tl) parts.push('TL');
      const sl = n.type === 'slip' ? slipsOn(n).length : 0;
      if (sl) parts.push(`SL ${sl}`);
      if (!parts.length) continue;
      // the selected junction's badge sits above its ring, clear of the corner buttons
      const sel = n === this.selectedNode(), rr = sel ? (Math.max(...n.arms.map(a => a.h)) + 1.5) * Math.SQRT1_2 : 0;
      const tag = parts.join(' · '), y = sel ? this.screen(n.x - rr, n.y - rr).y - 22 * d : s.y - 14 * d, w = ctx.measureText(tag).width + 8 * d, h = 16 * d;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(s.x - w / 2, y - h / 2, w, h);
      ctx.fillStyle = '#fde68a'; ctx.fillText(tag, s.x, y);
    }
  }
  /** the selected junction (the junction tool): a solid ring round it and, for lights, a round button at each corner that takes a slipway or has one:
   *  '+' (none) or '×' (has one). The buttons are the map's hit areas too (see cornerHit) */
  private drawSelectedJunction(ctx: CanvasRenderingContext2D) {
    const n = this.selectedNode(); if (!n) return;
    const r = Math.max(...n.arms.map(a => a.h)) + 1.5;
    this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
    if (!isLights(n)) return;
    const d = this.dpr, R = 8 * d;
    ctx.font = `700 ${12 * d}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of junctionCorners(n)) {
      if (!c.fits && !c.on) continue;
      const s = this.screen(c.at.x, c.at.y);
      ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2);
      ctx.fillStyle = c.on ? '#fbbf24' : '#0f172a'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5 * d; ctx.stroke();
      ctx.fillStyle = c.on ? '#0f172a' : '#fde68a'; ctx.fillText(c.on ? '×' : '+', s.x, s.y + 0.5 * d);
    }
  }
  /** the corner button under the pointer (within 14 px; a corner that takes a slipway or has one) of the selected lights: its node and corner, or null */
  private cornerHit(mx: number, my: number): { n: Node; c: Corner } | null {
    const n = this.selectedNode(); if (!n || !isLights(n)) return null;
    let hit: Corner | null = null, bd = 14;
    for (const c of junctionCorners(n)) {
      if (!c.fits && !c.on) continue;
      const s = this.screen(c.at.x, c.at.y), dd = Math.hypot(s.x / this.dpr - mx, s.y / this.dpr - my);
      if (dd < bd) { bd = dd; hit = c; }
    }
    return hit ? { n, c: hit } : null;
  }
  /** the junction tool's right click (before the pan): with a type brush the junction under it resets to plain (free) and is selected; a right click on
   *  empty ground deselects. Returns true when it reset a junction (then no pan starts) */
  private junctionRight(mx: number, my: number): boolean {
    const n = this.net.nearestNode(this.tileAt(mx, my), 2, 5);
    if (!n) { if (this.selectedJunction) { this.selectedJunction = null; this.emit(); } return false; }
    if (this.brush === 'select' || n.type === 'plain') return false;
    this.edit.setNodeType(n, 'plain'); this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.selectedJunction = this.net.nodeAt({ x: n.x, y: n.y }) ?? n;
    this.toast('Reset to plain (free)', 'good'); return true;
  }
  /** the junction tool's click: a corner button of the selected lights toggles that slipway; with the select brush a click selects the junction under it
   *  (empty ground deselects); with a type brush the type is installed on the junction under it (installType) */
  private junctionClick(mx: number, my: number) {
    const hit = this.cornerHit(mx, my);
    if (hit) { this.slipClick(hit.n, hit.c); return; }
    const t = this.tileAt(mx, my);
    if (this.brush === 'select') { this.selectedJunction = this.net.nearestNode(t, 2, 5); this.emit(); return; }
    const type: NodeType = this.brush, minDeg = JUNCTIONS.find(j => j.id === type)!.minDeg;
    const n = this.net.nearestNode(t, minDeg, 5);
    if (!n) { this.toast(minDeg > 2 ? 'Click a junction where three or more roads meet' : 'Click a junction or a bend in the road', 'warn'); return; }
    this.installType(n, type, this.ringLanes); this.emit();
  }
  /** the selected junction as the network holds it now (a rebuild can replace the node object; a junction that is gone deselects), or null */
  selectedNode(): Node | null { const s = this.selectedJunction; if (!s) return null; this.selectedJunction = this.net.nodeAt({ x: s.x, y: s.y }) ?? null; return this.selectedJunction; }
  /** the warning for a junction whose arms are too short for its type (slipways need 54 m; a roundabout's ring needs its radius plus 12 m), or '' */
  private armWarn(n: Node): string {
    if (n.type === 'slip' && !n.arms.every(a => a.len >= 27)) return 'Slipways need long approaches (54 m+): short arms get plain corners';
    return '';
  }
  /** Tab (Shift+Tab back) in the road tool: the variant of the type in hand moves to the next one (CLASS_VARIANTS: one-way, trees, turn lane, median). Nothing is toasted */
  flipVariant(dir: 1 | -1) {
    const list = CLASS_VARIANTS[this.cls.base]!;
    if (list.length < 2) return;
    let i = list.indexOf(this.roadClass); if (i < 0) i = 0;
    this.roadClass = list[(i + dir + list.length) % list.length]!; this.emit();
  }
  /** the road tool's type pick: the same type keeps the variant in hand, another type starts at its plain variant */
  pickType(t: TypeId) { if (this.cls.base !== t) this.roadClass = CLASS_VARIANTS[t]![0]!; this.emit(); }
  /** Tab (Shift+Tab back) in the junction tool: the junction or bend under the pointer moves to the next type it can take (the open types in VARIANTS
   *  that fit its arms; a bend takes plain and the roundabouts). Money is checked for the rise; a flip down is free. The junction is selected, so the panel follows */
  private flipJunction(dir: 1 | -1) {
    const n = this.hover ? this.net.nearestNode(this.hover, 2, 5) : null;
    if (!n) { this.toast('Hover a junction or a bend in the road', 'warn'); return; }
    // a ring variant the rules refuse (T224: what it would cover, arms too short, another road in its circle) is skipped, so Tab never sticks on it;
    // the first reason is toasted with the flip
    const refused: string[] = [];
    const fits = VARIANTS.filter(v => {
      if (!(this.junctionOpen(v.type) && (v.type === 'plain' || n.arms.length >= JUNCTIONS.find(j => j.id === v.type)!.minDeg) && (v.type !== 'mini' || miniFits(n)))) return false;
      const cur = v.type === n.type && (v.type !== 'roundabout' || v.rl === (n.rl ?? 1));
      if (cur || (v.type !== 'roundabout' && v.type !== 'mini')) return true;
      const why = this.ringPhysical(n, v.type, v.rl).why; if (why) refused.push(why);
      return !why;
    });
    const i = fits.findIndex(v => v.type === n.type && (v.type !== 'roundabout' || v.rl === (n.rl ?? 1)));
    const k = i < 0 ? (dir > 0 ? 0 : fits.length - 1) : (i + dir + fits.length) % fits.length;
    if (k === i) { this.toast(refused[0] ?? 'No other junction type is open for this junction yet', 'warn'); return; }
    const v = fits[k]!, name = JUNCTIONS.find(j => j.id === v.type)!.name + (v.type === 'roundabout' ? `, ${v.rl} ring lane${v.rl > 1 ? 's' : ''}` : '');
    const price = variantCost(v.type, v.rl), ring = this.ringJudge(n, v.type, v.rl), comp = ring?.comp ?? 0, cost = Math.max(0, price - variantCost(n.type, n.rl ?? 1));
    if (cost + comp > this.money) { this.toast(`Not enough money: ${name} costs $${(price + comp).toLocaleString()}${comp ? ` with $${comp.toLocaleString()} compensation` : ''}`, 'warn'); return; }
    const took = this.ringTaken(ring, comp);
    this.traffic.spend('construction', cost);
    if (v.type === 'roundabout') this.ringLanes = v.rl;
    const hadLights = isLights(n), lit = v.type === 'signal' || v.type === 'slip';
    this.edit.setNodeType(n, v.type);
    if (lit && !hadLights) this.edit.setSignal(n, this.signalTier(), undefined);
    if (v.type === 'slip') this.edit.setSlipOff(n, []);
    if (v.type === 'roundabout') this.edit.setNodeFlags(n, !!n.wide, !!n.tl, v.rl);
    else if ((v.type === 'stop' || v.type === 'mini') && (n.wide || n.tl)) this.edit.setNodeFlags(n, false, false, n.rl ?? 1);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    const m = this.net.nodeAt({ x: n.x, y: n.y }) ?? n; this.selectedJunction = m;
    const warn = this.armWarn(m);
    if (warn) this.toast(warn, 'warn');
    else this.toast(`${name} (${price ? '$' + price.toLocaleString() : 'free'})${took} · Tab for the next type${refused.length ? ` · ${refused[0]}` : ''}`, 'good');
  }
  /** the fixed-time green seconds of each phase (the panel's sliders, once released): sets the lights to fixed-time and commits the network */
  setSplit(n: Node, split: number[]) { this.edit.setSignal(n, 0, split); this.commitNetwork(); }
  /** buys the selected lights' upgrade to tier (1 actuated, 2 adaptive): the tier's year must have come and the cost be paid; the split is kept */
  upgradeSignal(tier: 1 | 2) {
    const n = this.selectedNode(); if (!n || !isLights(n) || (n.sig ?? 1) >= tier) return;
    const name = tier === 1 ? 'Actuated' : 'Adaptive', cost = UPGRADE_COST[tier]!;
    if (this.signalTier() < tier) { this.toast(`${name} lights from ${SIGNAL_TIER_YEAR[tier]}`, 'warn'); return; }
    if (cost > this.money) { this.toast(`Not enough money: ${name.toLowerCase()} lights cost $${cost.toLocaleString()}`, 'warn'); return; }
    this.traffic.spend('construction', cost);
    this.edit.setSignal(n, tier, n.split);
    this.commitNetwork(); this.puff(n.x, n.y, 8);
    this.toast(`${name} lights${tier === 1 ? ' (loop detectors)' : ''} installed for $${cost.toLocaleString()}`, 'good');
  }
  /** the calendar: the year against the one seen last frame; a signal tier's year coming in toasts once (the first frame only records the year) */
  /** a range start's season card (plan P22 2.5.3): set when a founding season ends with no tournament; the UI's Continue clears it */
  seasonReport: SeasonReport | null = null;
  dismissSeasonReport() { this.seasonReport = null; this.emit(); }
  /** the seasons played: the tournaments held and a range start's founding seasons (the calendar's year and the grow-in months count both) */
  private seasonsDone(): number { return this.traffic.round.runs + (this.golf?.founding ?? 0); }
  /** a range start's invitation checklist (golf/tour.ts invitedFacts: the holes with a tee and a pin, a car park, a clubhouse); null in other games */
  inviteCheck(): InviteCheck | null {
    if (this.golf?.start !== 'range') return null;
    return invitedFacts({ holes: this.courseHoleViews().filter(h => h.par > 0).length, carpark: this.parkDefs.length > 0, clubhouse: this.bizDefs.some(d => d.type === 'clubhouse') });
  }
  /** the founding seasons as the HUD shows them (range starts; null otherwise): the checklist, whether the tour has invited the player, and whether
   *  the tournament is held at this season's end (the invitation came at least 3 months before it) */
  foundingView(): { check: InviteCheck; invited: boolean; due: boolean } | null {
    const g = this.golf; if (g?.start !== 'range') return null;
    const c = this.traffic.clockTime(performance.now()), next = Math.floor(c / GAME_DAY) * GAME_DAY + GAME_DAY;
    return { check: this.inviteCheck()!, invited: !!g.invited, due: tournamentDue(g.invited?.at, next) };
  }
  // ---------- a range start's first minute (plan P22 2.8, T095) ----------
  /** the holes with a par, as the last progress check counted them */
  private playableHoles = 0;
  /** whether the tee ring is drawn (the progress check sets it: a range start's New hole in hand before its first hole) */
  private teeRingOn = false;
  /** the road the range stands on, by name ('' until the network names it) */
  private rangeRoadName = '';
  /** the save the welcome card's freshness was read for, and whether that game was new then (under WELCOME_PLAY_S of play) */
  private welcomeFor: GolfSave | null = null; private welcomeFresh = false;
  /** whether a new range game's first-minute moment id has passed (GolfProgress.seen keeps it: 'welcome', 'first-street', 'first-house',
   *  'town-named'). A range save from before the ramp (T132) has no moments: they happened long ago */
  private firstSeen(id: string): boolean { return !!this.golf?.progress?.seen.includes(id); }
  /** marks moment id passed (saved): true the first time in a new range game, false after that and in every other game */
  private firstMark(id: string): boolean {
    const g = this.golf, p = g?.progress;
    if (g?.start !== 'range' || !p || p.ramp === undefined || p.seen.includes(id)) return false;
    p.seen.push(id); this.scheduleSave(); return true;
  }
  /** the town's first building starts and its first one finishes (a new range game, P22 2.8): "Someone is building a house across from your
   *  range", then the town has its name: "Pine Hollow is on the map" (the minimap names it; the title bar says the club, T235) */
  private townFirsts(events: readonly { kind: string; use: number }[]) {
    if (this.golf?.start !== 'range') return;
    const b = events.find(e => e.kind === 'build');
    if (b && this.firstMark('first-house')) {
      const what = b.use === LU.RES ? 'a house' : b.use === LU.COM ? 'a shop' : b.use === LU.IND ? 'a workshop' : 'a building';
      this.toast(`Someone is building ${what} across from your range`, 'good');
    }
    if (events.some(e => e.kind === 'complete') && this.firstMark('town-named')) { this.toast(`${this.names.town(0)} is on the map`, 'good'); this.emit(); }
  }
  /** the name of the road the range stands on (its front's road side), '' until the network has it */
  private rangeRoad(): string {
    if (this.rangeRoadName) return this.rangeRoadName;
    const g = this.golf, d = g?.start === 'range' ? this.bizDefs.find(q => q.type === 'range') : undefined; if (!g || !d) return '';
    // the road's centre line runs NEAR tiles off the front's road side; the side away from the way the golfers hit
    const off = 6, cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    const at = g.dir === 0 ? { x: cx, y: d.y + d.h + off } : g.dir === 1 ? { x: d.x - off, y: cy } : g.dir === 2 ? { x: cx, y: d.y - off } : { x: d.x + d.w + off, y: cy };
    return (this.rangeRoadName = this.roadNameAt(at));
  }
  /** whether a new range game's town is still unnamed: its name comes with its first finished building ("Pine Hollow is on the map") */
  private townUnnamed(): boolean { const g = this.golf; return g?.start === 'range' && g.progress?.ramp !== undefined && !this.firstSeen('town-named'); }
  /** town i's name as the map and the minimap say it, or null while a new range game's town is unnamed (P22 2.8) */
  townName(i: number): string | null { return i === 0 && this.townUnnamed() ? null : this.names.town(i); }
  /** the tournament run whose weather the game shows now (1-based, as getTournamentWeather takes it): the one the tournament chip and the grass
   *  read (during the evaluation the run just played, else the next). The title's weather is the month's in this run, so August's is the tournament's */
  weatherRun(): number { const r = this.traffic.round; return r.stage === 'eval' && r.last ? r.last.run : r.runs + 1; }
  /** the top bar's title (T235, #690; the concept's): in a golf game the club's name (golf/clubtitle.ts: "Maple Falls Driving Range" before a
   *  range start's first hole, "... Golf Club", "... Golf & Country Club" from tier 4) over "Year 3 • October • Sunny 16°C"; null in a classic
   *  town game (the old "Maple Falls / Town Builder"). holes: the course's holes with a tee and a pin (the founding chip's), counted here when not given */
  titleName(holes: number = this.inviteCheck()?.holes ?? 0): ClubTitle | null {
    const g = this.golf; if (!g) return null;
    const r = this.traffic.round, c = this.traffic.clockTime(performance.now()) - (r.stage !== 'free' ? 1 : 0), range = g.start === 'range';
    return clubTitle({ seed: this.seed, seasons: this.seasonsDone(), month: seasonMonth(c), run: this.weatherRun(), range, holes, tier: g.tier, road: range && holes < 1 ? this.rangeRoad() : '' });
  }
  /** the welcome card (P22 2.8): once per new range game, while it is new (under WELCOME_PLAY_S of play when loaded), until it is closed.
   *  newHole: New hole is open (the card's button then builds the first hole; while P24's ramp holds it, the button opens the range) */
  /** whether the first view's ground is baked (T188, P23-UX P2-3: the welcome card waits for it, never a black map behind it): set once every
   *  chunk on screen has a picture */
  firstViewBaked = false;
  /** the control the guide points at (T188: a data-guide anchor; the UI pulses a ring on it) until when (performance.now ms) */
  guideAnchor: { id: string; until: number } | null = null;
  /** pulses the anchor id for ms (the guide's Show me, a Fix) */
  pulseAnchor(id: string, ms = 3600) { this.guideAnchor = { id, until: performance.now() + ms }; this.emit(); }
  /** the guide's last event (T188: a hole built, the clubhouse placed, a car park built) and when: the hint bar says it a moment */
  guideDone: { text: string; at: number } | null = null;
  /** an engine event moves the guide on at once (T188): the progress is counted on the next frame (not ten frames on), the hint bar says what
   *  was done, and the next step's anchor pulses */
  guideEvent(e: GuideEvent) {
    if (this.golf?.start !== 'range') return;
    this.progTick = 9; if (e === 'hole') this.playableHoles++;
    this.guideDone = { text: e === 'hole' ? 'Hole built' : e === 'clubhouse' ? 'Clubhouse placed' : 'Car park built', at: performance.now() };
    this.emit(); // (T239: the guide's card ticks its step at the next check)
  }
  /** a founding checklist item's Fix (T188, ui/golf/season.ts FIX): its tool armed (New hole, the car park, the clubhouse) and its anchor pulsed */
  armFix(id: 'holes' | 'carpark' | 'clubhouse') {
    if (id === 'holes') { if (this.playableHoles < 1) this.startFirstHole(); else if (!this.refuseLocked('course')) { this.setTool('course'); this.paint.setPlan(); } }
    else if (id === 'carpark') { if (!this.refuseLocked('park')) this.setTool('park'); }
    else if (!this.refuseLocked('buildings')) this.placeClubhouse(true);
    this.pulseAnchor(id === 'holes' ? 'new-hole' : id === 'carpark' ? 'tool-park' : 'clubhouse-card');
  }
  welcomeView(): { road: string; newHole: boolean } | null {
    if (!welcomeReady(this.firstViewBaked, performance.now() - this.readyAt)) return null; // T188: the card waits for the ground
    const g = this.golf, p = g?.progress;
    if (g !== this.welcomeFor) { this.welcomeFor = g; this.welcomeFresh = !!p && p.playS < WELCOME_PLAY_S; }
    if (g?.start !== 'range' || !p || p.ramp === undefined || !this.welcomeFresh || p.seen.includes('welcome') || this.playableHoles > 0) return null;
    const ui = this.toolUi();
    return { road: this.rangeRoad() || 'the county road', newHole: !ui?.newHoleLock && !this.toolLock('course') };
  }
  /** closes the welcome card for good (saved); go: its button (Build the first hole when New hole is open, else the range card) */
  closeWelcome(go: boolean) {
    const v = this.welcomeView(), p = this.golf?.progress;
    if (p && !p.seen.includes('welcome')) { p.seen.push('welcome'); this.scheduleSave(); }
    const cur = rangeGuideCurrent(p?.guide); // T239: the guide's current step's Show me
    if (go && v) { if (cur !== undefined) this.guideShowMe(RANGE_GUIDE[cur - 1]!.id); else if (v.newHole) this.startFirstHole(); else this.showHint('hint-range-open'); }
    this.emit();
  }
  /** Build the first hole (the welcome card, the guide's Show me): Course on New hole, the camera on the ring's tee spot */
  startFirstHole() {
    if (this.refuseLocked('course')) return;
    const t = this.teeSpot(); if (t) this.lookAt(t.x, t.y, 0.12);
    this.setTool('course'); this.paint.setPlan(); if (this.playableHoles < 1) this.teeRingOn = true; this.emit();
  }
  /** the ring's suggested tee in a range start (P22 2.8): P06's newHoleSpot once T047 lands; until then guide.ts's fallbackTeeSpot, beside the
   *  range on the parcel. Null in other games */
  teeSpot(): { x: number; y: number } | null {
    const g = this.golf, d = g?.start === 'range' ? this.bizDefs.find(q => q.type === 'range') : undefined; if (!g || !d) return null;
    const front: [number, number, number, number] = [d.x, d.y, d.w, d.h], plot = plotOfFront(front, g.dir);
    return fallbackTeeSpot(plot, front, g.parcel, g.dir, practiceArea(plot, g.dir).box); // off the practice area beside the plot (T130)
  }
  /** a range start's guide step as a hint (P22 2.8, T095). T239: the guided build's card (rangeGuideView) lists the steps instead, so the hint
   *  bar shows none (a range save from before T239 has no guide) */
  guideHint(): FirstRunHint | null { return null; }
  // ---------- T239: the range start's guided build (guide.ts RANGE_GUIDE; ui/golf/RangeGuideCard.tsx)
  /** the facts the guided build's steps read */
  private rangeGuideFacts(): GuideFacts | null {
    const g = this.golf, p = g?.progress, b = g?.range; if (g?.start !== 'range' || !p || !b) return null;
    return {
      pieces: p.pieces, roads: p.roads, parks: p.parks, structures: p.structures, kinds: {}, runs: this.traffic.round.runs, holes: this.playableHoles,
      tutorial: 'on', step: 1, start: 'range', golfers: b.total.golfers, owned: b.owned, walkway: this.range.hasWalkway(), practiceForSale: this.practiceForSale(),
      putting: this.range.practiceFacts()?.putting ?? 'none',
    };
  }
  /** the guide's card: its lines (null: no guide running) and whether it is folded */
  rangeGuideView(): { lines: GuideLine[]; folded: boolean } | null {
    const lines = rangeGuideLines(this.golf?.progress?.guide); return lines ? { lines, folded: this.guideFolded } : null;
  }
  /** the guide's card folded to its current line (the player's; not saved) */
  guideFolded = false;
  /** ticks the steps whose builds are done (a few times a second), pays each its reward and says so */
  private rangeGuideCheck() {
    const gd = this.golf?.progress?.guide; if (!gd || gd.off) return;
    const f = this.rangeGuideFacts(); if (!f) return;
    const ticked = rangeGuideTick(gd, f); if (!ticked.length) return;
    for (const s of ticked) {
      const r = s.reward ?? 0; if (r > 0) this.traffic.spend('construction', -r); // (the reward offsets the builds: booked against construction)
      this.toast(`Guide: ${s.title} ✓${r > 0 ? ` (+$${r.toLocaleString()})` : ''}`, 'good');
    }
    if (!rangeGuideLines(gd)) this.toast('The guide is done: your range is built. Grow it, and the course, your way', 'good', this.sceneArt('range') ? { kind: 'range', view: 'road' } : undefined); // (T242: Set the scene)
    this.scheduleSave(); this.emit();
  }
  /** Skip on a guide line (no reward), or Skip guide (id null): the whole card goes */
  skipGuideStep(id: string | null) {
    const gd = this.golf?.progress?.guide; if (!gd) return;
    if (id === null) rangeGuideOff(gd); else if (!rangeGuideSkip(gd, id)) return;
    this.scheduleSave(); this.emit();
  }
  /** the rings the walking path step points at (T239: the car park's edge, the shack's counter, the tee's back), until a time */
  private guideRings: { pts: Pt[]; until: number } | null = null;
  /** Show me on a guide line: the tool or card it needs, the camera on its spot and its control pulsed */
  guideShowMe(id: string) {
    const st = RANGE_GUIDE.find(s => s.id === id), sc = this.range.scene; if (!st || !sc) return;
    const b = this.golf?.range, P = (u: number, v: number) => { const o = sc.anchors.lot[0]!; return { x: o.x + sc.roadDir.x * (u - 49) + sc.rangeSide.x * (v - 2), y: o.y + sc.roadDir.y * (u - 49) + sc.rangeSide.y * (v - 2) }; };
    const card = (anchor: string, at: Pt, z: number) => { this.setTool('select'); this.lookAt(at.x, at.y, z); this.openRangeCard(true); queueMicrotask(() => this.pulseAnchor(anchor)); };
    switch (st.n) {
      case 1: card('range-takings', sc.counter, RANGE_CAM_ZOOM); return;
      case 2: card('range-buy-greens', P(35, 50), 0.15); return;
      case 3: {
        if (this.refuseLocked('path')) return;
        const c = sc.carEdge, s = sc.counter, t = P(30, 17); this.lookAt((c.x + t.x) / 2, (c.y + t.y) / 2, 0.3);
        if (this.range.cardOpen) this.openRangeCard(false);
        this.setTool('path'); this.roadClass = 'cart-walk'; // Course › Cart paths & roads, its Walking path
        this.guideRings = { pts: [c, s, t], until: performance.now() + 20000 };
        queueMicrotask(() => this.pulseAnchor('rail-course')); this.emit(); return;
      }
      case 4: card(b?.owned.includes('gravel') ? 'range-buy-pave' : 'range-buy-gravel', P(59, 10), 0.3); return;
      case 5: card('range-buy-teeturf', P(35, 21), 0.3); return;
      case 6:
        if (this.practiceForSale()) { this.showPracticeSale(); queueMicrotask(() => this.pulseAnchor('land-buy')); }
        else { this.showPracticeArea(); queueMicrotask(() => this.pulseAnchor('rail-facilities')); }
        return;
      default: this.startFirstHole(); queueMicrotask(() => this.pulseAnchor('new-hole')); return;
    }
  }
  private foundTick = 0;
  /** the tour's invitation (range starts, about twice a second): the moment the checklist is met, golf.invited is the clock's time, the worker
   *  hears of it (setGolf) and a toast says which season's end holds the first tournament */
  private foundingCheck() {
    const g = this.golf; if (g?.start !== 'range' || g.invited || ++this.foundTick % 30) return;
    if (!this.inviteCheck()?.met) return;
    const c = this.traffic.clockTime(performance.now()), next = Math.floor(c / GAME_DAY) * GAME_DAY + GAME_DAY;
    g.invited = { at: c };
    this.sendGolf(); this.scheduleSave();
    this.toast(`The tour invites you: the ${tierInfo(1).name} at the end of ${tournamentDue(c, next) ? 'this' : 'next'} season`, 'good');
    this.emit();
  }
  /** a range start's season boundary (the ledger of the day that closed): with no tournament due there, the founding season ends with the season
   *  card (the season's business takings, the residents and the invitation checklist) and the calendar counts it (golf.founding) */
  private foundingSeasonEnd(l: Ledger) {
    const g = this.golf; if (g?.start !== 'range') return;
    const boundary = Math.round(this.traffic.clockTime(performance.now()) / GAME_DAY) * GAME_DAY;
    if (tournamentDue(g.invited?.at, boundary)) return;
    const year = yearOf(this.seasonsDone());
    g.founding = (g.founding ?? 0) + 1;
    this.seasonReport = { year, takings: l.business, residents: this.traffic.pop, check: this.inviteCheck()!, invited: !!g.invited, ...(g.range ? { range: { ...g.range.season } } : {}), ...(this.traffic.room !== null ? { room: this.traffic.room } : {}) };
    this.scheduleSave();
  }
  private yearCheck() {
    const y = this.traffic.round.year, was = this.seenYear; this.seenYear = y;
    // a jump of more than one year is a load (or a new valley), not a finished round: no toast
    if (!was || y !== was + 1) return;
    for (let i = 1; i < SIGNAL_TIER_YEAR.length; i++) if (was < SIGNAL_TIER_YEAR[i]! && y >= SIGNAL_TIER_YEAR[i]!) this.toast(`${SIGNAL_TIER_YEAR[i]}: ${SIGNAL_TOAST[i]} available: select lit junctions with the Junctions tool to upgrade them`, 'good');
  }
  private bulldozeAt(mx: number, my: number, first: boolean) {
    const t = this.tileAt(mx, my);
    if (first) {
      const p = this.propAt(mx, my);
      if (this.golf?.structures?.length) {
        let hitId: number | null = null;
        if (p) for (const [sid, sp] of this.golfStructureProps) if (sp === p) { hitId = sid; break; }
        const idx = findStructureIndexAt(this.golf.structures, t.x, t.y, hitId);
        if (idx >= 0) { this.removeStructure(idx); return; }
      }
      if (p && !p.auto) { const it = LIBRARY[p.item], back = this.sellValue(p); this.removeProp(p); this.traffic.spend('construction', -back); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(back ? `Removed ${it.name} (+$${back.toLocaleString()})` : `Removed ${it.name}`); return; }
  
      if (this.golf && this.practice.removeAt(t.x, t.y)) return; // T206: a practice facility goes whole, half its price back
      const k = this.parkIndexAt(t);
      if (k >= 0) { const id = this.parkDefs[k]!.id; this.removePark(k); this.scheduleSave(); this.toast(`Removed car park #${id} (no refund)`); this.emit(); return; }
      const g = this.tollIndexAt(t);
      if (g >= 0) { const id = this.tollDefs[g]!.id; this.removeToll(g); this.scheduleSave(); this.toast(`Removed toll gate #${id} (the road stays; no refund)`); this.emit(); return; }
      const b = this.busIndexAt(t);
      if (b >= 0) { const id = this.busDefs[b]!.id; this.removeBus(b); this.scheduleSave(); this.toast(`Removed bus route #${id} (no refund)`); this.emit(); return; }
    }
    const piece = this.net.pieceNear(t);
    if (!piece) { if (first) this.buyOut(t); return; }
    const before = this.roadValue(), name = piece.seg.cls.name.toLowerCase();
    this.edit.removePiece(piece); this.tidyEnds([piece.p0, piece.p1, piece.seg.a, piece.seg.b]);
    const refund = Math.round(before - this.roadValue()); // the piece and the dead ends tidyEnds trimmed after it
    if (refund > 0) { this.traffic.spend('construction', -refund); this.toast(`Removed ${name} (+$${refund.toLocaleString()})`); }
    this.commitNetwork();
    this.hoverPiece = this.net.pieceNear(t);
    this.puff(t.x, t.y, 10);
  }
  /** after cuts (the bulldozer, Replace): each dead end at pts (a cut's ends, the nodes of a seg taken whole) that crowds another road is cut back
   *  until it clears it (RoadNetwork.clearCut), a dead-end stub under 2 tiles goes, and the ends that leaves are looked at in turn. (A short seg
   *  taken whole left the two roads beside it as dead ends whose turning circles overlapped: the road builder's stress test, 2026-10-19) */
  private tidyEnds(pts: Pt[]) {
    const todo = [...pts];
    for (let k = 0; k < 40 && todo.length; k++) {
      const n = this.net.nodeAt(todo.pop()!); if (!n || n.segs.length !== 1) continue;
      const s = n.segs[0]!, d = sub(s.b, s.a), L = vlen(d), u = mul(d, 1 / L), atA = s.a === n, other = atA ? s.b : s.a;
      let cut = L;
      if (L >= 2) { const [s0, s1] = atA ? this.net.clearCut(s, 0, 0.001) : this.net.clearCut(s, L - 0.001, L); cut = atA ? s1 : L - s0; if (cut <= 0.01) continue; }
      if (L - cut < 2) cut = L;
      this.edit.removePiece(atA ? { seg: s, p0: s.a, p1: cut >= L ? s.b : add(s.a, mul(u, cut)) } : { seg: s, p0: cut >= L ? s.a : add(s.a, mul(u, L - cut)), p1: s.b });
      todo.push(cut >= L ? other : add(s.a, mul(u, atA ? cut : L - cut)));
    }
  }
  /** the bulldozer on a town building (no road, no prop there): the built lot (BUILDING or more) under tile t is bought out for its compensation, if the
   *  treasury covers it. The worker clears the lot and holds it (see City.buyLot); its price is spent there */
  private buyOut(t: Pt) {
    let v: LotView | null = null;
    for (const l of this.traffic.lots.values()) {
      if (l.level < LV.BUILDING) continue;
      const dx = t.x - l.o[0], dy = t.y - l.o[1], a = dx * l.u[0] + dy * l.u[1], b = dx * l.n[0] + dy * l.n[1];
      if (a >= 0 && a <= l.w && b >= 0 && b <= l.d) { v = l; break; }
    }
    if (!v) return;
    const c = compensation(v), name = LOT_NAME[v.use] ?? 'lot';
    if (c > this.money) { this.toast(`Not enough money: buying out this ${name} costs $${c.toLocaleString()}`, 'warn'); return; }
    this.traffic.buyLot(v.key);
    // T232: a lot cleared on the player's own land is pegged out (bare dirt in a survey line) until it builds there (syncSurvey)
    if (this.golf && this.onGolfLand(lotBoxOf(v.o, v.u, v.n, v.w, v.d))) { (this.golf.cleared ??= []).push([v.o[0], v.o[1], v.u[0], v.u[1], v.n[0], v.n[1], v.w, v.d].map(x => +x.toFixed(3))); this.surveySig = ''; this.scheduleSave(); }
    this.toast(`Bought and cleared ${name} for $${c.toLocaleString()}`, 'good');
    this.emit();
  }
  /** the client slot of the nearest alive car within 1.5 tiles of the tile under (mx, my), or -1 */
  private carAt(mx: number, my: number): number {
    const t = this.tileAt(mx, my), tr = this.traffic;
    let best = -1, bd = 1.5 * 1.5;
    for (let i = 0; i < tr.n; i++) {
      if (!tr.alive[i]) continue;
      const dx = tr.px[i]! - t.x, dy = tr.py[i]! - t.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** inspects the car in slot i (its trip, route and origin: see SimClient.inspect) and clears the junction watch */
  inspectCar(i: number) { this.inspecting = i; this.traffic.inspect(i); this.traffic.unwatch(); this.emit(); }
  /** closes the car inspector (its Close button, Esc): the camera stops following it */
  closeInspect() { this.inspecting = -1; this.followCar = false; this.traffic.inspect(-1); this.emit(); }
  /** closes the junction watch (its Close button, Esc) */
  closeWatch() { this.traffic.unwatch(); this.emit(); }
  propAt(mx: number, my: number): Prop | null {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z, r = [0, 0, 0, 0];
    for (const p of this.sprites.at(X, Y)) {
      if (!this.props.has(p)) continue; // forest trees are not props: never picked
      spriteRect(p, r); if (X < r[0] || X > r[2] || Y < r[1] || Y > r[3]) continue;
      const it = LIBRARY[p.item], [page, u0, v0, u1, v1] = it.tex, a = this.pageAlpha[page];
      if (!a) return p;
      let u = (X - r[0]) / (r[2] - r[0]); if (p.flip) u = 1 - u;
      const v = (Y - r[1]) / (r[3] - r[1]), px = clamp(Math.floor((u0 + (u1 - u0) * u) * a.w), 0, a.w - 1), py = clamp(Math.floor((v0 + (v1 - v0) * v) * a.h), 0, a.h - 1);
      const i = py * a.w + px; if ((a.bits[i >> 3]! >> (i & 7)) & 1) return p;
    }
    return null;
  }
  deleteSelected() {
    if (!this.selected) return;
    const p = this.selected;
    if (this.golf?.structures?.length) {
      const idx = this.golf.structures.findIndex(s => this.golfStructureProps.get(s.id) === p);
      if (idx >= 0) { this.selected = null; this.removeStructure(idx); return; }
    }
    const it = LIBRARY[p.item]; this.removeProp(p); if (!p.auto && !p.plant) this.traffic.spend('construction', -this.sellValue(p)); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name}`); this.emit();
  }
  scaleSelected(f: number) {
    // never bigger than its picture's pixels allow at the closest zoom (newart.ts maxDrawScale), so the footprint stays the picture's
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item], k = clamp(p.scale * f, 0.6, Math.min(1.6, Math.max(p.scale, maxDrawScale(p.item))));
    if (f > 1 && k <= p.scale) { if (maxDrawScale(p.item) < 1.6) this.toast(`${it.name} is as big as its picture allows`, 'warn'); return; }
    const err = this.canPlace(it, p.x, p.y, p.flip, k, p); if (err) { this.toast(err, 'warn'); return; }
    p.scale = k; this.propChanged(p); this.scheduleSave(); this.emit();
  }

  // ---------- input ----------
  pointerDown(e: PointerEvent) {
  const mx = e.offsetX, my = e.offsetY;
  this.moneyAt(this.tileAt(mx, my)); // T147: a spend this click makes floats up here
  this.camEase = null; // a press takes the camera back from New hole's framing (P23 4.4)
  if (this.sceneRef) this.closeScene(); // T242: a press on the map puts the picture away (Select's click on a place opens its own below)
  // the owner's open shot (P4b) takes a left click on the course as its aim, before any tool does (a drag still pans; the aim is set on release)
  if (this.shot && e.button === 0 && !this.keys.has(' ')) { this.overlay.setPointerCapture(e.pointerId); this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false, aim: this.tileAt(mx, my) }; return; }
  // T268: a tee set in hand: a click lays it there, a right click puts it down (the middle button and Space still pan)
  if (this.teePlace && !this.teePlace.drag && !this.keys.has(' ') && (e.button === 0 || e.button === 2)) { this.hover = this.tileAt(mx, my); if (e.button === 0) this.placeTeeAt(); else this.cancelTeePlace(); return; }
  // the side modes live in Select (P23 P1-A): the Grass panel, Land, Event and Holes never take a build tool's click
  const side = this.tool === 'select';
  if (this.tool === 'greenkeeping' && e.button === 0 && !this.keys.has(' ')) { this.grassTarget = this.tileAt(mx, my); if (this.grassAction) this.careGrass(this.grassAction); this.emit(); return; } // T175
  if (side && this.grassPanel && e.button === 0 && !this.keys.has(' ')) { this.grassTarget = this.tileAt(mx, my); if (this.grassAction) this.careGrass(this.grassAction); this.emit(); return; }
  // T200: Land for sale: a press pans the map as ever; a click (no drag) opens the block's card on release (pointerUp), never buys
  if (side && this.landMode && e.button === 0 && !this.keys.has(' ')) {
  this.overlay.setPointerCapture(e.pointerId);
  this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false, land: this.tileAt(mx, my) };
  return;
  }
  this.overlay.setPointerCapture(e.pointerId);
    if (side && this.eventTool && this.eventStructurePending && this.golf && this.hover && e.button === 0) {  
 this.placeEventStructure({ typeId: this.eventStructurePending.typeId, mode: this.eventStructurePending.mode, x: Math.round(this.hover.x), y: Math.round(this.hover.y) });  
 return;  
 }  
 if (side && e.button === 0 && !this.keys.has(' ')) { const b = this.badgeAt(mx, my); if (b) { this.overlay.setPointerCapture(e.pointerId); this.badgeDrag = { n: b, sx: mx, sy: my, mx, my, moved: false }; return; } } // T174: a hole badge
 if (side && this.holeCardHole !== null && e.button === 0 && !this.keys.has(' ') && this.holeCardGrab()) return; // T174: the card's pin and tee markers drag
 if (side && this.holesTool && this.golf && this.hover && e.button === 0) {
    if (this.selectedGolfMarker) {
    this.moveGolfMarker(this.selectedGolfMarker.hole, this.selectedGolfMarker.kind, this.hover.x, this.hover.y);
    return;
    }
    for (const pin of this.golf.pins) {
    const cup = this.todayPin(pin.hole) ?? pin; // (T269: or its flag on the day's cup)
    if (Math.hypot(this.hover.x - pin.x, this.hover.y - pin.y) <= 3 || Math.hypot(this.hover.x - cup.x, this.hover.y - cup.y) <= 3) {
    this.selectGolfMarker(pin.hole, 'pin'); return;
    }
    }
    for (const tee of this.golf.tees) {
    if (Math.hypot(this.hover.x - tee.x, this.hover.y - tee.y) <= 2) {
    this.selectGolfMarker(tee.hole, tee.kind); return;
    }
    }
    }
    const pan = e.button === 1 || e.button === 2 || this.keys.has(' ');
    if (this.keys.has(' ')) this.spacePanned = true;
    if (this.tool === 'practice' && !pan) { if (e.button === 0) this.practice.click(mx, my); return; } // T206
    if (this.tool === 'props' && !pan) { if (e.button === 0) this.decor.down(mx, my); return; } // the Props tool (T131): place, or select and drag
    if (this.tool === 'junction' && e.button === 2 && this.junctionRight(mx, my)) return;
    if (this.paintOn && e.button === 2 && this.paint.secondary(this.tileAt(mx, my), mx, my)) return;
    if ((this.tool === 'lane' || this.tool === 'downgrade') && e.button === 2) { this.laneReverse(mx, my); return; }
    if (pan || this.tool === 'select') {
      if (!pan && this.tool === 'select') {
        // a car under the pointer (street tier) is inspected; else a prop is selected; else, with the flow on, the junction there is watched
        const car = this.cam.z >= DISTRICT_Z ? this.carAt(mx, my) : -1;
        if (car >= 0) { this.inspectCar(car); return; }
        if (this.cam.z >= DISTRICT_Z && this.repairAt(mx, my)) return;
        const p = this.propAt(mx, my), tl = this.tileAt(mx, my);
        // the range's own props and its front open the range card (P24, T129)
        if (p?.auto?.startsWith('range:') || (!p && this.range.hit(tl.x, tl.y))) { this.openRangeCard(true); this.inspectScene(p); return; } // (T242: and its picture)
        // T208: the clubhouse (its footprint, and the building's height up the screen: 6 tiles back) opens the clubhouse card
        const club = this.golf && !p ? this.bizDefs.find(d => d.type === 'clubhouse') : undefined;
        if (club && tl.x >= club.x - 6 && tl.x < club.x + club.w && tl.y >= club.y - 6 && tl.y < club.y + club.h) { this.openClubCard(true); this.inspectScene(null, true); return; }
        // T219: an iconic place's props open its card
        if (p?.auto?.startsWith('place:')) { this.selected = null; this.selectedPlace = p.auto.slice(6); this.inspectScene(p); this.emit(); return; }
        this.selectedPlace = null;
        if (p) { this.selected = p; this.inspectScene(p); this.emit(); return; } // (T242: a business's building or a farmhouse opens its picture)
        this.selected = null; this.emit();
        if (this.showFlow) { const t = this.tileAt(mx, my); this.traffic.watchAt(t.x, t.y); this.emit(); }
      }
      this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false, back: this.tool === 'road' && e.button === 2, ...(!pan && this.tool === 'select' && this.golf ? { hole: this.courseHoleAt(this.tileAt(mx, my)) } : {}) }; return;
    }
    if (e.button !== 0) return;
    switch (this.tool) {
      case 'road': this.roadClick(mx, my); break;
      case 'junction': this.junctionClick(mx, my); break;
      case 'toll': this.tollUpdate(mx, my); this.tollClick(); break;
      case 'business': this.bizUpdate(mx, my); this.bizClick(); break;
      case 'bus': this.busUpdate(mx, my); this.busClick(); break;
      case 'lane': case 'downgrade': this.laneUpdate(this.tileAt(mx, my)); this.laneClick(); break;
      case 'bulldoze': this.bulldozeAt(mx, my, true); this.dragging = { kind: 'bulldoze', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
      case 'paint': case 'course':
        if (this.clubPlacing && this.tool === 'course') { this.clubUpdate(mx, my); this.clubClick(); break; }
        if (this.halfwayPlacing && this.tool === 'course') { this.halfwayUpdate(mx, my); this.halfwayClick(); break; }
        if (!this.paintOn || !this.brushOpen) break; // Buildings with nothing in hand, or Holes at stage 1 outside New hole: a click lays nothing
        this.paint.pointerDown(this.tileAt(mx, my), mx, my, e.altKey); this.courseCursor.press(this.paint, e.altKey); break;
      case 'park': {
        // the bay rows drag and the on-street click are the Parking tool's (docs/PARKING.md); the rectangle is the car park drag below
        if (this.parking.mode !== 'rect') { if (this.parking.mode === 'rows') this.parking.down(this.tileAt(mx, my)); else this.parking.click(); break; }
        const t = this.tileAt(mx, my), r = Math.round; this.parkDrag = { x0: r(t.x), y0: r(t.y), x1: r(t.x), y1: r(t.y), def: { id: 0, x: 0, y: 0, w: 0, h: 0 }, park: null, why: '', cost: 0, mx, my }; this.dragging = { kind: 'park', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; this.parkUpdate(mx, my); break; }
    }
  }
  pointerMove(e: PointerEvent) {
  const mx = e.offsetX, my = e.offsetY;
  this.ghostMouse = { mx, my };
  if (this.badgeDrag) { const b = this.badgeDrag; b.mx = mx; b.my = my; if (Math.hypot(mx - b.sx, my - b.sy) > 4) b.moved = true; } // T174
  this.hover = this.tileAt(mx, my);
  // T200: the overlay's block under the pointer (a refused one too: its reason shows by the pointer)
  if (this.landMode && this.golf && this.hover) this.land.move(this.hover.x, this.hover.y);
  else if (this.landMode) this.land.hover = null;
  const d = this.dragging;
    if (d) {
      if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 3) d.moved = true;
      if (d.kind === 'pan') { this.cam.X = d.camX - (mx - d.sx) / this.cam.z; this.cam.Y = d.camY - (my - d.sy) / this.cam.z; this.clampCam(); }
      else if (d.kind === 'bulldoze') this.bulldozeAt(mx, my, false);
      else if (d.kind === 'park') this.parkUpdate(mx, my);
    } else if (this.tool === 'select') this.hoverProp = this.propAt(mx, my);
    if (this.tool === 'props') this.decor.move(mx, my);
    if (this.tool === 'practice') this.practice.move(mx, my);
    if (this.tool === 'select' && !d) this.hoverRoad = this.hoverProp ? '' : this.roadNameAt(this.hover);
    if (this.tool === 'junction') this.hoverNode = this.net.nearestNode(this.hover, this.brush === 'roundabout' || this.brush === 'select' ? 2 : 3, 5);
    if (this.tool === 'lane' || this.tool === 'downgrade') this.laneUpdate(this.hover);
    if (this.tool === 'bulldoze') this.hoverPiece = this.net.pieceNear(this.hover);
    if (this.tool === 'toll') this.tollUpdate(mx, my);
    if (this.tool === 'business') this.bizUpdate(mx, my);
    if (this.tool === 'bus') this.busUpdate(mx, my);
    if (this.clubPlacing && this.tool === 'course') this.clubUpdate(mx, my);
    else if (this.halfwayPlacing && this.tool === 'course') this.halfwayUpdate(mx, my);
    else if (this.paintOn && !this.teePlace) this.paint.pointerMove(this.hover, mx, my, this.keys.has('Shift')); // (T268: a tee set in hand is the engine's)
    if (this.tool === 'park') {
      if (this.parking.mode === 'rows') { if (this.hover) { this.parking.snap15 = this.keys.has('Shift'); this.parking.move(this.hover, mx, my); } }
      else if (this.parking.mode === 'curb') this.parking.hover(this.hover ? this.net.pieceNear(this.hover)?.seg ?? null : null, this.hover ?? { x: 0, y: 0 }, mx, my);
    }
  }
  pointerUp() {
    const d = this.dragging; this.moneyAt(this.hover); // T147: a spend this release makes floats up here
    if (this.markerDrag) this.holeCardDrop(); // T174
    if (this.teePlace?.drag) this.teeDragDrop(); // T268
    if (this.badgeDrag) { const b = this.badgeDrag, to = b.moved ? this.badgeAt(b.mx, b.my) : 0; this.badgeDrag = null; if (!b.moved) this.openHoleCard(b.n); else if (to && to !== b.n) this.renumberHole(b.n, to); this.emit(); }
    if (d?.kind === 'pan' && d.hole !== undefined && !d.moved) { if (d.hole) this.openHoleCard(d.hole); else this.closeHoleCard(); }
    if (d?.kind === 'park') this.parkRelease();
    // a click (no drag) on the course aims the owner's open shot (P4b)
    if (d?.kind === 'pan' && d.aim && !d.moved) this.aimAt(d.aim);
    if (d?.kind === 'pan' && d.land && !d.moved && this.landMode) { this.land.click(d.land.x, d.land.y); this.emit(); }
    // a right click (no drag) in the road tool takes back the last point, as Backspace does (the owner, 2026-10-27, T207); a right drag still pans
    if (d?.kind === 'pan' && d.back && !d.moved) this.routeInput('right');
    if (this.paintOn) { this.paint.pointerUp(this.paintTol); this.courseCursor.release(); }
    if (this.tool === 'park' && this.parking.mode === 'rows') this.parking.up();
    if (this.tool === 'props') this.decor.up();
    this.dragging = null;
  }
  pointerLeave() { this.paint.cursor = null; this.paint.mouse = null; this.paint.hover = 0; this.paint.hoverH = null; this.hover = null; this.hoverProp = null; this.hoverNode = null; this.hoverPiece = null; this.hoverRoad = ''; this.tollHover = null; this.bizHover = null; this.ghostMouse = null; this.busHover = null; this.laneHover = null; this.decor.ghost = null; this.practice.leave(); }
  /** the name of the road under tile t (the piece under it, then its route), or '' */
  roadNameAt(t: Pt | null): string {
    const piece = t ? this.net.pieceNear(t) : null;
    return piece ? this.roadNameOfSeg(piece.seg) : '';
  }
  /** the name of the route a segment belongs to, or '' */
  private roadNameOfSeg(s: Seg): string { const r = this.net.routeOfSeg(s); return r ? this.roadNames.nameOf(r) : ''; }
  /** a junction's name from the names of the roads meeting at it (Names.junction: "Maple Ave & 3rd St"), or '' */
  junctionName(n: Node): string { const names: string[] = []; for (const a of n.arms) { const s = this.roadNameOfSeg(a.seg); if (s) names.push(s); } return this.names.junction(names); }
  /** the name of the junction at tile position (x, y) (a node's position), or '' when there is no junction there */
  junctionNameAt(x: number, y: number): string { const n = this.net.nodeAt({ x, y }); return n ? this.junctionName(n) : ''; }
  doubleClick() { this.routeInput('double'); if (this.paintOn) this.paint.doubleClick(); }
  wheel(e: WheelEvent) {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0014);
    this.zoomAt(clampZoom(this.cam.z * f), e.offsetX, e.offsetY);
  }
  /** the camera easing to a framing (New hole, P23 4.4): from, to, its start (ms) and length; any drag, wheel, zoom or key pan drops it */
  private camEase: { a: Camera; b: Camera; t0: number; ms: number } | null = null;
  /** the camera frames tiles pts in the free map beside the panel (New hole's tee and green clicks, a check's Show me): it eases there in
   *  CAM_EASE_MS at most, or jumps under reduced motion; zoomIn false only eases out */
  fitView(pts: { x: number; y: number }[], zoomIn: boolean) {
    const to = frameView(pts, this.freeRect(), this.cssW, this.cssH, this.cam, zoomIn, ZOOM_MIN, ZOOM_MAX);
    if (!to) return;
    const c = this.cam;
    if (Math.abs(to.z - c.z) < c.z * 0.01 && Math.abs(to.X - c.X) * c.z < 2 && Math.abs(to.Y - c.Y) * c.z < 2) return;
    let reduce = false; try { reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media queries */ }
    if (reduce) { this.camEase = null; this.cam = { X: to.X, Y: to.Y, z: to.z }; this.clampCam(); this.emit(); return; }
    this.camEase = { a: { ...c }, b: { X: to.X, Y: to.Y, z: to.z }, t0: performance.now(), ms: CAM_EASE_MS };
  }
  /** the free map beside the tool panel, below the top bar and above the hint pill (css px over the map), where New hole frames what it
   *  shows */
  private freeRect(): FreeRect {
    let l = 0, t = 0;
    try {
      const c = this.overlay.getBoundingClientRect(), p = typeof document !== 'undefined' ? document.querySelector('[data-tool]')?.getBoundingClientRect() : null;
      if (p && p.width > 0) { l = Math.max(0, p.right - c.left); t = Math.max(0, p.top - c.top); }
    } catch { /* no layout (a test) */ }
    return { l: l + 8, t: t + 8, r: this.cssW - 8, b: this.cssH - 56 };
  }
  /** the camera's ease, once a frame: an ease out in X, Y and the zoom (the zoom in log steps, so it reads even) */
  private stepCamEase(now: number) {
    const e = this.camEase; if (!e) return;
    const u = Math.min(1, Math.max(0, (now - e.t0) / e.ms)), k = 1 - (1 - u) ** 3;
    this.cam.X = e.a.X + (e.b.X - e.a.X) * k; this.cam.Y = e.a.Y + (e.b.Y - e.a.Y) * k;
    this.cam.z = Math.exp(Math.log(e.a.z) + (Math.log(e.b.z) - Math.log(e.a.z)) * k);
    this.clampCam();
    if (u >= 1) { this.camEase = null; this.emit(); }
  }
  zoomAt(z: number, mx = this.cssW / 2, my = this.cssH / 2) {
    this.camEase = null; z = this.zoomFloor(z);
    const wx = this.cam.X + (mx - this.cssW / 2) / this.cam.z, wy = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    this.cam.z = z;
    this.cam.X = wx - (mx - this.cssW / 2) / z; this.cam.Y = wy - (my - this.cssH / 2) / z; this.clampCam(); this.emit();
  }
  /** the camera's centre held over the map (a light boot's: its box, boot.ts clampCentre), and its zoom to the boot's furthest */
  clampCam() { const c = clampCentre(this.cam.X, this.cam.Y, this.boot.box); this.cam.X = c.X; this.cam.Y = c.Y; this.cam.z = this.zoomFloor(this.cam.z); }
  /** a zoom held to the boot's furthest zoom (a light boot's; the game's range is clampZoom's) */
  private zoomFloor(z: number) { return this.boot.zoomMin !== null && z < this.boot.zoomMin ? this.boot.zoomMin : z; }
  /** centres the camera on tile (x, y), zooms in to at least 0.2 (a closer zoom stays), shows the flow and pulses a ring there */
  jumpTo(x: number, y: number) {
    this.camEase = null;
    if (this.cam.z < 0.2) this.cam.z = 0.2;
    this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam();
    this.focus = { x, y, t: performance.now() }; this.setFlow(true); this.emit();
  }
  /** centres the camera on tile (x, y) as it is (the minimap, the town chip); a zoom z, when given, replaces the camera's (clamped) */
  lookAt(x: number, y: number, z?: number) {
    this.camEase = null;
    if (z !== undefined) this.cam.z = clampZoom(z);
    this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit();
  }
  /** shows or hides the flow overlay (the Flow button, key F, a jump) and turns the worker's heat map on or off with it (see SimClient.heatOn); callers emit */
  setFlow(on: boolean) { this.showFlow = on; this.traffic.heatOn(on || this.showParkDemand); }
  /** shows or hides the parking demand overlay (the Car park panel) and keeps the worker's heat on with it; callers emit */
  setParkDemand(on: boolean) { this.showParkDemand = on; this.traffic.heatOn(on || this.showFlow); }
  keyDown(e: KeyboardEvent) {
    const el = e.target as HTMLInputElement | null, tag = el?.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA';
    // Esc (P23 4.10): the topmost menu or card first (even from a checkbox or slider in it), then the tool's own step, then out to Select; a
    // focused text box keeps Esc from the tool
    if (e.key === 'Escape' && this.sceneRef) { this.closeScene(); return; } // T242: the picture card, over everything, goes first
    if (e.key === 'Escape') { escapeLadder(this.escRungs(e, tag === 'TEXTAREA' || (tag === 'INPUT' && !/^(checkbox|radio|range|button|color)$/.test(el!.type)))); return; }
    if (typing) return;
    this.keys.add(e.key);
    // T268: the tee set in hand: R turns it (Shift+R back), [ ] size it
    if (this.teePlace && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'r' || e.key === 'R') { this.turnTeePlace(e.shiftKey); return; }
      if (e.key === ']' || e.key === '[') { this.sizeTeePlace(e.key === ']'); return; }
    }
    // T268: with the hole card open in Select, Ctrl+Z and Ctrl+Y take back the course's steps (a tee placed, moved or removed from the card)
    if (this.holeCardHole !== null && !this.paintOn && (e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.paint.undoTop(); return; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.paint.redoTop(); return; }
    }
    if (this.clubPlacing && this.tool === 'course' && (e.key === 'r' || e.key === 'R')) {
      this.bizRot = !this.bizRot; const h = this.bizHover; if (h) this.clubUpdate(h.mx, h.my); this.emit();
      return;
    }
    if (this.halfwayPlacing && this.tool === 'course' && (e.key === 'r' || e.key === 'R')) {
      this.bizRot = !this.bizRot; const h = this.bizHover; if (h) this.halfwayUpdate(h.mx, h.my); this.emit();
      return;
    }
    if (this.paintOn && this.paint.key(e)) return;
    if (this.tool === 'park' && this.parking.key(e)) return;
    if (this.tool === 'props' && this.decor.key(e)) return;
    if (this.tool === 'practice' && this.practice.key(e)) { this.emit(); return; } // T206
    switch (e.key) {
      case 'Enter': this.routeInput('enter'); break;
      case 'Backspace': this.routeInput('backspace'); break;
      case 'Delete': this.deleteSelected(); break;
      case 'g': case 'G': this.setShowGrid(!this.showGrid); break;
      case 'l': case 'L': this.showLanes = !this.showLanes; this.emit(); break;
      case 'k': case 'K': this.showLots = !this.showLots; this.emit(); break;
      case 'o': case 'O': this.showAccess = !this.showAccess; this.emit(); break;
      case 'f': case 'F': this.setFlow(!this.showFlow); this.emit(); break;
      case 'b': case 'B': this.panel = this.panel === 'bottlenecks' ? null : 'bottlenecks'; if (this.panel) this.traffic.requestReport(); this.emit(); break;
      case 'q': case 'Q': this.bendMode = this.bendMode === 90 ? 45 : 90; this.emit(); break;
      case 'e': case 'E': this.replaceMode = !this.replaceMode; this.toast(this.replaceMode ? 'Replace: on (roads in the way are bulldozed)' : 'Replace: off', 'info'); this.emit(); break;
      case 'r': case 'R': if (this.tool === 'toll') { this.tollFlip = !this.tollFlip; if (this.tollHover) this.tollUpdate(this.tollHover.mx, this.tollHover.my); this.emit(); }
        else if (this.tool === 'business') { this.bizRot = !this.bizRot; if (this.bizHover) this.bizUpdate(this.bizHover.mx, this.bizHover.my); this.emit(); }
        else this.setTool('road'); break;
      case 'j': case 'J': this.setTool('junction'); break;
      case 'x': case 'X': this.setTool('bulldoze'); break;
      case 'c': case 'C': this.setTool('course'); break;
      case 'a': case 'A': this.setTool('paint'); break;
      case 'p': case 'P': this.setTool('park'); break;
      case 't': case 'T': this.setTool('toll'); break;
      case 'u': case 'U': this.setTool('bus'); break;
      case 'm': case 'M': this.setTool('business'); break;
      case 'n': case 'N': this.setTool('lane'); break;
      case 'y': case 'Y': this.setTool('downgrade'); break;
      case 'v': case 'V': this.setTool('select'); break;
      case 'z': case 'Z': if (!e.ctrlKey && !e.metaKey && this.golfMode) this.setTool('props'); break;
      // T202 (#529): 1-6 open the rail's groups in order (the App opens the group's flyout: railKey); with the town's Build in hand they stay its
      // road classes, and with Holes in hand 1-8 its surfaces (paint-tool.ts key took them above): tool-modes.ts numberKeyUse. Before T202 they
      // picked a road class and the road tool from any tool
      case '1': case '2': case '3': case '4': case '5': case '6': {
        const u = numberKeyUse(this.uiTool, +e.key);
        if (u?.k === 'group') this.railKey?.(u.i + 1);
        else if (u?.k === 'class') { const c = KEY_CLASSES[u.i]; if (c && !this.refuseLocked('road')) { this.roadClass = c; this.setTool('road'); } }
        break;
      }
      case '+': case '=': this.zoomAt(clampZoom(this.cam.z * ZOOM_STEP)); break;
      case '-': case '_': this.zoomAt(clampZoom(this.cam.z / ZOOM_STEP)); break;
      case ' ': e.preventDefault(); if (!e.repeat) this.spacePanned = false; break;
      case '.': case '>': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.find(s => s > k) ?? SPEEDS[SPEEDS.length - 1]!); break; }
      case ',': case '<': { const k = this.speed || this.lastSpeed; this.setSpeed(SPEEDS.filter(s => s < k).pop() ?? SPEEDS[0]); break; }
      case 'h': case 'H': this.skipToRush(); break;
      case 'Tab': if (this.tool === 'junction') { e.preventDefault(); if (!e.repeat) this.flipJunction(e.shiftKey ? -1 : 1); } else if (this.tool === 'road') { e.preventDefault(); if (!e.repeat) this.flipVariant(e.shiftKey ? -1 : 1); } break;
    }
  }
  /** T202: the number keys' rail groups (the App sets it: the nth group after Select opens its flyout, Bulldoze picks its tool); null: none */
  railKey: ((n: number) => void) | null = null;
  /** T202: Help › Keys (the App sets it): whether it is open, and opening or closing it (the lot lab's ? opens it instead of its own list) */
  keysSheet: { open(): boolean; show(on: boolean): void } | null = null;
  /** the App's own menus and cards for Esc (Help, the gear menu, Course stats): which are open, and closing one (the App sets it) */
  uiCards: { open(): Partial<Record<EscCard, boolean>>; close(c: EscCard): void } | null = null;
  /** the Esc ladder's rungs (tool-modes.ts): the open cards (the App's, the Event catalogue, the Grass panel, the Budget or Bottlenecks
   *  card), the tool's own step (with a text box focused, Esc stops there: the tool keeps what is in hand), and Select */
  private escRungs(e: KeyboardEvent, textBox: boolean): EscLadder {
    return {
      open: () => ({ ...this.uiCards?.open(), event: this.eventTool, grass: this.grassPanel && this.tool !== 'greenkeeping', panel: !!this.panel }),
      close: c => {
        if (c === 'event') this.toggleSideMode('eventTool'); else if (c === 'grass') this.toggleSideMode('grassPanel');
        else { if (c === 'panel') this.panel = null; else this.uiCards?.close(c); this.emit(); }
      },
      hand: () => textBox || this.escHand(e),
      tool: () => this.tool,
      select: () => this.setTool('select'),
    };
  }
  /** Esc's tool rung: the tool steps back one stage or drops what is in hand (the clubhouse, the brush's stroke or outline, a bay row, the
   *  junction picked, the car watched, the bus stop picked, the route, the selection, the pin or tee picked, the Land or Holes switch);
   *  true when it did (else Esc puts the tool down for Select) */
  private escHand(e: KeyboardEvent): boolean {
    if (this.teePlace) { this.cancelTeePlace(); return true; } // T268: the tee set in hand first
    if (this.tool === 'greenkeeping' && this.grassAction) { this.grassAction = null; this.emit(); return true; } // T175: the care in hand first
    if (this.holeCardHole !== null) { this.closeHoleCard(); return true; } // T174: the hole card first
    if (this.clubPlacing && this.tool === 'course') { this.placeClubhouse(false); return true; }
    if (this.halfwayPlacing && this.tool === 'course') { this.placeHalfway(false); return true; }
    if (this.paintOn && this.paint.key(e)) return true;
    if (this.tool === 'park' && this.parking.key(e)) return true;
    if (this.tool === 'props' && this.decor.esc()) return true;
    if (this.tool === 'practice' && this.practice.cancel()) { this.emit(); return true; } // T206: the facility in hand goes down first
    if (this.tool === 'junction' && (this.selectedJunction || this.brush !== 'select')) { if (this.selectedJunction) this.selectedJunction = null; else this.brush = 'select'; this.emit(); return true; }
    if (this.traffic.car || this.traffic.watch) { this.closeInspect(); this.closeWatch(); return true; }
    if (this.busPick) { this.busPick = null; this.busHover = null; this.emit(); return true; }
    if (this.route.length) { this.cancelRoute(); return true; }
    if (this.selected) { this.selected = null; this.emit(); return true; }
    if (this.selectedPlace) { this.closePlaceCard(); return true; }
    if (this.selectedGolfMarker) { this.selectedGolfMarker = null; this.emit(); return true; }
    if (this.landMode && this.land.card) { this.land.cancel(); this.emit(); return true; }
    if (this.landMode || this.holesTool) { this.toggleSideMode(this.landMode ? 'landMode' : 'holesTool'); return true; }
    return false;
  }
  keyUp(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (e.key === ' ' && !this.spacePanned && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && tag !== 'BUTTON') this.togglePause();
    this.keys.delete(e.key);
  }
  /** traffic: n cars driving the network (0 = none); the sim worker starts on first use */
  setTraffic(n: number) { this.traffic.setTarget(n); this.emit(); }
  /** the town's growth option (its id, see GROWTH_OPTIONS) */
  setGrowth(id: string) { this.traffic.setOption(id); this.emit(); }
  /** the sim speed (0 pauses); a speed above 0 is remembered for the resume */
  setSpeed(k: number) {
    // while the owner's shot is open the clock waits for it: only a pause goes through (closeShot clears the shot before it resumes)
    if (k > 0 && this.shot) { this.toast(SHOT_HOLD, 'warn'); return; }
    if (k > 0) this.lastSpeed = k; this.speed = k; this.traffic.setSpeed(k); this.emit();
  }
  /** pauses, or resumes at the last speed */
  togglePause() { this.setSpeed(this.speed ? 0 : this.lastSpeed); }
  /** the game clock: the economy's day, and the time of day from the sim clock (one sim second is one game minute) */
  /** the time of day: in a golf game the town day's (LEAD.md M1: its own length, separate from the season; day counts town days from 1),
   *  else the classic game day (hours of GAME_HOUR) */
  clock(): { day: number; hour: number; minute: number } {
    // a golf game's town day runs on the sim's own time (it never stops; the season clock freezes at the season's end)
    // a golf game's town clock (townclock.ts, T048): the sim's time through the clock's pieces (the day's start, its speed)
    if (this.golfMode) { const tt = townTimeOf(this.traffic.town, this.traffic.simTime(performance.now())); return { day: tt.day, hour: tt.hour, minute: tt.minute }; }
    const now = performance.now(), t = this.traffic.clockTime(now), L = 24 * GAME_HOUR, hl = L / 24;
    return { day: this.day, hour: Math.floor(t / hl) % 24, minute: Math.floor((t % hl) / hl * 60) };
  }
  /** the owner's town day (LEAD.md M1): its length in real minutes at 1x and the town's traffic (times the lot trips); remembered */
  townDay = { minutes: 10, traffic: 1 };
  setTownDay(v: Partial<{ minutes: number; traffic: number }>) {
    this.townDay = { minutes: Math.min(30, Math.max(0.5, v.minutes ?? this.townDay.minutes)), traffic: Math.min(4, Math.max(0, v.traffic ?? this.townDay.traffic)) };
    try { localStorage.setItem('capitalempire.townday', JSON.stringify(this.townDay)); } catch { /* storage may be unavailable */ }
    this.traffic.setTownDay(this.townDay.minutes, this.townDay.traffic); this.nightKey = ''; this.emit();
  }
  /** fast-forwards the sim to the next 7:30 or 16:30 (game clock s 450 and 990 of the day); resumes first if paused. Not while the clock is frozen. */
  skipToRush() {
    if (this.shot) { this.toast(SHOT_HOLD, 'warn'); return; }
    if (this.traffic.skipping) return;
    if (this.traffic.stats.frozen) { this.toast('The clock is frozen during an event'); return; }
    const now = performance.now(), c = this.traffic.clockTime(now), day = Math.floor(c / GAME_DAY) * GAME_DAY;
    const target = [day + 450, day + 990].find(u => u > c) ?? day + GAME_DAY + 450, h = target % GAME_DAY === 450 ? 7 : 16;
    const until = this.traffic.simTime(now) + (target - c); // the sim time of the target, from the clock's offset now
    if (!this.speed) this.setSpeed(this.lastSpeed);
    this.traffic.skip(until);
    this.toast(`Skipping to the ${h === 7 ? 'morning' : 'evening'} rush…`);
  }
  /** takes the before / after snapshot now: the last rush window before this game hour and the next rush (the after numbers come with it); asks for a fresh report */
  takeSnapshot() {
    const at = Math.floor(this.traffic.clockTime(performance.now()) / GAME_HOUR), after = nextRush(at + 1); // the hour now began before the change: the after window starts at the next hour or later
    this.snapshot = { at, before: lastRush(this.traffic.hours, at), after };
    this.traffic.requestReport();
    this.toast(`Snapshot taken. Make your change; the after numbers come with the ${String(after[0] % 24).padStart(2, '0')}:00 rush`);
    this.emit();
  }
  /** drops the before / after snapshot */
  clearSnapshot() { this.snapshot = null; this.emit(); }
  /** the snapshot's rush window, once both its hours are in the city's snapshots (null until then) */
  get snapshotAfter(): Window | null { const s = this.snapshot; return s ? windowOf(this.traffic.hours, s.after[0], s.after[1], true) : null; }
  /** the access overlay's growth state, at most once a second: per zone, the lots started within the last game day (no declining, level BUILDING or more) and the lots declining (decline 1 or more); and the totals */
  private growthNow() {
    const now = performance.now();
    if (now - this.growStamp < 1000) return;
    this.growStamp = now; const T = this.traffic.clockTime(now);
    this.growN.fill(0); this.declN.fill(0); this.growTot = 0; this.declTot = 0;
    for (const l of this.traffic.lots.values()) {
      const z = zoneOf(l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2);
      if (l.decline >= 1) { this.declN[z]++; this.declTot++; }
      if (l.level >= LV.BUILDING && l.decline === 0 && T - l.since <= GAME_DAY) { this.growN[z]++; this.growTot++; }
    }
  }
  /** the golf state for the city worker: on or off, the tier, the reputation, the golf land, and a range start's start and exits */
  private sendGolf() { const g = this.golf; this.traffic.setGolf(!!g, g?.tier ?? 1, g?.rep ?? 0, this.golfLand(), g?.start === 'range' ? { start: 'range', exits: g.exits, invited: g.invited, holes: this.holesBuilt(), townBoost: g.townBoost } : undefined); }
  /** T090: the holes the player has built (a pin each): a range start's town grows faster with them (plan P22 2.3.3) */
  private holesBuilt(): number { return new Set((this.golf?.pins ?? []).map(p => p.hole)).size; }
  /** the terrain of the valley for the city worker: its classes, the highway entry (a range start's: its map exit nearer the town; the start
   *  block's centre if none) and the seed */
  private sendTerrain() {
  const t = this.terrain, h = t.highway, ex = this.golf?.start === 'range' ? this.golf.exits ?? [] : [], c = this.townPts[0];
  const near = ex.length && c ? ex.reduce((a, b) => (Math.hypot(b.x - c.x, b.y - c.y) < Math.hypot(a.x - c.x, a.y - c.y) ? b : a)) : null;
  this.traffic.terrain(t.cls, near ? [near.x, near.y] : h.x >= 0 ? [h.x, h.y] : [t.start.x + t.start.size / 2, t.start.y + t.start.size / 2], this.seed, this.townPts.flatMap(p => [p.x, p.y]), t.height, this.golfMode);
  this.traffic.disastersOn(this.disastersEnabled);
  }
  /** the town lays a free gravel road: its legs go down like a road build, small props are cleared, and a big prop in the way skips it */
  private townGrow(legs: Leg[]) {
    const cls = CLASS.gravel, near = this.propsNearLegs(legs, cls.h + cls.walk);
    if (near.some(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car')) return;
    for (const p of near) if (!p.auto && !LIBRARY[p.item].big) this.removeProp(p);
    const now = performance.now(), total = this.net.legsLength(legs), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of legs) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    this.edit.addLegs(legs, cls, 2, undefined, true);
    this.commitNetwork(true, now + dur + 150);
    this.builds.push({ legs, cls, t0: now, dur, total, cum });
    if (this.firstMark('first-street')) { this.growToast = now; this.toast('The town laid its first street', 'good'); } // a new range game's first (P22 2.8)
    else if (now - this.growToast > 30000) { this.growToast = now; this.toast('The town laid a gravel road'); }
  }

  // ---------- the event (Phase 5 step 2c) ----------
  /** the stadium's site: the one the player placed (null: none yet; see setBizDefs). In golf mode, the clubhouse's site (the venue) */
  get site(): Site | null { return this.stadiumSite; }
  /** the placed stadium's spot as [x, y, w, h] tiles (null: none) */
  get stadiumDef(): [number, number, number, number] | null { const s = this.bizDefs.find(d => d.type === 'stadium'); return s ? [s.x, s.y, s.w, s.h] : null; }
  /** sets the placed businesses and the stadium's site from them (cached here, so the drawing needs no allocation) */
  private businessProps: Prop[] = [];
  private setBizDefs(defs: BizDef[]) {
    for (const p of this.businessProps) this.sprites.remove(p);
    for (const d of [...this.bizDefs, ...defs]) this.dropTownTrees(d.x, d.y, d.x + d.w, d.y + d.h);
    this.bizDefs = defs; const s = defs.find(d => d.type === 'stadium') ?? defs.find(d => d.type === 'clubhouse') ?? defs.find(d => d.type === 'range'); this.stadiumSite = s ? siteAt(s.x, s.y, s.w, s.h) : null;
    this.businessProps = defs.flatMap(d => businessArt(d, LIBRARY, LIB_INDEX));
    for (const p of this.businessProps) this.sprites.add(p);
  }
  /** the game's own spot for the stadium on this valley (placeStadium), as [x, y, w, h] tiles; null without towns or a fit */
  private gameSpot(): [number, number, number, number] | null { const s = placeStadium(this.terrain.cls, this.townPts); return s ? [s.x, s.y, s.w, s.h] : null; }
  /** how many businesses of type t are placed */
  private bizCount(t: BusinessId): number { let n = 0; for (const d of this.bizDefs) if (d.type === t) n++; return n; }
  /** whether a type is open to build: the dev sandbox's unlock-all, else its unlock is met by the businesses owned (see ownedBiz) */
  bizOpen(t: BusinessId): boolean { return this.sandboxUnlock || unlockedBy(this.ownedBiz()).includes(t); }
  /** the businesses owned as the unlock tree reads them: each placed one with its stats from the worker (fresh until the worker has sent them) */
  ownedBiz(): Owned[] { return ownedOf(this.bizDefs.map(d => this.traffic.biz.find(v => v.id === d.id) ?? { ...d, ...freshStats(d.id) })); }
  /** the unlock toasts: each type now open to build (see bizOpen) that was not open at the last businesses message gets one; the first message after a
   *  new valley or a load only records what is open */
  private bizUnlocks(): void {
    if (this.sandboxUnlock) return;
    const open = new Set(unlockedBy(this.ownedBiz()));
    if (this.bizOpenSeen) for (const id of open) if (!this.bizOpenSeen.has(id)) this.toast(`${BUSINESS[id].name} unlocked: build it with the Business tool (M)`, 'good');
    this.bizOpenSeen = open;
  }
  /** the type in hand: the Business tool builds it, and the ghost follows (R turns its footprint) */
  selectBizType(t: BusinessId) { this.bizType = t; if (this.bizHover) this.bizUpdate(this.bizHover.mx, this.bizHover.my); this.emit(); }
  /** the business tool's ghost at the cursor: the type in hand's footprint centred on the tile under it (R turns it), with the reason it cannot go there */
  private bizUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), B = BUSINESS[this.bizType], w = this.bizRot ? B.footprint.h : B.footprint.w, h = this.bizRot ? B.footprint.w : B.footprint.h;
    const x = Math.round(t.x - w / 2), y = Math.round(t.y - h / 2), site = siteAt(x, y, w, h);
    this.bizHover = { mx, my, def: { id: 0, type: this.bizType, x, y, w, h }, site, why: this.bizWhy(B, site) };
  }
  /** why business type B cannot be built on site s ('' if it can), in order: not open (its unlock's text); the most of its type already; the spot (siteWhy:
   *  the town's distance, water); a road within 2 tiles; a car park in the way; another business within 2 tiles; a building; the money */
  private bizWhy(B: BusinessType, s: Site): string {
    const plural = B.name.endsWith('y') ? B.name.slice(0, -1) + 'ies' : B.name + 's';
    return (!this.bizOpen(B.id) ? unlockText(B, this.ownedBiz()) : '')
      || (this.bizCount(B.id) >= B.max ? (B.id === 'stadium' ? 'You have a stadium already (demolish it first)' : `You have the most ${plural} already (${B.max})`) : '')
      || siteWhy(s, this.terrain.cls, this.townPts, B.townMin, B.water)
      || (this.roadNearRect(s.x, s.y, s.w, s.h, 2) ? 'A road runs through it' : '')
      || (this.parkDefs.some(p => p.x < s.x + s.w + 1 && p.x + p.w > s.x - 1 && p.y < s.y + s.h + 1 && p.y + p.h > s.y - 1) ? 'A car park is in the way' : '')
      || (this.bizDefs.some(d => d.x < s.x + s.w + 2 && d.x + d.w > s.x - 2 && d.y < s.y + s.h + 2 && d.y + d.h > s.y - 2) ? 'Another business is in the way' : '')
      || (this.lotsUnder(s) ? 'Buildings stand there' : '')
      || (B.buildCost > this.money ? `Not enough money: the ${B.name.toLowerCase()} costs $${B.buildCost.toLocaleString()}` : '');
  }
  /** whether a road runs through the rect (x, y, w, h) grown by pad tiles: each seg's centre line sampled every 0.5 tiles, against the rect grown by pad and the seg's half-width */
  private roadNearRect(x: number, y: number, w: number, h: number, pad: number): boolean {
    for (const s of this.net.segs) {
      const g = s.cls.h + pad, ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
      if (Math.max(ax, bx) < x - g || Math.min(ax, bx) > x + w + g || Math.max(ay, by) < y - g || Math.min(ay, by) > y + h + g) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
      for (let k = 0; k <= n; k++) { const f = k / n; if (rectDist({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f }, x, y, w, h) <= g) return true; }
    }
    return false;
  }
  /** the business tool's click: a valid, affordable business is built on the ghost (the worker gets the list); else the toast says why */
  private bizClick() {
    const h = this.bizHover; if (!h) return;
    if (h.why) { this.toast(h.why, 'warn'); return; }
    const B = BUSINESS[h.def.type];
    this.traffic.spend('construction', B.buildCost);
    this.setBizDefs([...this.bizDefs, { ...h.def, id: Math.max(0, ...this.bizDefs.map(d => d.id)) + 1 }]);
    this.traffic.setBusinesses(this.bizDefs); this.farmsUpdate();
    this.scheduleSave(); this.toast(`${B.name} built (-$${B.buildCost.toLocaleString()})`, 'good');
    this.bizUpdate(h.mx, h.my); this.emit();
  }
  // ---------- the clubhouse the player places (range starts, plan P22 2.5.2, T089) ----------
  /** the rail's Buildings (P23 P1-E; was the Course tool's Buildings tab): the clubhouse's ghost follows the cursor and a click places it */
  clubPlacing = false;
  /** a clubhouse click refused for want of a drive offers "Draw a drive" (golf/drivestopgap.ts; T175): the clubhouse's rect and the spot tried */
  clubDriveOffer: DriveStopgap | null = null;
  /** the drive being drawn for it: when a drive is built, Buildings comes back with the clubhouse armed at the spot */
  private clubDrive: DriveStopgap | null = null;
  /** Draw a drive: Paths with the gravel drive, the route started at the nearest road to the spot, the camera on both */
  drawDriveForClub() {
    const o = this.clubDriveOffer; if (!o) return;
    const from = driveStart([...this.net.segsNear(o.spot, 600)].map(q => ({ a: q.a, b: q.b, family: q.cls.family, base: q.cls.base })), o.spot, 600);
    if (!from) { this.toast('No road within 1.2 km of that spot to start a drive from', 'warn'); return; }
    this.setTool('path'); if (this.uiTool !== 'path') return;
    this.clubDrive = o; this.clubDriveOffer = null; this.roadClass = 'drive-gravel';
    const sn = snapPoint(this.net, from, this.snapRadius(), this.roadStep());
    this.cancelRoute(); this.routeFrom = sn; this.route.push(sn.p); this.routeLast = sn;
    this.lookAt((from.x + o.spot.x) / 2, (from.y + o.spot.y) / 2);
    this.toast("Draw the drive to the clubhouse's spot, then Enter or double-click: the clubhouse comes back armed there", 'info'); this.emit();
  }
  /** a route built: a drive for the clubhouse stopgap brings Buildings back with the clubhouse armed at the spot tried */
  private clubDriveBuilt(cls: { family?: string; base: string }) {
    const p = afterRoute(this.clubDrive, cls); if (!p) return;
    this.clubDrive = null; this.placeClubhouse(true); if (!this.clubPlacing) return;
    this.lookAt(p.spot.x, p.spot.y);
    const sc = this.screen(p.spot.x, p.spot.y); this.clubUpdate(sc.x / this.dpr, sc.y / this.dpr, p.spot);
    this.toast('Drive built: the clubhouse is back where you tried it. Click to place it', 'good'); this.emit();
  }
  /** the halfway house being placed (T187: Course › Buildings; golf/halfway.ts) */
  halfwayPlacing = false;
  /** the clubhouse's visitor cars the halfway house's takings last counted (-1: not read yet) */
  private halfwaySeen = -1;
  /** the halfway house's takings this session, $ (the Buildings panel's card) */
  halfwayTaken = 0;
  /** starts (on) or ends placing the halfway house (golf games; Buildings opens) */
  placeHalfway(on: boolean) {
    const go = on && !!this.golf;
    if (go && this.uiTool !== 'buildings') this.setTool('buildings');
    this.halfwayPlacing = go; if (go) this.clubPlacing = false; this.bizHover = null;
    this.emit();
  }
  /** why the halfway house cannot stand on rect r ('' if it can): golf/halfway.ts halfwaySpotWhy */
  private halfwayWhy(r: [number, number, number, number]): string {
    const grid = this.courseGrid, play = new Set<number>([SURF.fairway, SURF.green, SURF.tee, SURF.bunker, SURF.water]);
    return halfwaySpotWhy(r, {
      count: this.bizCount('halfway'), owned: (x, y) => this.ownedAt(x, y),
      surf: (x, y) => { if (!grid) return ''; const i = cellAt(grid, x, y); return i >= 0 && play.has(grid.surf[i]!) ? 'play' : ''; },
      tees: this.paint.wizard.plans().map(p => p.tee), pathGap: this.roadGapOf(r[0], r[1], r[2], r[3]), money: this.money,
    });
  }
  /** the halfway house's ghost at the cursor: as the clubhouse's (its front snapped to the nearest path within reach and slid along it to the
   *  first spot it can stand on; else centred on the cursor, R turns it) */
  private halfwayUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), B = BUSINESS.halfway, fp = { w: B.footprint.w, d: B.footprint.h }, segs: SnapSeg[] = [];
    for (const s of this.net.segsNear(t, 40)) { const g = snapSegOf(s); if (g) segs.push(g); }
    const sn = snapFrontage(t.x, t.y, fp, segs, CLUB_REACH), cands: [number, number, number, number][] = [];
    if (sn) {
      const w = sn.rot ? fp.d : fp.w, h = sn.rot ? fp.w : fp.d, away = (v: number, f: number) => (f > 0 ? Math.floor(v) : f < 0 ? Math.ceil(v) : Math.round(v));
      const x0 = away(sn.cx - w / 2, sn.face.x), y0 = away(sn.cy - h / 2, sn.face.y);
      for (let k = 0; k <= 20; k++) { const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2); cands.push(sn.rot ? [x0, y0 + off, w, h] : [x0 + off, y0, w, h]); }
    }
    const w = this.bizRot ? fp.d : fp.w, h = this.bizRot ? fp.w : fp.d; cands.push([Math.round(t.x - w / 2), Math.round(t.y - h / 2), w, h]);
    let r = cands[0]!, why = this.halfwayWhy(r);
    for (let i = 1; why && i < cands.length; i++) { const wy = this.halfwayWhy(cands[i]!); if (!wy) { r = cands[i]!; why = ''; } }
    this.bizHover = { mx, my, def: { id: 0, type: 'halfway', x: r[0], y: r[1], w: r[2], h: r[3] }, site: siteAt(r[0], r[1], r[2], r[3]), why };
  }
  /** builds the halfway house on the ghost (or says why not): paid for, a business (no cars of its own), its takings from the golfers passing */
  private halfwayClick() {
    const h = this.bizHover; if (!h || h.def.type !== 'halfway') return;
    if (h.why) { this.toast(h.why, 'warn'); this.emit(); return; }
    this.traffic.spend('construction', HALFWAY_COST);
    this.setBizDefs([...this.bizDefs, { ...h.def, id: Math.max(0, ...this.bizDefs.map(d => d.id)) + 1 }]);
    this.traffic.setBusinesses(this.bizDefs);
    this.halfwayPlacing = false; this.bizHover = null; this.halfwaySeen = -1;
    this.scheduleSave(); this.toast(`Halfway house built (-$${HALFWAY_COST.toLocaleString()}): golfers stop for a drink between holes`, 'good'); this.emit();
  }
  /** the halfway house's takings (once a frame, golf games): the clubhouse's new visitor cars since the last count, their golfers who stop, what
   *  they spend (golf/halfway.ts), booked as business income */
  private halfwayStep() {
    if (!this.bizDefs.some(d => d.type === 'halfway')) { this.halfwaySeen = -1; return; }
    const club = this.bizDefs.find(d => d.type === 'clubhouse'), v = club ? this.traffic.biz.find(q => q.id === club.id)?.visitors ?? 0 : 0;
    if (this.halfwaySeen < 0 || v < this.halfwaySeen) { this.halfwaySeen = v; return; }
    const n = halfwayTakings(v - this.halfwaySeen); this.halfwaySeen = v;
    if (n > 0) { this.traffic.spend('business', -n); this.halfwayTaken += n; }
  }
  /** starts (on) or ends placing the clubhouse (golf games; Buildings opens) */
  placeClubhouse(on: boolean) {
    const go = on && !!this.golf;
    if (go && this.uiTool !== 'buildings') this.setTool('buildings');
    this.clubPlacing = go; if (go) this.halfwayPlacing = false; this.bizHover = null;
    this.emit();
  }
  /** the gap from rect (x, y, w, h) to the nearest road's verge (any road or drive), tiles: below 0 when a verge reaches into it; Infinity with no
   *  road within 30 tiles */
  private roadGapOf(x: number, y: number, w: number, h: number): number {
    let best = Infinity;
    for (const s of this.net.segsNear({ x: x + w / 2, y: y + h / 2 }, Math.hypot(w, h) / 2 + 30)) {
      const v = s.cls.h + s.cls.walk, n = Math.max(1, Math.ceil(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 0.5));
      for (let k = 0; k <= n; k++) { const f = k / n, d = rectDist({ x: s.a.x + (s.b.x - s.a.x) * f, y: s.a.y + (s.b.y - s.a.y) * f }, x, y, w, h) - v; if (d < best) best = d; }
    }
    return best;
  }
  /** why the clubhouse cannot stand on rect r ('' if it can): golf/range.ts clubhouseSpotWhy (one only, the player's land, off the range plot and the
   *  course, beside a drive or road), then the money */
  private clubWhy(r: [number, number, number, number]): string {
    const g = this.golf, grid = this.courseGrid, rng = g?.start === 'range' ? this.bizDefs.find(d => d.type === 'range') : undefined;
    return clubhouseSpotWhy(r, {
      clubs: this.bizCount('clubhouse'), owned: (x, y) => this.ownedAt(x, y), plot: g && rng ? plotOfFront([rng.x, rng.y, rng.w, rng.h], g.dir) : null,
      course: (x, y) => { if (!grid) return false; const i = cellAt(grid, x, y); return i >= 0 && grid.surf[i]! > 0; }, roadGap: this.roadGapOf(r[0], r[1], r[2], r[3]),
    }) || (CLUBHOUSE_RANGE_COST > this.money ? `Not enough money: the clubhouse costs $${CLUBHOUSE_RANGE_COST.toLocaleString()}` : '');
  }
  /** the clubhouse's ghost at the cursor: its front snapped to the nearest course drive or path within CLUB_REACH (ext/frontage-snap, P19) and slid
   *  along it (up to 40 tiles, nearest first) to the first spot it can be built on (the range's drive is shorter than the clubhouse, so it runs on
   *  past the drive's end); else the footprint centred on the cursor (R turns it). With no spot, the first try shows with its reason */
  private clubUpdate(mx: number, my: number, at?: Pt) {
    const t = at ?? this.tileAt(mx, my), B = BUSINESS.clubhouse, fp = { w: B.footprint.w, d: B.footprint.h }, segs: SnapSeg[] = [];
    for (const s of this.net.segsNear(t, 60)) { const g = snapSegOf(s); if (g) segs.push(g); }
    const sn = snapFrontage(t.x, t.y, fp, segs, CLUB_REACH), cands: [number, number, number, number][] = [];
    if (sn) {
      // whole tiles, rounded away from the road so the front stays off its verge
      const w = sn.rot ? fp.d : fp.w, h = sn.rot ? fp.w : fp.d, away = (v: number, f: number) => (f > 0 ? Math.floor(v) : f < 0 ? Math.ceil(v) : Math.round(v));
      const x0 = away(sn.cx - w / 2, sn.face.x), y0 = away(sn.cy - h / 2, sn.face.y);
      for (let k = 0; k <= 40; k++) { const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2; cands.push(sn.rot ? [x0, y0 + off, w, h] : [x0 + off, y0, w, h]); }
    }
    const w = this.bizRot ? fp.d : fp.w, h = this.bizRot ? fp.w : fp.d; cands.push([Math.round(t.x - w / 2), Math.round(t.y - h / 2), w, h]);
    let r = cands[0]!, why = this.clubWhy(r);
    for (let i = 1; why && i < cands.length; i++) { const wy = this.clubWhy(cands[i]!); if (!wy) { r = cands[i]!; why = ''; } }
    this.bizHover = { mx, my, def: { id: 0, type: 'clubhouse', x: r[0], y: r[1], w: r[2], h: r[3] }, site: siteAt(r[0], r[1], r[2], r[3]), why };
  }
  /** places the clubhouse on the ghost: it is paid for, becomes the venue (the engine's site and the worker's: setBusinesses prefers it over the
   *  range) and its green fees start; golf.clubhouse moves to its door nearest a road */
  private clubClick() {
    const h = this.bizHover; if (!h || h.def.type !== 'clubhouse') return;
    if (h.why) {
      // T175: a refusal a drive mends offers one (the Buildings panel's Draw a drive)
      this.clubDriveOffer = driveOffer(h.why, [h.def.x, h.def.y, h.def.w, h.def.h], this.hover ?? { x: h.def.x + h.def.w / 2, y: h.def.y + h.def.h / 2 });
      this.toast(this.clubDriveOffer ? `${h.why}: Draw a drive from the Buildings panel` : h.why, 'warn'); this.emit(); return;
    }
    this.clubDriveOffer = null; this.clubDrive = null;
    this.traffic.spend('construction', CLUBHOUSE_RANGE_COST);
    this.setBizDefs([...this.bizDefs, { ...h.def, id: Math.max(0, ...this.bizDefs.map(d => d.id)) + 1 }]);
    this.traffic.setBusinesses(this.bizDefs); this.farmsUpdate();
    if (this.golf) { let best = Infinity; for (const d of h.site.doors) { const g = this.roadGapOf(d.x, d.y, 0, 0); if (g < best) { best = g; this.golf.clubhouse = { x: d.x, y: d.y }; } } }
    this.clubPlacing = false; this.bizHover = null; this.guideEvent('clubhouse');
    this.scheduleSave(); this.toast(`Clubhouse built (-$${CLUBHOUSE_RANGE_COST.toLocaleString()}): green fees start, and the tournament's crowd will head here`, 'good'); this.emit();
  }
  /** demolishes a business by id (the stadium between rounds only): half its build cost comes back, and the worker drops it */
  demolishBusiness(id: number) {
    const d = this.bizDefs.find(q => q.id === id); if (!d) return;
    if (d.type === 'stadium' && this.traffic.round.stage !== 'free') { this.toast('Not while a round runs', 'warn'); return; }
    const B = BUSINESS[d.type];
    this.traffic.spend('construction', -B.buildCost / 2);
    this.setBizDefs(this.bizDefs.filter(q => q.id !== id)); this.traffic.setBusinesses(this.bizDefs); this.farmsUpdate();
    this.scheduleSave(); this.toast(`${B.name} demolished (+$${(B.buildCost / 2).toLocaleString()})`, 'good'); this.emit();
  }
  /** demolishes the stadium (between rounds only; see demolishBusiness) */
  demolishStadium() { const s = this.bizDefs.find(d => d.type === 'stadium'); if (s) this.demolishBusiness(s.id); }
  /** announces an event round: the build (10 minutes of wall clock) starts; the city worker refuses unless the round is free */
  startRound() { this.traffic.startRound(); this.toast('The event is announced: 10 minutes to build'); this.emit(); }
  /** ends the build now: the crowd's run to kick-off begins */
  startNow() { this.traffic.startNow(); this.emit(); }
  /** closes the eval: the round is free again and the clock runs on */
  closeRound() {
  if (this.golf && this.traffic.round.last) {
  const ye = this.golfYearEnd(this.traffic.round.last);
  if (ye) {
  this.golf.tier = ye.tier;
  this.golf.rep = ye.rep;
  this.golf.poorYears = ye.poorYears;
  this.sendGolf();
  const book = computeTournamentCloseBook(ye, this.traffic.round.last.tickets ?? 0, this.courseAreaList(), this.traffic.round.last.upkeep, this.traffic.round.last.toll ?? 0);
  if (book.bizIncome > 0) {
  this.traffic.spend('business', -book.bizIncome);
  }
  if (book.upkeepCost > 0) {
  this.traffic.spend('upkeep', book.upkeepCost);
  }
  // T208: the season's everyday play is in the year end (golfYearEnd): a new season starts
  this.dayBook?.endSeason();
  { const st = this.golf.crew?.staff; if (st) this.setStaff(closeSeason(st)); } // T269: and the crew's pin count
  this.scheduleSave();
  }
  }
  this.resultsEarly = false; this.traffic.closeRound(); this.emit();
  }
  /** moves the camera to the stadium's centre, keeping the zoom */
  goToSite() { const s = this.site; if (!s) return; this.cam.X = worldX(s.c.x, s.c.y); this.cam.Y = worldY(s.c.x, s.c.y); this.clampCam(); this.emit(); }
  /** moves the camera to a business's centre, keeping the zoom */
  goToBusiness(id: number) { const d = this.bizDefs.find(q => q.id === id); if (!d) return; const cx = d.x + d.w / 2, cy = d.y + d.h / 2; this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy); this.clampCam(); this.emit(); }

  // ---------- car parks (Phase 5 step 3b) ----------
  /** the index of the car park under tile t, or -1 */
  private parkIndexAt(t: Pt): number { return this.parkDefs.findIndex(d => t.x >= d.x && t.x < d.x + d.w && t.y >= d.y && t.y < d.y + d.h); }
  /** the car park drag: its rect to the pointer (tiles, rounded), the verdict (parkValid's reason, '' if it may be built), its built park and its cost */
  private parkUpdate(mx: number, my: number) {
    const pd = this.parkDrag; if (!pd) return;
    const t = this.tileAt(mx, my);
    pd.x1 = Math.round(t.x); pd.y1 = Math.round(t.y); pd.mx = mx; pd.my = my;
    const raw: CarParkDef = { id: 0, x: Math.min(pd.x0, pd.x1), y: Math.min(pd.y0, pd.y1), w: Math.abs(pd.x1 - pd.x0), h: Math.abs(pd.y1 - pd.y0) };
    // T237: a rectangle beside a road snaps onto its verge (the road its frontage, the entrance on it)
    const def = raw.w > 0 && raw.h > 0 ? snapToRoad(this.net, raw) ?? raw : raw;
    // the preview is laid as syncParks will build it (a golf game's layout), so its bays, serve line and toast count the bays it gets
    if (this.golf) def.cross = true;
    pd.def = def; pd.cost = parkCost(def); pd.why = parkValid(def, this.terrain.cls, this.net, this.site, this.parkDefs) || (this.lotsUnder(def) ? 'buildings stand there' : '') || this.parkSpotWhy(def);
    pd.park = pd.why ? null : buildPark(this.net, def);
  }
  /** T237: why a car park cannot stand on rect d in golf ('' when it can): over the driving range (its tee box, outfield, shop or yard), or a
   *  spot a club building hides in screen space (golf/parkplace.ts) */
  private parkSpotWhy(d: CarParkDef): string {
    const g = this.golf; if (!g) return '';
    const rd = g.start === 'range' ? this.bizDefs.find(b => b.type === 'range') : undefined, plot = rd ? plotOfFront([rd.x, rd.y, rd.w, rd.h], g.dir) : null;
    const keep = plot ? rangeKeepOutWhy(d, rangeKeepOut(plot, g.dir, g.range?.setback ?? 0)) : ''; if (keep) return keep;
    const bs: Building[] = [];
    for (const b of this.bizDefs) if (b.type === 'clubhouse' || b.type === 'halfway') bs.push({ rect: [b.x, b.y, b.w, b.h], name: b.type === 'clubhouse' ? 'the clubhouse' : 'the halfway house' });
    if (plot) bs.push({ rect: rangeLayout(plot, g.dir).hut.rect, name: 'the pro shop' });
    const gb = this.range.scene?.garage?.box; if (gb) bs.push({ rect: [gb[0], gb[1], gb[2] - gb[0], gb[3] - gb[1]], name: 'the car park building' });
    const hid = hiddenBy(d, bs);
    return hid ? `Hidden behind ${hid.name}: place it beside or in front of it` : '';
  }
  /** whether a lot of the town that is not EMPTY overlaps rect r (its box against r) */
  private lotsUnder(r: { x: number; y: number; w: number; h: number }): boolean {
    for (const l of this.traffic.lots.values()) {
      if (l.level === LV.EMPTY) continue;
      const ax = l.o[0] + l.u[0] * l.w, ay = l.o[1] + l.u[1] * l.w, bx = l.o[0] + l.n[0] * l.d, by = l.o[1] + l.n[1] * l.d, cx = ax + l.n[0] * l.d, cy = ay + l.n[1] * l.d;
      if (Math.max(l.o[0], ax, bx, cx) > r.x && Math.min(l.o[0], ax, bx, cx) < r.x + r.w && Math.max(l.o[1], ay, by, cy) > r.y && Math.min(l.o[1], ay, by, cy) < r.y + r.h) return true;
    }
    return false;
  }
  /** the car park drag's end: a valid car park that is affordable is built (id: the next after the highest), else the toast says why */
  private parkRelease() {
    const pd = this.parkDrag; this.parkDrag = null; if (!pd) return;
    if (pd.why) { this.toast(pd.why, 'warn'); return; }
    if (!pd.park) { this.toast('Car park: no road along its sides', 'warn'); return; }
    if (pd.cost > this.money) { this.toast(`Not enough money: a car park this size costs $${pd.cost.toLocaleString()}`, 'warn'); return; }
    const id = Math.max(0, ...this.parkDefs.map(d => d.id)) + 1, bays = pd.park.bays.length;
    this.parkDefs.push({ ...pd.def, id }); this.bump('parks'); this.guideEvent('carpark');
    this.dropTownTrees(pd.def.x, pd.def.y, pd.def.x + pd.def.w, pd.def.y + pd.def.h);
    this.traffic.spend('construction', pd.cost);
    this.syncParks();
    this.toast(`Car park: ${bays} bays ($${pd.cost.toLocaleString()})`, 'good');
    this.scheduleSave(); this.emit();
  }
  /** the car parks' builds on the network (after each network change and on load), and the list to the city worker (which builds them too) */
  private syncParks() {
    // T237: a golf game's car parks are laid in the golf layout (carpark.ts lotPlan: rows nose-in off their aisles, a cross aisle, a mouth at
    // each entrance); the city worker builds them from the same defs, so its bays and the game's agree
    for (const d of this.parkDefs) { if (this.golf) d.cross = true; else delete d.cross; }
    this.parkBuilt = this.parkDefs.map(d => buildPark(this.net, d));
    this.traffic.setParks(this.parkDefs);
    this.parkGrounds(); this.syncGates();
  }
  /** after the Parking tool's lists change (and after each network change, via its sync): the extra parks are its lots and on-street runs as the
   *  engine has them now, and their gates follow */
  private parkingChanged() { this.extraParks = [...this.parking.lots(), ...this.parking.curbParks()]; this.syncGates(); }
  /** the entrance gates, P signs and pay machines of every built car park and every extra park (gateSpots), as auto props gate:{id}:{k}, placed by
   *  their centre; a prop whose spot moved is replaced, and the props of parks that are gone are removed */
  private syncGates() {
    const want = new Map<string, { item: number; x: number; y: number; flip: boolean }>();
    const add = (p: CarPark | null) => {
      if (!p) return;
      // T239: an unpaved lot has its P sign only (no barriers)
      gateSpots(p).filter(g => !p.ground || g.item === 'ce:parking-sign').forEach((g, k) => {
        const item = LIBRARY.findIndex(it => it.id === g.item), b = item >= 0 ? LIBRARY[item]!.boxes[0] : undefined;
        if (!b) return;
        // the box's centre sits at the spot (a flipped prop's box turns: dx and dy swap, see footprint)
        const ox = g.flip ? b.dy : b.dx, oy = g.flip ? b.dx : b.dy;
        want.set(`gate:${p.id}:${k}`, { item, x: g.x - ox / 2, y: g.y - oy / 2, flip: g.flip });
      });
    };
    for (const pk of this.parkBuilt) add(pk);
    for (const p of this.extraParks) add(p);
    for (const [key, p] of this.gateProps) {
      const w = want.get(key);
      if (w && w.item === p.item && w.x === p.x && w.y === p.y && w.flip === p.flip) continue;
      this.removeProp(p); this.gateProps.delete(key);
    }
    for (const [key, w] of want) if (!this.gateProps.has(key)) this.gateProps.set(key, this.addProp(w.item, w.x, w.y, w.flip, 1, key));
  }
  /** the car parks' asphalt and bay lines, baked into the ground like a lot's car park (key park:{id}); a car park gone, or without a frontage, drops its patch */
  private parkGrounds() {
    const keep = new Set<string>(), looks = new Map<number, ParkLook>();
    this.parkDefs.forEach((d, k) => {
      const pk = this.parkBuilt[k]; if (!pk) return;
      const key = `park:${d.id}`, lines: number[] = [];
      for (const b of pk.bays) {
        if (b.dir % 2 === 0) for (const o of [-BAY_W / 2, BAY_W / 2]) lines.push(b.x - BAY_D / 2, b.y + o, b.x + BAY_D / 2, b.y + o);
        else for (const o of [-BAY_W / 2, BAY_W / 2]) lines.push(b.x + o, b.y - BAY_D / 2, b.x + o, b.y + BAY_D / 2);
      }
      // T239: an unpaved lot (the range start's car park before it is paved) is its ground alone: packed dirt or gravel, no painted bays
      // T237: a paved one in golf has the concept's look (event/parklook.ts): its kerbs and planting islands over the asphalt, its footpath
      const look = this.golf && !d.ground ? parkLook(pk, this.lookDoor(pk), this.clubWalls()) : null;
      if (look) looks.set(d.id, look);
      keep.add(key); this.setLotGround(key, [{ pts: [d.x, d.y, d.x + d.w, d.y, d.x + d.w, d.y + d.h, d.x, d.y + d.h], tex: d.ground ?? 'asphalt', ...(d.ground ? {} : { lines }) },
        ...(look ? look.over.map((o): LotPatch => ({ pts: o.pts, tex: o.tex, park: true })) : []), ...(look?.path ?? []).map((q): LotPatch => ({ pts: q.pts, tex: q.tex }))]);
    });
    for (const key of this.parkGround) if (!keep.has(key)) this.setLotGround(key, null);
    this.parkGround = keep; this.parkLooks = looks; this.lookKey = this.venueKey();
    this.syncLookProps();
  }
  /** T237: each paved car park's look (event/parklook.ts) by its id, as parkGrounds laid it last, and the venues' key it was laid for */
  private parkLooks = new Map<number, ParkLook>(); private lookKey = '';
  /** T237: the props of the car parks' looks (look:{id}:{k}: the islands' trees, lamps and shrubs), auto and never saved */
  private lookProps = new Map<string, Prop>();
  /** T237: the venues' key (their kinds and doors): a car park's look follows the venue it serves (its footpath, the bays' order) */
  private venueKey(): string { return this.venues().map(v => `${v.id}${Math.round(v.door.x)},${Math.round(v.door.y)}`).join(';'); }
  /** T237: the door a car park's footpath runs to: the nearest venue it serves (the range's: the walkway's end at its car parks, so the path
   *  meets the range's own path past the shop); null when it serves none */
  private lookDoor(pk: CarPark): Pt | null {
    const s = servesOf(pk.bays, this.venues())[0]; if (!s) return null;
    return s.venue.id === 'range' ? this.range.scene?.carEdge ?? s.venue.door : s.venue.door;
  }
  /** T237: where a car park's walkers step off it: the start of its footpath (the point of its edge nearest the door it serves: event/parklook
   *  footpath), null when it serves none */
  private footStart(pk: CarPark): Pt | null {
    const door = this.lookDoor(pk); return door ? footStart(pk, door) : null;
  }
  /** T237: the far end of a footpath leg (the centre of its end side: event/parklook strip's corners 1 and 2) */
  private pathMid(p: { pts: number[] }): Pt { return { x: (p.pts[2]! + p.pts[4]!) / 2, y: (p.pts[3]! + p.pts[5]!) / 2 }; }
  /** T237: the club's buildings' footprints (a footpath ends at the first one's face) */
  private clubWalls(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (const b of this.bizDefs) if (b.type === 'clubhouse' || b.type === 'halfway') out.push([b.x, b.y, b.w, b.h]);
    const g = this.golf, rd = g?.start === 'range' ? this.bizDefs.find(b => b.type === 'range') : undefined;
    if (g && rd) out.push(rangeLayout(plotOfFront([rd.x, rd.y, rd.w, rd.h], g.dir), g.dir).hut.rect);
    return out;
  }
  /** T237: the looks' props as parkGrounds laid them: a prop whose spot or picture moved is replaced, the gone ones removed (trees are never
   *  mirrored: addProp turns only the trees lit from the left, tree-sun.ts); the lamps light at night (syncLamps) */
  private syncLookProps() {
    const want = new Map<string, { item: number; x: number; y: number; scale: number }>();
    for (const [id, look] of this.parkLooks) look.props.forEach((q, k) => {
      const item = LIB_INDEX.get(q.id); if (item === undefined) return;
      const b = LIBRARY[item]!.boxes[0]; if (!b) return;
      want.set(`look:${id}:${k}`, { item, x: q.x - b.dx * q.scale / 2, y: q.y - b.dy * q.scale / 2, scale: q.scale });
    });
    let lamps = false;
    for (const [key, p] of this.lookProps) {
      const w = want.get(key);
      if (w && w.item === p.item && w.x === p.x && w.y === p.y && this.props.has(p)) continue;
      lamps ||= LIBRARY[p.item]!.kind === 'lamp'; this.removeProp(p); this.lookProps.delete(key);
    }
    for (const [key, w] of want) if (!this.lookProps.has(key)) { this.lookProps.set(key, this.addProp(w.item, w.x, w.y, false, w.scale, key)); lamps ||= LIBRARY[w.item]!.kind === 'lamp'; }
    if (lamps) this.syncLamps();
  }
  /** the ground patch keys of the car parks (park:{id}) baked now */
  private parkGround = new Set<string>();
  /** removes car park k (no refund): its parked cars go with it */
  private removePark(k: number) { const d = this.parkDefs[k]!; this.dropParkCars(d.id); this.dropTownTrees(d.x, d.y, d.x + d.w, d.y + d.h); this.parkDefs.splice(k, 1); this.syncParks(); }
  /** removes the parked car props of car park id (they are contiguous from bay 0) */
  private dropParkCars(id: number) {
    for (let i = 0; ; i++) { const key = `park:${id}:${i}`, p = this.parkCars.get(key); if (!p) break; this.removeProp(p); this.parkCars.delete(key); }
  }
  /** the parked cars: the worker's `parked` cars of each car park stand in a fixed order of its bays (parked-cars.ts workerBay: nearest its entrances
   *  first, or from the far end in the range's and the club's car parks, whose golfers' cars draw themselves near the entrance), each an auto prop
   *  park:{id}:{i} (never saved) facing its bay and centred on it, in its own paint (car-paint.ts: from its bay); only the difference is added or
   *  removed, at most twice a second, and only for the car parks on screen (T228: one off screen is not looked at; its props, culled with their
   *  sprite tiles, cost nothing to draw, and it catches up when it comes into view) */
  private syncParkCars(now: number) {
    if (now - this.parkSyncAt < 500) return;
    this.parkSyncAt = now;
    // T237: the car parks' looks follow the venues they serve (a clubhouse placed, the range's scene laid on a load): laid again when those move
    if (this.golf && this.parkDefs.length && this.venueKey() !== this.lookKey) this.parkGrounds();
    const views = new Map(this.traffic.parks.map(v => [v.id, v])), view = this.viewTileBox;
    const shared = (pk: CarPark | null) => !!pk && (!!this.rangePk?.pks.has(pk) || pk === this.dayPark);
    for (let k = 0; k < this.parkDefs.length; k++) { const pk = this.parkBuilt[k] ?? null; if (this.parkInView(pk, view)) this.parkCarsOf(this.parkDefs[k]!.id, pk, views, shared(pk)); }
    // the bay rows' lots and on-street runs park the same way; the ones gone lose their cars
    const ids = new Set<number>();
    for (const p of this.extraParks) { ids.add(p.id); if (this.parkInView(p, view)) this.parkCarsOf(p.id, p, views, false); }
    for (const id of this.extraCarIds) if (!ids.has(id)) this.dropParkCars(id);
    this.extraCarIds = ids;
  }
  /** T228: the tile box on screen (with a margin), as the last frame drew it; null before the first */
  private viewTileBox: TileBox | null = null;
  /** T228: each built car park's bay box (parked-cars.ts baysBox), cached per park object */
  private parkBoxes = new WeakMap<CarPark, TileBox | null>();
  /** T228: whether a built car park is on screen (no view yet: yes; no park: yes, so a car park that lost its frontage drops its cars at once) */
  private parkInView(pk: CarPark | null, view: TileBox | null): boolean {
    if (!pk || !view) return true;
    let b = this.parkBoxes.get(pk); if (b === undefined) { b = baysBox(pk.bays); this.parkBoxes.set(pk, b); }
    return !b || boxesMeet(b, view);
  }
  /** car park id's parked cars (pk: its built park, null if none): the worker's cars in their bays (parked-cars.ts workerBay), as syncParkCars says;
   *  a car whose bay moved (the car park laid again) goes to its new one */
  private parkCarsOf(id: number, pk: CarPark | null, views: Map<number, ParkView>, shared: boolean) {
    const v = views.get(id), n = pk ? pk.bays.length : 0;
    const want = pk && v ? workerShown(v.parked, n) : 0;
    for (let i = 0; i < want; i++) {
      const key = `park:${id}:${i}`, have = this.parkCars.get(key);
      // T236: the bay's car from the vehicle mix (vehicles.ts bayCar: always the same vehicle in the same bay, a picture it has at the bay's heading)
      const bay = (shared ? this.doorBays(pk!) : pk!.bays)[workerBay(i, n, shared)]!, facing = bayCar(bay.dir, bay.x, bay.y), x = bay.x - facing.ox, y = bay.y - facing.oy;
      if (have && this.props.has(have) && have.x === x && have.y === y && have.item === facing.item) continue;
      if (have && this.props.has(have)) this.removeProp(have);
      this.parkCars.set(key, this.addProp(facing.item, x, y, facing.flip, facing.size, key, isWagon(facing.item) ? undefined : { foot: bayFoot(facing, bay.x, bay.y) }));
    }
    for (let i = want; ; i++) { const key = `park:${id}:${i}`, p = this.parkCars.get(key); if (!p) break; this.removeProp(p); this.parkCars.delete(key); }
  }
  /** moves the camera to car park id's centre, keeping the zoom */
  goToPark(id: number) { const d = this.parkDefs.find(q => q.id === id); if (!d) return; this.cam.X = worldX(d.x + d.w / 2, d.y + d.h / 2); this.cam.Y = worldY(d.x + d.w / 2, d.y + d.h / 2); this.clampCam(); this.emit(); }
  /** dev: n cars sent to car park id (the city worker parks them as bays allow; see parkTest there) */
  parkTest(id: number, n: number) { this.traffic.parkTest(id, n); }
  /** the car park bays as 1 px outlines (one stroke): the rect of each bay, its depth along the bay's facing (dir even: x) */
  private bayOutlines(ctx: CanvasRenderingContext2D, bays: { x: number; y: number; dir: number }[]) {
    this.setIso(ctx); ctx.beginPath();
    for (const b of bays) { const ex = b.dir % 2 === 0 ? BAY_D / 2 : BAY_W / 2, ey = b.dir % 2 === 0 ? BAY_W / 2 : BAY_D / 2; ctx.rect(b.x - ex, b.y - ey, 2 * ex, 2 * ey); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = this.dpr; ctx.stroke();
  }
  /** the car parks over the baked ground: red when it lost its frontage, its entrances as amber dots with a line to its edge, and the label
   *  P · parked/bays at its centre */
  private drawParks(ctx: CanvasRenderingContext2D) {
    const dpr = this.dpr;
    for (let k = 0; k < this.parkDefs.length; k++) {
      const d = this.parkDefs[k]!, pk = this.parkBuilt[k] ?? null;
      if (!this.parkInView(pk, this.viewTileBox)) continue; // (T228: a car park off screen: nothing to draw)
      // the asphalt and the bays are baked into the ground (parkGrounds); the overlay only marks a car park that lost its frontage
      if (!pk) { this.setIso(ctx); ctx.beginPath(); ctx.rect(d.x, d.y, d.w, d.h); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(230,80,80,0.6)'; ctx.fill(); }
      if (pk) for (const e of pk.entrances) {
        const a = this.screen(clamp(e.x, d.x, d.x + d.w), clamp(e.y, d.y, d.y + d.h)), b = this.screen(e.x, e.y);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = '#ffbe3c'; ctx.lineWidth = 2 * dpr; ctx.stroke();
        disc(ctx, b.x, b.y, 4 * dpr, '#ffbe3c');
      }
      const parked = this.traffic.parks.find(q => q.id === d.id)?.parked ?? 0, c = this.screen(d.x + d.w / 2, d.y + d.h / 2);
      // the range's car park also holds the range sim's cars, which the worker never sees (T132)
      // (T146: the cars in the car park building are counted over it, not here)
      const label = parkLabel(parked, (pk && this.rangePk?.pks.has(pk) ? this.range.sim.parkedIn(pk.id) : 0) + (pk && pk === this.dayPark && this.dayPlay ? this.dayPlay.view.parkedNow(this.dayMinute) : 0), pk ? pk.bays.length : 0); // (T208: and the everyday golfers' cars)
      // a count: a world label of the second rank (T151)
      this.labels.text(d, PRI.count, label, c.x, c.y, `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`, 12 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
    }
    // the bay rows' lots and on-street runs: their entrances and labels, and a lot with no road in reach
    this.parkView.ctx = ctx; this.parkView.dpr = dpr; this.parkView.labels = this.labels; drawParkingOverlay(this.parkView, this.extraParks, this.traffic.parks, this.parking.rows);
    if (this.golf) {
    const parcels = this.golf.parcels ?? [this.golf.parcel];
    const rect = (x: number, y: number, w: number, h: number) => { this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0); };
    for (const r of parcels) {
    rect(r[0], r[1], r[2], r[3]);
    // (T200: your land outlined clearly while Land for sale is open)
    ctx.strokeStyle = this.landMode ? 'rgba(250, 204, 21, 0.95)' : 'rgba(234, 179, 8, 0.7)'; ctx.lineWidth = (this.landMode ? 3 : 1.5) * dpr; ctx.setLineDash([4 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
    }
    // T200: Land for sale: every block for sale tinted by its price band, with its band's $ label and its price (colour never alone, T180);
    // a block you cannot buy hatched with a small ✕ (its reason by the pointer); the block under the pointer and the card's outlined
    if (this.landMode) {
    const offers = this.land.offers(), hov = this.land.hover, card = this.land.card, font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    for (const o of offers) {
      const r = o.rect, on = hov === o || (card !== null && card.rect.join() === r.join());
      rect(r[0] + 0.4, r[1] + 0.4, r[2] - 0.8, r[3] - 0.8);
      if (o.why) {
        ctx.save(); ctx.fillStyle = 'rgba(70, 60, 60, 0.28)'; ctx.fill(); ctx.clip();
        const cs = [this.screen(r[0], r[1]), this.screen(r[0] + r[2], r[1]), this.screen(r[0], r[1] + r[3]), this.screen(r[0] + r[2], r[1] + r[3])];
        strokeHatch(ctx, Math.min(...cs.map(c => c.x)), Math.min(...cs.map(c => c.y)), Math.max(...cs.map(c => c.x)), Math.max(...cs.map(c => c.y)), dpr, 'rgba(255, 220, 210, 0.75)', 0.55);
        ctx.restore();
        rect(r[0] + 0.4, r[1] + 0.4, r[2] - 0.8, r[3] - 0.8);
        ctx.strokeStyle = on ? '#fca5a5' : 'rgba(252, 165, 165, 0.55)'; ctx.lineWidth = (on ? 2.5 : 1.2) * dpr; ctx.setLineDash([5 * dpr, 4 * dpr]); ctx.stroke(); ctx.setLineDash([]);
        const c = this.screen(r[0] + r[2] / 2, r[1] + r[3] / 2); drawRefusedCross(ctx, c.x, c.y, dpr);
        continue;
      }
      const band = LAND_BAND_COL[o.band ?? 'fair'];
      ctx.fillStyle = band.fill; ctx.fill();
      ctx.strokeStyle = on ? '#fff7d6' : band.edge; ctx.lineWidth = (on ? 3 : 1.5) * dpr; ctx.stroke();
      const c = this.screen(r[0] + r[2] / 2, r[1] + r[3] / 2);
      // a count's rank: the band and the price stay readable over the trees' names (T151)
      this.labels.text(o, on ? PRI.hint : PRI.count, `${o.name ? `${o.name} · ` : ''}${BAND_LABEL[o.band ?? 'fair']} · $${o.price.toLocaleString()}`, c.x, c.y, font, 12 * dpr, band.ink, LABEL_OUTLINE, 3 * dpr);
    }
    // the reason a block under the pointer cannot be bought, by the pointer
    if (hov?.why && this.hover) { const c = this.screen(this.hover.x, this.hover.y); this.labels.text(LABEL_KEY.landHover, PRI.hint, hov.why, c.x, c.y - 22 * dpr, font, 12 * dpr, '#fecaca', LABEL_OUTLINE, 3 * dpr); }
    }
    }
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
    }
  /** the car park drag: the rect green where parkValid allows it, else red; its bays and entrances when it can be built; and the verdict at the cursor
   *  (the reason, or the cost short of the money, or the bays and the cost) */
  private drawParkPreview(ctx: CanvasRenderingContext2D) {
    const pd = this.parkDrag;
    // T237: the Car park tool shows each venue's walking ring before a drag too, so the player sees where a car park would serve
    if (!pd) { if (this.tool === 'park') { const vs = this.venues(); if (vs.length) drawServePreview({ ctx, dpr: this.dpr, screen: (x, y) => this.screen(x, y), setIso: c => this.setIso(c) }, vs, [], p => p, NaN, NaN); } return; }
    const d = pd.def, pk = pd.park, v = this.ghostView(ctx), g = ghostStatus(pd.why, pd.cost, this.money, `${pk ? pk.bays.length : 0} bays`);
    drawGhostBlueprint(v, { status: g.status, rects: [{ rect: { x: d.x, y: d.y, w: d.w, h: d.h } }] });
    if (pk) { this.bayOutlines(ctx, pk.bays); drawGhostBlueprint(v, { status: g.status, entrances: pk.entrances }); }
    drawGhostHint(v, pd.mx, pd.my, g.label, g.bad);
    // T237: the walking distance (golf/walkserve.ts): each venue's ring, the lines to the venues this car park would serve, and the verdict
    if (d.w > 0 && d.h > 0) this.drawServe(ctx, pk ? pk.bays : [], [d.x, d.y, d.w, d.h], pd.mx, pd.my);
  }
  /** T237: the walking-distance preview for a car park being placed (its bays, or its rect while it has none) at the pointer (CSS px) */
  private drawServe(ctx: CanvasRenderingContext2D, bays: readonly Pt[], rect: [number, number, number, number], mx: number, my: number) {
    const venues = this.venues(); if (!venues.length) return;
    const serves = servesOf(bays, venues, rect);
    const from = (door: Pt): Pt => {
      if (!bays.length) return { x: clamp(door.x, rect[0], rect[0] + rect[2]), y: clamp(door.y, rect[1], rect[1] + rect[3]) };
      let best = bays[0]!, bd = Infinity; for (const b of bays) { const q = Math.hypot(b.x - door.x, b.y - door.y); if (q < bd) { bd = q; best = b; } }
      return best;
    };
    drawServePreview({ ctx, dpr: this.dpr, screen: (x, y) => this.screen(x, y), setIso: c => this.setIso(c) }, venues, serves, from, mx, my);
  }

  // ---------- toll gates (Phase 5 step 5b) ----------
  /** the road seg whose ends are the plaza's a and b (either way round, within 1e-3), or null */
  private tollSeg(d: TollDef): Seg | null {
    const at = (p: Pt, x: number, y: number) => Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3;
    for (const s of this.net.segsNear({ x: (d.ax + d.bx) / 2, y: (d.ay + d.by) / 2 }, PLAZA_LEN / 2 + 1)) {
      if ((at(s.a, d.ax, d.ay) && at(s.b, d.bx, d.by)) || (at(s.a, d.bx, d.by) && at(s.b, d.ax, d.ay))) return s;
    }
    return null;
  }
  /** the index of the toll gate whose plaza (tapers included) holds tile t, or -1 */
  private tollIndexAt(t: Pt): number {
    return this.tollDefs.findIndex(d => { const s = this.tollSegs.get(d.id); if (!s) return false; const f = plazaLocal(d, t.x, t.y); return f.t >= 0 && f.t <= PLAZA_LEN && f.o >= -s.cls.h && f.o <= plazaEdge(d.booths, laneOff(s, 0)); });
  }
  /** the toll tool's plan at the cursor: the nearest road piece within 4 tiles, the plaza it would make (its a → b is the inbound way: toward the stadium, R flips it),
   *  and the verdict (why: the reason it cannot be built, '' if it can) */
  private tollUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), booths = this.tollBooths, cost = TOLL_BASE_COST + booths * TOLL_BOOTH_COST;
    let best: Seg | null = null, bd = 4, pr = 0;
    for (const s of this.net.segsNear(t, 4)) {
      const dv = sub(s.b, s.a), L = vlen(dv); if (!L) continue;
      const u = mul(dv, 1 / L), k = clamp(dot(sub(t, s.a), u), 0, L), dist = vlen(sub(t, add(s.a, mul(u, k))));
      if (dist < bd) { bd = dist; best = s; pr = k; }
    }
    if (!best) { this.tollHover = { mx, my, seg: null, a: t, b: t, why: 'Point at a straight road', cost, booths }; return; }
    const seg: Seg = best, dv = sub(seg.b, seg.a), L = vlen(dv), u = mul(dv, 1 / L), P = add(seg.a, mul(u, pr));
    const toward = !this.site || dot(u, sub(this.site.c, P)) >= 0, s0 = Math.round(pr - PLAZA_LEN / 2);
    const p0 = add(seg.a, mul(u, s0)), p1 = add(seg.a, mul(u, s0 + PLAZA_LEN)), fwd = toward !== this.tollFlip;
    const a = fwd ? p0 : p1, b = fwd ? p1 : p0, ends = Math.min(pr, L - pr), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const junction = (p: Pt) => { for (const q of this.net.segsNear(p, 1)) if (q !== seg && segDist(p, q) < 0.6) return true; return false; };
    let why = '';
    if (seg.kind !== SK.GROUND) why = 'Toll gates go on ground-level road, not a bridge or tunnel';
    else if (ends < PLAZA_LEN / 2 + 6) why = 'Too close to a junction: a toll gate needs 21 tiles of straight road at each side';
    else if (junction(a) || junction(b)) why = 'A junction is in the way: move the gate';
    else if (this.tollDefs.some(d => Math.hypot((d.ax + d.bx) / 2 - cx, (d.ay + d.by) / 2 - cy) < 60)) why = 'Another toll gate is within 60 tiles';
    this.tollHover = { mx, my, seg, a, b, why, cost, booths };
  }
  /** the toll tool's click: a valid, affordable gate is built on the plan at the cursor (its plaza seg; the road is split at its ends) */
  private tollClick() {
    const h = this.tollHover; if (!h) return;
    if (!h.seg) { this.toast('Click a straight road to put a toll gate on it', 'warn'); return; }
    if (h.why) { this.toast(h.why, 'warn'); return; }
    if (h.cost > this.money) { this.toast(`Not enough money: a toll gate with ${h.booths} booths costs $${h.cost.toLocaleString()}`, 'warn'); return; }
    const s = h.seg, id = Math.max(0, ...this.tollDefs.map(d => d.id)) + 1, def: TollDef = { id, ax: h.a.x, ay: h.a.y, bx: h.b.x, by: h.b.y, booths: h.booths };
    this.tollDefs.push(def); { const b = tollBox(def); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); }
    this.edit.addLegs([{ a: h.a, b: h.b }], s.cls, s.style, [SK.GROUND]);
    this.commitNetwork();
    if (!this.tollDefs.includes(def)) { this.toast('The road would not take a toll gate here', 'warn'); this.tollUpdate(h.mx, h.my); return; }
    this.traffic.setTolls(this.tollDefs);
    this.traffic.spend('construction', h.cost);
    this.puff((h.a.x + h.b.x) / 2, (h.a.y + h.b.y) / 2, 8);
    this.toast(`Toll gate: ${h.booths} booths`, 'good');
    this.tollUpdate(h.mx, h.my);
  }
  /** the toll gates' plaza segs after each network change (and on load): a gate whose plaza seg is gone is dropped; the ground is baked for the rest
   *  (key toll:{id}); the worker gets the list when a gate was dropped, or when forced */
  private syncTolls(force = false) {
    const keep: TollDef[] = [], segs = new Map<number, Seg>();
    for (const d of this.tollDefs) { const s = this.tollSeg(d); if (s) { keep.push(d); segs.set(d.id, s); } }
    const dropped = keep.length !== this.tollDefs.length;
    this.tollDefs = keep; this.tollSegs = segs;
    const ground = new Set<string>();
    for (const d of keep) { const key = `toll:${d.id}`, s = segs.get(d.id)!; ground.add(key); this.setLotGround(key, this.tollPatches(d, s)); }
    for (const key of this.tollGround) if (!ground.has(key)) this.setLotGround(key, null);
    this.tollGround = ground;
    if (dropped || force) this.traffic.setTolls(this.tollDefs);
  }
  /** removes toll gate k (no refund): its plaza's ground goes; the road stays */
  private removeToll(k: number) {
    const d = this.tollDefs[k]!, key = `toll:${d.id}`, b = tollBox(d);
    this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!);
    this.tollDefs.splice(k, 1); this.tollSegs.delete(d.id); this.setLotGround(key, null); this.tollGround.delete(key);
    this.traffic.setTolls(this.tollDefs);
  }
  /** the plaza's asphalt patches for toll gate d on seg s (baked like a car park's) */
  private tollPatches(d: TollDef, s: Seg): LotPatch[] { return plazaQuads(d, s.cls.h, laneOff(s, 0)).map(pts => ({ pts, tex: 'asphalt' as const })); }
  /** moves the camera to toll gate id's plaza, keeping the zoom */
  goToToll(id: number) { const d = this.tollDefs.find(q => q.id === id); if (!d) return; const x = (d.ax + d.bx) / 2, y = (d.ay + d.by) / 2; this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit(); }
  /** the toll gates over the baked ground: a booth island between each pair of booth lanes and at both outer sides (grey, with an amber roof dot), and the
   *  label TOLL · $price above them (the price per car at the round's level) */
  private drawTolls(ctx: CanvasRenderingContext2D) {
    if (!this.tollDefs.length) return;
    const dpr = this.dpr, price = tollPrice(this.traffic.round.level);
    this.setIso(ctx); ctx.beginPath();
    for (const d of this.tollDefs) { const s = this.tollSegs.get(d.id); if (s) for (const i of plazaIslands(d, laneOff(s, 0))) ring(ctx, i.quad); }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d4d4d8'; ctx.fill(); ctx.strokeStyle = '#0f172a'; ctx.lineWidth = dpr; ctx.stroke();
    const font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    for (const d of this.tollDefs) {
      const s = this.tollSegs.get(d.id); if (!s) continue;
      const off0 = laneOff(s, 0);
      for (const i of plazaIslands(d, off0)) { const p = this.screen(i.c.x, i.c.y); disc(ctx, p.x, p.y, 2 * dpr, '#ffbe3c'); }
      // its price: a world label (T151)
      const mid = plazaPoint(d, PLAZA_LEN / 2, (-s.cls.h + plazaEdge(d.booths, off0)) / 2), c = this.screen(mid.x, mid.y);
      this.labels.text(d, PRI.count, `TOLL · $${price}`, c.x, c.y - 18 * dpr, font, 12 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
    }
  }
  /** the toll tool's preview at the cursor: the plaza outline (green where it can go, else red), its inbound arrow and a booth line across each booth lane;
   *  the label: the reason, or the booths and the cost (red when short of the money) */
  private drawTollPreview(ctx: CanvasRenderingContext2D) {
    const h = this.tollHover; if (!h) return;
    const dpr = this.dpr, s = h.seg;
    if (s) {
      const d: TollDef = { id: 0, ax: h.a.x, ay: h.a.y, bx: h.b.x, by: h.b.y, booths: h.booths }, off0 = laneOff(s, 0), c = PLAZA_LEN / 2;
      const outline = plazaOutline(d, s.cls.h, off0);
      drawGhostPoly(this.ghostView(ctx), outline, h.why ? 'invalid' : 'valid');
      const q = (t: number, o: number, first = false) => { const p = plazaPoint(d, t, o); if (first) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); };
      this.setIso(ctx); ctx.beginPath();
      q(c - 6, 0, true); q(c + 6, 0); q(c + 3, -1.5); q(c + 6, 0); q(c + 3, 1.5);
      for (let k = 0; k < h.booths; k++) { const o = off0 + BOOTH_W * k; q(c, o - 0.8, true); q(c, o + 0.8); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke();
    }
    const g = tollGhostLabel(h.why, h.booths, h.cost, this.money);
    drawGhostHint(this.ghostView(ctx), h.mx, h.my, g.label, g.bad);
  }

  // ---------- shuttle bus routes (Phase 5 step 6b) ----------
  /** the road point nearest tile t within r tiles (its projection on the nearest seg's centre line), or null */
  private roadNear(t: Pt, r: number): Pt | null {
    let best: Pt | null = null, bd = r;
    for (const s of this.net.segsNear(t, r)) {
      const dv = sub(s.b, s.a), L = vlen(dv); if (!L) continue;
      const u = mul(dv, 1 / L), P = add(s.a, mul(u, clamp(dot(sub(t, s.a), u), 0, L))), d = vlen(sub(t, P));
      if (d < bd) { bd = d; best = P; }
    }
    return best;
  }
  /** the bus tool's plan at the cursor: the stop it would place (x, y: a road point within 4 tiles, else the tile under the cursor), the car park of a lot stop
   *  (park: its id; 0 for a doors stop, a town's car park or none), the town of a stop beside a town's car park lot (town), and why it cannot be placed ('' if
   *  it can). The lot stop: a car park within 12 tiles of the road point, else a town's car park lot (townParkAt); the doors stop: within 60 tiles of the
   *  stadium's rect. Once the first stop is picked, the plan is the doors stop */
  private busUpdate(mx: number, my: number) {
    const t = this.tileAt(mx, my), lot = !this.busPick, P = this.roadNear(t, 4);
    if (!P) { this.busHover = { mx, my, x: t.x, y: t.y, park: 0, why: lot ? 'Click a road beside a car park' : 'Click a road near the stadium' }; return; }
    if (lot) {
      let park = 0, bd = 12;
      for (const d of this.parkDefs) { const q = rectDist(P, d.x, d.y, d.w, d.h); if (q <= bd) { bd = q; park = d.id; } }
      if (park) { this.busHover = { mx, my, x: P.x, y: P.y, park, why: '' }; return; }
      const town = this.townParkAt(t, 12);
      this.busHover = town === null ? { mx, my, x: P.x, y: P.y, park: 0, why: 'Click a road beside a car park' } : { mx, my, x: P.x, y: P.y, park: 0, why: '', town };
    } else {
      const s = this.site, near = !!s && rectDist(P, s.x, s.y, s.w, s.h) <= 60;
      this.busHover = { mx, my, x: P.x, y: P.y, park: 0, why: near ? '' : 'Click a road near the stadium' };
    }
  }
  /** the town of the town public car park lot (a COM lot that isCarPark) whose centre is nearest tile t within r tiles, or null; the town is the nearest
   *  town centre to that lot's centre (the worker's town index: the terrain's towns, in order) */
  private townParkAt(t: Pt, r: number): number | null {
    let best: LotView | null = null, bd = r, bx = 0, by = 0;
    for (const v of this.traffic.lots.values()) {
      if (!isCarPark(v)) continue;
      const cx = v.o[0] + (v.u[0] * v.w + v.n[0] * v.d) / 2, cy = v.o[1] + (v.u[1] * v.w + v.n[1] * v.d) / 2, d = Math.hypot(cx - t.x, cy - t.y);
      if (d <= bd) { bd = d; best = v; bx = cx; by = cy; }
    }
    if (!best) return null;
    const cs = townCentres(this.terrain);
    let k = -1, kd = Infinity;
    cs.forEach((c, i) => { const d = (c.x - bx) ** 2 + (c.y - by) ** 2; if (d < kd) { kd = d; k = i; } });
    return k < 0 ? null : k;
  }
  /** the bus tool's click: the first picks the lot stop (its plan must have a car park), the second places the route with the doors stop if it is affordable
   *  (the first route is free: the starting kit) */
  private busClick() {
    const h = this.busHover; if (!h) return;
    if (h.why) { this.toast(h.why, 'warn'); return; }
    if (!this.busPick) { this.busPick = { x: h.x, y: h.y, park: h.park, town: h.town }; this.busUpdate(h.mx, h.my); this.emit(); return; }
    const cost = this.busDefs.length ? BUS_ROUTE_COST : 0, pk = this.busPick;
    if (cost > this.money) { this.toast(`Not enough money: a bus route costs $${cost.toLocaleString()}`, 'warn'); return; }
    const id = Math.max(0, ...this.busDefs.map(d => d.id)) + 1;
    this.busDefs.push({ id, park: pk.park, sx: pk.x, sy: pk.y, dx: h.x, dy: h.y, buses: this.busFleet, seats: this.busSeats, ...(pk.town !== undefined ? { town: pk.town } : {}) });
    if (cost) this.traffic.spend('construction', cost);
    this.traffic.setBusRoutes(this.busDefs); this.syncStopCuts();
    this.busPick = null; this.puff((pk.x + h.x) / 2, (pk.y + h.y) / 2, 8);
    this.toast(`Bus route #${id}: ${this.busFleet} buses of ${this.busSeats} seats${cost ? ` ($${cost.toLocaleString()})` : ' (the starting kit)'}`, 'good');
    this.busUpdate(h.mx, h.my); this.scheduleSave(); this.emit();
  }
  /** the index of the bus route with a stop within 3 tiles of tile t, or -1 */
  private busIndexAt(t: Pt): number { return this.busDefs.findIndex(d => Math.hypot(d.sx - t.x, d.sy - t.y) <= 3 || Math.hypot(d.dx - t.x, d.dy - t.y) <= 3); }
  /** removes bus route k (no refund) and sends the list to the city worker (which plans the buses again) */
  private removeBus(k: number) { this.busDefs.splice(k, 1); this.traffic.setBusRoutes(this.busDefs); this.syncStopCuts(); }
  /** T228: the bus stops' cuts in the roads' white edge lines (street-marks.ts stopCut), one lot ground patch per stop (key stop:{route}:{0|1}),
   *  laid again when the routes or the roads change; the ones gone are dropped */
  private syncStopCuts() {
    const keep = new Set<string>();
    for (const d of this.busDefs) ([[d.sx, d.sy], [d.dx, d.dy]] as const).forEach(([x, y], k) => {
      const c = stopCut({ x, y }, this.net.segsNear({ x, y }, 12)); if (!c) return;
      const key = `stop:${d.id}:${k}`, j = JSON.stringify(c.pts); keep.add(key);
      if (this.stopCuts.get(key) !== j) { this.stopCuts.set(key, j); this.setLotGround(key, [c]); }
    });
    for (const key of [...this.stopCuts.keys()]) if (!keep.has(key)) { this.stopCuts.delete(key); this.setLotGround(key, null); }
  }
  /** T228: the bus stops' edge-line cuts laid now, by key (their quads, as JSON) */
  private stopCuts = new Map<string, string>();
  /** moves the camera to the midpoint of bus route id's stops, keeping the zoom */
  goToBus(id: number) { const d = this.busDefs.find(q => q.id === id); if (!d) return; const x = (d.sx + d.dx) / 2, y = (d.sy + d.dy) / 2; this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y); this.clampCam(); this.emit(); }
  /** the bus routes over the baked ground: a bus-stop marker at each stop, and at the street and district zooms a thin dashed line between a route's two stops
   *  (white 30%: a schematic, not the path) */
  private drawBuses(ctx: CanvasRenderingContext2D) {
    if (!this.busDefs.length) return;
    const dpr = this.dpr;
    if (this.cam.z >= PLANNER_Z) {
      ctx.beginPath();
      for (const d of this.busDefs) { const a = this.screen(d.sx, d.sy), b = this.screen(d.dx, d.dy); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.setLineDash([]);
    }
    for (const d of this.busDefs) { const a = this.screen(d.sx, d.sy), b = this.screen(d.dx, d.dy); busStop(ctx, a.x, a.y, dpr); busStop(ctx, b.x, b.y, dpr); }
  }
  /** the galleries' crowds (LEAD.md M2.2): below the street tier each spot is a green dot sized by its fans; at the street tier the fans are the
   *  3D spectators (crowdMovers), drawn in the sprite layer, so this 2D layer adds no dot there. At zoom 0.2 and closer the count (`n watching`)
   *  sits above the spot, a walker's height (h) up. Culled to the view */
  private drawGalleries(ctx: CanvasRenderingContext2D) {
    const G = this.traffic.gallery; if (!G.length) return;
    const dpr = this.dpr, ze = this.cam.z * this.dpr, cw = this.cw, ch = this.ch, dots = this.cam.z < DISTRICT_Z, h = 0.9 * HH * 2 * ze;
    const font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    for (let i = 0; i + 7 < G.length; i += 8) {
      const x = G[i]!, y = G[i + 1]!, n = Math.round(G[i + 2]!); if (n <= 0) continue;
      const c = this.screen(x, y); if (c.x < -200 || c.y < -200 || c.x > cw + 200 || c.y > ch + 200) continue;
      if (dots) { ctx.fillStyle = 'rgba(134,239,172,0.85)'; ctx.beginPath(); ctx.arc(c.x, c.y, Math.min(10, 2 + Math.sqrt(n) / 3) * dpr, 0, Math.PI * 2); ctx.fill(); }
      // the count: a world label (T151), keyed by its spot
      if (this.cam.z >= 0.2) this.labels.text(LABEL_KEY.gallery + i / 8, PRI.count, `${n} watching`, c.x, c.y - h * 1.6, font, 12 * dpr, '#bbf7d0', LABEL_OUTLINE, 3 * dpr);
    }
  }
  /** the shuttle crowd on the map (during a surge and its eval): each stop's and gate's queue with its count (`n waiting`, above the stop). The
   *  queues' people and the walking parties are 3D movers at the street tier (crowdMovers), so they have no 2D drawing there; below the street tier
   *  each walking party is a 2 px amber dot. Culled to the view */
  private drawWalkers(ctx: CanvasRenderingContext2D) {
    const W = this.traffic.walkers, S = this.traffic.stops;
    if (!W.length && !S.length) return;
    const dpr = this.dpr, ze = this.cam.z * this.dpr, cw = this.cw, ch = this.ch, X0 = this.cam.X, Y0 = this.cam.Y, font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    for (let i = 0; i + 3 < S.length; i += 4) {
      const sx = S[i]!, sy = S[i + 1]!, q = Math.round(S[i + 2]!);
      if (q > 0) {
        // the queue's count: a world label (T151), keyed by its stop
        const px = (worldX(sx, sy) - X0) * ze + cw / 2, py = (worldY(sx, sy) - Y0) * ze + ch / 2;
        this.labels.text(LABEL_KEY.waiting + i / 4, PRI.count, `${q} waiting`, px, py - 16 * dpr, font, 12 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
      }
    }
    if (this.cam.z < DISTRICT_Z) {
      ctx.fillStyle = '#ffbe3c';
      for (let i = 0; i + 5 < W.length; i += 6) {
        const px = (worldX(W[i]!, W[i + 1]!) - X0) * ze + cw / 2, py = (worldY(W[i]!, W[i + 1]!) - Y0) * ze + ch / 2;
        if (px >= -2 * dpr && px <= cw + 2 * dpr && py >= -2 * dpr && py <= ch + 2 * dpr) ctx.fillRect(px - dpr, py - dpr, 2 * dpr, 2 * dpr);
      }
    }
    ctx.lineJoin = 'miter'; ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
  /** the golf balls of the day (docs/GOLF-PLAY.md P2) at the street tier: each in the air raised by its height (1 m = HH * ze px, half a tile's screen
   *  height) over a soft shadow on the ground, or at rest; a white ball with a dark rim. T251: bouncing and rolling after its landing (the same
   *  drawing, its height a bounce's), a splash in water (rings and drops on the water, the ball gone) and a puff of sand round a ball plugged in a
   *  bunker, drawn here as particles (not in the water's shader). Culled to the view */
  private drawBalls(ctx: CanvasRenderingContext2D) {
    const pl = this.play, dv = this.dayOff ? undefined : this.dayPlay?.view; if ((!pl && !dv) || this.cam.z < DISTRICT_Z) return;
    const dpr = this.dpr, ze = this.cam.z * dpr, r = Math.max(1.5, 0.06 * HH * 2 * ze);
    // (T208: the everyday golfers' balls too, from the playback of the groups on screen)
    if (pl) this.drawBallList(ctx, pl.pv.balls, r, ze, dpr);
    if (dv) this.drawBallList(ctx, dv.balls, r, ze, dpr);
  }
  /** the balls of one playback (drawBalls), r their radius (px) */
  private drawBallList(ctx: CanvasRenderingContext2D, B: readonly PlayBall[], r: number, ze: number, dpr: number) {
    const cw = this.cw, ch = this.ch, m = 7 * r; // (the margin: a splash's rings)
    ctx.lineWidth = dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)';
    for (let i = 0; i < B.length; i++) {
      const b = B[i]!, c = this.screen(b.x, b.y);
      if (c.x < -m || c.y < -m || c.x > cw + m || c.y > ch + m) continue;
      if (b.fx === FX_SPLASH) { ballSplash(ctx, c.x, c.y, r, b.fu ?? 0, HH * ze, dpr); ctx.lineWidth = dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; continue; }
      if (b.h > 0) { ctx.fillStyle = 'rgba(2,6,23,0.35)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 1.5 * r, 0.7 * r, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(c.x, c.y - b.h * HH * ze, r, 0, Math.PI * 2); ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.stroke();
      if (b.fx === FX_SAND) ballPuff(ctx, c.x, c.y, r, b.fu ?? 0, HH * ze);
    }
  }
  /** the bus tool's preview at the cursor: once the first stop is picked, a line from it to the plan (white dashed) and the plan's stop; the label: the reason,
   *  the lot stop's car park, or the doors stop's cost (red when short of the money) */
  private drawBusPreview(ctx: CanvasRenderingContext2D) {
    const h = this.busHover; if (!h) return;
    const dpr = this.dpr, P = this.busPick;
    if (P) {
      const a = this.screen(P.x, P.y), b = this.screen(h.x, h.y);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); ctx.setLineDash([]);
      busStop(ctx, a.x, a.y, dpr);
    }
    drawGhostRing(this.ghostView(ctx), h.x, h.y, 1.5, 0, h.why ? 'invalid' : 'valid');
    if (!h.why) { const b = this.screen(h.x, h.y); busStop(ctx, b.x, b.y, dpr); }
    const cost = this.busDefs.length ? BUS_ROUTE_COST : 0, g = busGhostLabel(h.why, !!P, cost, this.money, h.town !== undefined, h.park);
    drawGhostHint(this.ghostView(ctx), h.mx, h.my, g.label, g.bad);
  }

  // ---------- economy / save ----------
  /** the treasury, $ (the city's books, mirrored from the city worker; spend moves it at once); Infinity with unlimited money (the dev sandbox) */
  get money(): number { return this.traffic.unlimited ? Infinity : this.traffic.budget.money; }
  /** the dev sandbox's growth speed (1 = the game's), whether the towns are stamped at a new valley, and unlimited money (the top bar's badge) */
  get growth(): number { return this.sandboxGrow; }
  get stamped(): boolean { return this.stampOn; }
  /** the dev sandbox's unlock-all (see sandboxUnlock) */
  get unlockAll(): boolean { return this.sandboxUnlock; }
  get unlimited(): boolean { return this.traffic.unlimited; }
  /** the game day (from the city's books) */
  get day(): number { return this.traffic.day; }
  /** the last closed day's ledger, or null before the first day closes */
  get ledger(): Ledger | null { const h = this.traffic.budget.history; return h[h.length - 1] ?? null; }
  /** true once the city went too long in the red (the books stay so) */
  get bankrupt() { return this.traffic.budget.bankrupt; }
  /** the index of the highest career milestone reached (see career.ts; the city worker's, mirrored) */
  get reached() { return this.traffic.career.reached; }
  /** true once the career is won (WIN_POP residents; it stays so) */
  get won() { return this.traffic.career.won; }
  /** event mode: the valley has town centres (the stadium is then the player's to place: see site), and the event's rules replace the Career's unlocks (see classOpen, junctionOpen, tunnelsOpen) */
  get eventMode(): boolean { return this.townPts.length > 0; }
  /** the golf game's state (golf/mode.ts; null: a legacy classic game, which loads and plays as before) */
  golf: GolfSave | null = null;
  /** the course's subtle height field (T027; saved in golf.height) */
  courseHeight: CourseHeightField = createCourseHeightField();
  /** T251: the course height (metres) at a tile point, the field as it is now (0 on a field never edited): the balls' rolls bend with it, putts break on it */
  private ballHeight: HeightAt = (x, y) => { const f = this.courseHeight; return f.rev ? sampleCourseGrid(f.data, x, y) : 0; };
  /** T251 (dev, the bench's A/B): the balls bounce and roll after landing (on), or fly to where they end and lie there as before (off) */
  setBallRoll(on: boolean) { ballRoll.on = on; }
  /** the course height as save chunks, cached by field and rev (see courseHeightChunks) */
  private chSave: { field: CourseHeightField; rev: number; chunks: CourseHeightSaveChunk[] } | null = null;
  /** golf mode: a new game is a golf game (one town, the old nine, the season); the stadium and the Business tool are off */
  get golfMode(): boolean { return this.golf !== null; }
  landMode = false;
  /** T200 (#524): Land for sale: the blocks for sale next to your land, the one under the pointer and the card's (golf/land-sale.ts) */
  readonly land: LandSale = new LandSale({
    parcels: () => (this.golf ? this.golf.parcels ?? [this.golf.parcel] : []), map: MAP,
    classOf: r => this.blockLandClass(r), onRoad: r => this.blockOnPublicRoad(r), pop: () => this.traffic.pop,
    version: () => { let n = 0; for (const l of this.traffic.lots.values()) if (l.level >= 1) n++; return `${this.net.version}|${n}`; },
    special: () => { const q = this.golf?.practiceLot; return q ? [{ rect: q, name: PRACTICE_LOT_NAME }] : []; }, // T239
  });
  toggleLandMode() { this.toggleSideMode('landMode'); }
  /** T200: opens Land for sale (Course › Land for sale, the top bar's Land chip, a refusal's button), centred on tile point at when given */
  openLandSale(at?: Pt | null) {
    if (!this.golf) return;
    if (!this.landMode) this.toggleSideMode('landMode');
    this.land.cancel();
    if (at) { this.camEase = null; this.cam.X = at.x; this.cam.Y = at.y; this.clampCam(); }
    this.emit();
  }
  /** T200: closes Land for sale (its card and the overlay) */
  closeLandSale() { if (this.landMode) this.toggleSideMode('landMode'); this.land.cancel(); this.emit(); }
  /** T200: Buy on the card: exactly the card's block at the card's price (land-sale.ts LandSale.buy checks it is still that), else why not */
  buyLandCard(): boolean {
    const r = this.land.buy(this.money);
    if (!r.ok) { this.toast(r.why, 'warn'); this.emit(); return false; }
    const ok = this.land.card?.name ? this.buyPracticeLot(r.price) : this.buyLandBlock(r.rect, r.price);
    if (ok) this.land.cancel();
    this.emit();
    return ok;
  }
  /** T200: where a course brush is refused for "not your land" (the tile under the pointer), for the refusal's Land for sale button; null else */
  landRefusalAt(): Pt | null {
    if (!this.golf || this.tool !== 'course' || this.landMode) return null;
    const now = performance.now();
    if (this.hover && this.courseCursor.state.kind === 'refused' && /not your land/i.test(this.courseCursor.hint)) this.landRefused = { at: { x: Math.round(this.hover.x), y: Math.round(this.hover.y) }, t: now };
    return this.landRefused && now - this.landRefused.t < LAND_REFUSAL_MS ? this.landRefused.at : null;
  }
  /** the last "not your land" refusal of a course brush: where and when (landRefusalAt) */
  private landRefused: { at: Pt; t: number } | null = null;
  /** T200: the trees standing on a block (its card: cleared as you build there) */
  treesOn(r: [number, number, number, number]): number {
    const [x0, y0, x1, y1] = [r[0], r[1], r[0] + r[2], r[1] + r[3]], N = MAP / FOREST_CELL, at = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;
    let n = 0;
    // the planted forest and town trees (by forest cell), then the placed tree props
    for (const map of [this.forest, this.townTrees]) for (const [k, ps] of map) {
      const ci = k % N, cj = Math.floor(k / N);
      if (!boxNear([x0, y0, x1, y1], ci * FOREST_CELL, cj * FOREST_CELL, (ci + 1) * FOREST_CELL, (cj + 1) * FOREST_CELL, 0)) continue;
      for (const p of ps) if (at(p.x, p.y)) n++;
    }
    for (const p of this.propGrid.query([x0, y0, x1, y1])) if (LIBRARY[p.item]?.kind === 'tree' && at((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2)) n++;
    return n;
  }
  /** the Grass panel's button: opens the panel (in Select) or closes it */
  toggleGrassPanel() { if (this.golfMode) { this.setTool(this.tool === 'greenkeeping' ? 'select' : 'greenkeeping'); return; } this.toggleSideMode('grassPanel'); } // T175: Greenkeeping in golf games
  /** opens side mode k (the Grass panel, Land, Holes, Event) and closes the others, or closes k: opening one switches to Select and picking a
   *  build tool closes them (setTool), so a side mode never takes a build tool's click (P23 P1-A, tool-modes.ts). Land, Holes and Event are golf only */
  toggleSideMode(k: SideMode) {
  if (k !== 'grassPanel' && !this.golfMode) return;
  const on = switchSideMode(this, k); this.tidySideModes();
  if (on) this.setTool('select'); else this.emit();
  }
  /** what a closed side mode leaves behind: the land block under the pointer, the picked pin or tee, the structure in hand, the armed grass care */
  private tidySideModes() {
  if (!this.landMode) { this.land.hover = null; this.land.cancel(); }
  if (!this.holesTool && !this.markerDrag) this.selectedGolfMarker = null;
  if (!this.eventTool) this.eventStructurePending = null;
  if (!this.grassPanel) this.grassAction = null;
  }
  private blockLandClass(r: [number, number, number, number]): { landClass: ParcelLandClass; houses: number; buildings: number } {
  const [bx, by, bw, bh] = r;
  if (blockOnWater(r, (x, y) => x >= 0 && x < MAP && y >= 0 && y < MAP && this.terrain.cls[y * MAP + x] === TC.WATER)) return { landClass: 'unbuildable', houses: 0, buildings: 0 };
  let houses = 0, buildings = 0, com = false, ind = false;
  for (const l of this.traffic.lots.values()) {
  if (l.level >= 1 && l.o[0] >= bx && l.o[0] < bx + bw && l.o[1] >= by && l.o[1] < by + bh) {
  if (l.use === 1) houses++;
  else if (l.use === 2) { buildings++; com = true; }
  else if (l.use === 3) { buildings++; ind = true; }
  else if (l.use > 1) buildings++;
  }
  }
  if (com) return { landClass: 'commercial', houses, buildings };
  if (ind) return { landClass: 'industrial', houses, buildings };
  if (houses > 0 || buildings > 0) return { landClass: 'town', houses, buildings };
  for (const f of this.farmMap.farms.values()) {
  if (f.p.o.x >= bx && f.p.o.x < bx + bw && f.p.o.y >= by && f.p.o.y < by + bh) return { landClass: 'farm', houses: 0, buildings: 0 };
  }
  return { landClass: 'open', houses: 0, buildings: 0 };
  }
  /** whether block r would take a public road's tiles (any road but the course's own drives and cart paths; a tunnel runs under the land) */
  private blockOnPublicRoad(r: [number, number, number, number]): boolean {
    const roads: LandRoad[] = [];
    for (const s of this.net.segsNear({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 }, Math.hypot(r[2], r[3]) / 2 + 12)) {
      if (s.kind !== SK.TUNNEL && !isCourseClass(s.cls.id)) roads.push({ ax: s.a.x, ay: s.a.y, bx: s.b.x, by: s.b.y, hw: s.cls.h + s.cls.walk });
    }
    return blockOnRoad(r, roads);
  }
  /** buys block r (T200: at price when given: refused if the price has moved since); true when bought */
  buyLandBlock(r: [number, number, number, number], price?: number): boolean {
  if (!this.golf) return false;
  if (this.blockOnPublicRoad(r)) { this.toast('A public road runs here: it stays public', 'warn'); return false; }
  const parcels = this.golf.parcels ?? [this.golf.parcel];
  const info = this.blockLandClass(r);
  const res = buyAdjacentBlock(parcels, { rect: r, ...info, townPop: this.traffic.pop }, this.money);
  if (!res.ok) {
  this.toast(res.reason ?? 'Cannot buy this block', 'warn');
  return false;
  }
  if (price !== undefined && res.price !== price) { this.toast(`The price changed: now $${res.price.toLocaleString()}`, 'warn'); return false; }
  this.golf.parcels = res.parcels;
  this.golf.parcel = res.bounds;
  this.fitCourseGrid(); // the course grid holds the new land
  this.sendGolf(); // the town keeps off the new land too
  this.traffic.spend('construction', res.price);
  this.scheduleSave();
  this.toast(`Bought ${info.landClass} land: $${res.price.toLocaleString()}`);
  this.land.hover = null;
  this.emit();
  return true;
  }
  /** T239: buys a guided range start's practice area at price: it becomes the player's (pegged out by its survey line until built on) and
   *  Facilities › Practice builds on it */
  buyPracticeLot(price: number): boolean {
    const g = this.golf, q = g?.practiceLot; if (!g || !q) return false;
    if (price > this.money) { this.toast(`Not enough money: the practice area costs $${price.toLocaleString()}`, 'warn'); return false; }
    delete g.practiceLot; g.parcels = [...(g.parcels ?? [g.parcel]), [...q] as [number, number, number, number]];
    this.traffic.spend('construction', price); this.surveySig = '';
    this.scheduleSave(); this.toast(`Bought the practice area: $${price.toLocaleString()}. Facilities › Practice builds on it`, 'good');
    this.land.hover = null; this.emit();
    return true;
  }
  /** the golf HUD's view (null outside golf mode) */
  lastGolfMonth = -1;
  /** the game month as an absolute count (seasons so far x 12 + months since September), for planting and grow-in; on tournament day the clock sits on the next season's first instant, so it is read a unit earlier */
  golfMonthIndex(): number {
    const r = this.traffic.round, c = this.traffic.clockTime(performance.now()) - (r.stage !== 'free' ? 1 : 0);
    return this.seasonsDone() * 12 + ((seasonMonth(c) - SEASON_START + 12) % 12);
  }
  /** T233: the golf month with how far into it the clock is (golfMonthIndex plus a fraction: 12.5 is the middle of the second season's September) */
  private golfMonthAt(now: number): number {
    const r = this.traffic.round, c = this.traffic.clockTime(now) - (r.stage !== 'free' ? 1 : 0), d = ((c % SEASON_LEN) + SEASON_LEN) % SEASON_LEN;
    return this.seasonsDone() * 12 + Math.min(12 - 1e-9, d / MONTH_LEN);
  }
  /** T233 (#674, the concept's top bar): the stat chips' figures (null outside golf mode): the treasury and its change a month over the last
   *  months (golf/topstats.ts MonthMoney, noted each frame), the reputation, T208's everyday golfers a month (today's tee sheet: the Club card's) and the
   *  course's quality for its rating (Course stats', every RATING_MS at most; null with no holes) */
  topStats(now = performance.now()): TopStats | null {
    const g = this.golf; if (!g) return null;
    if (now - this.ratingAt > RATING_MS) { this.ratingAt = now; const s = this.courseStatsView(); this.ratingOf = { quality: s && s.totals.holes > 0 ? s.qualityScore : null, holes: s?.totals.holes ?? 0 }; }
    // the money's change a month: averaged over about a town day of months (a 10-minute town day: five), as it comes in with the day's tee times
    const money = this.money, ch = this.monthMoney.change(money, Math.ceil(this.traffic.dayLen / MONTH_LEN)), r = this.hasClubhouse ? this.dayBook?.rosterOf() : null;
    return {
      money, monthChange: Number.isFinite(money) ? ch.value : null, monthSpan: ch.span, month: ch.month,
      rep: g.rep, golfers: r ? golfersAMonth(r.members + r.visitors) : 0, quality: this.ratingOf.quality, holes: this.ratingOf.holes,
    };
  }
  /** counts a player action toward the tool unlocks (golf mode only; saved) */
  private bump(k: 'pieces' | 'roads' | 'parks' | 'structures') { const p = this.golf?.progress; if (!p) return; p[k]++; this.scheduleSave(); this.emit(); }
  /** the player's progress facts (T032; T117: the unlocks read the course: its holes with a par, the seasons played and the tour's invitation),
   *  null outside golf mode */
  playerProgressFacts(): PlayerProgressFacts | null {
    const g = this.golf, p = g?.progress, b = g?.start === 'range' ? g.range : undefined;
    // a range start's ramp (P24 Phase 4a, T132): the upgrades bought, the season's takings, and a prop placed near the range
    const range = b ? { upgrades: b.owned.length, seasonTakings: b.season.takings, propsPlaced: this.decor.appeal() > 0 } : undefined;
    const f = p ? progressFacts(p, { holes: this.courseHoleViews().filter(h => h.par > 0).length, seasons: this.seasonsDone(), invited: !!g!.invited, range }) : null;
    const pr = f && this.range.practiceFacts(); if (f && pr) f.practice = pr; // a range start's practice facilities (T130): their hints and brushes
    if (f && this.practiceForSale()) f.practiceForSale = true; // T239: its hint says buy it first
    if (f && b) { // a range start's town jam (T178): zones with built lots over the decline line (the access overlay's red)
      const T = this.traffic; let jam = 0; for (let z = 0; z < 256; z++) if (T.builtZone[z] && T.access[z]! > 1.8) jam++;
      f.townJammed = jam >= JAM_ZONES;
    }
    if (f) { // Greenkeeping opens with the first hole grown in (T175)
      const grow = this.holesGrowing(), par = this.courseHoleViews().filter(h => h.par > 0);
      f.grownHoles = par.filter(h => !grow.has(h.n)).length;
      const soon = par.filter(h => grow.has(h.n)).sort((a, b) => grow.get(a.n)! - grow.get(b.n)!)[0];
      if (soon) f.firstReady = `hole ${soon.n} ready ${monthIndexLabel(grow.get(soon.n)!)}`;
    }
    return f;
  }
  private progTick = 0;
  /** keeps the saved progress in step (T117, about 6 times a second): the unlock stage reached (it never falls) and the tool in hand counted as
   *  opened (its NEW badge goes) */
  private progressCheck() {
    const p = this.golf?.progress; if (!p || ++this.progTick % 10) return;
    this.rangeGuideCheck(); // T239: the guided build's steps tick
    this.sceneNewsCheck(); // T242: a range view's picture turned: a toast offers its card (about once a second)
    const f = this.playerProgressFacts(), was = p.ramp;
    if (f && advanceProgress(p, f, this.uiTool)) { this.scheduleSave(); this.emit(); }
    // a ramp step opens (T132); not when its tools were open already, nor New hole's once a hole exists (T095)
    const rt = rampToast(was, p.ramp, { open: this.unlockAll || p.advanced, holes: f?.playableHoles ?? 0 }); if (rt) this.toast(rt, 'good');
    this.range.hint = !!f && !!nextFirstRunHint(f)?.id.startsWith('hint-practice'); // the practice area's outline brightens while its hint is up
    this.range.practiceLocked = !!f && rampLock(f, 'course') !== null; // until the first upgrade the practice area says what opens it
    this.range.practiceSale = this.golf?.practiceLot ? this.land.offers().find(o => o.name === PRACTICE_LOT_NAME)?.price ?? null : null; // T239: its price
    this.playableHoles = f?.playableHoles ?? 0;
    // the tee ring (P22 2.8): a range start's New hole in hand before its first hole
    this.teeRingOn = this.golf?.start === 'range' && this.uiTool === 'course' && this.paint.planOpen && this.playableHoles < 1;
    // a tool that is not open (a save loads with the road tool in hand; Show every tool now unticked) is put down for Holes (P23 P1-E), or for
    // Select while Holes waits for a range start's first upgrade (T132)
    if (this.toolLock(this.uiTool)) this.setTool(this.toolLock('course') ? 'select' : 'course');
  }
  /** a hint's Show me (T130, T132): the camera on the spot it means and its tool in hand */
  showHint(id: string) {
    // T188: the anchor the hint means pulses (a ring on the control), after its tool is in hand (below)
    const st = guideTable({ start: 'range' }).find(x => x.id === id), anchor = st?.target.ui ?? HINT_ANCHOR[id];
    if (anchor) queueMicrotask(() => this.pulseAnchor(anchor));
    const sc = this.range.scene;
    if (id.startsWith('guide-range-')) { this.guideShowMe(id); return; } // T239: the guided build's Show me
    if (id.startsWith('hint-practice')) { if (this.practiceForSale()) this.showPracticeSale(); else this.showPracticeArea(); return; } // T239: for sale: Land for sale on it
    if ((id === 'hint-range-open' || id === 'hint-range-upgrade') && sc) { this.lookAt(sc.counter.x, sc.counter.y, RANGE_CAM_ZOOM); this.setTool('select'); this.openRangeCard(true); return; }
    if (id === 'hint-range-props' && sc) { this.lookAt(sc.counter.x, sc.counter.y, 0.3); this.setTool('props'); return; }
    if (id === 'hint-range-first-hole') {
      // the land beyond the range's plot and practice area: the middle of your land's box, at a zoom that shows a par-3
      const L = this.golf ? this.golfLand() : [];
      if (L.length) { const x0 = Math.min(...L.map(r => r[0])), y0 = Math.min(...L.map(r => r[1])), x1 = Math.max(...L.map(r => r[0] + r[2])), y1 = Math.max(...L.map(r => r[1] + r[3])); this.lookAt((x0 + x1) / 2, (y0 + y1) / 2, 0.12); }
      this.setTool('course'); this.paint.setPlan(); this.emit();
    }
  }
  /** why tool t is not open yet under the unlocks (the rail shows it dimmed in place, P23 4.2), or null when it is open */
  toolLock(t: Tool): string | null { return this.toolUi()?.lockedTools.find(x => x.id === t)?.why ?? null; }
  /** a locked tool's key or pick (P23 4.10): it says what unlocks the tool and does nothing; true when t is locked */
  private refuseLocked(t: Tool): boolean {
    const why = this.toolLock(t); if (!why) return false;
    this.toast(`${TOOL_NAME[t] ?? 'This tool'}: ${why}`); return true;
  }
  /** why a course path or drive is held back by the unlock stage (T117: the cement slab path until the first hole), or null when it is not */
  courseStageLock(id: ClassId): string | null { return this.toolUi()?.lockedCourseClasses.find(c => c.id === id)?.why ?? null; }
  /** the progressive tool visibility (T032/T033), null outside golf mode (classic and sandbox show everything) */
  progressiveUi(): ProgressiveUiState | null { const f = this.playerProgressFacts(); return f ? computeProgressiveUiState(f) : null; }
  /** the tool visibility in force (T033): null shows everything (classic games, and the dev sandbox's unlock-all) */
  toolUi(): ProgressiveUiState | null { return this.unlockAll ? null : this.progressiveUi(); }
  /** hides a first-run hint for good (saved) */
  dismissHint(id: string) { const p = this.golf?.progress; if (!p || p.dismissed.includes(id)) return; p.dismissed.push(id); this.scheduleSave(); this.emit(); }
  /** Settings > "Show every tool now" (saved) */
  setAdvancedTools(on: boolean) { const p = this.golf?.progress; if (!p || p.advanced === on) return; p.advanced = on; this.scheduleSave(); this.emit(); }
  golfView(): GolfView | null {
  if (!this.golf) return null;
  const c = this.traffic.clockTime(performance.now()), r = this.traffic.round, tier = this.golf.tier;
  const curM = this.golfMonthIndex();
  if (curM !== this.lastGolfMonth) {
  this.lastGolfMonth = curM;
  const effM = effectiveGrowInClockMonth(curM, this.golf.cards ?? this.traffic.round.cards);
  for (const a of this.paint.areas) if (a.plantKind === 'seed' && a.plantedMonth !== undefined) this.paint.send(a, effM); // only areas still growing in change with the month
  this.courseMonth(); // and the course grid's chunks whose seeded cells reached their next quarter
  }
  return { tier, tierName: tierInfo(tier).name, month: seasonLabel(r.stage !== 'free' ? c - 1 : c, this.seasonsDone()), monthsLeft: monthsLeft(c), year: yearOf(this.seasonsDone()), live: r.stage !== 'free' };
  }
  /** course stats panel view data (null outside golf mode), derived from painted areas and hole objects */
  courseStatsView(): CourseStatsPanel | null {
  if (!this.golf) return null;
  const curM = this.golfMonthIndex();
  const areas: CourseArea[] = this.courseAreaList();
  const layout: CourseLayout = {
  areas,
  tees: this.golf.tees,
  pins: this.golf.pins,
  aims: this.golf.aims,
  clubhouse: this.golf.clubhouse,
  };
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  const have = new Set<Need>(structuresNeeds(this.golf.structures ?? [], holes));
  if (this.parkDefs.length > 0) have.add('carpark');
  if (this.golf.start === 'range' && this.bizDefs.some(d => d.type === 'range')) have.add('range'); // a range start's driving range meets tier 3's range
  for (const n of parkRideNeeds(this.golf.clubhouse, this.parkDefs, this.busDefs)) have.add(n);
  const gCards = this.golf.cards ?? this.traffic.round.cards;
  for (const n of parkRideNeedsWithCards(this.golf.clubhouse, this.parkDefs, this.busDefs, gCards)) have.add(n);
  const panel = buildCourseStatsPanel(layout, this.golf.tier, have, effectiveGrowInClockMonth(curM, gCards), { field: this.courseHeight, areas: this.courseAreaList() });
  return { ...panel, qualityScore: applyCourseConsultantQuality(panel.qualityScore, gCards) };
  }
  /** evaluates tournament day outcome and tour progression (null outside golf mode or without a finished round) */
  golfYearEnd(last = this.traffic.round.last): YearEndResult | null {
  if (!this.golf || !last) return null;
  const { holes, facts, baseQ, gCards } = this.golfFacts(this.golf);
  const parked = countParkedCars(this.traffic.parks, this.traffic.round.surge, last.byTown);
  const ye = computeYearEnd(this.golf.tier, this.golf.rep, last, facts, this.golf.poorYears ?? 0, this.golf.structures ?? [], holes, this.seed, baseQ, gCards, parked, this.parking.fee);
  // T208 everyday golf: the green fees are what the season's golfers paid (booked as they checked in; the close book does not book them again), and how
  // the course played (the pace term, golf/everyday.ts seasonPaceRep) moves the reputation
  const se = this.dayBook?.season();
  if (se) { ye.greenFeesPlayed = Math.round(se.fees); ye.paceRep = seasonPaceRep(se); ye.rep = Math.min(100, Math.max(0, ye.rep + ye.paceRep)); }
  // T269: the season's unmoved pins (golf/staff.ts pinReputation) move it too
  const st = this.golf.crew?.staff; if (st) { ye.pinRep = pinReputation(st.season); ye.rep = Math.min(100, Math.max(0, ye.rep + ye.pinRep)); }
  return ye;
  }
  /** the course's facts for the year end and everyday golf (T208): the derived holes, the course facts (holes, length, what the club has), the quality
   *  score before the cards, and the cards in play */
  private golfFacts(g: GolfSave): { holes: Hole[]; facts: CourseFacts; baseQ: number; gCards: readonly string[] } {
  const stats = this.courseStatsView();
  const holes = stats ? deriveHoles(this.courseAreaList(), g.tees, g.pins, g.aims) : [];
  const have = new Set<Need>(structuresNeeds(g.structures ?? [], holes));
  if (this.parkDefs.length > 0) have.add('carpark');
  if (g.start === 'range' && this.bizDefs.some(d => d.type === 'range')) have.add('range'); // a range start's driving range meets tier 3's range
  for (const n of parkRideNeeds(g.clubhouse, this.parkDefs, this.busDefs)) have.add(n);
  const facts: CourseFacts = { holes: stats?.totals.holes ?? 0, lengthM: stats?.totals.lengthM ?? 0, have };
  const gCards = g.cards ?? this.traffic.round.cards;
  for (const n of parkRideNeedsWithCards(g.clubhouse, this.parkDefs, this.busDefs, gCards)) have.add(n);
  const baseQ = stats ? buildCourseStatsPanel({ areas: this.courseAreaList(), tees: g.tees, pins: g.pins, aims: g.aims, clubhouse: g.clubhouse }, g.tier, have, effectiveGrowInClockMonth(this.golfMonthIndex(), gCards), { field: this.courseHeight, areas: this.courseAreaList() }).qualityScore : 85;
  // T269: the course's condition (the grounds crew keeping up, golf/staff.ts) takes up to a quarter off the quality score
  return { holes, facts, baseQ: baseQ * this.crewQuality(), gCards };
  }
  /** T208: what the club is now, for a town day's everyday golf (golf/everyday.ts DayInputs): the quality score as the year end takes it (the course
   *  consultant's card included), the reputation and the holes (as yearend.ts computeYearEnd: no stats, no holes) */
  private dayInputs(): DayInputs {
    const g = this.golf; if (!g) return { quality: 0, rep: 0, holes: 0 };
    const { facts, baseQ, gCards } = this.golfFacts(g);
    const inp: DayInputs = { quality: applyCourseConsultantQuality(baseQ, gCards), rep: g.rep, holes: facts.holes };
    if (this.dayBusy !== undefined) inp.busy = this.dayBusy;
    return inp;
  }
  /** fast-forwards the season to the tournament (the end of the game day, one sim second past it); golf mode only, not while the clock is frozen */
  skipToTournament() {
  if (this.shot) { this.toast(SHOT_HOLD, 'warn'); return; }
  if (!this.golf || this.traffic.skipping) return;
  if (this.traffic.stats.frozen) { this.toast('The clock is frozen during an event'); return; }
    const now = performance.now(), c = this.traffic.clockTime(now), target = Math.floor(c / GAME_DAY) * GAME_DAY + GAME_DAY;
    const until = this.traffic.simTime(now) + (target - c) + 1; // one sim second past the target, so the worker's step crosses it
    if (!this.speed) this.setSpeed(this.lastSpeed);
    this.traffic.skip(until);
    // a range start's founding season ends with no tournament (golf/tour.ts tournamentDue): the skip stops at the season's end
    if (this.golf.start === 'range' && !tournamentDue(this.golf.invited?.at, target)) { this.toast('Skipping to the end of the season… (no tournament yet)'); return; }
    // the tournament day plays at 8x (about 3 real minutes): its town clock runs at 1 game minute per sim s from 05:00 (see City.startTournament)
    this.setSpeed(8);
    this.toast('Skipping to the tournament… (8× for the day)');
  }
  /** a road class is open to build: every class in event mode, else as the Career unlocks it. A course path or drive (P19) is open only in a golf
   *  game, at its tier (golf.tier: courseRoadOpen) and its unlock stage (T117: courseStageLock); the dev sandbox's unlock-all (sandboxUnlock: the
   *  dev server, or ?unlock=1) opens every tier (T084) */
  classOpen(id: ClassId): boolean {
    if (isCourseClass(id)) return courseRoadOpen(id, this.golf ? this.golf.tier : null, this.sandboxUnlock) && !this.courseStageLock(id);
    return this.sandboxUnlock || this.eventMode || classUnlocked(id, this.reached);
  }
  /** the road tool's scope (T084): entering the other scope swaps the picked class for the one last picked there (a town class under Roads, a
   *  course path or drive under the Course menu's Paths & drives) */
  private setRoadScope(scope: 'town' | 'course') {
    const course = scope === 'course';
    this.roadScope = scope;
    if (isCourseClass(this.roadClass) !== course) { this.scopeClass[course ? 'town' : 'course'] = this.roadClass; this.roadClass = this.scopeClass[scope]; }
  }
  /** why a road class is not open (classOpen is false): a course path's unlock stage (T117), a course drive's tour level (P19; outside golf it is
   *  only on golf courses), else the career milestone that unlocks it; a town class no milestone lists gets a plain note */
  classLockWhy(id: ClassId): string {
    const c = classOf(id), tier = courseTierNeeded(id), stage = this.courseStageLock(id);
    if (stage) return `${c.name}: ${stage.toLowerCase()}`;
    if (tier !== null) return this.golf ? `${c.name} opens at Tour level ${tier}` : `${c.name} is only on golf courses`;
    const lk = unlockOf('class', id);
    return lk ? `${c.name} unlocks at ${lk.pop.toLocaleString()} residents (${lk.name})` : `${c.name} is not open yet`;
  }
  /** a junction type is open: in event mode all but the roundabout, which the Roundabout card opens; else as the Career unlocks it */
  junctionOpen(t: NodeType): boolean { if (this.golf?.cards?.includes('roundabout') && t === 'roundabout') return true; return this.sandboxUnlock ? true : this.eventMode ? t !== 'roundabout' || this.traffic.round.cards.includes('roundabout') : junctionUnlocked(t, this.reached); }
  /** the highest speed-limit tier open: the year's (see speedTierOpen), all of them with the dev sandbox's unlock-all */
  speedTierMax(): 0 | 1 | 2 | 3 { return this.sandboxUnlock ? 3 : speedTierOpen(this.traffic.round.year); }
  /** every road's speed limit raised by the tier's km/h (0 the roads' own limits): free, once its year has come; the lanes rebuild at the new limits */
  setSpeedTier(t: 0 | 1 | 2 | 3) {
    if (t > this.speedTierMax()) { this.toast(`+${SPEED_BONUS_KMH[t]} km/h speed limits from ${SPEED_TIER_YEAR[t]}`, 'warn'); return; }
    if (t === this.net.speedTier) return;
    this.edit.setSpeedTier(t); this.commitNetwork();
    this.toast(t ? `Speed limits +${SPEED_BONUS_KMH[t]} km/h on every road (up to 140)` : "Speed limits back to each road's own", 'good');
  }
  /** the best signal tier open: the year's (see signalTierOpen), every tier with the dev sandbox's unlock-all */
  signalTier(): 0 | 1 | 2 { return this.sandboxUnlock ? 2 : signalTierOpen(this.traffic.round.year); }
  /** tunnels are open: always in event mode, else as the Career unlocks them */
  tunnelsOpen(): boolean { return this.sandboxUnlock || this.eventMode || tunnelsUnlocked(this.reached); }
  /** takes a card of the eval's draft (the worker refuses what is not on it); its effects follow with the next frame (see applyCards) */
  pickCard(id: CardId) { if (this.golf && isGolfCardId(id) && this.traffic.round.stage === 'eval' && this.traffic.round.draft?.includes(id)) { this.golf.cards = [...(this.golf.cards ?? []), id]; this.scheduleSave(); } this.traffic.pickCard(id); this.emit(); }
  /** the new toll gates' booths, the new bus routes' buses and the seats of a bus, as the cards given set them (see applyCards; on load, the cards applied) */
  private setCardFields(cards: CardId[]) {
    this.tollBooths = START_BOOTHS + 2 * cards.filter(c => c === 'booths').length;
    this.busFleet = START_BUSES + 4 * cards.filter(c => c === 'buses').length;
    this.busSeats = cards.includes('doubledecker') ? DECK_SEATS : BUS_SEATS;
  }
  /** the round's cards not applied yet, in order: a toast each, and the effects on the toll gates and bus routes (booths, buses, double-decker seats);
   *  express and the double-decker seats of the routes are the worker's (City.applyCards); the roundabout's is its gate (see junctionOpen) */
  private applyCards() {
    const cards = this.traffic.round.cards;
    for (let i = this.cardsApplied; i < cards.length; i++) {
      const id = cards[i]!;
      if (id === 'booths') { this.tollBooths += 2; for (const d of this.tollDefs) { d.booths += 2; const b = tollBox(d); this.dropTownTrees(b[0]!, b[1]!, b[2]!, b[3]!); } this.syncTolls(true); }
      else if (id === 'buses') { this.busFleet += 4; for (const d of this.busDefs) d.buses += 4; this.traffic.setBusRoutes(this.busDefs); }
      else if (id === 'doubledecker') { this.busSeats = DECK_SEATS; for (const d of this.busDefs) d.seats = Math.max(d.seats, DECK_SEATS); this.traffic.setBusRoutes(this.busDefs); }
      if (this.golf) this.golf.cards = cards.filter(isGolfCardId);
      const cardName = findGolfCard(id)?.name ?? CARDS.find(c => c.id === id)?.name ?? id;
      this.toast(`Card: ${cardName}`, 'good');
    }
    this.cardsApplied = cards.length; this.scheduleSave(); this.emit();
  }
  /** takes a loan unit if the town can hold one more (else says why); the worker books it */
  borrow() { const b = Budget.from(this.traffic.budget); if (b.loans >= b.maxLoans(this.traffic.pop)) this.toast('No more credit: grow the town for more', 'warn'); else this.traffic.loan(true); }
  /** repays a loan unit if there is one and the treasury covers LOAN (else says why); the worker books it */
  repay() { const b = this.traffic.budget; if (!b.loans) this.toast('No loans to repay', 'warn'); else if (b.money < LOAN) this.toast('Not enough money to repay', 'warn'); else this.traffic.loan(false); }
  scheduleSave() { if (this.benchMode) return; clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.save(), 800); }
  benchMode = false;
  /** the lots still to compose (queued, or staged part-way): the bench's grown-town scene waits for them before its tour (T098) */
  get lotsPending() { return this.lotQueue.size + this.staged.size; }
  async save() {
    if (this.benchMode) return 0; if (this.saveBlocked) return 0;
    // the tournament day under way (T209): the worker's snapshot of it, asked for first (only while a golf round is in its surge or eval: every other save
    // is written at once, as before, without it)
    const rs = this.traffic.round.stage, tourney = this.golf && (rs === 'surge' || rs === 'eval') ? await this.traffic.daySave() : null;
    if (this.saveBlocked) return 0;
    const d: SaveV5 = {
      version: SAVE_VERSION, map: MAP, seed: this.seed, lotModel: lotModelVersion(),
      // T259: the farm model (an old save's farms rebuilt since on the new one: farmsNew)
      farmModel: this.farmModel, ...(this.farmModel === 1 && this.farmsNew.size ? { farmsNew: [...this.farmsNew] } : {}),
      segs: [...this.net.segs].map(segRec),
      nodes: [...this.net.nodes.values()].filter(n => n.type !== 'plain' || n.wide || n.tl).map(nodeEntry),
      props: [...this.props].filter(p => !p.auto).map(p => propTuple(LIBRARY[p.item].id, p)),
      money: this.traffic.budget.money, day: this.day, cam: { ...this.cam, ...(this.tileBand !== null ? { tb: this.tileBand } : {}) },
      lots: [...this.traffic.lots.values()].filter(l => l.level !== LV.EMPTY).map((l): LotTuple => [l.key, l.use, l.level, l.decline, l.seed, l.since]),
      simT: this.traffic.simTime(performance.now()), shift: this.traffic.stats.clock - this.traffic.stats.simT, townClock: this.traffic.town, budget: this.traffic.budget, career: this.traffic.career, round: this.traffic.round,
      parks: this.parkDefs.map((d): [number, number, number, number] => [d.x, d.y, d.w, d.h]),
      places: placeTuples(this.places),
      tolls: this.tollDefs.map((d): [number, number, number, number, number] => [d.ax, d.ay, d.bx, d.by, d.booths]),
      buses: this.busDefs.map((d): [number, number, number, number, number, number, number, number] => [d.park, +d.sx.toFixed(3), +d.sy.toFixed(3), +d.dx.toFixed(3), +d.dy.toFixed(3), d.buses, d.seats, d.town ?? -1]),
      cardsApplied: this.cardsApplied,
      biz: this.bizDefs.map((d): [BusinessId, number, number, number, number] => [d.type, d.x, d.y, d.w, d.h]),
      bizStats: this.bizDefs.map((d, k): BizStats => { const v = this.traffic.biz.find(q => q.id === d.id) ?? freshStats(d.id); return { id: k + 1, level: v.level, xp: v.xp, sat: v.sat, goodDays: v.goodDays, revenue: v.revenue, visitors: v.visitors, today: { ...v.today } }; }),
      paints: this.paint.save(),
      grass: this.grass.serialize(),
      rows: this.parking.rows.map((r): [number, number, number, number, number, number, string] => [r.ax, r.ay, r.bx, r.by, r.side, r.bay, r.col]),
      curbs: this.parking.curbs.map((c): [number, number, number, number] => [c.ax, c.ay, c.bx, c.by]),
      parkFee: this.parking.fee,
      speed: this.net.speedTier,
      golf: this.golf ? { ...this.golf, teeSets: 1 as const, height: this.courseHeightChunks(), grid: this.gridSave(), plans: this.golf.plans?.length ? this.golf.plans : undefined, play: this.golf.play && this.traffic.round.stage !== 'free' ? this.golf.play : undefined, everyday: this.dayBook?.save ?? this.golf.everyday } : undefined,
    };
    try { return await writeSave(withTourney(d, tourney)); } catch { return 0; }
  }
  /** the course height as save chunks (undefined when flat), recomputed only when the field changed */
  private courseHeightChunks(): CourseHeightSaveChunk[] | undefined {
    const f = this.courseHeight; if (!this.chSave || this.chSave.field !== f || this.chSave.rev !== f.rev) this.chSave = { field: f, rev: f.rev, chunks: saveCourseHeight(f) };
    return this.chSave.chunks.length ? this.chSave.chunks : undefined;
  }
  private load(d: SaveV5): boolean {
    try {
      // the town's house lots compose with the lot model it was made with (T160: a save from before has none: v1)
      setLotModel(d.lotModel ?? 1);
      // T259: its farms compose with the farm model it was made with (a save from before has none: model 1), those rebuilt since on the new one
      this.farmModel = d.farmModel === 2 ? 2 : 1; this.farmsNew = new Set(this.farmModel === 1 && Array.isArray(d.farmsNew) ? d.farmsNew.filter(k => typeof k === 'string') : []);
      this.bizOpenSeen = null;
      this.genTerrain(d.seed);
      // a golf game has one town (its centre, saved); a legacy save has none of these, and keeps the valley's three
      this.golf = normalizeGolfSave(d.golf); this.dayBook = null; this.dayPlay = null; this.clubCardOpen = false; // T208: everyday golf comes back from golf.everyday
      // a course grid that does not decode fails the load (the slot is backed up, T042), never an empty course saved over the real one
      const lg = this.golf ? loadCourseGrid(this.golf.grid) : 'migrate';
      if (lg === 'bad') { console.error('load failed: the course grid does not decode'); this.golf = null; return false; }
      this.courseHeight = loadCourseHeight(this.golf?.height); this.chSave = null;
      if (this.golf) this.golf.progress = normalizeProgress(this.golf.progress);
      if (this.golf) { if (this.golf.cards?.length && (!d.round || !d.round.cards?.length)) { if (d.round) d.round.cards = this.golf.cards.slice() as CardId[]; } else if (!this.golf.cards && d.round?.cards?.length) { this.golf.cards = d.round.cards.filter(isGolfCardId); } }
      if (this.golf?.town) { this.townPts = [this.golf.town]; this.roadNames = new RoadNames(this.names, this.townPts); }
      // a save with businesses has its list; an old one has its stadium as id 1 (or, with no stadium field either, the game's spot)
      // a type the catalogue does not have (a save from another branch) is dropped, so the rest of the save keeps working (T135)
      if (d.biz) this.setBizDefs(knownBusinesses(d.biz.map(([type, x, y, w, h], k): BizDef => ({ id: k + 1, type, x, y, w, h })), 'load'));
      else { const at = d.stadium !== undefined ? d.stadium : this.gameSpot(); this.setBizDefs(at ? [{ id: 1, type: 'stadium', x: at[0], y: at[1], w: at[2], h: at[3] }] : []); }
      for (const [ax, ay, bx, by, cls, style, kind, town] of d.segs) this.edit.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], classOf(cls), style as LineStyle, [(kind ?? 0) as SegKind], town ? true : undefined);
      if (d.speed) this.edit.setSpeedTier(Math.min(3, Math.max(0, d.speed | 0)) as 0 | 1 | 2 | 3);
      this.net.rebuild(true);
      for (const entry of d.nodes) applyNodeEntry(this.edit, entry);
      const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
      // (T257: a Props tool prop keeps its saved flip, a tree's too: as the player turned it)
      for (const t of d.props) { const [id, x, y, flip, scale] = t, i = index.get(id), m = tupleMarks(t); if (i !== undefined) Object.assign(this.addProp(i, x, y, !!flip, scale, undefined, m.decor ? { own: true } : undefined), m); }
      if (d.parks) this.parkDefs = d.parks.map(([x, y, w, h], k) => ({ id: k + 1, x, y, w, h }));
      this.places = placesFromTuples(d.places);
      if (d.tolls) this.tollDefs = d.tolls.map(([ax, ay, bx, by, booths], k) => ({ id: k + 1, ax, ay, bx, by, booths }));
      if (d.buses) this.busDefs = d.buses.map(([park, sx, sy, dx, dy, buses, seats, town], k) => ({ id: k + 1, park, sx, sy, dx, dy, buses, seats, ...(town !== undefined && town >= 0 ? { town } : {}) }));
      this.paint.load(d.paints as PaintTuple[] | undefined);
      // the course grid (T078): decoded here; a save without one (or a bad one) migrates its golf areas in afterLoad
      this.dropCourseGrid();
      if (this.golf) { this.courseGrid = lg === 'migrate' ? null : lg; delete this.golf.grid; this.golf.plans = Array.isArray(this.golf.plans) ? this.golf.plans.filter(Array.isArray) : undefined; }
      this.grass.load(d.grass); this.grassSim = -1;
      if (!GREENKEEPING) this.grass.configure({ enabled: false }); // greenkeeping hidden for now (features.ts): no condition layer, no drift
      // the bay rows and on-street runs (their ground and lists go to the City now: the network is built above; afterLoad syncs their gates)
      this.parking.load(d.rows?.map(([ax, ay, bx, by, side, bay, col], k): BayRowDef => ({ id: k + 1, ax, ay, bx, by, side: side < 0 ? -1 : 1, bay: bay === 60 || bay === 45 ? bay : 90, col: col === 'white' ? 'white' : 'yellow' })), d.curbs?.map(([ax, ay, bx, by], k): CurbDef => ({ id: k + 1, ax, ay, bx, by })), d.parkFee);
      // the cards the save had applied are in its tolls and routes already: only the fields new gates and routes take are set from them
      const cards = d.round?.cards ?? [], n = Math.min(cards.length, d.cardsApplied ?? cards.length);
      this.cardsApplied = n; this.setCardFields(cards.slice(0, n));
      // a save from before T153 may sit below the new furthest zoom: clamped to it (FAR there)
      if (d.cam) { this.cam = { X: d.cam.X, Y: d.cam.Y, z: clampZoom(d.cam.z) }; this.tileBand = nextBand(this.cam.z, d.cam.tb); }
      return true;
    } catch (e) { console.error('load failed', e); return false; }
  }
  private reset() {
    this.courseHeight = createCourseHeightField(); this.chSave = null;
    this.grass.clear(); this.grassZones.clear(); this.grassSim = -1; this.grassElapsed = 0; this.grassTrafficT = -1; this.grassPedOut.fill(0); this.grassCarAlive.fill(0); this.grassTarget = null; this.grassAction = null;
    this.edit.clear(); this.snapshot = null; this.pondKey = ''; // T231: the ponds' edges are laid again for the loaded game
    for (const p of [...this.props]) this.removeProp(p);
    this.sprites.clear(); this.autoByKey.clear(); this.forest.clear(); this.perf.forest = 0; this.townTrees.clear(); this.perf.townTrees = 0; this.lotBoxes.clear(); this.paintBoxes.clear();
    this.ground.dropCasters('f:'); this.ground.dropCasters('t:');
    this.parkCars.clear(); this.parkDefs = []; this.parkBuilt = []; this.parkDrag = null; for (const k of this.parkGround) this.setLotGround(k, null); this.parkGround.clear();
    for (const p of this.lookProps.values()) this.removeProp(p); this.lookProps.clear(); this.parkLooks.clear(); this.lookKey = ''; // (T237)
    this.parking.clear(); this.extraParks = []; this.extraCarIds.clear(); this.gateProps.clear();
    this.tollDefs = []; this.tollSegs.clear(); this.tollHover = null; for (const k of this.tollGround) this.setLotGround(k, null); this.tollGround.clear();
    this.busDefs = []; this.busPick = null; this.busHover = null; this.paint.clear(); this.dropCourseGrid();
    for (const k of this.stopCuts.keys()) this.setLotGround(k, null); this.stopCuts.clear();
    this.golf = null; this.townPts = []; this.golfProps.clear(); this.golfStructureProps.clear(); this.range.drop(); this.range.cardOpen = false;
    this.landMode = false; this.land.hover = null; this.land.cancel(); this.holesTool = false; this.selectedGolfMarker = null;
    this.eventTool = false; this.eventStructurePending = null; this.lastGolfMonth = -1;
    // the last game's season card and calendar year do not carry over (T135: the new game's clock starts again in the city worker)
    this.seasonReport = null; this.seenYear = 0; this.foundTick = 0;
    this.setBizDefs([]); this.bizHover = null; this.bizOpenSeen = null;
    // the new town's round has no cards: the mirror goes with it (a frame still in flight would otherwise apply the old cards again)
    this.cardsApplied = 0; this.setCardFields([]); this.traffic.round = new Round().view();
    for (const k of this.lotProps.keys()) this.setLotGround(k, null);
    for (const k of this.blockLawns) this.setLotGround(k, null); this.blockLawns.clear();
    for (const k of this.surveyKeys) this.setLotGround(k, null); this.surveyKeys.clear(); this.surveySig = '';
    this.lotProps.clear(); this.yardRough.clear(); this.roughAt = -1; this.lotQueue.clear(); this.staged.clear(); this.labLot = null; this.labClear = null; this.perf.lotProps = 0;
    this.dropAllFarms();
    for (const id of [...this.placeProps.keys()]) this.dropPlace(id);
    this.places = []; this.placeTryAt = 0; this.selectedPlace = null;
    this.traffic.setGolf(false, 1, 0);
    this.traffic.setBudget(null, null); this.showWin = false; this.route = []; this.selected = null; this.builds = [];
  }
  newTown() {
    this.reset(); const golf = this.newGame();
    if (!golf) this.genTerrain(newSeed());
    this.ground.terrain(this.terrain); this.sendTerrain();
    if (!golf) this.seedTowns(); // a golf game laid its road and range (or its town) in newGame
    this.afterLoad(); this.rangeMorning();
    if (this.stampPending) { this.stampPending = false; this.traffic.stamp(TOWN_POP); this.scheduleSave(); }
    void this.save(); this.toast(`New game (seed ${this.seed})`); this.emit();
  }
  clearTown() { this.reset(); this.sendTerrain(); this.afterLoad(); void clearSave(); void this.save(); this.emit(); }
  /** downloads the current save as capital-empire-YYYY-MM-DD.cesave (saves first, unless saving is blocked) */
  async downloadSave(): Promise<void> {
    await this.save();
    const buf = await exportSaveBytes();
    if (!buf) { this.toast('No save to download yet', 'warn'); return; }
    const t = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    this.downloadBytes(buf, `capital-empire-${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}.cesave`);
  }
  /** loads a .cesave file: on success the page reloads into it (the current save is backed up first); on failure a toast says why */
  async loadSaveFile(file: File): Promise<void> {
    const was = this.saveBlocked; this.saveBlocked = true; // no autosave may write the old game over the file while it loads
    const r = await importSaveBytes(await file.arrayBuffer());
    if (r.ok) { location.reload(); return; }
    this.saveBlocked = was; this.toast(r.why ?? 'This save could not be read', 'warn');
  }
  /** the backup slots for the gear menu, with a download and a delete for each */
  async saveBackups(): Promise<string[]> { return listSaveBackups(); }
  async downloadBackup(key: string): Promise<void> {
    const buf = await readBackup(key);
    if (!buf) { this.toast('That backup is gone', 'warn'); return; }
    this.downloadBytes(buf, `capital-empire-${key}.cesave`);
  }
  async deleteSaveBackup(key: string): Promise<void> {
    if (await deleteBackup(key)) this.toast('Backup deleted'); else this.toast('That backup could not be deleted', 'warn');
  }
  /** a file download of bytes: a Blob behind a temporary link that is clicked, then its URL is released */
  private downloadBytes(buf: ArrayBuffer, name: string) {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/gzip' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000); // released later: some browsers start the download after the click returns
  }
  /** debug (the contact sheet): an empty map at the camera, then a street grid of cols x rows blocks (BLOCK tiles). Every lot is composed
   *  directly (no town) with a use from uses (cycled), the level, decline and seed + i. The states hold until the next reset. diag (T154 Phase 2):
   *  the grid turned 45 degrees, its streets on the roads at 45 degrees (blocks about BLOCK a side: steps of BLOCK / sqrt 2 tiles along x and y) */
  stageLots(o: { cols: number; rows: number; uses: number[]; level: number; decline: number; seed: number; diag?: boolean }) {
    this.reset(); this.afterLoad();
    const W = o.cols * BLOCK, H = o.rows * BLOCK, c = tileOf(this.cam.X, this.cam.Y);
    const x0 = clamp(Math.round(c.x - W / 2), 8, MAP - 8 - W), y0 = clamp(Math.round(c.y - H / 2), 8, MAP - 8 - H);
    const legs: Leg[] = [];
    if (o.diag) {
      // the corner (i, j) of the turned grid: i steps along (1, 1), j along (1, -1), the grid's middle at the camera
      const S = Math.round(BLOCK / Math.SQRT2), ox = clamp(Math.round(c.x - ((o.cols + o.rows) * S) / 2), 8, MAP - 8 - (o.cols + o.rows) * S), oy = clamp(Math.round(c.y - ((o.cols - o.rows) * S) / 2), 8 + o.rows * S, MAP - 8 - o.cols * S);
      const P = (i: number, j: number) => ({ x: ox + (i + j) * S, y: oy + (i - j) * S });
      for (let i = 0; i <= o.cols; i++) legs.push({ a: P(i, 0), b: P(i, o.rows) });
      for (let j = 0; j <= o.rows; j++) legs.push({ a: P(0, j), b: P(o.cols, j) });
    } else {
      for (let i = 0; i <= o.cols; i++) legs.push({ a: { x: x0 + i * BLOCK, y: y0 }, b: { x: x0 + i * BLOCK, y: y0 + H } });
      for (let j = 0; j <= o.rows; j++) legs.push({ a: { x: x0, y: y0 + j * BLOCK }, b: { x: x0 + W, y: y0 + j * BLOCK } });
    }
    this.edit.addLegs(legs, CLASS.street, 0);
    this.commitNetwork();
    const { added } = new LotMap().update(this.net, this.terrain.cls);
    added.forEach((l, i) => {
      const g: LotGeom = { o: l.o, u: l.u, n: l.n, w: l.w, d: l.d }, st: ComposeState = { use: o.uses[i % o.uses.length]!, level: o.level, decline: o.decline, seed: o.seed + i };
      this.staged.set(l.key, { g, st }); this.placeLot(l.key, g, st);
    });
  }
  /** the lot lab's lot (stageLab): its key, geometry, road and size, so restageLab composes it again; null until a lab lot is staged and after a reset */
  private labLot: { key: string; g: LotGeom; road: number; w: number; d: number } | null = null;
  /** the box (tiles) the lot lab keeps clear of forest trees: the lab lot and its street with 70 tiles to spare past the road, so the view round it is the map's own grass (stageLab); null outside the lab */
  private labClear: BBox | null = null;
  /** debug (the lot lab, src/game/dev/lot-lab.ts): saving and farms off, an empty map, the sim paused, one straight street through the terrain's start at
   *  the road angle (presets.ts Road: the side the street lies on, in eighth turns; even along a map axis, odd a 45-degree diagonal) and one lot
   *  of w x d tiles fronting it on that side, staged with st (st.preset forces its preset); the camera on the lot. Returns its key and geometry */
  stageLab(o: { road: number; w: number; d: number; st: ComposeState }): { key: string; g: LotGeom } {
    // no farms either: their parcels would grow along the lab street
    this.benchMode = true; this.farmsOn(false); this.reset(); this.afterLoad(); this.setSpeed(0);
    // the street's side from the lot (by road), the lot's away vector n (from the street) and its along vector u
    const h = Math.SQRT1_2, S: Pt[] = [{ x: 0, y: 1 }, { x: h, y: h }, { x: 1, y: 0 }, { x: h, y: -h }, { x: 0, y: -1 }, { x: -h, y: -h }, { x: -1, y: 0 }, { x: -h, y: h }];
    const s = S[o.road]!, n = { x: -s.x, y: -s.y }, u = { x: -n.y, y: n.x }, t = this.terrain.start;
    // the street's whole-tile direction (u on an axis, u / h on a diagonal), and the start rounded to tiles, kept 40 tiles inside the map with the leg
    // (LEG steps either way: long enough for the lab's neighbours, two lots each way: stageLabNeighbours)
    const D = o.road % 2 ? { x: Math.round(u.x / h), y: Math.round(u.y / h) } : u, LEG = 90;
    const R = { x: clamp(Math.round(t.x + t.size / 2), 40 + LEG * Math.abs(D.x), MAP - 40 - LEG * Math.abs(D.x)), y: clamp(Math.round(t.y + t.size / 2), 40 + LEG * Math.abs(D.y), MAP - 40 - LEG * Math.abs(D.y)) };
    this.edit.addLegs([{ a: { x: R.x - LEG * D.x, y: R.y - LEG * D.y }, b: { x: R.x + LEG * D.x, y: R.y + LEG * D.y } }], CLASS.street, 0);
    this.commitNetwork();
    // the front edge sits at the verge: the origin lies h + walk off the centre line (lots.ts segLots, r0), with no clearance on top
    const off = CLASS.street.h + CLASS.street.walk, C = { x: R.x - s.x * off, y: R.y - s.y * off };
    const g: LotGeom = { o: { x: C.x - u.x * o.w / 2, y: C.y - u.y * o.w / 2 }, u, n, w: o.w, d: o.d };
    this.staged.set('lab', { g, st: o.st }); this.placeLot('lab', g, o.st);
    this.labLot = { key: 'lab', g, road: o.road, w: o.w, d: o.d };
    // no forest round the lab lot and its street (the lab shows the lot on the map's plain grass); the cells there plant again without it
    const b = lotBoxOf([g.o.x, g.o.y], [u.x, u.y], [n.x, n.y], o.w, o.d), m = 2 * off + 110;
    this.labClear = [b[0]! - m, b[1]! - m, b[2]! + m, b[3]! + m]; this.dropTownTrees(this.labClear[0], this.labClear[1], this.labClear[2], this.labClear[3]);
    this.setTool('select');
    const c = { x: g.o.x + (u.x * o.w + n.x * o.d) / 2, y: g.o.y + (u.y * o.w + n.y * o.d) / 2 };
    this.lookAt(c.x, c.y, ZOOM_MAX); this.emit();
    return { key: 'lab', g };
  }
  /** debug (the lot lab): the staged lab lot composed again with a new state (a variant, another preset), the street and the lot kept; null when no lab lot is staged */
  restageLab(st: ComposeState): { key: string; g: LotGeom } | null {
    if (!this.labLot) return null;
    const { key, g } = this.labLot; this.staged.set(key, { g, st }); this.placeLot(key, g, st); this.emit();
    return { key, g };
  }
  /** debug (the lot lab's Neighbours, T148): the lots round the lab lot, staged as given (keys 'lab-n...'; composed as the game composes a lot of
   *  their state: no forced preset), the ones staged before dropped; [] drops them all. A fresh stageLab drops them too (its reset) */
  stageLabNeighbours(list: readonly { key: string; g: LotGeom; st: ComposeState }[]) {
    for (const k of [...this.staged.keys()]) if (k.startsWith('lab-n')) { this.staged.delete(k); this.dropLot(k); }
    for (const l of list) { this.staged.set(l.key, { g: l.g, st: l.st }); this.placeLot(l.key, l.g, l.st); }
    this.emit();
  }

  /** a new valley: the three towns' street grids (townGrid: the legs on buildable ground, the middle lines avenues), laid as one edit; the
   *  city worker stamps the towns to TOWN_POP residents after the network arrives (stampPending). No lamps yet: the net is rebuilt only by
   *  afterLoad's commit, so the lamps would need a second pass there. */
  private stampPending = false;
  seedTowns() {
    const cs = townCentres(this.terrain), cls = (x: number, y: number) => classAt(this.terrain, x, y);
    if (!cs.length) return;
    const byClass = new Map<ClassId, Leg[]>();
    for (const c of cs) {
      const g = townGrid(c, TOWN_BLOCKS, cls);
      g.legs.forEach((l, i) => { const id = g.cls[i]!; let a = byClass.get(id); if (!a) byClass.set(id, a = []); a.push(l); });
    }
    for (const [id, legs] of byClass) this.edit.addLegs(legs, classOf(id), 0, undefined, true);
    this.cam.X = worldX(cs[0]!.x, cs[0]!.y); this.cam.Y = worldY(cs[0]!.x, cs[0]!.y);
    if (this.stampOn) this.stampPending = true;
  }
  /** A starter Maple Falls showing every road type: highway with a 45° approach, a boulevard, an avenue, a roundabout, lights with slipways, streets and a lane. */
  seedTown() {
    const { start } = this.terrain, Ox = clamp(start.x + 32 - 80, 8, MAP - 168), Oy = clamp(start.y + 32 - 80, 8, MAP - 168);
    const net = this.net, byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
    const legs = (pts: [number, number][]): Leg[] => pts.slice(1).map((p, i) => ({ a: { x: pts[i][0] + Ox, y: pts[i][1] + Oy }, b: { x: p[0] + Ox, y: p[1] + Oy } }));
    const road = (pts: [number, number][], c: RoadClass, s: LineStyle) => { const ls = legs(pts); if (!this.blockedForRoad(ls, c.h + c.walk)) this.edit.addLegs(ls, c, s); };
    road([[10, 50], [24, 36], [146, 36], [146, 64]], CLASS.road, 0);
    road([[80, 36], [80, 124]], CLASS.boulevard, 0);
    road([[36, 80], [128, 80]], CLASS.avenue, 0);
    road([[54, 80], [54, 108], [106, 108], [106, 80]], CLASS.street, 0);
    road([[54, 80], [54, 58]], CLASS.street, 1);
    road([[60, 124], [100, 124]], CLASS.street, 0);
    road([[106, 96], [122, 80]], CLASS.street, 0);
    road([[54, 94], [72, 94]], CLASS.lane, 0);
    road([[120, 108], [106, 108]], CLASS.street, 2);
    net.rebuild(true);
    const typed = (x: number, y: number, t: NodeType) => { const n = net.nodeAt({ x: x + Ox, y: y + Oy }); if (n) this.edit.setNodeType(n, t); };
    typed(80, 36, 'slip'); typed(80, 80, 'roundabout'); typed(80, 108, 'signal'); typed(106, 80, 'signal');
    net.rebuild();
    // helpers: a sprite facing +y with its front edge on frontY; flipped sprites face +x with their front edge on frontX
    const front = (id: string, cx: number, frontY: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = cx + Ox - b.dx * k / 2, y = frontY + Oy - (b.dy * k / 2 + b.hy * k / 2); if (!this.canPlace(it, x, y, false, k)) this.addProp(i, x, y, false, k); };
    const side = (id: string, frontX: number, cy: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = frontX + Ox - (b.dy * k / 2 + b.hy * k / 2), y = cy + Oy - b.dx * k / 2; if (!this.canPlace(it, x, y, true, k)) this.addProp(i, x, y, true, k); };
    // a car takes its owner size (carOwnerScale: the studio's, 1 unset) on top of k; the engine draws it at CAR_SCALE times that
    const put = (id: string, x: number, y: number, k = 1, flip = false) => { const i = byId(id); if (i < 0) return; const s = LIBRARY[i].kind === 'car' ? k * carOwnerScale(id) : k; if (!this.canPlace(LIBRARY[i], x + Ox, y + Oy, flip, s)) this.addProp(i, x + Ox, y + Oy, flip, s); };
    front('town:postoffice', 45, 75.4); front('town:bakery', 54, 75.4); front('world:arcade', 63, 75.4);
    front('world:video_rental', 96, 75.4); front('town:grocery', 106, 75.4); front('world:diner', 115, 75.4); front('town:pharmacy', 123, 75.4);
    front('town:laundromat', 40, 118.9); front('town:fish_tackle', 128, 100);
    front('world:church', 54, 54.4); front('world:primary_school', 46, 32.2); front('ref:building-gas-canopy', 112, 32.2); side('town:firestation', 73.9, 62);
    front('world:barn', 30, 61); put('ref:landmark-windmill', 22, 72); put('world:watertower', 138, 76); put('world:gazebo', 102, 56);
    for (const [id, x] of [['world:house_1', 61], ['world:house_3', 69], ['gen:house-splitlevel', 91], ['world:house_4', 99]] as [string, number][]) front(id, x, 104.9);
    for (const [id, x] of [['gen:house-duplex', 66], ['world:house_1', 74], ['gen:house-l-ranch', 88], ['world:house_3', 96]] as [string, number][]) front(id, x, 120.9);
    for (const [id, y] of [['gen:house-ranch-long', 64], ['world:house_4', 72], ['gen:house-farmhouse-wrap', 88], ['gen:house-l-shape', 100]] as [string, number][]) side(id, 50.9, y);
    front('world:house_4', 60, 92.4); front('static:garage_timber', 67, 92.4);
    const trees = ['world:tree_oak_0', 'world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold', 'world:tree_pine_0', 'ref:tree-spruce-blue', 'world:tree_pine_1'];
    const spots: [number, number][] = [[94, 48], [100, 50], [108, 47], [114, 52], [120, 58], [96, 60], [112, 62], [118, 48], [60, 113], [68, 113], [92, 113], [100, 113], [44, 86], [46, 100], [112, 90], [118, 96], [130, 56], [134, 48], [30, 72], [36, 66], [138, 92], [132, 100], [60, 44], [66, 48], [24, 60]];
    spots.forEach(([x, y], i) => put(trees[(i * 5) % trees.length], x, y, 0.95 + ((i * 7) % 4) * 0.08));
    this.lampsAlongRoads(this.net);
    put('world:hydrant', 60, 84.2, 0.9); put('world:mailbox', 68, 76.3, 0.9); put('world:bench', 92, 84.1, 0.9); put('world:trashcan', 94, 84.1, 0.9); put('town:bus_stop', 66, 84.1, 0.95);
    put('town:stop_sign', 57.4, 104.6, 0.9); put('town:phone_booth', 101, 76.3, 0.9); put('town:picnic_table', 104, 60, 0.95); put('town:bike_rack', 60, 76.3, 0.9); put('town:utility_pole', 36, 86, 1);
    put('world:car_0', 48, 37.2); put('static:pickup_n', 104, 34.9); put('world:schoolbus', 130, 37.3); put('static:van_e', 60, 82.2); put('world:car_2', 110, 77.8);
    put('world:car_1', 82, 60); put('static:compact_n', 76, 100); put('world:car_3', 66, 106.9); put('static:compact_e', 96, 109.1, 1, true);
    put('world:scarecrow', 30, 52, 0.9); put('ref:halloween-hay-bales', 34, 56, 0.9); put('world:pumpkin_0', 59, 101.5, 0.9); put('world:pumpkin_1', 91.5, 101.6, 0.9); put('gen:inflatable-pumpkin', 73, 117.8, 0.9);
    put('world:candy_stand', 110, 58, 0.9); put('ref:halloween-pumpkin-cluster', 48, 72.5, 0.9); put('ref:halloween-sheet-ghost', 97, 101, 0.9);
    const cx = start.x + 32, cy = start.y + 32;
    this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy);
    this.buildHighway();
  }
  /** the highway from its map edge entry to the starter town's node nearest the entry (the start block centre if the town has no nodes) */
  private buildHighway() {
    const t = this.terrain, h = t.highway, hw = CLASS.road.h + CLASS.road.walk;
    if (h.x < 0) return;
    let target = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 }, best = Infinity;
    for (const n of this.net.nodes.values()) { const d = (n.x - h.x) ** 2 + (n.y - h.y) ** 2; if (d < best) { best = d; target = { x: n.x, y: n.y }; } }
    const pts = highwayRoute(h, target, hw, (x, y) => classAt(t, x, y));
    const legs0: Leg[] = []; for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1], b: pts[i] });
    const { legs, kinds } = splitByTerrain(legs0, hw, (x, y) => groundClass(classAt(t, x, y)));
    for (const p of this.propsNearLegs(legs, hw)) if (!LIBRARY[p.item].big) this.removeProp(p);
    this.edit.addLegs(legs, CLASS.road, 0, kinds, true);
  }
  /** street lamps on the sidewalk's outer half along every kerbed street, both sides, staggered */
  lampsAlongRoads(net: RoadNetwork, every = 1) {
    const lampId = LIBRARY.findIndex(i => i.id === 'world:streetlamp'), lampIt = LIBRARY[lampId], lb = lampIt.boxes[0];
    let n = 0;
    for (const r of net.routes) {
      if (r.cls.walkTex !== 'slabs' || r.closed) continue;
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 6) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = r.cls.h + r.cls.walk * 0.62, step = (r.cls.id === 'lane' ? 12 : 8) * every;
        for (let s = 4; s < L - 3; s += step) for (const side of [1, -1]) {
          const t = s + (side > 0 ? 0 : step / 2); if (t > L - 3) continue;
          const cx = a.x + ux * t + nx * side * off, cy = a.y + uy * t + ny * side * off, x = cx - lb.dx * 0.9 / 2, y = cy - lb.dy * 0.9 / 2;
          if (!this.canPlace(lampIt, x, y, false, 0.9)) { this.addProp(lampId, x, y, false, 0.9); n++; }
        }
      }
    }
    return n;
  }

  // ---------- fx ----------
  puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 1.5, y: y + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.6 + Math.random() * 1.2, z: 0, life: 0.6 + Math.random() * 0.6, age: 0, r: 0.25 + Math.random() * 0.3 });
  }
  private revealFront(b: Build, now: number) {
    const p = clamp((now - b.t0) / b.dur, 0, 1), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return e * b.total;
  }
  /** the build reveal as an alpha mask in screen space (half resolution) */
  private revealMask(now: number) {
    if (!this.builds.length) return null;
    const W = Math.ceil(this.cw / 2), H = Math.ceil(this.ch / 2);
    if (!this.mask || this.mask.width !== W || this.mask.height !== H) this.mask = new OffscreenCanvas(W, H);
    const g = this.mask.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.beginPath();
    for (const b of this.builds) {
      const front = this.revealFront(b, now), pad = b.cls.h + b.cls.walk + 14;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = clamp(front - b.cum[i], 0, len); if (rl <= 0) return;
        const u = mul(d, 1 / len), n = perp(u), done = rl >= len - 1e-6;
        const s = sub(l.a, mul(u, pad)), e = add(l.a, mul(u, rl + (done ? pad : 0)));
        const c = [add(s, mul(n, pad)), add(e, mul(n, pad)), sub(e, mul(n, pad)), sub(s, mul(n, pad))].map(q => this.screen(q.x, q.y));
        g.moveTo(c[0].x / 2, c[0].y / 2); for (let k = 1; k < 4; k++) g.lineTo(c[k].x / 2, c[k].y / 2); g.closePath();
      });
    }
    g.fill(); return this.mask;
  }

  /** the townspeople: new sidewalks when the network changed (looked at twice a second), the head count from the built lots */
  /** Current maintenance selection: a radius in tiles or the clicked registered grass polygon. */
  grassScope(): GrassScope | null { const p = this.grassTarget; if (!p || !this.grassHere(p.x, p.y)) return null; const zone = this.grassArea ? this.grass.zoneAt(p.x, p.y) : undefined; return this.grassArea && !zone ? null : { ...p, radius: this.grassRadius, zone }; }
  /** Only actual managed turf receives wear: exclude roads/sidewalks, non-ground terrain and overpainted bunkers/water/paths. */
  private grassHere(x: number, y: number): boolean {
    if (!this.grass.zoneAt(x, y) || this.net.occAt(x, y) || classAt(this.terrain, x, y) > TC.PATCH) return false;
    const cs = this.courseSurfAt(x, y); if (cs === SURF.bunker || cs === SURF.waste || cs === SURF.water) return false; // the course grid's sand and water
    const p = areaAt(this.paint.areas, x, y); return !p || !!grassSurface(p.tex, false, surfaceOfTex(p.tex));
  }
  /** Pay for care through the existing treasury and update only the selected cells. */
  careGrass(action: GrassAction) {
    const scope = this.grassScope(); if (!scope) return;
    const cost = this.grass.quote(action, scope, this.grassDose); if (!cost) { this.toast('Select a grass area first', 'warn'); return; }
    if (cost > this.money) { this.toast(`Grass care needs $${cost}`, 'warn'); return; }
    const n = this.grass.apply(action, scope, this.grassDose, this.grassAngle); if (!n) return;
    this.traffic.spend('upkeep', cost); this.flushGrass(); this.scheduleSave(); this.toast(`${GRASS_ACTION_NAME[action]}: ${n} turf cells ($${cost})`); this.emit(); // T175: the plan's names
  }
  /** Persist owner tuning without changing lawn/base-grass/mowing presets. */
  tuneGrass(settings: Partial<GrassSettings>) { this.grass.configure(settings); this.flushGrass(); this.scheduleSave(); this.emit(); }
  /** Record a player-marked turf strike, rendered as a small separate divot; never a full damaged turf tile. */
  markGrassDivot() { const p = this.grassTarget; if (!p || !this.grassHere(p.x, p.y)) return; this.grass.traffic(p.x, p.y, p.x, p.y, 1, 'divot', 0); this.flushGrass(); this.scheduleSave(); this.emit(); }
  private flushGrass() {
    const visible = this.grass.settings.enabled && this.grass.settings.strength > 0 || this.grassHeat;
    if (this.grass.drain(this.grassDelta) && (visible || this.grassVisible)) this.ground.grass(this.grassDelta, this.grass.settings.enabled ? this.grass.settings.strength : 0, this.grassHeat, this.grass.settings.mowing);
    this.grassVisible = visible;
  }
  private updateGrass() {
    const t = this.traffic.stats.simT;
    if (this.grassSim < 0 || t < this.grassSim) this.grassSim = t;
    this.grassElapsed += Math.max(0, t - this.grassSim) / GAME_DAY * (this.golfMode && this.traffic.round.stage === 'free' ? 365 : 1); this.grassSim = t;
    if (this.grassElapsed >= 0.25) {
      const days = Math.min(30, Math.floor(this.grassElapsed * 4) / 4), s = this.grass.settings;
      const r = this.traffic.round, weather = this.golf && r.stage !== 'free' ? getTournamentWeather(this.seed, r.stage === 'eval' && r.last ? r.last.run : r.runs + 1).condition : 'clear';
      this.grass.step(days, { rain: weather === 'rain' ? Math.max(s.rain, 0.2) : weather === 'storm' ? Math.max(s.rain, 0.4) : s.rain, evaporation: weather === 'heat' ? Math.max(s.evaporation, 0.12) : s.evaporation, temperature: weather === 'heat' ? Math.max(32, s.temperature) : s.temperature }); this.grassElapsed -= days;
    }
    // Use real movement/occupancy only. No artificial customers, cart routes or random divots are invented.
    if (this.grass.settings.enabled && this.speed && t - this.grassTrafficT >= 1) {
      const elapsed = this.grassTrafficT < 0 ? 0 : Math.min(5, t - this.grassTrafficT); this.grassTrafficT = t;
      for (let i = 0; i < this.peds.n; i++) {
        const out = this.peds.isOut(i), x = this.peds.x[i], y = this.peds.y[i];
        if (out && this.grassPedOut[i] && this.grassHere(x, y) && this.grassHere(this.grassPedX[i], this.grassPedY[i])) { const distance = Math.hypot(x - this.grassPedX[i], y - this.grassPedY[i]); if (distance > 0.05 && distance < 32) this.grass.traffic(this.grassPedX[i], this.grassPedY[i], x, y, distance, 'foot'); }
        this.grassPedOut[i] = out ? 1 : 0; this.grassPedX[i] = x; this.grassPedY[i] = y;
      }
      // Event frame groups have no stable visitor id: local occupancy is usable without inventing trajectories between groups.
      for (const [fans, st] of [[this.traffic.walkers, 6], [this.traffic.stops, 4], [this.traffic.gallery, 8]] as const) for (let k = 0; k + st <= fans.length; k += st) if (fans[k + 2] > 0 && this.grassHere(fans[k], fans[k + 1])) this.grass.traffic(fans[k], fans[k + 1], fans[k], fans[k + 1], fans[k + 2] * 0.05 * elapsed, 'foot');
      const tr = this.traffic;
      if (this.grassCarAlive.length < tr.n) { this.grassCarX = new Float32Array(tr.n); this.grassCarY = new Float32Array(tr.n); this.grassCarAlive = new Uint8Array(tr.n); }
      for (let i = 0; i < tr.n; i++) {
        const x = tr.px[i], y = tr.py[i];
        if (tr.alive[i] && this.grassCarAlive[i] && this.grassHere(x, y) && this.grassHere(this.grassCarX[i], this.grassCarY[i])) { const d = Math.hypot(x - this.grassCarX[i], y - this.grassCarY[i]); if (d > 0.05 && d < 32) this.grass.traffic(this.grassCarX[i], this.grassCarY[i], x, y, d / 4, 'cart'); }
        this.grassCarAlive[i] = tr.alive[i]; this.grassCarX[i] = x; this.grassCarY[i] = y;
      }
    }
    this.flushGrass();
  }
  private updatePeds(dt: number) {
    if (!WALKER_PEOPLE.length) return;
    if (this.pedTick++ % 30 === 0) {
      if (this.pedNet !== this.net.version) {
        this.pedNet = this.net.version;
        // town sidewalks only (slab sidewalks, not the rural verges), and never in a tunnel
        const roads = [...this.net.routes].filter(r => r.cls.walkTex === 'slabs' && r.kind !== SK.TUNNEL).map(r => ({ pts: r.pts, h: r.cls.h, walk: r.cls.walk, closed: r.closed }));
        this.peds.setSidewalks(sidewalks(roads));
      }
      // the doors: every built lot's frontage, a tile in (houses are homes; shops, work, civic buildings and venues are places)
      const built = this.traffic?.built ?? 0;
      if (built !== this.pedLots && this.traffic) {
        this.pedLots = built; const doors: Door[] = [];
        for (const l of this.traffic.lots.values()) if (l.level >= LV.BUILT) doors.push({ x: l.o[0] + l.u[0] * l.w / 2 + l.n[0], y: l.o[1] + l.u[1] * l.w / 2 + l.n[1], kind: l.use === 1 ? 0 : 1 });
        this.peds.setDoors(doors);
      }
      this.peds.populate(Math.min(PED_MAX, built * 0.5));
    }
    if (this.speed) this.peds.step(dt);
  }
  /** the walkers in a tile box as movers (reused Drawables): each its person's frame for its facing (mirrored on the west side) */
  private pedMovers(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const m = this.peds.inBox(x0, y0, x1, y1, this.pedView), out = this.pedDraw; out.length = m;
    for (let k = 0; k < m; k++) {
      const v = this.pedView[k], [row, mirror] = FACING_ROW[v.face]!, d = out[k] ?? (out[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: true });
      d.item = WALKER_BASE + (v.person * WALK_DIRS.length + row) * WALK_FRAMES + v.frame; d.x = v.x; d.y = v.y; d.flip = mirror;
      d.x0 = v.x - 0.12; d.y0 = v.y - 0.12; d.x1 = v.x + 0.12; d.y1 = v.y + 0.12;
    }
    return out;
  }

  /** the crowd as movers in a tile box (the street tier, with the townspeople): each gallery spot's fans, each queue at a stop or gate (its block
   *  1.5 tiles behind the kerb toward the stop's car park, as drawWalkers had it) and each walking party, every person its 3D frame (crowdview.ts;
   *  `now` in seconds), then the golfers of the day (playMovers). A spot, a party or a queue is culled by its point to the box padded by 4 tiles, the
   *  reach of its people. Reused Drawables and scratch people: no allocation per frame once the crowd is warm */
  private crowdMovers(x0: number, y0: number, x1: number, y1: number, now: number): Drawable[] {
    const G = this.traffic.gallery, W = this.traffic.walkers, S = this.traffic.stops, out = this.crowdDraw, P = this.crowdPeople;
    const X0 = x0 - 4, Y0 = y0 - 4, X1 = x1 + 4, Y1 = y1 + 4, nS = SPECTATOR_PEOPLE.length, ch = this.play?.pv.cheers.length ? this.play.pv.cheers : null;
    let m = 0;
    for (let i = 0; i + 7 < G.length; i += 8) {
      const x = G[i]!, y = G[i + 1]!;
      if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
      // (T213: the fans cheer a birdie or better holed near them, the playback's celebrations)
      let cheer = -1;
      if (ch) for (const c of ch) if ((c.x - x) ** 2 + (c.y - y) ** 2 < CHEER_TILES * CHEER_TILES) cheer = Math.max(cheer, c.t);
      const spot = i / 8, k = galleryPeople(G, i, spot, now, nS, P, cheer);
      for (let j = 0; j < k; j++) crowdDrawable(out, m++, P[j]!);
    }
    for (let i = 0; i + 5 < W.length; i += 6) {
      const x = W[i]!, y = W[i + 1]!;
      if (x < X0 || x > X1 || y < Y0 || y > Y1) continue;
      const k = walkerPeople(W, i, i / 6, now, nS, P);
      for (let j = 0; j < k; j++) crowdDrawable(out, m++, P[j]!);
    }
    for (let i = 0; i + 3 < S.length; i += 4) {
      const sx = S[i]!, sy = S[i + 1]!, q = Math.round(S[i + 2]!), r = S[i + 3]!;
      if (q <= 0 || sx < X0 || sx > X1 || sy < Y0 || sy > Y1) continue;
      // the queue's block: 1.5 tiles behind the kerb toward the stop's car park (the tile direction (0, 1) with no car park, as a gate has)
      const def = this.busDefs[r];
      let ux = 0, uy = 1;
      if (def) for (const p of this.parkDefs) if (p.id === def.park) { const cx = p.x + p.w / 2 - sx, cy = p.y + p.h / 2 - sy, L = Math.hypot(cx, cy); if (L > 0) { ux = cx / L; uy = cy / L; } break; }
      const k = queuePeople(sx + ux * 1.5, sy + uy * 1.5, sx, sy, q, r, now, nS, P);
      for (let j = 0; j < k; j++) crowdDrawable(out, m++, P[j]!);
    }
    m = this.playMovers(out, m, X0, Y0, X1, Y1);
    m = this.dayMovers(out, m, X0, Y0, X1, Y1, now); // T208: everyday golf
    m = this.crewMovers(out, m, X0, Y0, X1, Y1, now); // T269: the grounds crew
    out.length = m;
    return out;
  }
  /** the golfers of the day (docs/GOLF-PLAY.md P2) in the box, from mover m on: each person of the playback (PlayView.people) as a golfer of his art
   *  (group 1: person = the art's index for his sex and look; the row and frame come from the view), culled to the box. Reuses one scratch person;
   *  returns the next mover index */
  private playMovers(out: Drawable[], m: number, X0: number, Y0: number, X1: number, Y1: number): number {
    this.golfCartOut.length = 0; this.caddieLabels.length = 0;
    const pl = this.play; if (!pl) return m;
    const P = pl.pv.people, t = this.crowdGolfers[0] ?? (this.crowdGolfers[0] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0 });
    // (T213: the playback's carts are worked out for this box from the next frame on)
    const box = pl.pv.box ?? (pl.pv.box = [0, 0, 0, 0]); box[0] = X0; box[1] = Y0; box[2] = X1; box[3] = Y1;
    for (let j = 0; j < P.length; j++) {
      const p = P[j]!;
      if (p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) continue;
      t.x = p.x; t.y = p.y; t.person = pl.art[p.golfer]!; t.row = p.row; t.frame = p.frame;
      crowdDrawable(out, m, t); if (p.lift) out[m]!.lift = p.lift; if (p.alpha !== undefined && p.alpha < 1) out[m]!.alpha = p.alpha; m++; // (T266: fading)
    }
    // T213: the caddies (the stand-in spectator, labelled) with their bags, and the carts
    const c = this.crowdGolfers[2] ?? (this.crowdGolfers[2] = { x: 0, y: 0, group: 0, person: 0, row: 0, frame: 0 });
    for (const k of pl.pv.caddies) {
      if (k.x < X0 || k.x > X1 || k.y < Y0 || k.y > Y1) continue;
      c.group = 0; c.x = k.x; c.y = k.y; c.person = CADDIE_ART; c.row = k.row; c.frame = k.frame;
      crowdDrawable(out, m, c); if (k.alpha !== undefined && k.alpha < 1) out[m]!.alpha = k.alpha; this.caddieLabels.push({ p: out[m]!, text: CADDIE_LABEL }); m++;
      if (BAG_ART >= 0) { const b = this.propDrawable(out, m++, BAG_ART, k.bx, k.by, 0.25); if (k.alpha !== undefined && k.alpha < 1) b.alpha = k.alpha; } // (T266: fading with him)
    }
    this.cartDrawables(pl.pv.carts, this.golfCartOut, X0, Y0, X1, Y1);
    return m;
  }
  /** T213: the tournament's carts as movers (reused Drawables), and the caddies' stand-in labels (drawStandIns) */
  private golfCartOut: Drawable[] = []; private golfCartDraw: Drawable[] = []; private dayCartDraw: Drawable[] = [];
  private caddieLabels: { p: Drawable; text: string }[] = [];
  /** T213: a library picture as a mover at (x, y) (tiles) at its art scale (or `or`), in out[k] (made on first use, then reused) */
  private propDrawable(out: Drawable[], k: number, item: number, x: number, y: number, r: number): Drawable {
    const d = out[k] ?? (out[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: false });
    d.item = item; d.x = x; d.y = y; d.flip = false; d.scale = artScale(item, 0.3); d.moving = false; d.lift = undefined; d.alpha = undefined;
    d.x0 = x - r; d.y0 = y - r; d.x1 = x + r; d.y1 = y + r;
    return d;
  }
  /** T213: the carts (play/carts.ts PlayCart) in the box into `to` as movers: the hire cart's nearest facing to its heading (its art has two: the front
   *  to the screen's lower left or lower right; a cart heading up the screen shows the one on its side, GOLF-ART-LIST item 173) */
  private cartDrawables(carts: readonly PlayCart[], to: Drawable[], X0: number, Y0: number, X1: number, Y1: number) {
    const pool = to === this.golfCartOut ? this.golfCartDraw : this.dayCartDraw;
    let n = 0;
    for (const c of carts) {
      if (c.x < X0 || c.x > X1 || c.y < Y0 || c.y > Y1) continue;
      const item = CART_ART[c.hx - c.hy < 0 ? 0 : 1]!; if (item < 0) continue;
      const d = this.propDrawable(pool, n++, item, c.x, c.y, 0.6); if (c.alpha !== undefined) d.alpha = c.alpha; to.push(d); // (T266: a watchable cart fading)
    }
  }
  /** the golf round on the tournament day (docs/GOLF-PLAY.md P2), each frame in golf mode. It is built once per tournament, while its round is live
   *  (the surge, and the eval after kick-off, so a reload in the eval finds it too), keyed by the round's count (runs: the same after a reload, new for
   *  each tournament), and then played back at the town clock's minute of the day (the tournament day runs at 1 game minute per sim second). Dropped
   *  when the round is free, or when there is no golf */
  private updatePlay(now: number) {
    const tr = this.traffic, r = tr?.round;
    if (!this.golf || !r || (r.stage !== 'surge' && r.stage !== 'eval' && !this.devTourney)) { this.play = null; this.playTried = -1; this.playSavedHr = -1; this.resultsEarly = false; this.clearFeatured(); if (this.shot) this.closeShot(); this.holdDay(now, false); return; }
    if (this.playTried !== r.runs) { this.playTried = r.runs; this.play = this.buildPlaySaved(r.runs); }
    if (!this.play) { this.clearFeatured(); this.holdDay(now, true); return; }
    const minute = this.playMinute(this.play, townTimeOf(tr.town, tr.simTime(now)).dayMin);
    // the day saves itself each game hour (T209: the save keeps the day, SaveV5.tourney), so a reload resumes near where it was; the owner's shots save as he plays
    const hr = Math.floor(minute / 60); if (hr !== this.playSavedHr) { if (this.playSavedHr >= 0) this.scheduleSave(); this.playSavedHr = hr; }
    // the owner's pending turn (P4b): his walk to the ball and his address there, facing the open shot's aim when one is open
    const own = this.play.own, shotAim = this.shot && own && this.shot.turn === own.turn ? this.shot.input.aim : null;
    { const T = this.traffic, st = T.simTime(now); this.play.pv.update(minute, now / 1000, own?.turn ?? null, shotAim, null, st, localRate(T.town, st)); } // (T266: its pacers)
    this.ownerFrame(minute); this.holdDay(now, true);
    // the crowd follows the play (docs/GOLF-PLAY.md decision 6): the featured holes are worked out at most every FEATURED_EVERY_MS and sent when they change
    if (now - this.featuredAt >= FEATURED_EVERY_MS) { this.featuredAt = now; this.sendFeatured(this.featuredHoles(this.play, minute)); }
    // T211: a marshal's wave-through is toasted as the minute passes it (those before the first frame, a reload mid-day, are not)
    this.toastWaves(this.play, minute);
    // the end of the round (T210): the last group's moment (a toast; the board offers to watch it), then the round over: the champion is toasted and the
    // results open (resultsOpen). Stepped at most every FINISH_EVERY_MS; the tracker latches both, so a 20x frame that jumps the 18th still has them in order
    if (now - this.finishAt >= FINISH_EVERY_MS) {
      this.finishAt = now;
      const pl = this.play, fin = pl.finish.step(pl.plan, pl.view, minute);
      if (fin.last && !fin.over) this.toast(`Last group on the 18th: ${fin.last.golfers.map(id => golferShort(pl.plan.golfers.find(g => g.id === id)?.name ?? '')).join(', ')}`, 'info');
      if (fin.over) { const line = championLine(pl.plan, pl.view); this.boardCache = null; if (line) this.toast(`${line} — ${this.golf ? tierInfo(this.golf.tier).name : ''}`, 'good'); else this.emit(); }
    }
  }
  /** the game minute the play is shown at: the town clock's minute of the day, held at the minute the round was over once the clock has run past the day's
   *  end (T210: the results stay open after the tournament day, when the town clock goes back to its normal rate and wraps at midnight) */
  private playMinute(pl: GolfPlay, minute: number): number { return pl.finish.over ? Math.max(minute, pl.finish.overAt) : minute; }
  /** T208 everyday golf, each frame: the day book steps to the town clock's day and minute (golf/everyday.ts DayBook: the day's roster from what the club
   *  is at its start, the check-ins booked as the minute passes them, at feeScale, as business takings floating up at the clubhouse; a tournament day
   *  closes the day). Then the day's playback (golf/everydayview.ts DayView: the round played at the day's first frame, from the roster), rebuilt when the
   *  day or the course's holes change; none on a tournament day, without a clubhouse or without holes. The movers and the balls read it */
  private updateEveryday(now: number) {
    const g = this.golf, tr = this.traffic;
    if (!g || !this.bizDefs.some(d => d.type === 'clubhouse')) { this.dayPlay = null; this.dropCrew(); return; }
    if (!this.dayBook || this.dayBookFor !== g) { this.dayBook = new DayBook(this.seed, normalizeDaySave(g.everyday)); this.dayBookFor = g; this.dayPlay = null; }
    const at = townTimeOf(tr.town, tr.simTime(now)), free = tr.round.stage === 'free';
    this.dayMinute = at.dayMin;
    const b = this.dayBook.step(at.day, at.dayMin, free, () => this.dayInputs(), feeScale(tr.dayLen), r => this.dayPaceOf(r, now));
    if (b.fees > 0) {
      tr.spend('business', -b.fees);
      const c = g.clubhouse; this.floatMoney({ x: c.x, y: c.y, amount: Math.round(b.fees), kind: 'in', group: 'clubhouse', gx: c.x, gy: c.y });
    }
    if (b.members + b.visitors > 0) this.scheduleSave();
    // the card follows the day (the golfers out, the waits): once a second while it is open
    if (this.clubCardOpen && (b.members + b.visitors > 0 || now - this.clubEmitAt > 1000)) { this.clubEmitAt = now; this.emit(); }
    const s = this.dayBook.save;
    if (!free || !s || s.closed || s.day !== at.day) { this.dayPlay = null; this.dropCrew(); return; }
    const course = this.dayCourseOf(now);
    if (!course || !course.view.holes.length) { this.dayPlay = null; this.dropCrew(); return; }
    if (!this.dayPlay || this.dayPlay.day !== s.day || this.dayPlay.key !== course.key) {
      const roster = this.dayBook.rosterOf()!, plan = dayPlan(course.view, roster);
      this.dayPlay = { view: new DayView(plan, roster, course.view, this.clubGround(g), this.cartPathsNow(), capped(this.golfPace) ? { walk: WALK_CAP, cart: CART_CAP, car: DAY_CAR_CAP } : null, this.ballHeight), day: s.day, key: course.key };
      this.dayArt = roster.golfers.map(p => GOLFER_ART[p.sex][p.look % GOLFER_ART[p.sex].length]!);
      this.buildCrew(g, plan, course.view, s.day); // T269: the grounds crew works round the day's groups
    }
    this.crewFlags(); // T269: a flag moves when the greenkeeper sets it
  }
  // ---------- T269 (#810) part 3: the grounds staff (golf/staff.ts) ----------
  /** the course needs a crew and has none: said once a session */
  private crewNagged = false;
  /** the holes the crew keeps: every hole with a pin */
  private staffHoles(): number[] { return [...new Set((this.golf?.pins ?? []).map(p => p.hole))].sort((a, b) => a - b); }
  /** the staff's state (golf.crew.staff); an old save, or a new game, hires the crew its course needs with every job done today */
  private staffNow(day?: number): StaffState {
    const g = this.golf!, had = g.crew?.staff; if (had) return had;
    const d = day ?? townTimeOf(this.traffic.town, this.traffic.simTime(performance.now())).day, s = freshStaff(d, this.staffHoles(), this.golfMonthIndex());
    this.setStaff(s); return s;
  }
  private setStaff(s: StaffState) { const g = this.golf; if (!g) return; g.crew = { phase: g.crew?.phase ?? [], mown: g.crew?.mown ?? [], staff: s }; }
  /** the crew's work for each town day since the last worked out, up to `day` (golf/staff.ts workDay, at most 60 days of a skip); with no clubhouse the
   *  course is not open: every job is done and the season counts nothing. Returns the state */
  private workStaff(day: number): StaffState {
    let s = this.staffNow(day); if (day <= s.day) return s;
    const holes = this.staffHoles();
    if (!this.hasClubhouse) s = { ...freshStaff(day, holes, s.paid, s.staff), season: s.season };
    else for (let d = Math.max(s.day + 1, day - 60); d <= day; d++) s = workDay(s, d, holes);
    this.setStaff(s);
    const need = crewNeed(holes.length);
    if (this.hasClubhouse && need.gk + need.mo > 0 && s.staff.gk + s.staff.mo === 0 && !this.crewNagged) {
      this.crewNagged = true; this.toast('Your course has no grounds crew: hire greenkeepers and mower operators in the Clubhouse card, or the grass grows long and the pins stay put', 'warn');
    }
    return s;
  }
  /** the crew's wages, each game month as it begins (golf/staff.ts payWages: a skip pays every month it crossed), booked as upkeep at the clubhouse */
  private payStaff() {
    const g = this.golf, st = g?.crew?.staff; if (!g || !st) return;
    const { s, due } = payWages(st, this.golfMonthIndex()); if (s === st) return;
    this.setStaff(s);
    if (due > 0) { const c = g.clubhouse; this.spendAt({ x: c.x, y: c.y, group: 'clubhouse', gx: c.x, gy: c.y }, 'upkeep', due); this.scheduleSave(); }
  }
  /** the quality factor of the course's condition (golf/staff.ts qualityFactor; 1 with no staff state yet) */
  private crewQuality(): number { const st = this.golf?.crew?.staff; return st ? qualityFactor(courseCondition(st)) : 1; }
  /** T269: hires (+1) or lets go (-1) a greenkeeper or a mower operator (the club card's Grounds crew): a hire is paid from the next month, a let-go
   *  costs a month's wage now (P26); the crew works its new size from the next morning */
  crewHire(role: StaffRole, delta: 1 | -1) {
    const g = this.golf; if (!g) return;
    const r = changeStaff(this.staffNow(), role, delta); if (!r) return;
    this.setStaff(r.s);
    if (r.cost > 0) { const c = g.clubhouse; this.spendAt({ x: c.x, y: c.y, group: 'clubhouse', gx: c.x, gy: c.y }, 'upkeep', r.cost); }
    this.toast(delta > 0 ? `Hired a ${ROLE_NAME[role][0]}: $${WAGE[role]} a month, at work from tomorrow morning` : `Let a ${ROLE_NAME[role][0]} go: a month's wage, $${WAGE[role]}`, delta > 0 ? 'good' : 'info');
    this.scheduleSave(); this.emit();
  }
  /** T269: the club card's Grounds crew block (null: no golf) */
  private crewCardView(): CrewCardView | null { return this.golf ? crewCard(this.staffNow(), this.staffHoles().length) : null; }
  // ---------- T269 (#810) part 2: the grounds crew (golf/crew.ts, crewground.ts, crewview.ts) ----------
  /** the day's crew: its day (the schedule), its playback, the town day it was made for, and the next cup event's minute (the flags) */
  private crew: { day: CrewDay; view: CrewView; town: number; nextCup: number } | null = null;
  /** the crew's ground per hole, kept with its key (the grid's rev and the holes' lines) */
  private crewGrounds: { key: string; m: Map<number, CrewGround> } | null = null;
  /** the crew's vehicles as movers (reused Drawables), and the pool they come from */
  private crewOut: Drawable[] = []; private crewThingDraw: Drawable[] = [];
  /** T269: the crew's size: the staff the player hired (part 3; before the staff state exists, the crew a course of its holes needs) */
  private crewSize(holes: number): { gk: number; mo: number } { return this.golf?.crew?.staff?.staff ?? crewFor(holes); }
  /** each hole's crew ground (golf/crewground.ts), read from the grid once per course (its rev and the holes' lines) */
  private crewGroundsNow(): Map<number, CrewGround> {
    const grid = this.courseGrid, g = this.golf; if (!grid || !g) return new Map();
    const lines = this.holeLines(), key = `${grid.rev}|${JSON.stringify([...lines])}`;
    if (this.crewGrounds?.key === key) return this.crewGrounds.m;
    // (the bands the ground draws: T227's finish's, along the line, else T218's own)
    const cells = crewCells(grid), base = fairwayStripeLook(), look = finishStripeLook(finishOf(paintedSurfaces()), base) ?? base, m = new Map<number, CrewGround>();
    for (const p of g.pins) {
      const next = g.tees.find(t => t.hole === p.hole + 1 && t.kind === 'back') ?? g.tees.find(t => t.hole === p.hole + 1) ?? null;
      m.set(p.hole, crewGround(grid, p.hole, cells.get(p.hole), lines.get(p.hole), look, this.greenOf(p.hole), next));
    }
    this.crewGrounds = { key, m }; return m;
  }
  /** the crew's day for town day `day` round the day's play (plan: its groups' times on each hole), on the day's course (each hole once) */
  private buildCrew(g: GolfSave, plan: RoundPlan, view: CourseView, day: number) {
    const holes = view.holes, N = holes.length, grounds = this.crewGroundsNow(), dp = g.dayPins;
    const size = this.crewSize(new Set(holes.map(h => h.n)).size);
    const done = plan.groups.map(gr => Math.max(...gr.players.map(id => plan.done[id] ?? 0)));
    const { windows, firstOn } = holeWindows(plan.pace?.arrive ?? [], done, N);
    const T = this.traffic, prof = T.town.prof, spm = (prof ? prof.k : 1) / Math.max(1e-6, T.town.rate); // (sim s a game minute in the golf hours)
    const crew = holes.map(h => {
      const ground: CrewGround = grounds.get(h.n) ?? { n: h.n, passes: [], rough: [], sands: [], greenPasses: [], park: null };
      const now = this.todayPin(h.n) ?? h.pin, old = (dp ? pinIn(dp.prev, h.n) : null) ?? now;
      return { ground, oldCup: { x: old.x, y: old.y }, newCup: { x: now.x, y: now.y }, moved: Math.hypot(now.x - old.x, now.y - old.y) > 0.5 };
    });
    // (part 3: the day's jobs as the staff worked them out, golf/staff.ts workDay; the rota before there is a day of them)
    const st = g.crew?.staff, jobs = st && st.day === day ? { greens: new Set(st.today.greens), sands: new Set(st.today.sands), fairways: new Set(st.today.fairways), rough: new Set(st.today.rough) } : rotaJobs(day, holes.map(h => h.n));
    const yard = this.dayPark?.entrances[0] ?? g.clubhouse;
    const pace = capped(this.golfPace);
    const cd = crewDay({ holes: crew, yard: { x: yard.x, y: yard.y }, gk: size.gk, mo: size.mo, ...jobs, windows, firstOn, pace: pace ? { walk: WALK_CAP * spm, cart: CART_CAP * spm } : null });
    this.crew = { day: cd, view: new CrewView(cd, pace ? { walk: WALK_CAP, cart: CART_CAP } : null), town: day, nextCup: -Infinity };
  }
  /** T269: the grounds crew's cut of each hole now (golf/crew.ts crewFlips: the saved phases and today's fresh stripes behind the mowers), as the
   *  course chunks carry it (CourseJob flips) */
  private mowFlips(): Map<number, number[]> {
    const g = this.golf; if (!g) return new Map();
    return crewFlips(g.crew ?? { phase: [], mown: [] }, this.crew?.day ?? null, this.crew?.town ?? -1, this.dayMinute);
  }
  /** T269: the stripes follow the mowers: every LINES_EVERY_MS the holes' cuts are compared with those last sent, and a hole's chunks round its line
   *  are sent again when its cut moved (a band cut: a few chunks once a pass); a fairway cut whole today takes its new phase into the save */
  private flipsSeen: Map<number, string> | null = null; private flipsAt = 0; private flipsKey = '';
  private watchMowFlips(now: number) {
    if (now - this.flipsAt < LINES_EVERY_MS) return; this.flipsAt = now;
    const g = this.golf, c = this.crew; if (!g || !this.courseGrid) return;
    // (nothing to do until a band is cut, the day turns or a phase changes: the bands cut by now, counted)
    let cut = 0; if (c) for (const e of c.day.mown) { if (e.t > this.dayMinute) break; cut++; }
    const key = `${c?.town ?? -1}|${cut}|${g.crew?.phase.join(',') ?? ''}|${this.courseGrid.rev}`; if (key === this.flipsKey) return; this.flipsKey = key;
    // a fairway cut whole today: its phase flips in the save (drawn the same: the cut covered it)
    if (c) {
      const done = fullyCut(c.day, new Map([...this.crewGroundsNow()].map(([h, q]) => [h, q.passes])), this.dayMinute), sv = normalizeCrewSave(g.crew), had = new Map(sv.mown); // (a copy: written back whole)
      let changed = false;
      for (const h of done) if (had.get(h) !== c.town) { const ph = new Set(sv.phase); if (ph.has(h)) ph.delete(h); else ph.add(h); sv.phase = [...ph].sort((a, b) => a - b); had.set(h, c.town); changed = true; }
      if (changed) { sv.mown = [...had]; g.crew = sv; this.scheduleSave(); }
    }
    const cur = this.mowFlips(), lines = this.holeLines(), moved = new Set<number>(), seen = this.flipsSeen;
    this.flipsSeen = new Map([...cur].map(([h, f]) => [h, f.join(',')]));
    // (the first look: the saved phases went with the first chunks; a cut of today's, made with the day's crew, may not have)
    if (!seen) { for (const [h, f] of cur) if (f[1]! >= 0) moved.add(h); }
    else {
      for (const [h, f] of cur) { const k = f.join(','); if (seen.get(h) !== k) moved.add(h); }
      for (const h of seen.keys()) if (!cur.has(h)) moved.add(h);
    }
    if (!moved.size) return;
    const R = LINES_REACH;
    for (const h of moved) {
      const l = lines.get(h); if (!l) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k + 1 < l.length; k += 2) { x0 = Math.min(x0, l[k]!); y0 = Math.min(y0, l[k + 1]!); x1 = Math.max(x1, l[k]!); y1 = Math.max(y1, l[k + 1]!); }
      this.sendCourseChunks([x0 - R, y0 - R, x1 + R, y1 + R]);
    }
  }
  /** no crew today (a tournament day, no clubhouse or no holes): the flags stand on today's cups */
  private dropCrew() { if (this.crew) { this.crew = null; this.syncFlags(); } }
  /** the flags follow the greenkeepers: when the minute passes a cup event the flags are synced (and once after the crew is made) */
  private crewFlags() {
    const c = this.crew; if (!c) return;
    if (this.dayMinute >= c.nextCup) {
      c.nextCup = c.day.cups.find(e => e.t > this.dayMinute)?.t ?? Infinity;
      this.syncFlags();
    }
  }
  /** the crew's stand-ins (until the art: GOLF-SPRITES.md "Grounds crew"): the greenkeeper a spectator in a bucket hat, the mower operator one in a cap */
  private static readonly CREW_ART: Record<'gk' | 'mo', number> = {
    gk: Math.max(0, SPECTATOR_PEOPLE.findIndex(p => p.id === 'spectator:spec_m_bucket_hat')), mo: Math.max(0, SPECTATOR_PEOPLE.findIndex(p => p.id === 'spectator:spec_m_young_cap')),
  };
  /** the crew's vehicles' stand-ins (the hire cart's two facings, the golf mower, the push mower, the ride-on), their footprints' half sides and labels */
  private static readonly CREW_VEH: Record<Exclude<CrewVeh, 'none'>, { items: number[]; label: string; r: number }> = {
    cart: { items: [libIndexOf('business:golf-cart-sw'), libIndexOf('business:golf-cart-se')], label: 'Stand In for utility cart', r: 0.6 },
    reel: { items: [libIndexOf('business:golf-mower')], label: 'Stand In for ride-on reel mower', r: 0.7 },
    push: { items: [libIndexOf('gen:lawnmower')], label: 'Stand In for walk-behind mower', r: 0.3 },
    rotary: { items: [libIndexOf('expansion:rideon-mower')], label: 'Stand In for rotary mower', r: 0.6 },
  };
  /** T269: the grounds crew in the tile box, from mover m on (as dayMovers): each worker as his stand-in person (labelled), his vehicles to crewOut.
   *  Returns the next mover index */
  private crewMovers(out: Drawable[], m: number, X0: number, Y0: number, X1: number, Y1: number, now: number): number {
    this.crewOut.length = 0; const c = this.crew; if (!c || this.dayOff) return m;
    const T = this.traffic, st = T.simTime(performance.now()), v = c.view; v.update(this.dayMinute, now, X0, Y0, X1, Y1, st, localRate(T.town, st));
    const t = this.crowdGolfers[3] ?? (this.crowdGolfers[3] = { x: 0, y: 0, group: 0, person: 0, row: 0, frame: 0 });
    for (const p of v.people) {
      if (p.x < X0 || p.x > X1 || p.y < Y0 || p.y > Y1) continue;
      t.group = 0; t.x = p.x; t.y = p.y; t.person = Game.CREW_ART[p.role]; t.row = p.row; t.frame = p.frame;
      crowdDrawable(out, m, t); if (p.lift) out[m]!.lift = p.lift; if (p.alpha < 1) out[m]!.alpha = p.alpha;
      this.caddieLabels.push({ p: out[m]!, text: p.role === 'gk' ? 'Stand In for greenkeeper' : 'Stand In for mower operator' }); m++;
    }
    let n = 0;
    for (const th of v.things) {
      if (th.veh === 'none' || th.x < X0 || th.x > X1 || th.y < Y0 || th.y > Y1) continue;
      const a = Game.CREW_VEH[th.veh], item = a.items.length > 1 ? a.items[th.hx - th.hy < 0 ? 0 : 1]! : a.items[0]!; if (item < 0) continue;
      const d = this.propDrawable(this.crewThingDraw, n++, item, th.x, th.y, a.r); if (th.alpha < 1) d.alpha = th.alpha;
      this.crewOut.push(d); this.caddieLabels.push({ p: d, text: a.label });
    }
    return m;
  }
  /** T208: the town day's minute everyday golf is played back at (set each frame) and each everyday golfer's art (indices into GOLFER_PEOPLE) */
  private dayMinute = 0; private dayArt: number[] = []; private dayBookFor: GolfSave | null = null; private clubEmitAt = 0; private dayPark: CarPark | null = null;
  /** T208: the everyday cars as movers (reused Drawables, rangehost.ts's way: their facing's picture at CAR_SCALE about their centre) */
  private dayCarDraw: Drawable[] = []; private dayCarOut: Drawable[] = [];
  /** T208: the pace of a day's roster for the season's pace term: the day on screen's plan, else the day played now (a day a skip jumped) */
  private dayPaceOf(r: DayRoster, now: number) {
    if (this.dayPlay && this.dayPlay.view.roster === r) return dayPace(this.dayPlay.view.plan);
    const c = this.dayCourseOf(now); return c && c.view.holes.length ? dayPace(dayPlan(c.view, r)) : null;
  }
  /** T208: the played course for everyday golf, rebuilt when the tees, pins or aim points change (looked at every 2 s) */
  private dayCourseOf(now: number): { view: CourseView; key: string } | null {
    const g = this.golf; if (!g) return null;
    const c = this.dayCourse;
    if (c && now - c.at < 2000) return c;
    const key = JSON.stringify([g.tees, g.pins, g.aims, g.dayPins?.today ?? null]); // (T269: and the day's cups)
    if (c && c.key === key) { c.at = now; return c; }
    this.dayCourse = { view: dayCourse(this.playCourse(g)), key, at: now }; // (each hole once: a 9-hole course is a 9-hole round)
    return this.dayCourse;
  }
  // ---------- T269 (#810): the day's pins (golf/daypins.ts) ----------
  /** today's cup of hole n: the day's (golf.dayPins), else its placed pin; null: no pin */
  todayPin(n: number): Pt | null {
    const g = this.golf; if (!g) return null;
    const t = g.dayPins ? pinIn(g.dayPins.today, n) : null; if (t) return t;
    return g.pins.find(p => p.hole === n) ?? null;
  }
  /** sets hole n's cup today (a pin put down or dragged is today's cup) */
  private setTodayPin(n: number, x: number, y: number) {
    const s = this.golf?.dayPins; if (!s) return; // (no day pins yet: the placed pins are today's)
    const t = pinIn(s.today, n); if (t) { t.x = x; t.y = y; } else s.today.push({ hole: n, x, y });
    this.pinRev++; this.dayCourse = null;
  }
  /** the point before hole n's pin on its line of play (its last aim point, else its back tee); null: none */
  private approachOf(n: number): Pt | null {
    const g = this.golf; if (!g) return null;
    const aims = (g.aims ?? []).filter(q => q.hole === n).sort((p, q) => p.order - q.order), a = aims[aims.length - 1];
    if (a) return { x: a.x, y: a.y };
    const t = g.tees.find(q => q.hole === n && q.kind === 'back') ?? g.tees.find(q => q.hole === n);
    return t ? { x: t.x, y: t.y } : null;
  }
  /** hole n's green round its placed pin (golf/daypins.ts greenAt), kept until the grid, the pin or its approach changes */
  private greenOf(n: number): GreenShape | null {
    const g = this.golf, grid = this.courseGrid; if (!g || !grid) return null;
    const pin = g.pins.find(p => p.hole === n); if (!pin) return null;
    const from = this.approachOf(n), key = `${grid.rev}|${pin.x},${pin.y}|${from ? `${from.x},${from.y}` : ''}`, c = this.greens.get(n);
    if (c?.key === key) return c.g;
    const gr = greenAt(grid, n, pin.x, pin.y, from); this.greens.set(n, { key, g: gr }); return gr;
  }
  /** the rota's new cup for hole n on town day `day`, away from yesterday's (golf/daypins.ts choosePin on its green, on T263's slopes) */
  private nextPin(day: number, n: number, prev: Pt): Pt | null {
    const { depth, side } = pinSlot(day, n), f = this.courseHeight;
    return choosePin(this.greenOf(n), depth, side, prev, f.rev ? (x, y) => courseSlopeAt(f, x, y).mag : null, this.seed, day, n);
  }
  /** T269, each frame in golf: a new town day cuts every hole's cup anew (rollDayPins; an old save's cups are its placed pins); every 2 s, when the
   *  grid or the pins changed, a cup no longer on its hole's green goes back to the placed pin. The flags follow the cups */
  private updateDayPins(now: number) {
    const g = this.golf; if (!g) return;
    const tr = this.traffic, day = townTimeOf(tr.town, tr.simTime(now)).day;
    if (!g.dayPins || g.dayPins.day !== day) {
      // T269 part 3: the day's work first (golf/staff.ts): only the cups the greenkeepers change today move; the others keep yesterday's pin
      const cut = new Set(this.workStaff(day).today.cups);
      g.dayPins = rollDayPins(g.dayPins ?? null, day, g.pins.map(p => ({ hole: p.hole, x: p.x, y: p.y })), (n, prev) => (cut.has(n) ? this.nextPin(day, n, prev) : null));
      this.pinRev++; this.dayCourse = null; this.scheduleSave();
    }
    if (now - this.pinsCheckedAt >= 2000) { this.pinsCheckedAt = now; this.checkDayPins(); this.payStaff(); }
    if (this.flagRev !== this.pinRev) this.syncFlags();
  }
  /** the day's cups against the course (when the grid or the pins changed): a hole with no cup today is given its placed pin, and a cup no longer on
   *  its hole's green (repainted, the pin moved) goes back to the placed pin */
  private checkDayPins() {
    const g = this.golf, grid = this.courseGrid, s = g?.dayPins; if (!g || !s) return;
    const key = () => `${grid?.rev ?? -1}|${this.pinRev}|${g.pins.length}`; if (key() === this.pinsCheckKey) return;
    let moved = false;
    for (const p of g.pins) {
      const t = pinIn(s.today, p.hole);
      if (!t) { s.today.push({ hole: p.hole, x: p.x, y: p.y }); moved = true; continue; }
      if (!grid || (t.x === p.x && t.y === p.y)) continue;
      const i = cellAt(grid, t.x, t.y);
      if (i < 0 || grid.surf[i] !== SURF.green || grid.hole[i] !== p.hole) { t.x = p.x; t.y = p.y; moved = true; }
    }
    if (moved) { this.pinRev++; this.dayCourse = null; this.scheduleSave(); }
    this.pinsCheckKey = key();
  }
  /** where hole n's flag stands now: today's cup, once the greenkeeper has set it (T269 part 2: until his cup event, yesterday's) */
  private shownPin(n: number): Pt | null {
    const t = cupSetAt(this.crew?.day ?? null, n), prev = this.golf?.dayPins ? pinIn(this.golf.dayPins.prev, n) : null;
    return t !== null && this.dayMinute < t && prev ? prev : this.todayPin(n);
  }
  /** the flags (the pins' props, golfProps) to the cups shown now: moved in place (propChanged; a flag casts nothing, so no ground re-bakes) */
  private syncFlags() {
    const g = this.golf; this.flagRev = this.pinRev; if (!g) return;
    for (const p of g.pins) {
      const pr = this.golfProps.get('pin:' + p.hole), at = this.shownPin(p.hole); if (!pr || !at) continue;
      if (Math.abs(pr.x - at.x) > 1e-6 || Math.abs(pr.y - at.y) > 1e-6) { pr.x = at.x; pr.y = at.y; this.propChanged(pr); }
    }
  }
  /** T269: the hole card's line for hole n's cup today ("back left · 24 m on, 5 m from the left edge"); null: no green to read it on */
  todayPinText(n: number): string | null {
    const p = this.todayPin(n), gr = p ? this.greenOf(n) : null;
    return p && gr ? pinLine(pinReport(gr, p)) : null;
  }
  /** T208: the club's ground for the everyday golfers' walks and cars: the clubhouse's door, and the car park that serves it (T237: the nearest
   *  walk of those within WALK_SERVE_M, golf/walkserve.ts; none in reach: no bays, so the golfers find no parking) with its bays (nearest the
   *  door first, doorBays: the worker's cars there fill from the far end; the tournament's and the everyday golfers' never share a day) and its first entrance */
  private clubGround(g: GolfSave): ClubGround {
    const door = g.clubhouse, parks: CarPark[] = [];
    for (const pk of this.parkBuilt) if (pk && pk.bays.length) parks.push(pk);
    const pk = servingParks(parks, door, q => q.bays)[0]?.park ?? null; this.dayPark = pk;
    if (!pk) return { door, bays: [], entrance: null };
    // (T237: each bay's drive from the mouth along the aisles, and its golfers' walk to the door: along the aisles to the footpath, then on it)
    const f = this.footStart(pk), foot = this.parkLooks.get(pk.id)?.path ?? [], via = foot.length > 1 ? [this.pathMid(foot[0]!)] : [];
    return { door, bays: this.doorBays(pk).map(b => ({ x: b.x, y: b.y, hx: b.hx, hy: b.hy, drive: bayDrive(pk, b), walk: f ? [...bayWalk(pk, b, f).reverse(), ...via] : [] })), entrance: pk.entrances[0] ?? null };
  }
  /** T213: the course's cart paths for the carts (golf/play/carts.ts): the network's cart paths (not the narrow walking paths) and course drives, as
   *  straight centre lines; null with none */
  private cartPathsNow(): CartPaths | null {
    const lines: { a: Pt; b: Pt }[] = [];
    for (const s of this.net.segs) {
      const c = s.cls;
      if ((c.family === 'cart' && c.base !== 'cart-walk') || c.family === 'course') lines.push({ a: { x: s.a.x, y: s.a.y }, b: { x: s.b.x, y: s.b.y } });
    }
    return lines.length ? cartPaths(lines) : null;
  }
  /** T208: the everyday golfers in the tile box as movers, from mover m on (as playMovers), after the day's playback is updated for the box; the cars go
   *  to dayCarOut. Returns the next mover index */
  private dayMovers(out: Drawable[], m: number, X0: number, Y0: number, X1: number, Y1: number, now: number): number {
    const d = this.dayPlay; this.dayCarOut.length = 0; if (!d || this.dayOff) return m; // (?everyday=0: the bench's same scene with none drawn)
    const T = this.traffic, st = T.simTime(performance.now()), v = d.view; v.update(this.dayMinute, now, X0, Y0, X1, Y1, st, localRate(T.town, st)); // (T266: the watchable golfers walk in sim seconds)
    const t = this.crowdGolfers[1] ?? (this.crowdGolfers[1] = { x: 0, y: 0, group: 1, person: 0, row: 0, frame: 0 });
    for (const p of v.people) { t.x = p.x; t.y = p.y; t.person = this.dayArt[p.golfer] ?? 0; t.row = p.row; t.frame = p.frame; crowdDrawable(out, m, t); if (p.lift) out[m]!.lift = p.lift; if (p.alpha !== undefined && p.alpha < 1) out[m]!.alpha = p.alpha; m++; }
    this.cartDrawables(v.carts, this.dayCarOut, X0, Y0, X1, Y1); // T213: the carts
    const F = facings();
    for (let k = 0; k < v.cars.length; k++) {
      const c = v.cars[k]!, f = F[c.type % 5]![carHeading(c.ang)]!, z = CAR_SCALE * f.size;
      const dr = this.dayCarDraw[k] ?? (this.dayCarDraw[k] = { item: 0, x: 0, y: 0, flip: false, scale: CAR_SCALE, x0: 0, y0: 0, x1: 0, y1: 0, moving: true });
      dr.item = f.item; dr.flip = f.flip; dr.scale = z; dr.moving = true; dr.alpha = c.alpha; dr.paint = TYPE_PAINTS[c.type % TYPE_PAINTS.length]; // (T228: a paint per car type)
      dr.x = c.x - f.ox * z; dr.y = c.y - f.oy * z; dr.x0 = c.x - f.hx * z; dr.x1 = c.x + f.hx * z; dr.y0 = c.y - f.hy * z; dr.y1 = c.y + f.hy * z;
      this.dayCarOut.push(dr);
    }
    return m;
  }
  /** T208: the clubhouse card (null: closed, or no clubhouse) */
  clubCard(): ClubCardView | null {
    const g = this.golf, bk = this.dayBook;
    if (!this.clubCardOpen || !g || !bk || !this.bizDefs.some(d => d.type === 'clubhouse')) return null;
    return { ...clubCardView(bk, this.dayPlay?.view ?? null, this.dayMinute, this.traffic.round.stage === 'free', g.rep, feeScale(this.traffic.dayLen)), lots: this.lotsFor(g.clubhouse), crew: this.crewCardView() ?? undefined }; // (T237: its car parks; T269: its crew)
  }
  /** T208: opens or closes the clubhouse card (the select tool's click on the clubhouse, the top bar's Club chip) */
  openClubCard(open = !this.clubCardOpen) { this.clubCardOpen = open && !!this.golf && this.bizDefs.some(d => d.type === 'clubhouse'); if (this.clubCardOpen && this.range.cardOpen) this.range.cardOpen = false; this.emit(); }
  /** T208: whether the game has a clubhouse (the top bar's Club chip) */
  get hasClubhouse(): boolean { return !!this.golf && this.bizDefs.some(d => d.type === 'clubhouse'); }
  /** T208: the everyday golfers out at the club now (checked in, not yet back at their car; the bench logs it) */
  /** T251 (dev): where most of the tournament's golfers are (the bench's and the captures' camera); null with no play */
  playFocus(): Pt | null { const P = this.play?.pv.people; if (!P?.length) return null; let best: Pt | null = null, bn = -1; for (const p of P) { let n = 0; for (const q of P) if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < 50) n++; if (n > bn) { bn = n; best = { x: p.x, y: p.y }; } } return best; }
  dayOutNow(): number { return this.dayPlay ? this.dayPlay.view.outNow(this.dayMinute) : 0; }
  /** T208: the busiest spot of the everyday golfers now (the golfer with the most others within 50 tiles) (the bench's camera; null: none) */
  dayFocus(): Pt | null { const v = this.dayPlay?.view; if (!v) return null; { const T = this.traffic, st = T.simTime(performance.now()); v.update(this.dayMinute, performance.now() / 1000, -1e6, -1e6, 1e6, 1e6, st, localRate(T.town, st)); } let best: Pt | null = null, bn = -1; for (const p of v.people) { let n = 0; for (const q of v.people) if (Math.abs(q.x - p.x) + Math.abs(q.y - p.y) < 50) n++; if (n > bn) { bn = n; best = { x: p.x, y: p.y }; } } return best; }
  /** the eval's results screen is open (T210, resultsDue): in the eval, outside golf at once; on the tournament day once the last group is in (or at once
   *  with no play to wait for, or when the player asked for the results early); not while the play is not built yet (the first frame after a load) */
  resultsOpen(): boolean {
    const r = this.traffic.round, waitPlay = !!this.golf && r.stage === 'eval';
    return resultsDue(r.stage, !!this.golf, !waitPlay ? null : this.playTried !== r.runs ? undefined : this.play ? this.play.finish : null, this.resultsEarly);
  }
  /** the results now, before the last group is in (T210: today's early leave kept; the screen says who leads, and Back to the valley ends the day) */
  showResultsNow() { if (this.traffic.round.stage !== 'eval') return; this.resultsEarly = true; this.emit(); }
  /** the camera to the last group on the 18th (T210, the board's Watch): the middle of its golfers still out, at the current zoom */
  watchLastGroup() {
    const pl = this.play, lg = pl?.finish.last; if (!pl || !lg || pl.finish.over) return;
    const tr = this.traffic, m = this.playMinute(pl, townTimeOf(tr.town, tr.simTime(performance.now())).dayMin), st = stateAt(pl.plan, pl.view, m);
    const at = st.filter(s => lg.golfers.includes(s.golfer)); if (!at.length) return;
    this.lookAt(at.reduce((a, s) => a + s.x, 0) / at.length, at.reduce((a, s) => a + s.y, 0) / at.length);
  }
  /** T211: toasts the wave-throughs (plan.pace.waves, in time order) the minute has passed since the last frame; at the first frame only counts them */
  private toastWaves(pl: GolfPlay, minute: number) {
    const ws = pl.plan.pace?.waves; if (!ws) return;
    if (pl.waves < 0) { pl.waves = 0; while (pl.waves < ws.length && ws[pl.waves]!.t <= minute) pl.waves++; return; }
    while (pl.waves < ws.length && ws[pl.waves]!.t <= minute) this.toast(waveLine(pl.plan, pl.view, ws[pl.waves++]!), 'info');
  }
  /** T209: ends a resumed tournament day's wait (dayHold) once its play is back (ready: built, or none to build; the owner's shot, opened by ownerFrame,
   *  keeps the sim paused and goes on at the held speed), or DAY_HOLD_MS after the first frame when the day did not come back (the round loaded free) */
  private holdDay(now: number, ready: boolean) {
    const h = this.dayHold; if (!h) return;
    if (!h.at) h.at = now;
    if (!ready && now - h.at < DAY_HOLD_MS) return;
    this.dayHold = null;
    if (this.shot) this.shotSpeed = h.speed; else this.setSpeed(h.speed);
  }
  /** the holes the crowd follows at a game minute (docs/GOLF-PLAY.md decision 6), sorted, no repeats: the holes the last three groups are on (the marquee
   *  groups tee off last) and the holes of the top three of the standings, among the golfers who have teed off and are not done. A golfer's hole is its
   *  PlayHole.n (a 9-hole course's second nine repeats its numbers, as do the spots' holes) */
  private featuredHoles(pl: GolfPlay, minute: number): number[] {
    const { plan, view } = pl, st = stateAt(plan, view, minute), holes = new Set<number>();
    const out = (id: number) => plan.done[id]! > minute;
    const add = (id: number) => { const s = st.find(q => q.golfer === id), h = s ? view.holes[s.hole] : undefined; if (h) holes.add(h.n); };
    for (const gr of plan.groups.slice(-3)) if (minute >= gr.tee) for (const id of gr.players) if (out(id)) add(id);
    let top = 0;
    for (const s of standings(plan, view, minute)) { if (!out(s.golfer)) continue; add(s.golfer); if (++top === 3) break; }
    return [...holes].sort((a, b) => a - b);
  }
  /** the featured holes to the city when they differ from the last sent (the city's set is replaced whole: see SimClient.setFeatured) */
  private sendFeatured(holes: number[]) {
    const f = this.featured;
    if (holes.length === f.length && holes.every((h, i) => h === f[i])) return;
    this.featured = holes; this.traffic.setFeatured(holes);
  }
  /** no play: the city follows no golfers (the featured holes cleared, sent once when they were set) */
  private clearFeatured() { if (this.featured.length) this.sendFeatured([]); }
  /** the day's leaderboard (docs/GOLF-PLAY.md decision 8; the panel and the eval line read it): null with no play. The minute, the rows (boardRows: the
   *  top 8 and the owner's row below them, the owner the one golfer marked owner), the champion's line once everyone is done, done, and the tournament's
   *  name. Recomputed at most every 250 ms */
  playBoard(): PlayBoard | null {
    const pl = this.play; if (!pl) return null;
    const now = performance.now(), c = this.boardCache;
    if (c && c.play === pl && now - c.at < 250) return c.board;
    const tr = this.traffic, plan = pl.plan, minute = this.playMinute(pl, townTimeOf(tr.town, tr.simTime(now)).dayMin), ownerId = plan.golfers.find(g => g.owner)?.id ?? null;
    const fin = pl.finish, last = fin.last && !fin.over ? fin.last.golfers.map(id => golferShort(plan.golfers.find(g => g.id === id)?.name ?? '')) : null;
    const board: PlayBoard = {
      minute, rows: boardRows(standings(plan, pl.view, minute), plan.golfers, BOARD_ROWS, ownerId).map(r => ({ ...r, wait: waitText(plan, pl.view, r.golfer, minute) })), champion: championLine(plan, pl.view, minute),
      done: plan.golfers.every(g => plan.done[g.id]! <= minute), event: this.golf ? tierInfo(this.golf.tier).name : '', ownerTee: pl.own?.tee ?? null,
      last, waiting: tr.round.stage === 'eval' && !fin.over && !this.resultsEarly,
    };
    this.boardCache = { play: pl, at: now, board };
    return board;
  }
  /** the round of a tournament key (see updatePlay): the course's played holes (the course grid's surface where it is painted, else the painted
   *  areas), the field at the tier, its tee times and the round, all from a seed of the map's seed and the key. With an owner (P4b: a join, or the
   *  save's play), his golfer joins the field as the next id, his group is played live (startOwner: his saved inputs replayed, then the caddie if he
   *  handed over) and his next turn is due. Null with no holes to play */
  private buildPlay(key: number, owner: GolfPlaySave | null): GolfPlay | null {
    const g = this.golf; if (!g) return null;
    const view = this.playCourse(g);
    if (!view.holes.length) return null;
    // the field, the tee times, the round and the owner's live group (dayRound: the same pure build a reload makes, T209)
    const seed = Math.floor(hash(this.seed, key) * 4294967296), { plan, golfers, own } = dayRound(view, g.tier, seed, owner);
    const art = golfers.map(p => p.owner ? ownerArt(p.sex) : GOLFER_ART[p.sex][p.look % GOLFER_ART[p.sex].length]!);
    const pl: GolfPlay = { plan, view, pv: new PlayView(plan, view, { paths: this.cartPathsNow(), home: g.clubhouse, pace: this.playPace(), height: this.ballHeight }), key, art, finish: new DayFinish(), own: null, waves: -1 };
    if (owner && own) pl.own = { id: own.id, sex: owner.owner, skill: OWNER_SKILL, tee: own.tee, live: own.live, turn: own.turn, caddie: owner.caddie, ...(owner.tees ? { tees: owner.tees } : {}) };
    return pl;
  }
  /** the played course (docs/GOLF-PLAY.md P2a): the derived holes with a line, the lie from the course grid's surface where it is painted, else the painted
   *  areas (the tournament's round and everyday golf, T208) */
  private playCourse(g: GolfSave): CourseView {
    const areas = this.courseAreaList(), grid = this.courseGrid;
    // T253 (#735): where Round off reshaped a surface the lie follows the drawn shape (course-blobs DrawnSurfaces: the same droplet field as
    // the chunks); elsewhere, and on a course with nothing rounded, the cell's surface as before
    // the drawn shape cut a corner off: the areas are read without that surface's own (their outlines are the cells'), its collars kept
    const drawn = grid ? drawnSurfaces(grid, this.courseLooks()) : null, but = new Map<number, CourseAreaRec[]>();
    const areasBut = (c: number) => { let v = but.get(c); if (!v) { v = areas.filter(a => { const q = a as Partial<GridArea>; return q.s !== c || !!q.collar; }); but.set(c, v); } return v; };
    // T271: a custom grass plays as its grass (the cells hold that surface; the first cut's hold rough, so the lie reads the grass's own play)
    const plays = this.grassPlays();
    const surfAt = (x: number, y: number): GolfSurface | null => {
      const i = grid ? cellAt(grid, x, y) : -1, c = i >= 0 ? grid!.surf[i]! : 0;
      // the surface drawn on top (the rounded outlines' where they are near, else the cell's): a draw id, so a custom grass is its own
      const d0 = drawn && i >= 0 ? drawn.at(x, y) : i >= 0 && grid!.draw ? grid!.draw[i]! : c;
      const k = grassSlot(d0), p = k ? plays.get(k) : undefined, d = k ? (p ? PLAY_SURF[p] : c) : d0;
      const s = i >= 0 ? (p ? golfSurfaceOf(p) : SURF_SURFACE[d]) : null;
      return s ?? surfaceAt(d !== c && c ? areasBut(c) : areas, x, y);
    };
    // T269: play reads the day's cups (golf/daypins.ts): the pin and the end of each line; the par and the tees are the placed pin's
    return withDayPins(makeCourseView(deriveHoles(areas, g.tees, g.pins, g.aims), surfAt), n => this.todayPin(n));
  }
  /** the round of a tournament key from the save: the save's owner play when it is this tournament's (buildPlay replays his inputs). A save the course no
   *  longer fits (its inputs throw) is dropped, and the day is played without him */
  private buildPlaySaved(key: number): GolfPlay | null {
    const s = this.golf?.play;
    if (s && s.key === key) {
      try { return this.buildPlay(key, s); } catch { if (this.golf) delete this.golf.play; this.scheduleSave(); }
    }
    return this.buildPlay(key, null);
  }
  /** whether the owner can join the day's tournament (docs/GOLF-PLAY.md decision 7): the play exists with no owner yet, and the game minute is before
   *  FIRST_TEE - 10 (the window closes ten minutes before the first tee) */
  canJoinTournament(): boolean {
    const pl = this.play; if (!pl || pl.own) return false;
    const tr = this.traffic; return townTimeOf(tr.town, tr.simTime(performance.now())).dayMin < FIRST_TEE - 10;
  }
  /** joins the tournament as the owner (P4b): the play is rebuilt with his golfer in the first group (the same seed and key; his first turn is due) and
   *  the save records him. `sex` picks his look: golf_am_m3 for 'm', golf_am_w1 for 'w' */
  joinTournament(sex: Sex, tees: TeeKind = 'middle') {
    const pl = this.play; if (!pl || !this.canJoinTournament()) return;
    const built = this.buildPlay(pl.key, { key: pl.key, owner: sex, inputs: [], caddie: null, tees }); // T254: from the tee set he chose
    if (!built) return;
    this.play = built; this.saveOwner(); this.emit();
  }
  /** the owner's open shot for the shot panel, or null */
  shotState(): ShotState | null { return this.shot; }
  /** the owner's club for the open shot: one his lie allows (allowedClubs; the driver only from the tee). The power resets to what carries the distance to
   *  the aim (powerFor) */
  setShotClub(c: Club) {
    const s = this.shot, own = this.play?.own; if (!s || !own || !allowedClubs(s.turn.lie, s.turn.lie === 'tee').includes(c)) return;
    const dM = Math.hypot(s.input.aim.x - s.turn.ball.x, s.input.aim.y - s.turn.ball.y) * TILE_M;
    this.shot = { ...s, input: { club: c, aim: s.input.aim, power: powerFor(c, dM, own.skill) } }; this.emit();
  }
  /** the owner's power for the open shot: clamped to the club's range (30% to 100% of the full carry; a putt 50% to 150% of its length) */
  setShotPower(p: number) {
    const s = this.shot; if (!s || !Number.isFinite(p)) return;
    const r = s.input.club === 'putter' ? PUTT_POWER : POWER;
    this.shot = { ...s, input: { ...s.input, power: Math.min(r[1]!, Math.max(r[0]!, p)) } }; this.emit();
  }
  /** the owner's aim: a point on the course (a click, not a drag, while his shot is open). The power follows (powerFor), so the ring is where he means the
   *  ball to land: a click 30 m out with the driver at 100% would otherwise fly the full carry past it */
  private aimAt(t: Pt) {
    const s = this.shot, own = this.play?.own; if (!s) return;
    const aim = { x: t.x, y: t.y }, dM = Math.hypot(aim.x - s.turn.ball.x, aim.y - s.turn.ball.y) * TILE_M;
    const power = own && s.input.club !== 'putter' ? powerFor(s.input.club, dM, own.skill) : s.input.power;
    this.shot = { ...s, input: { ...s.input, aim, power } }; this.emit();
  }
  /** the owner's hit (P4b): plays his shot from the panel's input, plays the day on to his next turn, closes the shot (the sim resumes) and saves. When his
   *  group is done, his score is toasted */
  ownerHit() {
    const s = this.shot, pl = this.play, own = pl?.own; if (!s || !pl || !own) return;
    const i = s.input;
    own.live.play({ holeIdx: s.turn.holeIdx, stroke: s.turn.stroke, club: i.club, aim: i.aim, power: i.power });
    own.turn = own.live.advance();
    this.closeShot(); this.saveOwner();
    if (!own.turn) this.ownerDone(pl);
    this.emit();
  }
  /** the owner hands the rest to the caddie (P4b): the model plays his group on, the shot closes (the sim resumes), the save records how many inputs he had
   *  played, and his score is toasted (the group is done at once) */
  ownerCaddie() {
    const s = this.shot, pl = this.play, own = pl?.own; if (!s || !pl || !own) return;
    own.live.caddie(); own.caddie = own.live.inputs.length; own.turn = own.live.advance();
    this.closeShot(); this.saveOwner();
    if (!own.turn) this.ownerDone(pl);
    this.emit();
  }
  /** the owner's address (P4b, every frame): once his turn is due (the minute is OWNER_ADDRESS game minutes before his strike) and no shot is open, the sim
   *  pauses (its speed remembered), the camera goes to his ball at the closest zoom, and the shot opens on the suggested club, aim and power */
  private ownerFrame(minute: number) {
    const own = this.play?.own, t = own?.turn; if (!own || !t || this.shot || minute < t.t - OWNER_ADDRESS) return;
    this.shotSpeed = this.speed || this.lastSpeed; this.setSpeed(0);
    this.shot = { turn: t, input: { club: t.suggested.club, aim: { x: t.suggested.aim.x, y: t.suggested.aim.y }, power: t.suggested.power } };
    this.lookAt(t.ball.x, t.ball.y, ZOOM_MAX);
  }
  /** closes the open shot and resumes the sim at the speed it had (at least 1x) */
  private closeShot() { this.shot = null; this.setSpeed(Math.max(1, this.shotSpeed)); }
  /** writes the owner's play to the save (GolfSave.play): his tournament key, sex, the inputs he has played and his caddie count */
  private saveOwner() {
    const pl = this.play, o = pl?.own; if (!pl || !o || !this.golf) return;
    this.golf.play = { key: pl.key, owner: o.sex, inputs: o.live.inputs.slice(), caddie: o.caddie, ...(o.tees ? { tees: o.tees } : {}) };
    this.scheduleSave();
  }
  /** toasts the owner's score once his group is done ("You shot 82 (+10)") */
  private ownerDone(pl: GolfPlay) {
    const id = pl.own?.id; if (id === undefined) return;
    const total = pl.plan.strokes[id]!.reduce((a, b) => a + b, 0), par = pl.view.holes.reduce((a, h) => a + h.par, 0);
    this.toast(`You shot ${total} (${toParText(total - par)})`, 'good');
  }
  /** the owner's open shot on the course (P4b, the 2D overlay): a line from his ball to the aim, a white ring at the aim, his ball, and for a full shot the
   *  faint ellipse of its expected spread at the landing point (the carry along the aim): two sigmas along (0.03 + 0.07 * (1 - skill) of the carry) and
   *  across ((1.5 + 5 * (1 - skill)) degrees) */
  private drawShot(ctx: CanvasRenderingContext2D) {
    const s = this.shot, own = this.play?.own; if (!s || !own) return;
    const i = s.input, t = s.turn, dpr = this.dpr, b = this.screen(t.ball.x, t.ball.y), a = this.screen(i.aim.x, i.aim.y);
    ctx.save();
    if (i.club !== 'putter') {
      const L = Math.hypot(i.aim.x - t.ball.x, i.aim.y - t.ball.y) || 1, ux = (i.aim.x - t.ball.x) / L, uy = (i.aim.y - t.ball.y) / L;
      const carry = carryM(i.club, own.skill) * i.power / TILE_M, k = 1 - own.skill;
      const px = t.ball.x + ux * carry, py = t.ball.y + uy * carry, A = 2 * (0.03 + 0.07 * k) * carry, B = 2 * carry * Math.tan((1.5 + 5 * k) * Math.PI / 180);
      const c = this.screen(px, py), e1 = this.screen(px + ux * A, py + uy * A), e2 = this.screen(px - uy * B, py + ux * B);
      // the unit circle through the spread's axes (their screen vectors from the landing point), filled faint
      ctx.save(); ctx.transform(e1.x - c.x, e1.y - c.y, e2.x - c.x, e2.y - c.y, c.x, c.y); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    }
    ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x, a.y, 6 * dpr, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x, b.y, 3 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#f8fafc'; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- main loop ----------
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    // real play seconds of a golf game while the sim runs (T033): stops at the stuck player's mark (T117: 20 minutes), so the save does not churn
    const pdt = this.lastFrame ? Math.min(0.25, (now - this.lastFrame) / 1000) : 0; this.lastFrame = now; const gp = this.golf?.progress; if (gp && this.speed > 0 && gp.playS < STUCK_PLAY_SEC) gp.playS += pdt;
    this.perf.courseMs = this.cMs; this.cMs = 0; this.perf.lotFlushMs = 0;
    if (this.grassWait.size) { const tg = performance.now(); this.courseGrass(1); this.cMs += performance.now() - tg; }
    if (++this.surveyTick % 30 === 0) this.syncSurvey(); // T232
    this.applyLotQueue(); this.applyFarmQueue(); if (this.cgDirty && performance.now() - this.cgSentAt >= this.courseSendMs) { const tc = performance.now(); this.flushCourse(); this.cMs += performance.now() - tc; } this.watchHoleLines(performance.now()); this.watchMowFlips(performance.now()); this.flushLotGround(); this.flushCasters(); this.laybyLots();
    // the farms yield to the lots the town builds on (checked about once a second: the count walks every lot)
    if (this.farmsEnabled && ++this.farmTick % 60 === 0 && this.farmMap.stale(claimedLots(this.traffic.lots), this.site, this.farmParks().length)) this.farmsUpdate(true);
    // T259: the farms' fields and orchards by the month (checked four times a second; only the farms whose look changes compose again)
    if (this.farmsEnabled && this.farmTick % 15 === 7) this.farmSeasonTick();
    if (this.traffic.round.cards.length > this.cardsApplied) this.applyCards();
    this.yearCheck(); this.foundingCheck(); this.progressCheck(); this.ghostTreesCheck(); this.ghostFrameCheck(performance.now()); // T176, T229
    const t0 = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000), frameMs = now - this.last; this.last = now;
    this.resize();
    const sp = 900 / this.cam.z * dt; let kx = 0, ky = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) kx -= 1; if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) ky -= 1; if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) ky += 1;
    if (kx || ky) { this.camEase = null; this.cam.X += kx * sp * 0.6; this.cam.Y += ky * sp * 0.6; this.clampCam(); }
    else this.stepCamEase(now);
    this.onFrame?.(now, dt);
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl));
        for (let k = 0; k < 3; k++) { const s = (Math.random() - 0.5) * 2 * b.cls.h, q = add(f, mul(n, s)); this.particles.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 1.5 - u.x * 0.4, vy: (Math.random() - 0.5) * 1.5 - u.y * 0.4, vz: 0.8 + Math.random() * 1.6, z: 0, life: 0.7 + Math.random() * 0.7, age: 0, r: 0.3 + Math.random() * 0.5 }); }
      });
    }
    this.builds = this.builds.filter(b => now < b.t0 + b.dur + 150);
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 0.8 * dt; p.r += 0.6 * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
    this.traffic?.update(now);
    // T147: the money floats: the old ones go, then the city worker's money with its place (the range's comes as it steps)
    this.floats.frame(now / 1000);
    if (this.traffic?.cash.length) { if (this.showMoneyFloats) addCash(this.floats, this.traffic.cash, now / 1000, this.cam.z); this.traffic.cash.length = 0; }
    if (this.golf?.start === 'range') { this.range.sync(); this.range.step(); }
    if (this.golf) this.halfwayStep();
    if (this.golf) { this.decor.frame(); this.pondsFrame(now); } // T231: the ponds' stone edges and the jets
    this.updatePeds(dt);
    this.updateGrass();
    // the followed car: the camera centres on its interpolated place (the info itself comes at 10 Hz)
    if (this.followCar && this.traffic.car) {
      const tr = this.traffic, i = this.inspecting, live = tr.alive[i] === 1, x = live ? tr.px[i]! : tr.car!.x, y = live ? tr.py[i]! : tr.car!.y;
      this.cam.X = worldX(x, y); this.cam.Y = worldY(x, y);
    }
    const t1 = performance.now();
    this.draw(now);
    const t2 = performance.now();
    // perf counters (rolling one second)
    this.frameTimes.push(frameMs); if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    Object.assign(this.perf, { fps: 1000 / avg, frameMs: avg, cpuMs: t2 - t0, drawMs: t2 - t1, instances: this.gl.stats.instances, draws: this.gl.stats.draws, uploadKB: this.gl.stats.uploadFloats * 4 / 1024, chunksPending: this.ground.busy, simActive: this.traffic.stats.active, simTickMs: this.traffic.stats.tickMs, simMaxTickMs: this.traffic.stats.maxTickMs, pop: this.traffic.pop, jobs: this.traffic.jobs, built: this.traffic.built });
    this.perf.frames++;
  };
  /** a hook for the benchmark's camera path */
  onFrame: ((now: number, dt: number) => void) | null = null;

  /** T080: tell the atlas which cells this frame draws (on screen, weighted by their screen px) and which are near the view (the prepared
   *  sprite tiles within half a screen around it, every few frames), at the mip the zoom needs; atlas-pages.ts streams them, finest wants and
   *  most pixels first. Past the zoom where the always-resident low set suffices nothing streams. */
  private streamAtlas(stream: Float32Array, floats: number, X0: number, Y0: number, X1: number, Y1: number) {
    const a = this.gl.atlas; if (!a) return;
    const P = a.plan, need = neededLevel(this.cam.z, this.dpr, P), G = P.grid, ze = this.cam.z * this.dpr;
    if (need >= P.lowBase) { a.want([]); this.perf.atlasSoft = 0; return; }
    if (this.atlasMark.length !== P.pages * G * G) this.atlasMark = new Float32Array(P.pages * G * G);
    const mark = this.atlasMark, touched = this.atlasTouched; touched.length = 0;
    const cell = (u0: number, v0: number, u1: number, v1: number, p: number, px: number) => {
      const gx0 = Math.max(0, Math.floor(Math.min(u0, u1) * G)), gx1 = Math.min(G - 1, Math.floor(Math.max(u0, u1) * G));
      const gy0 = Math.max(0, Math.floor(Math.min(v0, v1) * G)), gy1 = Math.min(G - 1, Math.floor(Math.max(v0, v1) * G)), share = px / ((gx1 - gx0 + 1) * (gy1 - gy0 + 1));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) { const u = (p * G + gy) * G + gx; if (mark[u] === 0) touched.push(u); mark[u] += share; }
    };
    for (let o = 0; o < floats; o += SPRITE_STRIDE) {
      if (!(stream[o + 9]! > 0) || stream[o + 8]! < 0) continue; // hidden, or a lamp's glow (T192: no atlas page)
      // the part of the picture on screen: its rect clipped to its tile and the view, in its uv rect
      const x0 = stream[o]!, y0 = stream[o + 1]!, x1 = stream[o + 2]!, y1 = stream[o + 3]!, w = x1 - x0, h = y1 - y0;
      const cx0 = Math.max(x0, stream[o + 12]!, X0), cy0 = Math.max(y0, stream[o + 13]!, Y0), cx1 = Math.min(x1, stream[o + 14]!, X1), cy1 = Math.min(y1, stream[o + 15]!, Y1);
      if (cx1 <= cx0 || cy1 <= cy0 || w <= 0 || h <= 0) continue;
      const u0 = stream[o + 4]!, v0 = stream[o + 5]!, du = stream[o + 6]! - u0, dv = stream[o + 7]! - v0;
      cell(u0 + du * (cx0 - x0) / w, v0 + dv * (cy0 - y0) / h, u0 + du * (cx1 - x0) / w, v0 + dv * (cy1 - y0) / h, stream[o + 8]!, (cx1 - cx0) * (cy1 - cy0) * ze * ze);
    }
    const wants: PageWant[] = new Array(touched.length);
    for (let i = 0; i < touched.length; i++) { const u = touched[i]!; wants[i] = { unit: u, level: need, onScreen: true, weight: mark[u]! }; mark[u] = 0; }
    touched.length = 0;
    // near the view, one mip coarser: the prepared tiles within half a screen around it (one more tile prepared per pass)
    if (need + 1 >= P.lowBase) this.atlasNear = [];
    else if (this.perf.frames - this.atlasNearAt >= 10) {
      this.atlasNearAt = this.perf.frames; const hw = (X1 - X0) / 2, hh = (Y1 - Y0) / 2;
      this.sprites.visit(X0 - hw, Y0 - hh, X1 + hw, Y1 + hh, (s, o) => {
        if (!(s[o + 9]! > 0) || s[o + 2]! < X0 - hw || s[o]! > X1 + hw || s[o + 3]! < Y0 - hh || s[o + 1]! > Y1 + hh) return;
        cell(s[o + 4]!, s[o + 5]!, s[o + 6]!, s[o + 7]!, s[o + 8]!, (s[o + 2]! - s[o]!) * (s[o + 3]! - s[o + 1]!) * ze * ze);
      }, 1);
      this.atlasNear = touched.map(u => { const w: PageWant = { unit: u, level: need + 1, onScreen: false, weight: mark[u]! }; mark[u] = 0; return w; });
      touched.length = 0;
    }
    a.want(this.atlasNear.length ? wants.concat(this.atlasNear) : wants);
    // the readout: the share of this frame's on-screen sprite px drawn coarser than the view needs (streaming in, or no slot left)
    let soft = 0, total = 0; for (const w of wants) { total += w.weight!; if (a.pages.levelOf(w.unit) > need) soft += w.weight!; }
    this.perf.atlasSoft = total ? soft / total : 0;
  }

  private groundTier: 'g' | 'm' | null = null;
  private groundTarget = '';
  private groundBlendAt = Infinity;
  private groundBlendOtherTier = false;
  /** the last target's tile spec, and whether the zoom transition in progress is a band (or DPR) switch (cut once the whole view has it) */
  private groundTs = -1;
  /** whether the last ground switch was a tile band step (T145; T197: it crossfades now as any switch; read by scripts/perf/zoom-sweep.mjs) */
  groundCut = false;
  /** the tile set families' band (T150, painted-tiles.ts nextBand: from the CSS zoom with hysteresis, never magnified; saved with the camera) */
  tileBand: number | null = null;
  /** T186: sprite shadows over the ground's baked shade take the max of the two, not their product (the dev switch: window.__game.shadeMax =
   *  false shows them multiplied, as before, for a comparison) */
  shadeMax = true;
  /** T215 (#561, phase 1): the street lamps' reflection pools as the camera specular (lamp-reflect.ts): on, the ground bakes them onto each
   *  chunk's reflection mask and the GPU lights the road by it times a falloff from the screen's centre (gl.ts FS_QUAD), so a pool shows
   *  whole in the middle of the screen and fades out toward the edges; off (the default), they are baked into the road as before. The dev
   *  switch window.__game.specCam = true (every chunk is baked again); the knobs window.__game.setSpec({ inner, outer, strength, day }), and
   *  the gear menu's Night panel. Not remembered: a test of the look for the owner */
  get specCam() { return this.ground.specCam; }
  set specCam(on: boolean) { this.ground.setSpecCam(!!on); this.emit(); }
  spec: SpecLook = { ...SPEC_LOOK };
  setSpec(p: Partial<SpecLook>) { this.spec = clampSpecLook({ ...this.spec, ...p }); this.emit(); }
  /** T262 (#769): the grass catches the camera's shine (grass-shine.ts), on T215's falloff: on by default; the gear menu's Grass shine (its
   *  switch, strength, gloss size and per-surface weights, beside T215's knobs; remembered), window.__game.setShine({ on, strength, size, weights,
   *  bump, eye, night }). The switch and the weights are baked into each chunk's weight mask, so changing them bakes the ground again (the
   *  weights a moment after the last change, as a slider is dragged); the rest are the shader's */
  /** T248 (#718): the water moves (water-motion.ts): two ripple layers, the rivers' flow, waves lapping at the shore and the sparkle, on by
   *  default; the gear menu's Water motion (its switch, the speed, the ripples', foam's and sparkle's strength; remembered),
   *  window.__game.setWaterMotion({ on, flow, ripple, foam, sparkle }). The switch makes (or drops) each water chunk's motion mask, so it
   *  bakes the ground again; off is the water as before, bit for bit. The rest are the shader's */
  get waterMotion(): boolean { return this.waterLook.on; }
  set waterMotion(on: boolean) { this.setWaterMotion({ on: !!on }); }
  waterLook: WaterMotion = { ...WATER_MOTION };
  setWaterMotion(p: Partial<WaterMotion>) {
    this.waterLook = clampWaterMotion({ ...this.waterLook, ...p });
    try { localStorage.setItem(WATER_MOTION_KEY, JSON.stringify(this.waterLook)); } catch { /* storage may be unavailable */ }
    this.ground.setWaterMotion(this.waterLook.on); this.emit();
  }
  /** T248: the water's phases (the rivers' flow cycles, the waves, the ponds' drift), stepped by the real time each frame at the look's speed;
   *  waterClock (seconds, the captures and tests): the phases held at that time instead (null: running) */
  private waterPhases = { phase: 0, wave: 0, drift: [0, 0, 0, 0] }; private waterLast = 0;
  waterClock: number | null = null;
  get grassShine(): boolean { return this.shine.on; }
  set grassShine(on: boolean) { this.setShine({ on: !!on }); }
  shine: ShineLook = clampShineLook(SHINE_LOOK);
  private shineSend = 0;
  setShine(p: Partial<Omit<ShineLook, 'weights'>> & { weights?: Partial<ShineWeights> }) {
    this.shine = clampShineLook({ ...this.shine, ...p, weights: { ...this.shine.weights, ...p.weights } });
    try { localStorage.setItem(SHINE_KEY, JSON.stringify(this.shine)); } catch { /* storage may be unavailable */ }
    clearTimeout(this.shineSend);
    const send = () => this.ground.setGrassShine(this.shine.on, this.shine.weights);
    if (p.weights) this.shineSend = window.setTimeout(send, 350); else send();
    this.emit();
  }

  /** the dev readout of the tile set families (T145, T150; App.tsx TilesPanel, shown with the Developer panel: ?debug, F3 or the gear menu): the camera's
   *  band, its anchor zoom (where it draws at its native pixels), how big it is drawn against native, and the zooms the band shows over; for each
   *  tile set family a surface wears, its set, the tiles in view, a tile's width on screen in device px and how many whole tiles the view shows;
   *  under the pointer, the course surface there and, when it wears a tile set, the tile and its grid cell */
  tilesReadout() {
    const z = this.cam.z, b = this.tileBand ?? bandAt(z), band = TILE_BANDS[b]!, k = tileSpec(b, this.dpr), file = paintedSurfaces();
    const X0 = this.cam.X - this.cssW / 2 / z, Y0 = this.cam.Y - this.cssH / 2 / z, X1 = this.cam.X + this.cssW / 2 / z, Y1 = this.cam.Y + this.cssH / 2 / z;
    const used = new Map<string, string[]>();
    for (const [key, look] of Object.entries(file.surfaces)) if (tiledFamily(look.family)) used.set(look.family, [...(used.get(look.family) ?? []), key]);
    const fams = [...used].map(([id, surfaces]) => {
      const f = tiledFamily(id)!, lv = f.levels[band], size = tileSize(lv, k), perm = tilePermutation(f.id, band, lv.tiles.length), cells = cellsIn(X0, Y0, X1, Y1, size[0], size[1]);
      const ids = [...new Set(cells.map(c => lv.tiles[tileIndex(perm, c.ix, c.iy)]!.id))].sort(), cov = coverageOf(this.cssW, this.cssH, z, size);
      return { id: f.id, materialId: f.materialId, name: f.name, surfaces, set: lv.revision, provisional: !!f.provisional, native: lv.native, ids, cells: cells.length, areas: cov.areas, across: cov.across, down: cov.down, tileW: size[0], tileH: size[1], screenPx: tileScreenPx(lv, z, b) };
    });
    let pointer: { surface: string; family: string | null; tile: string | null; cell: [number, number] | null } | null = null;
    const h = this.hover, g = this.courseGrid;
    if (h) {
      const ci = g ? cellAt(g, h.x, h.y) : -1, code = ci >= 0 ? g!.surf[ci]! : 0, surface = (Object.keys(SURF) as (keyof typeof SURF)[]).find(n => SURF[n] === code && code !== 0) ?? (this.terrain.cls[Math.floor(h.y) * MAP + Math.floor(h.x)] === TC.WATER ? 'river' : 'map ground');
      const look = file.surfaces[surface], f = look ? tiledFamily(look.family) : undefined;
      if (f) { const lv = f.levels[band], [w, hh] = tileSize(lv, k), c = cellOf(worldX(h.x, h.y), worldY(h.x, h.y), w, hh); pointer = { surface, family: f.materialId, tile: lv.tiles[tileIndex(tilePermutation(f.id, band, lv.tiles.length), c[0], c[1])]!.id, cell: c }; }
      else pointer = { surface, family: look?.family ?? null, tile: null, cell: null };
    }
    // the zooms this band shows over, zooming out: from its switch in (or the closest zoom) down to the coarser set's switch (or the furthest
    // zoom); NEAR stays on down to nearUntil (T153)
    const zRange = bandRange(b);
    return { band, bandIndex: b, spec: k, anchor: anchorAt(b), scale: drawnScale(z, b), zoom: z, dpr: this.dpr, zRange, nearUntil: nearUntil(), revision: TILES_REVISION, fams, pointer };
  }
  private draw(now: number) {
    const z = this.cam.z, ze = z * this.dpr, gl = this.gl, cam = this.cam;
    // the tile set families' band and its spec (the band at this screen's DPR: the one world size its tiles are laid at), and the band the
    // workers decode ahead once the camera nears its switch (T150, painted-tiles.ts)
    const tb = this.tileBand = nextBand(z, this.tileBand), ts = tileSpec(tb, this.dpr);
    this.ground.tilesAhead(bandsAhead(z, tb));
    const tier = z < PLANNER_Z ? 'planner' : z < DISTRICT_Z ? 'district' : 'street'; this.perf.tier = tier;
    // the golf round moves on before the movers (the golfers) and the overlay (the balls) read it
    this.updateDayPins(now); this.updatePlay(now); this.updateEveryday(now); // T269: the day's cups first, so the day's play reads them
    if (this.golf) this.monthMoney.note(this.golfMonthAt(now), this.money); // T233: the money chip's change a month
    // T226: the colour grade this frame (grade.ts: none when off, easing off after dusk; the scene then draws straight to the screen)
    gl.grade = this.boot.kind === 'game' ? gradeFrame(this.grade, this.nightAmount()) : null;
    gl.begin({ X: cam.X, Y: cam.Y, ze, cw: this.cw, ch: this.ch }, [0.106, 0.157, 0.086]);
    const X0 = cam.X - this.cw / 2 / ze, Y0 = cam.Y - this.ch / 2 / ze, X1 = cam.X + this.cw / 2 / ze, Y1 = cam.Y + this.ch / 2 / ze;
    const dist = (cx: number, cy: number) => Math.hypot(cx - cam.X, cy - cam.Y) * ze;
    // ---- planner map: the whole view at the planner tier, otherwise under any chunk not baked yet
    const pL = planLevelFor(ze), pi0 = Math.floor(X0 / PLAN_W), pi1 = Math.floor(X1 / PLAN_W), pj0 = Math.floor(Y0 / PLAN_H), pj1 = Math.floor(Y1 / PLAN_H);
    const drawPlan = () => {
      for (let j = pj0; j <= pj1; j++) for (let i = pi0; i <= pi1; i++) {
        const t = this.ground.tile('p', i, j); this.ground.need(t, pL, (tier === 'planner' ? 0 : 1e6) + dist((i + 0.5) * PLAN_W, (j + 0.5) * PLAN_H), now, pL, ts);
        if (t.tex) gl.drawChunk(t.tex, i * PLAN_W, j * PLAN_H, (i + 1) * PLAN_W, (j + 1) * PLAN_H);
      }
    };
    if (tier === 'planner') {
      drawPlan();
      // T197: the planner map shown, the district chunks a zoom in reaches are baked ahead meanwhile (as at the other tiers)
      if (z !== this.prebakeZ) { this.prebakeZ = z; this.prebakeHold = now + Game.PREBAKE_SETTLE_MS; }
      if (this.ground.idle && now >= this.prebakeHold) this.prebake(z, 'p', X0, Y0, X1, Y1, now);
      // vehicles as dots coloured by type
      const tr = this.traffic;
      if (tr) {
        const pts = new Float32Array(tr.n * POINT_STRIDE); let n = 0;
        for (let i = 0; i < tr.n; i++) { if (!tr.alive[i]) continue; const X = worldX(tr.px[i], tr.py[i]), Y = worldY(tr.px[i], tr.py[i]); if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue; const c = CAR_COLOURS[tr.kind[i] % CAR_COLOURS.length], o = n * POINT_STRIDE; pts[o] = X; pts[o + 1] = Y; pts[o + 2] = c[0]; pts[o + 3] = c[1]; pts[o + 4] = c[2]; pts[o + 5] = 1; n++; }
        gl.upload(pts, n * POINT_STRIDE); gl.drawPoints(0, n, Math.max(1.5, Math.min(4, 5 * ze / 0.035)) * (this.dpr > 1 ? 1.5 : 1));
      }
    } else {
      // ---- ground: full chunks close up, district chunks (4 x 4, lite) further out
      const { district: mid, artL, rasterL: L } = grassZoomLevels(z, this.dpr), kind = mid ? 'm' : 'g', CW = mid ? MID_W : CHUNK_W, CH = mid ? MID_H : CHUNK_H;
      const i0 = Math.floor(X0 / CW), i1 = Math.floor(X1 / CW), j0 = Math.floor(Y0 / CH), j1 = Math.floor(Y1 / CH);
      const target = kind + '@' + L + ':' + artL + '#' + ts;
      if (this.groundTarget !== target) { this.groundBlendOtherTier = this.groundTier !== kind; this.groundCut = this.groundTs >= 0 && this.groundTs !== ts; this.groundTier = kind; this.groundTarget = target; this.groundTs = ts; this.groundBlendAt = Infinity; }
      if (!Number.isFinite(this.groundBlendAt)) {
        let complete = true;
        for (let j = j0; j <= j1 && complete; j++) for (let i = i0; i <= i1; i++) { const t = this.ground.tile(kind, i, j); if (!pictureCurrent(t, L, artL, ts) || t.stale) { complete = false; break; } }
        // a step switch (T145: another tile set, or another tile size) shows once every chunk on screen has it, then crossfades over the same
        // 180 ms as a zoom level (T197: it cut, a visible jump of the whole ground's texture at a band switch)
        if (complete) this.groundBlendAt = now;
      }
      const zoomBlend = Number.isFinite(this.groundBlendAt) ? Math.max(0, Math.min(1, (now - this.groundBlendAt) / 180)) : 0;
      // a chunk not baked yet shows its piece of the planner map meanwhile, asked for before any chunk (one planner bake covers 8 x 8 chunks:
      // after a jump or a fresh start the view is low-detail ground at once, never the clear colour; T134)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j); if (t.tex || t.prev) continue;
        const X = i * CW, Y = j * CH, pi = Math.floor(X / PLAN_W), pj = Math.floor(Y / PLAN_H), p = this.ground.tile('p', pi, pj);
        this.ground.need(p, pL, dist(X, Y) - 1e6, now, pL, ts);
        if (p.tex) gl.drawChunk(p.tex, X, Y, X + CW, Y + CH, false, 1, [(X - pi * PLAN_W) / PLAN_W, (Y - pj * PLAN_H) / PLAN_H, (X + CW - pi * PLAN_W) / PLAN_W, (Y + CH - pj * PLAN_H) / PLAN_H]);
      }
      const mask = this.revealMask(now); if (mask) gl.setMask(mask);
      // T215: the camera specular's falloff and gain this frame (the night light's amount takes the pools to their whole strength after dusk)
      gl.spec = this.ground.specCam ? { inner: this.spec.inner, outer: this.spec.outer, gain: specGain(this.spec, this.nightAmount()) } : null;
      // T199: the swamp's sky glint, on the same switch and knobs (its gain falls after dusk: no sky to reflect); each picture's gloss mask by
      // the picture itself
      gl.gloss = this.ground.specCam ? { inner: this.spec.inner, outer: this.spec.outer, gain: glossGain(this.spec, this.nightAmount()) } : null;
      gl.glossOf ??= tex => this.ground.glossOf(tex);
      // T262: the grass shine's falloff (T215's), gain (by day, by the zoom) and look this frame; each picture's weight mask by the picture
      gl.shine = this.ground.grassShine ? { inner: this.spec.inner, outer: this.spec.outer, gain: shineGain(this.shine, this.nightAmount(), cam.z), exponent: shineExponent(this.shine), bump: this.shine.bump, eye: this.shine.eye } : null;
      gl.shineOf ??= tex => this.ground.shineOf(tex);
      // T248: the water's motion this frame (its phases stepped by the real time; faded out toward the district zoom); each picture's mask by
      // the picture
      { const dt = this.waterLast ? Math.min(0.1, Math.max(0, (now - this.waterLast) / 1000)) : 0; this.waterLast = now; if (this.waterClock === null) stepPhases(this.waterPhases, dt, this.waterLook); }
      gl.water = this.ground.waterMotion ? motionFrame(this.waterLook, cam.z, this.nightAmount(), ze, this.waterClock === null ? this.waterPhases : phasesAt(this.waterClock, this.waterLook)) : null;
      gl.waterOf ??= tex => this.ground.waterOf(tex);
      const spec = (tex: WebGLTexture | null) => this.ground.specOf(tex);
      const shadeMasks: { tex: WebGLTexture; r: readonly [number, number, number, number] }[] = [];
      let baked = true;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j); if (!t.tex) baked = false;
        if (!this.ground.castersUsed || this.casterReady(i * CW, j * CH, (i + 1) * CW, (j + 1) * CH)) this.ground.need(t, L, dist((i + 0.5) * CW, (j + 0.5) * CH), now, artL, ts);
        const r = [i * CW, j * CH, (i + 1) * CW, (j + 1) * CH] as const;
        if (t.prev && now < t.prevUntil) { gl.drawChunk(t.prev, ...r, false, 1, FULL_UV, spec(t.prev)); if (t.tex && t.tex !== t.prev && mask) gl.drawChunk(t.tex, ...r, true, 1, FULL_UV, spec(t.tex)); continue; }
        // its picture (ground-layers.ts): while the zoom crossfade waits for the whole view, an older picture, or its new one when it has none
        // (a chunk that came into view: it drew nothing, the clear colour, until the last chunk on screen was baked, T134), the other tier's
        // pictures over it, and its new picture fading in
        const lay = chunkLayers(t, L, artL, zoomBlend, this.groundBlendOtherTier, ts);
        if (lay.base) gl.drawChunk(lay.base, ...r, false, 1, FULL_UV, spec(lay.base));
        const fallback = lay.fallback ? this.ground.zoomFallback(kind, r, now) : [];
        for (const picture of fallback) gl.drawChunk(picture.tex, ...picture.rect, false, 1, picture.uv, picture.spec);
        if (lay.top && (lay.top !== lay.base || fallback.length)) gl.drawChunk(lay.top, ...r, false, lay.topAlpha, FULL_UV, spec(lay.top));
        // (T186: the shade its picture baked in, for the sprite shadows to take the max with; only while that picture is the one drawn)
        if (t.shade && (lay.base === t.tex || lay.top === t.tex)) shadeMasks.push({ tex: t.shade, r });
        if (t.fadeFrom && Number.isFinite(this.groundBlendAt) && (zoomBlend < 1 || !Number.isFinite(t.fadeStart))) t.fadeStart = this.groundBlendAt;
      }
      // T188: the first view's ground is baked (the welcome card waits for it)
      if (baked && !this.firstViewBaked && this.ready) { this.firstViewBaked = true; this.emit(); }
      // T197: the view done, the chunks a zoom would need next are baked ahead, a few a frame at the lowest priority
      // (not while the zoom moves: a bake ahead in flight would hold up the next chunk on screen)
      if (z !== this.prebakeZ) { this.prebakeZ = z; this.prebakeHold = now + Game.PREBAKE_SETTLE_MS; }
      if (this.ground.idle && now >= this.prebakeHold) this.prebake(z, kind, X0, Y0, X1, Y1, now);
      // ---- the map grid and the course half grid (T100): over the ground and its paint, hidden on the roads, under every shadow and sprite
      if (this.gridLayer.draw(gl.gl, gl.view, z, this.dpr, gridShown(this.showGrid, this.tool), this.courseBuilding, this.gridLand(), this.net)) gl.stats.draws++;
      // the dev tools' ground lines (the lot lab's Lot grid): the same place, under every shadow and sprite
      if (this.devGround?.(gl.gl, gl.view)) gl.stats.draws++;
      // ---- sprites: every visible tile in one instanced draw (each instance clipped to its tile), vehicles merged in
      const vis: { i: number; j: number }[] = [];
      for (let j = Math.floor(Y0 / SPR_H); j <= Math.floor(Y1 / SPR_H); j++) for (let i = Math.floor(X0 / SPR_W); i <= Math.floor(X1 / SPR_W); i++) vis.push({ i, j });
      const c = [tileOf(X0, Y0), tileOf(X1, Y0), tileOf(X0, Y1), tileOf(X1, Y1)], pad = 6;
      // cars in tunnels are not drawn (the sim client skips them)
      const bx0 = Math.min(...c.map(p => p.x)) - pad, by0 = Math.min(...c.map(p => p.y)) - pad, bx1 = Math.max(...c.map(p => p.x)) + pad, by1 = Math.max(...c.map(p => p.y)) + pad;
      this.viewTileBox = [bx0, by0, bx1, by1]; // (T228: the car parks' parked cars are looked at only on screen, syncParkCars)
      // (T192: with their brake lights from the closest zooms down to 8%, drawn in the sprite pass right after each car)
      const cars: Drawable[] = this.traffic ? this.traffic.visible(bx0, by0, bx1, by1, cam.z >= 0.08) : [];
      // at the street tier the townspeople and the crowd (the galleries' fans, the queues, the walking parties) are the movers, merged in by depth
      const movers = tier === 'street' ? cars.concat(this.peds.n ? this.pedMovers(bx0, by0, bx1, by1) : [], this.crowdMovers(bx0, by0, bx1, by1, now / 1000), this.range.movers_(bx0, by0, bx1, by1), this.dayCarOut, this.golfCartOut, this.crewOut) : cars;
      // with the living ground the trees plant over every chunk on screen and as far out as a chunk's caster reach (a chunk bakes once its trees
      // are known: casterReady; a cell one tile short of that left an edge chunk unbaked for ever, T134)
      if (this.ground.castersUsed) { const CW2 = this.groundTier === 'm' ? MID_W : CHUNK_W, CH2 = this.groundTier === 'm' ? MID_H : CHUNK_H; this.plantForest(Math.floor(X0 / CW2) * CW2, Math.floor(Y0 / CH2) * CH2, (Math.floor(X1 / CW2) + 1) * CW2, (Math.floor(Y1 / CH2) + 1) * CH2, LIVING_PLANT_MARGIN); }
      else this.plantForest(X0, Y0, X1, Y1);
      const f = this.sprites.frame(vis, movers), shadows = this.shadowStrength > 0;
      this.streamAtlas(f.stream, f.floats, X0, Y0, X1, Y1);
      // (T192: no car light overlay any more: no headlights, beams or turn signals; the brake lights are glow instances in the sprite stream)
      const vecOn = shadows || this.cast.on;
      const [sAt, pAt, ...vAt] = gl.uploadParts([[f.shadows, shadows ? f.shadowFloats : 0], [f.stream, f.floats],
        ...f.vec.map(v => [v.data, vecOn ? v.floats : 0] as [Float32Array, number])]);
      // the shadows into one layer, the darkest winning where they overlap, laid on the ground once (T185: gl.ts beginShadows): the cast
      // shadows (cast-shadow.ts), faded out by night, then the contact shadows, the vector shadows; then the sprites
      // the district zoom's sprite cull (T216): one rule for a sprite and all its shadows (gl.ts CULL_MIN_PX)
      const minPx = tier === 'district' ? CULL_MIN_PX * this.dpr : 0;
      gl.beginShadows();
      // the ground's own baked shade first (T186: the sprite shadows darken it only past that, never a product)
      if (this.shadeMax) for (const m of shadeMasks) gl.drawShadeMask(m.tex, ...m.r);
      if (this.cast.on) { const sh = castShear(this.cast); gl.drawCast(pAt, f.floats / SPRITE_STRIDE, sh.sx, sh.sy, this.cast.strength * (1 - this.nightAmount()), minPx); }
      // the contact shadows lean toward the cast shadows' side (away from the sun), blob and box alike (shadow-shape.ts contactLean, T141)
      const lean = contactLean(this.cast);
      if (shadows) gl.drawShadows(sAt, f.shadowFloats / SHADOW_STRIDE, this.shadowStrength, lean.x, lean.y, minPx);
      // the hand-drawn vector shadows (T142): each picture's contact and cast shapes, the cast following the sun and fading out by night
      if (vecOn) {
        const sh = this.cast.on ? castShear(this.cast) : { sx: 0, sy: 0 }, castMul = this.cast.on ? this.cast.strength * (1 - this.nightAmount()) : 0;
        // (at the district zoom a shadow is a few px: the meshes' far copies, a few points a ring and no soft rim)
        const far = tier === 'district';
        f.vec.forEach((v, k) => gl.drawVector(vAt[k]!, v.floats / VECTOR_STRIDE, far ? v.far : v.verts, sh.sx, sh.sy, this.shadowStrength, castMul, far, minPx));
      }
      gl.endShadows();
      gl.drawSprites(pAt, f.floats / SPRITE_STRIDE, minPx);
    }
    // T226: the scene laid on the screen through the grade (when graded), before the overlay and its night pass read the canvas
    gl.endFrame();
    this.gl.atlas?.pump();
    this.ground.pump(); this.ground.settle(now); this.ground.evict(now);
    this.syncParkCars(now);
    this.drawOverlay(now);
  }

  /** debug: the lane graph (white links, yellow connectors, cyan ring arcs, red conflict dots); lanes are drawn when an end is near the view */
  private drawLanes(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr, pad = 10;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const ok = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1, at = { x: 0, y: 0, hx: 0, hy: 0 };
    this.setIso(ctx); ctx.lineWidth = 0.08;
    for (const l of this.lanes.lanes) {
      if (!l) continue;
      const n = l.pts.length;
      if (!ok(l.pts[0], l.pts[1]) && !ok(l.pts[n - 2], l.pts[n - 1])) continue;
      if (l.kind === LK.LINK) ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      if (l.kind === LK.CONN) ctx.strokeStyle = '#ffd866';
      if (l.kind === LK.RING) ctx.strokeStyle = '#5ee6ff';
      ctx.beginPath(); ctx.moveTo(l.pts[0], l.pts[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]); ctx.stroke();
      for (const c of l.conflicts) {
        if (c.lane < l.id) continue;
        laneAt(l, c.s, at); ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(at.x, at.y, 0.15, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** debug (P): the parcels of the city worker in view: outline (amber at a corner), filled by use (EMPTY outline only, BUILDING at half alpha, declined darker), a dot at the frontage midpoint */
  private drawLots(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr, pad = 2;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    // the lots are not indexed here: cull by the centre against the view (a lot reaches at most 24 tiles from its centre)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2 + 24;
    this.setIso(ctx); ctx.lineWidth = 0.08;
    for (const l of this.traffic.lots.values()) {
      const ox = l.o[0], oy = l.o[1], ux = l.u[0] * l.w, uy = l.u[1] * l.w, nx = l.n[0] * l.d, ny = l.n[1] * l.d;
      if (Math.abs(ox + (ux + nx) / 2 - cx) > R || Math.abs(oy + (uy + ny) / 2 - cy) > R) continue;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + ux, oy + uy); ctx.lineTo(ox + ux + nx, oy + uy + ny); ctx.lineTo(ox + nx, oy + ny); ctx.closePath();
      if (l.level !== LV.EMPTY) { ctx.globalAlpha = l.level === LV.BUILDING ? 0.5 : 1; ctx.fillStyle = LOT_FILL[l.use * 4 + l.decline]!; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = l.corner ? 'rgba(255,176,32,0.9)' : 'rgba(255,255,255,0.5)'; ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ox + ux / 2, oy + uy / 2, 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** the signal heads of the junctions in view (Street tier): a disc per arm at its stop line, green, amber or red at the sim's time */
  private drawSignals(ctx: CanvasRenderingContext2D) {
    const traffic = this.traffic; if (!traffic) return;
    const ze = this.cam.z * this.dpr, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    this.setIso(ctx);
    for (const p of this.lanes.signals.values()) {
      const n = p.node;
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
      // the worker's runtime state of the plan (the phase served, the stage); red for all when none is known yet
      let key = this.sigKeys.get(p); if (key === undefined) { key = sigKey(n.x, n.y); this.sigKeys.set(p, key); }
      const sg = traffic.sigs.get(key);
      for (let i = 0; i < n.arms.length; i++) {
        const a = n.arms[i], inset = a.stop >= 0 ? a.stop : a.reachEdge, st = sg ? shown(p.armPhase[i]!, sg.idx, sg.stage) : SIG.RED;
        const x = n.x + a.dir.x * inset + a.nrm.x * a.h * 0.75, y = n.y + a.dir.y * inset + a.nrm.y * a.h * 0.75;
        ctx.fillStyle = st === 0 ? '#3ddc84' : st === 1 ? '#ffb020' : '#ff3b3b';
        ctx.beginPath(); ctx.arc(x, y, 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** the traffic incidents (SimClient.incidents, 3 floats each: x, y in tiles, kind 1 crash or 0 breakdown): a red warning triangle for a crash, amber
   *  for a breakdown, on the lane where it stands, in screen space; culled to the view (drawn at the street and district tiers, with the signals) */
  private drawIncidents(ctx: CanvasRenderingContext2D) {
    const F = this.traffic.incidents, dpr = this.dpr, r = 9 * dpr;
    if (!F.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let k = 0; k + 2 < F.length; k += 3) {
      const p = this.screen(F[k]!, F[k + 1]!);
      if (p.x < -r || p.x > this.cw + r || p.y < -r || p.y > this.ch + r) continue;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.9, p.y + r * 0.6); ctx.lineTo(p.x - r * 0.9, p.y + r * 0.6); ctx.closePath();
      ctx.fillStyle = F[k + 2] === 1 ? '#ff3b3b' : '#ffb020'; ctx.fill();
      ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.stroke();
    }
  }
  /** the natural disaster under way (SimClient.disasters): its area as a translucent polygon in its colour, and a red X on each closed road's midpoint (a
   *  quake's closure that can be paid for also has a ring: a click on it repairs it, see repairAt); at the district and street tiers */
  private drawDisasters(ctx: CanvasRenderingContext2D) {
    const D = this.traffic.disasters; if (!D.length) return;
    const dpr = this.dpr, r = 6 * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const d of D) {
      const A = d.area, col = DISASTER_COL[d.kind];
      if (A.length >= 6) {
        ctx.beginPath();
        for (let k = 0; k + 1 < A.length; k += 2) { const p = this.screen(A[k]!, A[k + 1]!); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
        ctx.closePath(); ctx.globalAlpha = 0.22; ctx.fillStyle = col; ctx.fill();
        ctx.globalAlpha = 0.7; ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = col; ctx.stroke();
      }
      for (const c of d.closures) {
        const p = this.screen(c.x, c.y);
        ctx.globalAlpha = 1; ctx.beginPath();
        ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r); ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2.5 * dpr; ctx.stroke();
        if (c.repair) { ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.lineWidth = 1.5 * dpr; ctx.stroke(); }
      }
    }
    ctx.globalAlpha = 1;
  }
  /** a click (CSS px) on the ring of a closure that can be paid for (a quake's): asks the worker to repair it (it charges, or notes it unpaid); true if hit */
  private repairAt(mx: number, my: number): boolean {
    const dpr = this.dpr;
    for (const d of this.traffic.disasters) for (const c of d.closures) {
      if (!c.repair) continue;
      const p = this.screen(c.x, c.y);
      if (Math.hypot(p.x / dpr - mx, p.y / dpr - my) > 11) continue;
      this.traffic.repairDisaster(d.id, c.key); return true;
    }
    return false;
  }
  /** the traffic flow (key F): the congestion over time (drawHeatHist) or the live heat map (drawHeat, see flowMode) when the worker's geometry and heat are in, then the focus ring of a jump (4 s) */
  private drawFlow(ctx: CanvasRenderingContext2D) {
    const tr = this.traffic, G = tr.heatGeom, R = tr.heatRatio, D = tr.heatDens, H = tr.heatHist, now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showFlow && G) { if (this.flowMode === 'time') { if (H) this.drawHeatHist(ctx, G, H); } else if (R && D) this.drawHeat(ctx, G, R, D, now); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
    const fo = this.focus, age = fo ? now - fo.t : Infinity;
    if (fo && age < 4000) {
      const s = this.screen(fo.x, fo.y), r = (18 + 10 * Math.sin(age / 1000 * Math.PI * 2)) * this.dpr;
      ctx.globalAlpha = 1 - age / 4000; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // the tee ring (P22 2.8, T095): a gold ring pulsing out from the suggested tee while a range start's first New hole is in hand
    // (T239: and the guide's rings, the walking path's ends while its Show me holds them)
    const gr = this.guideRings && now < this.guideRings.until && !this.range.hasWalkway() ? this.guideRings.pts : [];
    const ts = this.teeRingOn ? this.teeSpot() : null;
    for (const at of ts ? [ts, ...gr] : gr) {
      const s = this.screen(at.x, at.y), ph = (now % 1600) / 1600, d = this.dpr, R = 16 * d;
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#fde68a'; ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.fill();
      for (const [r, a] of [[R, 1], [R + 34 * ph * d, 1 - ph]] as const) {
        ctx.globalAlpha = a * 0.7; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 6 * d; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = a; ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 3 * d; ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
  /** the congestion heat map (SimClient.heatGeom, heatRatio, heatDens): each direction of each road with traffic (1 vehicle per km per lane or more), on its own
   *  side of the road, in the band of its speed against the limit (Flowing 0.75+, Slow, Heavy, Stopped under 0.25; worst drawn last, on top): a glow, then a core.
   *  Screen space, one path per band and lane count (so each has its width), culled to the view; the keys are counting-sorted into the scratch arrays (no allocation) */
  private drawHeat(ctx: CanvasRenderingContext2D, G: Float32Array, R: Float32Array, D: Float32Array, now: number) {
    const ze = this.cam.z * this.dpr, cX = this.cam.X, cY = this.cam.Y, cw2 = this.cw / 2, ch2 = this.ch / 2, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const nD = Math.min(G.length / 6, R.length, D.length) | 0;
    if (this.heatKey.length < nD) { this.heatKey = new Uint8Array(nD); this.heatOrd = new Int32Array(nD); }
    const K = this.heatKey, ord = this.heatOrd, cnt = this.heatCnt, start = this.heatStart, fill = this.heatFill;
    // pass 1: the key of each dseg drawn (dead ids are NaN, no traffic is density under 1): band * 8 + lanes - 1, lanes 1 to 8
    cnt.fill(0);
    for (let d = 0; d < nD; d++) {
      const o = 6 * d, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!;
      K[d] = 255;
      if (Number.isNaN(fx) || D[d]! < 1 || Math.max(fx, tx) < x0 || Math.min(fx, tx) > x1 || Math.max(fy, ty) < y0 || Math.min(fy, ty) > y1) continue;
      const r = R[d]!, band = r >= 0.75 ? 0 : r >= 0.5 ? 1 : r >= 0.25 ? 2 : 3, lanes = Math.min(8, Math.max(1, G[o + 5]! | 0));
      const k = band * 8 + lanes - 1;
      K[d] = k; cnt[k] = cnt[k]! + 1;
    }
    // pass 2: the start of each key in ord; pass 3: the dsegs of each key, in dseg order
    let s = 0;
    for (let k = 0; k < 32; k++) { start[k] = s; fill[k] = s; s += cnt[k]!; }
    for (let d = 0; d < nD; d++) { const k = K[d]!; if (k !== 255) { const p = fill[k]!; fill[k] = p + 1; ord[p] = d; } }
    const zf = clamp(this.cam.z / 0.12, 0.6, 1.6), pulse = 0.85 + 0.15 * Math.sin(now / 1000 * Math.PI * 2);
    ctx.lineCap = 'round';
    for (let band = 0; band < 4; band++) for (let ln = 0; ln < 8; ln++) {
      const k = band * 8 + ln, n0 = start[k]!, n1 = n0 + cnt[k]!;
      if (n1 === n0) continue;
      // device px: 2.2 px a lane at the 0.12 zoom tier and up, scaled with the zoom, 2 to 9 px
      const w = clamp((ln + 1) * 2.2 * zf, 2, 9) * this.dpr;
      ctx.beginPath();
      for (let j = n0; j < n1; j++) {
        const o = 6 * ord[j]!, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!, dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1, off = G[o + 4]!;
        // the lanes' centre: off tiles along perp(u) = (-uy, ux), u = (dx, dy) / L
        const ox = -dy / L * off, oy = dx / L * off;
        ctx.moveTo((worldX(fx + ox, fy + oy) - cX) * ze + cw2, (worldY(fx + ox, fy + oy) - cY) * ze + ch2);
        ctx.lineTo((worldX(tx + ox, ty + oy) - cX) * ze + cw2, (worldY(tx + ox, ty + oy) - cY) * ze + ch2);
      }
      ctx.strokeStyle = HEAT_COLS[band]!;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = band === 0 ? 0.06 : 0.18; ctx.lineWidth = 3 * w; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = band === 0 ? 0.45 : band === 1 ? 0.9 : band === 2 ? 0.95 : pulse;
      ctx.lineWidth = band === 3 ? 1.4 * w : w; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** the congestion over time (SimClient.heatHist: the delay per lane-km, an EMA of about 6 game hours): each dseg with a mean delay of one stopped car
   *  per lane-km or more (H >= 1) gets a glow along its lanes' side, coloured and widened by k = log2(H) / log2(60) (see HIST_GLOW). Screen space, one path per
   *  bin, hot bins drawn last (on top); culled to the view as drawHeat, the ids counting-sorted into the scratch arrays (no allocation) */
  private drawHeatHist(ctx: CanvasRenderingContext2D, G: Float32Array, H: Float32Array) {
    const ze = this.cam.z * this.dpr, cX = this.cam.X, cY = this.cam.Y, cw2 = this.cw / 2, ch2 = this.ch / 2, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const nD = Math.min(G.length / 6, H.length) | 0;
    if (this.histKey.length < nD) { this.histKey = new Uint8Array(nD); this.histOrd = new Int32Array(nD); }
    const K = this.histKey, ord = this.histOrd, cnt = this.histCnt, start = this.histStart, fill = this.histFill;
    // pass 1: the bin of each dseg drawn (dead ids are NaN, under a delay of 1 is not drawn): 255 = none
    cnt.fill(0);
    for (let d = 0; d < nD; d++) {
      const o = 6 * d, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!;
      K[d] = 255;
      if (Number.isNaN(fx) || H[d]! < 1 || Math.max(fx, tx) < x0 || Math.min(fx, tx) > x1 || Math.max(fy, ty) < y0 || Math.min(fy, ty) > y1) continue;
      const b = Math.min(HIST_BINS - 1, Math.floor(clamp(Math.log2(H[d]!) / HIST_LOG, 0, 1) * HIST_BINS));
      K[d] = b; cnt[b] = cnt[b]! + 1;
    }
    // pass 2: the start of each bin in ord; pass 3: the dsegs of each bin, in dseg order
    let s = 0;
    for (let b = 0; b < HIST_BINS; b++) { start[b] = s; fill[b] = s; s += cnt[b]!; }
    for (let d = 0; d < nD; d++) { const b = K[d]!; if (b !== 255) { const p = fill[b]!; fill[b] = p + 1; ord[p] = d; } }
    ctx.lineCap = 'round';
    for (let b = 0; b < HIST_BINS; b++) {
      const n0 = start[b]!, n1 = n0 + cnt[b]!;
      if (n1 === n0) continue;
      const k = (b + 0.5) / HIST_BINS, w = (6 + 14 * k) * this.dpr;
      ctx.beginPath();
      for (let j = n0; j < n1; j++) {
        const o = 6 * ord[j]!, fx = G[o]!, fy = G[o + 1]!, tx = G[o + 2]!, ty = G[o + 3]!, dx = tx - fx, dy = ty - fy, L = Math.hypot(dx, dy) || 1, off = G[o + 4]!;
        const ox = -dy / L * off, oy = dx / L * off;
        ctx.moveTo((worldX(fx + ox, fy + oy) - cX) * ze + cw2, (worldY(fx + ox, fy + oy) - cY) * ze + ch2);
        ctx.lineTo((worldX(tx + ox, ty + oy) - cX) * ze + cw2, (worldY(tx + ox, ty + oy) - cY) * ze + ch2);
      }
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = HIST_GLOW[b]!; ctx.lineWidth = w; ctx.stroke();
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = HIST_CORE[b]!; ctx.lineWidth = 0.4 * w; ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  /** the parking demand (SimClient.parkDemand, the Car park panel's toggle): each PD_CELL cell with 0.5 cars per game hour or more, shaded blue (low)
   *  to red (high) by its bin (PD_FILL); at the district and street tiers the cells over 5 are labelled with their cars per game hour (rounded).
   *  Supply (bays) is not drawn here */
  private drawParkDemand(ctx: CanvasRenderingContext2D) {
    const PD = this.traffic.parkDemand; if (!PD) return;
    const N = MAP / PD_CELL, dpr = this.dpr;
    this.setIso(ctx);
    for (let c = 0; c < PD.length; c++) {
      const v = PD[c]!; if (v < 0.5) continue;
      ctx.fillStyle = PD_FILL[Math.min(PD_BINS - 1, Math.floor(clamp(Math.log2(1 + v) / PD_LOG, 0, 1) * PD_BINS))]!;
      ctx.fillRect((c % N) * PD_CELL, ((c / N) | 0) * PD_CELL, PD_CELL, PD_CELL);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cam.z < DISTRICT_Z) return;
    ctx.font = `bold ${11 * dpr}px sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = '#0f172a'; ctx.fillStyle = '#fff';
    for (let c = 0; c < PD.length; c++) {
      const v = PD[c]!; if (v <= 5) continue;
      const p = this.screen((c % N) * PD_CELL + PD_CELL / 2, ((c / N) | 0) * PD_CELL + PD_CELL / 2), t = String(Math.round(v));
      const x = p.x - ctx.measureText(t).width / 2;
      ctx.strokeText(t, x, p.y); ctx.fillText(t, x, p.y);
    }
  }
  /** the car inspector and the junction routes (see SimClient.car and .watch): the inspected car's route ahead (cyan, dashed after its first
   *  stretch), its origin (blue) and destination (orange) dots, and a ring on the car; the watched junction's recorded crossings, from their
   *  origins (blue) and to their destinations (orange), and a ring on the junction */
  private drawInspect(ctx: CanvasRenderingContext2D) {
    const tr = this.traffic, c = tr.car, w = tr.watch, jn = w && w.node ? w.node : null;
    if (!c && !jn) return;
    this.setIso(ctx); ctx.globalAlpha = 0.9; ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 0.5;
    if (c) {
      const P = c.path;
      ctx.beginPath(); ctx.moveTo(P[0]!, P[1]!); ctx.lineTo(P[2]!, P[3]!); ctx.stroke();
      ctx.setLineDash([1.2, 0.8]); ctx.beginPath(); ctx.moveTo(P[2]!, P[3]!);
      for (let k = 4; k + 1 < P.length; k += 2) ctx.lineTo(P[k]!, P[k + 1]!);
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (jn && w) {
      const L = w.lines, jx = jn[0], jy = jn[1];
      ctx.lineWidth = 0.35; ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#60a5fa'; ctx.beginPath(); for (let k = 0; k + 3 < L.length; k += 4) { ctx.moveTo(L[k]!, L[k + 1]!); ctx.lineTo(jx, jy); } ctx.stroke();
      ctx.strokeStyle = '#fb923c'; ctx.beginPath(); for (let k = 0; k + 3 < L.length; k += 4) { ctx.moveTo(jx, jy); ctx.lineTo(L[k + 2]!, L[k + 3]!); } ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = this.dpr;
    if (c) {
      const i = this.inspecting, live = tr.alive[i] === 1, a = this.screen(c.ox, c.oy), b = this.screen(c.dx, c.dy), cs = live ? this.screen(tr.px[i]!, tr.py[i]!) : this.screen(c.x, c.y);
      disc(ctx, a.x, a.y, 6 * dpr, '#60a5fa'); disc(ctx, b.x, b.y, 6 * dpr, '#fb923c');
      ctx.beginPath(); ctx.arc(cs.x, cs.y, 12 * dpr, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    }
    if (jn) { const s = this.screen(jn[0], jn[1]); ctx.beginPath(); ctx.arc(s.x, s.y, 12 * dpr, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 * dpr; ctx.stroke(); }
  }
  private drawOverlay(now: number) {
    const ctx = this.ov, ze = this.cam.z * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cw, this.ch);
    // T151: the world labels drawn below are collected (this.labels) and written together after the tolls, placed so none overlap
    this.labels.begin(ctx, this.dpr);
    if (this.showLanes && this.cam.z > 0.12) this.drawLanes(ctx);
    if (this.showLots && this.cam.z > 0.06) this.drawLots(ctx);
    if (this.showAccess || this.cam.z < PLANNER_Z) this.drawAccess(ctx);
    if (this.cam.z < DISTRICT_Z) this.drawTownNames();
    if (this.traffic && this.cam.z >= DISTRICT_Z) { this.drawDisasters(ctx); this.drawSignals(ctx); this.drawIncidents(ctx); }
    if (this.tool === 'junction') { if (this.cam.z >= PLANNER_Z) this.drawJunctionBadges(ctx); this.drawSelectedJunction(ctx); }
    this.drawFlow(ctx);
    this.drawTeeMarkers(ctx); // T254
    this.drawHoleBadges(ctx); // T174
    if (this.showParkDemand) this.drawParkDemand(ctx);
    this.drawInspect(ctx);
    this.drawGroundOverlays(ctx);
    this.drawStadium(ctx);
    this.drawBusinesses(ctx);
    this.drawPlaceNames();
    if (this.showStandIns) this.drawStandIns();
    this.drawParks(ctx);
    this.drawParkPreview(ctx);
    this.drawBuses(ctx);
    this.drawGalleries(ctx);
    this.drawWalkers(ctx);
    this.drawBalls(ctx);
    this.drawShot(ctx);
    if (this.range.scene) { const o = { x: 0, y: 0 }, cx = this.cw / 2, cy = this.ch / 2; this.range.drawOver(ctx, (x, y) => { o.x = (worldX(x, y) - this.cam.X) * ze + cx; o.y = (worldY(x, y) - this.cam.Y) * ze + cy; return o; }, ze, this.cam.z, this.dpr, this.cw, this.ch, this.labels); }
    if (this.grassPanel) {
      const s = this.grassScope();
      if (s) {
        const polygon = s.zone && this.grass.polygon(s.zone); ctx.beginPath();
        if (polygon) { for (let k = 0; k < polygon.length; k += 2) { const p = this.screen(polygon[k], polygon[k + 1]); if (!k) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); } }
        else for (let k = 0; k < 48; k++) { const angle = k * Math.PI / 24, p = this.screen(s.x + Math.cos(angle) * s.radius, s.y + Math.sin(angle) * s.radius); if (!k) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.closePath(); ctx.strokeStyle = '#86efac'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
      }
    }
    this.drawTolls(ctx);
    // the world labels: placed in one pass (by priority, none overlapping, kept still across frames) and written over the map, under the tools'
    // previews and hints
    { const t0 = performance.now(); this.labels.place(this.cw, this.ch); const gm = this.ghostMouse; this.labels.fadeNear = this.ghostTrees.ghost && gm ? { x: gm.mx * this.dpr, y: gm.my * this.dpr, r: LABEL_FADE_PX * this.dpr, a: LABEL_FADE_ALPHA } : null; this.labels.draw(ctx); this.perf.labelMs = performance.now() - t0; this.perf.labels = this.labels.n; this.perf.labelsShown = this.labels.shown; }
    this.drawTollPreview(ctx);
    this.drawBizPreview(ctx);
    this.drawEventGhosts(ctx);
    this.drawTeeGhost(ctx); // T268
    this.drawDecorGhost(ctx);
    this.drawPracticeGhost(ctx);
    this.drawBusPreview(ctx);
    for (const p of [this.selected, this.hoverProp]) {
      if (!p) continue;
      this.setIso(ctx); ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = p === this.selected ? 'rgba(255,190,60,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = p === this.selected ? '#ffbe3c' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // construction front: striped barrier, cones and dust
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl)), w = b.cls.h * 2, dd = 0.35;
        this.setIso(ctx); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(u.y, u.x));
        ctx.fillStyle = '#f2b632'; ctx.fillRect(-dd / 2, -w / 2, dd, w);
        ctx.fillStyle = '#1a1a1a'; for (let s = -w / 2; s < w / 2; s += 0.8) ctx.fillRect(-dd / 2, s, dd, 0.4);
        ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const t of [-b.cls.h + 0.4, b.cls.h - 0.4]) {
          const q = add(f, mul(n, t)), c = this.screen(q.x, q.y), hgt = 0.5 * HH * ze * 2.2, bw = 0.25 * HW * ze;
          ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(c.x, c.y - hgt); ctx.lineTo(c.x + bw, c.y); ctx.lineTo(c.x - bw, c.y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(c.x - bw * 0.5, c.y - hgt * 0.55, bw, hgt * 0.15);
        }
      });
    }
    for (const p of this.particles) {
      const s = this.screen(p.x, p.y), a = (1 - p.age / p.life) * 0.5, r = p.r * HW * ze;
      ctx.fillStyle = `rgba(214,190,150,${a.toFixed(3)})`; ctx.beginPath(); ctx.ellipse(s.x, s.y - p.z * HH * ze * 1.5, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    this.drawNight(ctx, now);
    // T147: the money floats over everything on the map (the night too), under the HUD
    // (T151: each float's column clear of the placed world labels)
    this.floatCols.begin();
    if (this.showMoneyFloats && this.floats.live.length) drawMoneyFloats(ctx, this.floats.live, now / 1000, (x, y) => this.screen(x, y), ze, this.dpr, this.cw, this.ch, { placer: this.labels.placer, cols: this.floatCols });
  }

  /** the map's three town names at the district and planner tiers: white with a dark outline, centred on each town site (screen px) */
  private drawTownNames() {
    const dpr = this.dpr, font = `bold ${16 * dpr}px sans-serif`;
    this.townPts.forEach((c, i) => {
      const s = this.screen(c.x, c.y);
      const name = this.townName(i); if (!name) return; // a new range game's town has no name yet (T095)
      this.labels.text(LABEL_KEY.town + i, PRI.name, name, s.x, s.y, font, 16 * dpr, '#ffffff', '#0f172a', 4 * dpr);
    });
  }

  /** the access overlay: each zone (128 tiles square) with a built lot, shaded by its access: green below 1.3, amber to 1.8, red above (25% alpha),
   *  with a red edge over 1.8; at the district and planner tiers each built zone is labelled with its growth (+started, −declining; growth stopped over 1.8) */
  private drawAccess(ctx: CanvasRenderingContext2D) {
    const T = this.traffic;
    this.growthNow();
    this.setIso(ctx);
    for (let z = 0; z < 256; z++) {
      if (!T.builtZone[z]) continue;
      const a = T.access[z]!, x0 = (z & 15) * 128, y0 = (z >> 4) * 128;
      ctx.fillStyle = a < 1.3 ? 'rgba(61,220,132,0.16)' : a <= 1.8 ? 'rgba(255,176,32,0.16)' : 'rgba(255,59,59,0.16)';
      ctx.fillRect(x0, y0, 128, 128);
      if (a > 1.8) { ctx.strokeStyle = 'rgba(255,59,59,0.6)'; ctx.lineWidth = 3 / (HW * this.cam.z * this.dpr); ctx.strokeRect(x0, y0, 128, 128); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.cam.z < DISTRICT_Z) {
      // the labels in screen px, at each built zone's centre: started (green) and declining (red); growth stopped under them
      // (T151: world labels, placed with the rest)
      const dpr = this.dpr, font = `bold ${12 * dpr}px sans-serif`, px = 12 * dpr, lw = 3 * dpr;
      for (let z = 0; z < 256; z++) {
        if (!T.builtZone[z]) continue;
        const g = this.growN[z]!, d = this.declN[z]!, stop = T.access[z]! > 1.8;
        if (!g && !d && !stop) continue;
        const c = this.screen((z & 15) * 128 + 64, (z >> 4) * 128 + 64), a = g ? `+${g}` : '', b = d ? ` −${d}` : '';
        if (a || b) this.labels.pair(LABEL_KEY.growth + z, PRI.growth, a, '#3ddc84', b, '#ff3b3b', c.x, c.y, font, px, '#0f172a', lw);
        if (stop) this.labels.text(LABEL_KEY.stopped + z, PRI.growth - 1, 'growth stopped', c.x, c.y + (a || b ? 15 * dpr : 0), font, px, '#ff3b3b', '#0f172a', lw);
      }
    }
  }

  /** Stadium label; the planner retains a footprint while detail tiers use the sorted artwork. */
  private drawStadium(ctx: CanvasRenderingContext2D) {
    // only a real stadium (T132: the site falls back to a golf game's clubhouse or range, and its "STADIUM · L1" was drawn under the range's own
    // label at the same spot: the stray glyph after "DRIVING RANGE")
    const s = this.site; if (!s || !this.bizDefs.some(d => d.type === 'stadium')) return;
    if (this.cam.z < PLANNER_Z) this.drawSite(ctx, s, 'rgba(150,160,175,0.55)');
    const dpr = this.dpr, c = this.screen(s.c.x, s.c.y);
    this.labels.text(LABEL_KEY.stadium, PRI.name, `STADIUM · L${this.traffic.round.level}`, c.x, c.y, `bold ${13 * dpr}px ui-sans-serif, system-ui, sans-serif`, 13 * dpr, '#f8fafc', LABEL_OUTLINE, 4 * dpr);
  }
  /** a stadium site drawn: the footprint in fill, its pitch inset 8 tiles, the outline and the 4 doors (the placed stadium and the business ghost) */
  private drawSite(ctx: CanvasRenderingContext2D, s: Site, fill: string) {
    const dpr = this.dpr, I = 8;
    const rect = (x: number, y: number, w: number, h: number) => { this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0); };
    rect(s.x, s.y, s.w, s.h); ctx.fillStyle = fill; ctx.fill();
    rect(s.x + I, s.y + I, s.w - 2 * I, s.h - 2 * I); ctx.fillStyle = 'rgba(70,140,70,0.55)'; ctx.fill();
    rect(s.x, s.y, s.w, s.h); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.fillStyle = '#ffbe3c';
    for (const d of s.doors) { const p = this.screen(d.x, d.y); ctx.beginPath(); ctx.arc(p.x, p.y, 6 * dpr, 0, Math.PI * 2); ctx.fill(); }
  }
  /** a business's rect drawn: its fill and the white outline (the placeholder art, until Phase 8) */
  private drawBizRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
    this.setIso(ctx); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
  }
  /** a refused rect (T180, not by colour alone): the hatch and the ✕, drawn over the ghost's picture */
  private refusedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) { drawRefusedMarks(this.ghostView(ctx), [x, y, x + w, y, x + w, y + h, x, y + h], 'front'); }
  /** Placed business labels; footprint fills only at planner zoom, below the detailed artwork tier. */
  private drawBusinesses(ctx: CanvasRenderingContext2D) {
    const dpr = this.dpr, font = `bold ${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    for (const d of this.bizDefs) {
      if (d.type === 'stadium') continue;
      // a range start's range (T132): its own name plate ("DRIVING RANGE · 4 BAYS", the worker's level means nothing there) on a dark plate, so
      // the land's dashed edge never runs through its letters; at district zoom the range's own "Driving Range" label stands in its place
      const range = d.type === 'range' && this.golf?.start === 'range' && this.golf.range;
      if (range && this.cam.z < RANGE_LABEL_Z) continue;
      const B = BUSINESS[d.type], c0 = this.screen(d.x + d.w / 2, d.y + d.h / 2), c = range ? { x: c0.x, y: c0.y + 16 * dpr } : c0, label = range ? rangeMapLabel(rangeStats(range).bays) : `${B.name.toUpperCase()} · L${this.traffic.biz.find(v => v.id === d.id)?.level ?? 1}`;
      if (this.cam.z < PLANNER_Z) this.drawBizRect(ctx, d.x, d.y, d.w, d.h, FAMILY_FILL[B.family]);
      // the business's own name: a world label of the first rank (T151), the range's on its dark plate
      const l = this.labels.text(d, PRI.name, label, c.x, c.y, font, 11 * dpr, '#f8fafc', LABEL_OUTLINE, 3 * dpr);
      if (range) { l.bg = 'rgba(2,6,23,0.82)'; l.radius = 5 * dpr; l.w = l.w1 + 12 * dpr; l.h = 18 * dpr; }
    }
  }
  /** the stand-in labels (T114): each building on screen drawn as a stand-in (the view's props and the businesses' pictures) carries "Stand In
   *  for <name>" (newart.ts standInLabel, cached strings) in a small dark pill just above its picture, sized with the zoom (11 to 9 css px) and
   *  faded out between 12% and 8%. World labels of the last rank (T151): they give way to the real names, moving just above or below, hidden only
   *  when no slot near is free. No allocation per frame: a reused query set and rect, widths measured once */
  private siHits = new Set<Prop>(); private siBox: BBox = [0, 0, 0, 0]; private siRect = [0, 0, 0, 0];
  private siFont = ''; private siPx = 0; private siFade = 1;
  private drawStandIns() {
    const z = this.cam.z, fade = Math.min(1, (z - STANDIN_FADE[0]) / (STANDIN_FADE[1] - STANDIN_FADE[0])); if (!(fade > 0)) return;
    const ze = z * this.dpr, hw = this.cw / 2 / ze, hh = this.ch / 2 / ze, b = this.siBox;
    // the view in tiles: the bbox of the screen's corners, reaching further down for the tall pictures whose anchors are below the screen
    const X0 = this.cam.X - hw, X1 = this.cam.X + hw, Y0 = this.cam.Y - hh, Y1 = this.cam.Y + hh + STANDIN_REACH;
    b[0] = (X0 / HW + Y0 / HH) / 2; b[2] = (X1 / HW + Y1 / HH) / 2; b[1] = (Y0 / HH - X1 / HW) / 2; b[3] = (Y1 / HH - X0 / HW) / 2;
    this.siHits.clear(); this.propGrid.query(b, this.siHits);
    // 11 css px at the closest zoom, smaller as the view zooms out, never below a readable 9 px
    const px = Math.round(this.dpr * Math.max(9, 11 * Math.sqrt(Math.min(1, z / ZOOM_MAX))));
    if (px !== this.siPx) { this.siPx = px; this.siFont = `600 ${px}px system-ui, sans-serif`; }
    this.siFade = fade;
    for (const p of this.siHits) this.standInPill(p, p, ze);
    for (const p of this.businessProps) this.standInPill(p, p, ze);
    for (const l of this.range.labels) this.standInPill(l, l.p, ze, l.text);
    // T259: the farms' stand-ins (the windbreak, the orchard, the crop fields, the lane) in the view's box
    for (const ls of this.farmLabels.values()) for (const l of ls) if (l.box[2]! >= b[0]! && l.box[0]! <= b[2]! && l.box[3]! >= b[1]! && l.box[1]! <= b[3]!) this.standInPill(l, l.p, ze, l.text);
    for (const l of this.decor.labels) this.standInPill(l, l.p, ze, l.text);
    for (const l of this.placeStandIns) this.standInPill(l, l.p, ze, l.text);
    for (const l of this.caddieLabels) this.standInPill(l.p, l.p, ze, l.text); // T213: the caddies' stand-in
  }
  /** one stand-in's label pill (drawStandIns), if p is drawn as a stand-in and its label is on screen: a world label (key: the prop, or the
   *  scene's label) */
  private standInPill(key: unknown, p: Drawable, ze: number, text?: string) {
    const label = text ?? standInLabel(p.item); if (label === null) return;
    const w11 = this.labels.width('600 11px system-ui, sans-serif', label);
    const r = spriteRect(p, this.siRect), s = this.siPx / 11, w = w11 * s + 12 * s, h = 17 * s;
    const cx = ((r[0]! + r[2]!) / 2 - this.cam.X) * ze + this.cw / 2, y0 = (r[1]! - this.cam.Y) * ze + this.ch / 2 - h - 3 * s;
    if (cx + w / 2 < 0 || cx - w / 2 > this.cw || y0 + h < 0 || y0 > this.ch) return;
    this.labels.pill(key, PRI.standIn, label, cx, y0 + h / 2, this.siFont, w, h, 'rgba(22,20,24,0.78)', h / 2, '#f1f5f9', 0.5 * s).alpha = this.siFade;
  }
  /** the business tool's ghost at the cursor: the footprint (green where it can go, else red; the stadium's with its doors) and the reason beside the cursor if
   *  it cannot. With the type in hand at its max only the hint shows (a red footprint would hide the real one) */
  private drawBizPreview(ctx: CanvasRenderingContext2D) {
    const h = this.bizHover; if (!h) return;
    if (this.bizCount(this.bizType) < BUSINESS[this.bizType].max) {
      const fill = h.why ? 'rgba(230,80,80,0.35)' : 'rgba(60,200,90,0.35)';
      if (this.bizType === 'stadium') this.drawSite(ctx, h.site, fill); else this.drawBizRect(ctx, h.def.x, h.def.y, h.def.w, h.def.h, fill);
      // Use the same composition and projection as the placed business, over its validity footprint.
      const ze = this.cam.z * this.dpr;
      ctx.save(); ctx.globalAlpha = h.why ? .35 : .65;
      for (const p of businessArt(h.def, LIBRARY, LIB_INDEX)) {
        // the picture the placed business draws (newart.ts: a stand-in, capped at its pixels), cut from its full-size page (mip 0, loaded on first use)
        const l = lookOf(p); if (l.hidden) continue;
        const it = LIBRARY[l.item], [page, u0, v0, u1, v1] = it.tex, image = this.pageImage0(page);
        if (!image) continue;
        const r = spriteRect(p), x = (r[0] - this.cam.X) * ze + this.cw / 2, y = (r[1] - this.cam.Y) * ze + this.ch / 2;
        const w = (r[2] - r[0]) * ze, height = (r[3] - r[1]) * ze;
        ctx.save(); ctx.translate(l.flip ? x + w : x, y); if (l.flip) ctx.scale(-1, 1);
        ctx.drawImage(image, u0 * image.naturalWidth, v0 * image.naturalHeight, (u1 - u0) * image.naturalWidth, (v1 - v0) * image.naturalHeight, 0, 0, w, height); ctx.restore();
      }
      ctx.restore();
      if (h.why && this.bizType !== 'stadium') this.refusedRect(ctx, h.def.x, h.def.y, h.def.w, h.def.h);
    }
    if (h.why) this.hintAt(ctx, h.mx, h.my, h.why, true);
  }
  /** the Props tool's ghost (T131): the picture at the cursor, see-through, over its footprint (green where it can stand, else red) and its label */
  private decorDraw: Drawable = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: false };
  private drawDecorGhost(ctx: CanvasRenderingContext2D) {
    const g = this.tool === 'props' ? this.decor.ghost : null, m = this.ghostMouse; if (!g) return;
    // T231: a run's other pieces and a pond's stones are drawn first, each over its footprint, back to front
    const all = [...this.decor.ghosts].sort((a, b) => a.x + a.y - b.x - b.y);
    if (!g.noPic) all.push(g);
    for (const q of all) {
      this.drawBizRect(ctx, q.box[0], q.box[1], q.box[2] - q.box[0], q.box[3] - q.box[1], q.why ? 'rgba(230,80,80,0.4)' : 'rgba(60,200,90,0.4)');
      const d = this.decorDraw; d.item = q.item; d.x = q.x; d.y = q.y; d.scale = q.scale; d.flip = !!q.flip;
      const l = lookOf(d), it = LIBRARY[l.item]!, [page, u0, v0, u1, v1] = it.tex, image = this.pageImage0(page);
      if (image && !l.hidden) {
        const ze = this.cam.z * this.dpr, r = spriteRect(d), x = (r[0] - this.cam.X) * ze + this.cw / 2, y = (r[1] - this.cam.Y) * ze + this.ch / 2, w = (r[2] - r[0]) * ze;
        ctx.save(); ctx.globalAlpha = q.why ? 0.4 : 0.75;
        // (T257: a mirrored look drawn mirrored about its rect)
        if (l.flip) { ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
        ctx.drawImage(image, u0 * image.naturalWidth, v0 * image.naturalHeight, (u1 - u0) * image.naturalWidth, (v1 - v0) * image.naturalHeight, x, y, w, (r[3] - r[1]) * ze);
        ctx.restore();
      }
      if (q.why) this.refusedRect(ctx, q.box[0], q.box[1], q.box[2] - q.box[0], q.box[3] - q.box[1]);
    }
    if (g.noPic && g.why) this.refusedRect(ctx, g.box[0], g.box[1], g.box[2] - g.box[0], g.box[3] - g.box[1]);
    if (m) this.hintAt(ctx, m.mx, m.my, g.label, !!g.why);
  }
  /** T206: Facilities ▸ Practice in hand: the practice area's outline and the facility's ghost (green, sand and mat, see-through; red with the
   *  reason where it cannot go) with its label; the bulldozer over a practice facility: what a click removes and refunds */
  private pracHover: { key: string; f: ReturnType<PracticeTool['facilityAt']> } | null = null;
  private drawPracticeGhost(ctx: CanvasRenderingContext2D) {
    const m = this.ghostMouse;
    if (this.tool === 'bulldoze' && !this.hoverPiece && this.hover && this.golf && this.courseGrid) {
      const h = this.hover, key = `${Math.floor(h.x * 2)},${Math.floor(h.y * 2)},${this.courseGrid.rev}`;
      if (this.pracHover?.key !== key) this.pracHover = { key, f: this.practice.facilityAt(h.x, h.y) };
      const f = this.pracHover.f; if (f && m) this.hintAt(ctx, m.mx, m.my, `Click removes the ${f.name} (+$${f.refund.toLocaleString()})`, true);
      return;
    }
    if (this.tool !== 'practice') return;
    const a = this.range.scene?.practice, v = this.ghostView(ctx);
    if (a) drawGhostPoly(v, a.pts, 'valid', { dashed: true, fillColor: 'rgba(236,252,203,0.05)' });
    const g = this.practice.ghost; if (!g) return;
    const st = g.why ? 'invalid' : 'valid', p = g.plan;
    drawGhostPoly(v, p.green, st, { fillColor: g.why ? undefined : 'rgba(110,190,90,0.55)', borderWidthTiles: 1, borderColor: 'rgba(80,150,70,0.35)' });
    if (p.bunker) drawGhostPoly(v, p.bunker, st, { fillColor: g.why ? undefined : 'rgba(230,214,160,0.7)' });
    if (p.spot) drawGhostPoly(v, p.spot, st, { fillColor: g.why ? undefined : 'rgba(150,200,110,0.7)' });
    if (m) this.hintAt(ctx, m.mx, m.my, g.label, !!g.why);
  }
  /** the overlay view the shared ghost drawers take (T019/T020) */
  private ghostView(ctx: CanvasRenderingContext2D): GhostView {
    return { ctx, setIso: c => this.setIso(c as CanvasRenderingContext2D), screen: (x, y) => this.screen(x, y), dpr: this.dpr };
  }
  /** the Event tool's and the Holes tool's ghosts at the cursor (T019): the pending structure's footprint or the selected marker's ring, green when the click would succeed, else red, with its one-line label; rebuilt only when the hover spot or the course changes */
  private drawEventGhosts(ctx: CanvasRenderingContext2D) {
    const h = this.hover, m = this.ghostMouse, g = this.golf; if (!h || !m || !g) return;
    let key = '', make: (() => GhostBlueprint) | null = null;
    if (this.eventTool && this.eventStructurePending) {
      const p = this.eventStructurePending, cand = { typeId: p.typeId, mode: p.mode, x: Math.round(h.x), y: Math.round(h.y) };
      key = `s|${p.typeId}|${p.mode}|${cand.x}|${cand.y}|${this.money}|${this.paint.areas.length}|${this.gaRev}|${(g.structures ?? []).length}`;
      make = () => structureGhost(structureRect(cand), this.structureCheck(cand), this.money, STRUCTURE[p.typeId]?.name ?? p.typeId, p.mode);
    } else if ((this.holesTool || this.markerDrag) && this.selectedGolfMarker) {
      const s = this.selectedGolfMarker;
      key = `m|${s.hole}|${s.kind}|${h.x}|${h.y}|${this.paint.areas.length}|${this.gaRev}`;
      make = () => markerGhost(h.x, h.y, s.hole, s.kind, validateMarkerPlacement(this.courseAreaList(), s.kind, h.x, h.y));
    }
    if (!make) return;
    if (this.ghostCache?.key !== key) this.ghostCache = { key, bp: make() };
    drawGhostBlueprint(this.ghostView(ctx), this.ghostCache.bp, m.mx, m.my);
  }
  /** a hint label beside the cursor at (mx, my) (screen px, as the tools' why): the text in red when bad, else green */
  private hintAt(ctx: CanvasRenderingContext2D, mx: number, my: number, text: string, bad: boolean) {
    const dpr = this.dpr, x = mx * dpr + 14 * dpr, y = my * dpr - 12 * dpr;
    ctx.font = `bold ${12 * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 * dpr; ctx.strokeStyle = 'rgba(2,6,23,0.9)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = bad ? '#fecaca' : '#bbf7d0'; ctx.fillText(text, x, y);
    ctx.lineJoin = 'miter'; ctx.textBaseline = 'alphabetic';
  }
  /** the road tool's snap mark: an amber ring on a node or a dead end, a tick across the road on a road; nothing on the grid */
  private drawSnapMark(ctx: CanvasRenderingContext2D, s: Snap) {
    if (s.kind === 'node' || s.kind === 'end') {
      const c = this.screen(s.p.x, s.p.y);
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2 * this.dpr; ctx.beginPath(); ctx.arc(c.x, c.y, 8 * this.dpr, 0, Math.PI * 2); ctx.stroke();
    } else if (s.kind === 'road' && s.seg) {
      const n = perp(norm(sub(s.seg.b, s.seg.a))), h = s.seg.cls.h + 0.5, p = s.p;
      this.setIso(ctx); ctx.beginPath(); ctx.moveTo(p.x - n.x * h, p.y - n.y * h); ctx.lineTo(p.x + n.x * h, p.y + n.y * h); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2 * this.dpr; ctx.stroke();
    }
  }
  private drawGroundOverlays(ctx: CanvasRenderingContext2D) {
    const strip = (legs: Leg[], hw: number) => { for (const l of legs) { const d = sub(l.b, l.a), len = vlen(d) || 1, u = mul(d, 1 / len), n = perp(u); const c = [add(sub(l.a, mul(u, hw)), mul(n, hw)), add(add(l.b, mul(u, hw)), mul(n, hw)), sub(add(l.b, mul(u, hw)), mul(n, hw)), sub(sub(l.a, mul(u, hw)), mul(n, hw))]; ctx.moveTo(c[0].x, c[0].y); for (let k = 1; k < 4; k++) ctx.lineTo(c[k].x, c[k].y); ctx.closePath(); } };
    if (this.tool === 'road') {
      const legs = this.previewLegs(), cls = this.cls, cs = this.cursorSnap(), block = this.routeBlock(legs), bad = block !== '', cuts = this.routeCuts(legs);
      if (legs.length) {
        // the pieces Replace will take up: amber and dashed, under the route (drawn red on top they made a buildable route look refused, the
        // owner, 2026-10-19; red stays the colour of a refusal)
        if (cuts.length) { this.setIso(ctx); ctx.beginPath(); for (const c of cuts) strip([{ a: c.p0, b: c.p1 }], c.seg.cls.h + c.seg.cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(251,191,36,0.22)'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = cls.walkTex === 'gravel' ? 'rgba(150,140,120,0.45)' : 'rgba(230,200,160,0.45)'; ctx.fill();
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(160,40,40,0.6)' : 'rgba(50,60,80,0.6)'; ctx.fill(); ctx.strokeStyle = bad ? 'rgba(248,113,113,0.9)' : 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (cls.median) { this.setIso(ctx); ctx.beginPath(); strip(legs, cls.median / 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(90,160,70,0.55)'; ctx.fill(); }
        // the thing in the way, outlined red (T207: the shop, the covered bays, a car park, a toll plaza, a business, a big prop)
        const hit = bad ? this.routeInWay(legs) : null;
        if (hit && hit.why === block) {
          const o = hit.outline; this.setIso(ctx); ctx.beginPath(); ctx.moveTo(o[0]!, o[1]!); for (let k = 2; k < o.length; k += 2) ctx.lineTo(o[k]!, o[k + 1]!); ctx.closePath(); ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = 'rgba(240,80,60,0.28)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = bad ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
        if (cls.oneway) {
          // the flow: a white chevron every 15 tiles on the centre line, in the drawn direction
          this.setIso(ctx); ctx.beginPath();
          for (const l of legs) {
            const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, L = Math.hypot(dx, dy); if (L < 0.01) continue;
            const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
            for (let s = Math.min(7.5, L / 2); s < L; s += 15) {
              const px = l.a.x + ux * s, py = l.a.y + uy * s, tx = px - ux * 0.6, ty = py - uy * 0.6;
              ctx.moveTo(tx + nx * 0.8, ty + ny * 0.8); ctx.lineTo(px + ux * 0.6, py + uy * 0.6); ctx.lineTo(tx - nx * 0.8, ty - ny * 0.8);
            }
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
        }
        const pts = [...this.route, legs[legs.length - 1].b];
        for (const p of pts) { const s = this.screen(p.x, p.y); ctx.fillStyle = '#ffd866'; ctx.beginPath(); ctx.arc(s.x, s.y, 4 * this.dpr, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5; ctx.stroke(); }
      } else if (cs) {
        const s = this.screen(cs.p.x, cs.p.y);
        ctx.fillStyle = bad ? 'rgba(248,113,113,0.9)' : 'rgba(255,216,102,0.9)'; ctx.beginPath(); ctx.arc(s.x, s.y, 5 * this.dpr, 0, Math.PI * 2); ctx.fill();
      }
      if (cs) {
        this.drawSnapMark(ctx, cs);
        if (bad) { const c = this.screen(cs.p.x, cs.p.y); ctx.font = `bold ${12 * this.dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * this.dpr; ctx.strokeStyle = '#0f172a'; ctx.strokeText(block, c.x, c.y - 18 * this.dpr); ctx.fillStyle = '#f87171'; ctx.fillText(block, c.x, c.y - 18 * this.dpr); }
      }
      const gm = this.ghostMouse;
      if (legs.length && !bad && gm) {
        const key = `${cls.id}|` + legs.map(l => `${l.a.x},${l.a.y},${l.b.x},${l.b.y}`).join('|');
        if (this.routeCostCache?.key !== key) this.routeCostCache = { key, cost: this.routeCost() };
        let len = 0; for (const l of legs) len += vlen(sub(l.b, l.a));
        const g = costLabel('', this.routeCostCache.cost, this.money, `${Math.round(len * 2)} m of ${cls.name.toLowerCase()}`);
        drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, g.label, g.bad);
      }
    } else if (this.tool === 'junction' && this.hoverNode) {
      const n = this.hoverNode, b = this.brush;
      if (b === 'roundabout' || b === 'mini') {
        // what the brush would build, before the click: the ring (its circle and island) amber, or red with the roads in the way red and the reason
        // written over it (the owner: show what it is going to build, with red where the issue is)
        const rl = this.ringLanes, c = this.installCheck(n, b, rl), R = this.ringOf(n, b, rl), ri = b === 'roundabout' ? R - rl * RB_LANE : R - 1.4, bad = !!c.why && !/^It (already|is already)/.test(c.why);
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(240,80,60,0.28)' : 'rgba(60,70,90,0.45)'; ctx.fill(); ctx.strokeStyle = bad ? '#f87171' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.5, ri), 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = bad ? 'rgba(240,80,60,0.18)' : 'rgba(110,150,80,0.5)'; ctx.fill(); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (c.hit.length) { this.setIso(ctx); ctx.beginPath(); strip(c.hit.map(s => ({ a: s.a, b: s.b })), Math.max(...c.hit.map(s => s.cls.h + s.cls.walk))); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(240,80,60,0.45)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2; ctx.stroke(); }
        // T224: what the ring would take in, before the click: the buildings and props it clears amber and dashed (their compensation is in the price
        // below), the thing that refuses it (a business, the range's sign, an iconic place, a big prop) outlined red
        const ring = c.ring, poly = (o: readonly number[]) => { ctx.moveTo(o[0]!, o[1]!); for (let k = 2; k < o.length; k += 2) ctx.lineTo(o[k]!, o[k + 1]!); ctx.closePath(); };
        if (ring && !bad && (ring.lotOutlines.length || ring.props.length)) {
          this.setIso(ctx); ctx.beginPath(); for (const o of ring.lotOutlines) poly(o); for (const p of ring.props) poly(rectPoly(p.x0, p.y0, p.x1, p.y1)); ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = 'rgba(251,191,36,0.3)'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (ring?.outline.length && c.why === ring.why) {
          this.setIso(ctx); ctx.beginPath(); for (const o of ring.outline) poly(o); ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.fillStyle = 'rgba(240,80,60,0.28)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        const gm = this.ghostMouse;
        if (!bad && !c.why && gm) {
          const nl = ring?.lots.length ?? 0, np = ring?.props.length ?? 0, nm = b === 'roundabout' ? `Roundabout, ${rl} lane${rl > 1 ? 's' : ''}` : 'Mini-roundabout';
          const g = costLabel('', c.cost + c.comp, this.money, `${nm}${nl ? ` · ${nl} building${nl > 1 ? 's' : ''} cleared, $${c.comp.toLocaleString()} compensation` : ''}${np ? ` · ${np} item${np > 1 ? 's' : ''} cleared` : ''}`);
          drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, g.label, g.bad);
        }
        if (bad) { const p = this.screen(n.x, n.y); ctx.font = `bold ${12 * this.dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3 * this.dpr; ctx.strokeStyle = '#0f172a'; ctx.strokeText(c.why, p.x, p.y - 22 * this.dpr); ctx.fillStyle = '#f87171'; ctx.fillText(c.why, p.x, p.y - 22 * this.dpr); }
      } else {
        const r = Math.max(...n.arms.map(a => a.h)) + 1.5;
        this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(255,216,102,0.22)'; ctx.fill(); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
    } else if ((this.tool === 'lane' || this.tool === 'downgrade') && this.laneHover?.segs.length) {
      // the run the Upgrade (Downgrade) tool would change: amber (blue) where it can go, red where not
      const h = this.laneHover, cls = h.segs[0]!.cls, legs = h.segs.map(s => ({ a: s.a, b: s.b }));
      this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = h.why ? 'rgba(240,80,60,0.3)' : h.down ? 'rgba(96,165,250,0.3)' : 'rgba(255,216,102,0.3)'; ctx.fill();
      this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.strokeStyle = h.why ? '#f87171' : h.down ? '#60a5fa' : '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
      // T224: the buildings and items the rings at its ends would grow over (amber, paid for in the price), or the thing that refuses (red)
      const poly = (o: readonly number[]) => { ctx.moveTo(o[0]!, o[1]!); for (let k = 2; k < o.length; k += 2) ctx.lineTo(o[k]!, o[k + 1]!); ctx.closePath(); };
      for (const r of h.rings) {
        this.setIso(ctx); ctx.beginPath();
        if (r.why) for (const o of r.outline) poly(o); else { for (const o of r.lotOutlines) poly(o); for (const p of r.props) poly(rectPoly(p.x0, p.y0, p.x1, p.y1)); }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (r.why) { ctx.fillStyle = 'rgba(240,80,60,0.28)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5; ctx.stroke(); }
        else if (r.lotOutlines.length || r.props.length) { ctx.fillStyle = 'rgba(251,191,36,0.3)'; ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); }
      }
      const gm = this.ghostMouse, nb = h.rings.reduce((a, r) => a + (r.why ? 0 : r.lots.length), 0);
      if (gm) { const g = costLabel(h.why, h.cost + h.comp, this.money, h.to ? `${h.down ? 'Downgrade' : 'Upgrade'} to ${h.to.name.toLowerCase()}${nb ? ` · ${nb} building${nb > 1 ? 's' : ''} cleared, $${h.comp.toLocaleString()} compensation` : ''}` : ''); drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, g.label, g.bad); }
    } else if (this.tool === 'bulldoze' && this.hoverPiece) {
      const pc = this.hoverPiece, cls = pc.seg.cls;
      this.setIso(ctx); ctx.beginPath(); strip([{ a: pc.p0, b: pc.p1 }], cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(240,80,60,0.3)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5; ctx.stroke();
      const gm = this.ghostMouse;
      if (gm) drawGhostHint(this.ghostView(ctx), gm.mx, gm.my, `Click removes this ${cls.name.toLowerCase()} (refunds its value)`, true);
    } else if (this.clubPlacing && this.tool === 'course') {
      const bt = this.bizType; this.bizType = 'clubhouse'; this.drawBizPreview(ctx); this.bizType = bt;
    } else if (this.halfwayPlacing && this.tool === 'course') {
      const bt = this.bizType; this.bizType = 'halfway'; this.drawBizPreview(ctx); this.bizType = bt;
    } else if (this.paintOn && this.brushOpen) {
      this.paint.drawPreview({ ctx, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y), dpr: this.dpr, hint: (mx, my, t, b) => this.hintAt(ctx, mx, my, t, b) });
      const v = this.cursorView; v.ze = this.cam.z * this.dpr; v.camX = this.cam.X; v.camY = this.cam.Y; v.cw = this.cw; v.ch = this.ch; v.dpr = this.dpr;
      const now = performance.now();
      this.courseCursor.draw(ctx, v, this.paint, now);
      if (this.courseCursor.hintRev !== this.hintSeen && now - this.hintEmitAt > 100) { this.hintSeen = this.courseCursor.hintRev; this.hintEmitAt = now; this.emit(); }
    }
    else if (this.tool === 'park' && this.parking.mode !== 'rect') this.parking.drawPreview({ ctx, setIso: c => this.setIso(c), screen: (x, y) => this.screen(x, y), dpr: this.dpr, hint: (mx, my, t, b) => this.hintAt(ctx, mx, my, t, b) });
  }
}
