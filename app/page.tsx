"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Terrain = "water" | "desert" | "forest" | "hills" | "grass" | "mountain";
type Position = { col: number; row: number };
type TechId = "husbandry" | "riding" | "federalism" | "broadcast";
type BuildingId = "monument" | "granary" | "academy" | "workshop";
type UnitProductionId = "scout" | "gaucho";
type ProductionId = BuildingId | UnitProductionId;
type UnitType = "scout" | "gaucho";
type YieldKey = "food" | "production" | "science" | "culture";
type ImprovementType = "palace" | "ranch" | "farm";
type PlayerUnit = { id: string; type: UnitType; pos: Position; moves: number };
type BuildingProject = { id: BuildingId; kind: "building"; name: string; cost: number; icon: string; effect: string; category: string; yield: YieldKey; allowedTerrains: Terrain[]; placementRule: string };
type UnitProject = { id: UnitProductionId; kind: "unit"; unitType: UnitType; name: string; cost: number; icon: string; effect: string; category: string; yield: "production" };
type ProductionProject = BuildingProject | UnitProject;

type GameState = {
  turn: number;
  gold: number;
  science: number;
  culture: number;
  greatPoints: number;
  population: number;
  food: number;
  activeTech: TechId | null;
  techProgress: number;
  completedTechs: TechId[];
  activeProduction: ProductionId | null;
  productionProgress: Record<ProductionId, number>;
  completedBuildings: BuildingId[];
  buildingPlacements: Partial<Record<BuildingId, string>>;
  units: PlayerUnit[];
  selectedUnitId: string | null;
  nextUnitSerial: number;
  brazilPos: Position;
  brazilInfluence: number;
  discovered: Set<string>;
  selectedTile: string | null;
  messiRecruited: boolean;
  messiAbilityUsed: boolean;
  footballTurns: number;
  message: string;
  log: string[];
  result: "win" | "lose" | null;
};

type SavedGameState = Omit<GameState, "discovered"> & { discovered: string[] };
type SaveEnvelope = { version: 1; savedAt: string; game: SavedGameState };
type SaveReadResult =
  | { ok: true; savedAt: string; game: GameState }
  | { ok: false; reason: "missing" | "version" | "corrupt" };
type SaveMeta = { savedAt: string; turn: number };

const LEGACY_COLS = 9;
const LEGACY_ROWS = 6;
const COLS = 15;
const ROWS = 8;
const CITY_POS = { col: 4, row: 2 };
const BRAZIL_CITY_POS = { col: 13, row: 1 };
const BRAZIL_LABEL_POS = { col: 14, row: 0 };
const BRAZIL_SCOUT_START = { col: 12, row: 2 };
const BOARD_WIDTH = (COLS - 1) * 70 + 92;
const BOARD_HEIGHT = (ROWS - 1) * 82 + 41 + 80;
const EXPLORE_TARGET = 42;
const SAVE_KEY = "civilization-dawn.single-slot";
const SAVE_VERSION = 1 as const;

const LEGACY_TERRAIN: Terrain[] = [
  "water", "desert", "forest", "hills", "grass", "mountain", "water", "desert", "forest",
  "desert", "forest", "grass", "grass", "hills", "forest", "mountain", "grass", "water",
  "water", "grass", "forest", "desert", "grass", "hills", "grass", "forest", "desert",
  "desert", "grass", "grass", "forest", "desert", "grass", "forest", "hills", "water",
  "hills", "forest", "grass", "water", "grass", "desert", "forest", "grass", "mountain",
  "water", "desert", "forest", "water", "hills", "grass", "water", "desert", "forest",
];

const TERRAIN_INFO: Record<Terrain, { label: string; food: number; production: number; science: number; culture: number; gold: number }> = {
  water: { label: "浅海", food: 1, production: 0, science: 1, culture: 0, gold: 2 },
  desert: { label: "沙漠", food: 0, production: 1, science: 1, culture: 0, gold: 1 },
  forest: { label: "森林", food: 1, production: 2, science: 0, culture: 1, gold: 1 },
  hills: { label: "丘陵", food: 0, production: 3, science: 1, culture: 0, gold: 1 },
  grass: { label: "潘帕斯草原", food: 3, production: 1, science: 0, culture: 1, gold: 0 },
  mountain: { label: "山脉", food: 0, production: 1, science: 2, culture: 0, gold: 0 },
};

const IMPROVEMENTS: Record<string, { type: ImprovementType; name: string; bonus: { food?: number; production?: number; science?: number; culture?: number } }> = {
  "4-2": { type: "palace", name: "首都宫殿", bonus: { production: 1, science: 1, culture: 1 } },
  "3-1": { type: "ranch", name: "潘帕斯牧场", bonus: { food: 1, production: 1 } },
  "2-3": { type: "farm", name: "灌溉农场", bonus: { food: 2 } },
};

const TECHS: Array<{ id: TechId; name: string; cost: number; icon: string; effect: string }> = [
  { id: "husbandry", name: "畜牧业", cost: 12, icon: "♞", effect: "潘帕斯地块食物 +1" },
  { id: "riding", name: "骑术传统", cost: 16, icon: "⚑", effect: "高乔侦骑移动力 +1" },
  { id: "federalism", name: "联邦制度", cost: 20, icon: "◈", effect: "首都每回合科研 +2" },
  { id: "broadcast", name: "大众广播", cost: 24, icon: "◉", effect: "每回合伟人点 +2" },
];

const PRODUCTIONS: ProductionProject[] = [
  { id: "monument", kind: "building", name: "五月纪念碑", cost: 14, icon: "✦", effect: "每回合文化 +2", category: "文化建筑", yield: "culture", allowedTerrains: ["grass", "desert", "hills"], placementRule: "建在草原、沙漠或丘陵" },
  { id: "granary", kind: "building", name: "潘帕斯粮仓", cost: 21, icon: "♨", effect: "每回合食物 +2", category: "农业建筑", yield: "food", allowedTerrains: ["grass", "forest"], placementRule: "建在草原或森林" },
  { id: "academy", kind: "building", name: "国立学院", cost: 28, icon: "◆", effect: "每回合科技 +2", category: "科技建筑", yield: "science", allowedTerrains: ["grass", "desert", "hills", "forest"], placementRule: "建在陆地；山脉与丘陵提供相邻加成" },
  { id: "workshop", kind: "building", name: "布宜诺斯工坊", cost: 32, icon: "⚒", effect: "首都每回合生产力 +2", category: "工业建筑", yield: "production", allowedTerrains: ["forest", "hills", "desert"], placementRule: "建在森林、丘陵或沙漠" },
  { id: "scout", kind: "unit", unitType: "scout", name: "潘帕斯侦察兵", cost: 12, icon: "侦", effect: "移动力 2 · 擅长揭开战争迷雾", category: "侦察单位", yield: "production" },
  { id: "gaucho", kind: "unit", unitType: "gaucho", name: "高乔骑手", cost: 20, icon: "高", effect: "移动力 3 · 阿根廷特色骑乘单位", category: "骑乘单位", yield: "production" },
];

const UNIT_INFO: Record<UnitType, { name: string; short: string; baseMoves: number }> = {
  scout: { name: "潘帕斯侦察兵", short: "侦", baseMoves: 2 },
  gaucho: { name: "高乔骑手", short: "高", baseMoves: 3 },
};

const YIELD_META: Record<YieldKey, { label: string; symbol: string }> = {
  food: { label: "食物", symbol: "粮" },
  production: { label: "生产", symbol: "锤" },
  science: { label: "科技", symbol: "科" },
  culture: { label: "文化", symbol: "文" },
};

const idFor = ({ col, row }: Position) => `${col}-${row}`;
const posForId = (id: string): Position => ({ col: Number(id.split("-")[0]), row: Number(id.split("-")[1]) });
const inBounds = ({ col, row }: Position) => col >= 0 && col < COLS && row >= 0 && row < ROWS;
const EXPANSION_PATTERN: Terrain[] = ["grass", "forest", "hills", "grass", "desert", "forest", "grass", "hills", "water", "grass", "mountain", "forest"];
const terrainAt = ({ col, row }: Position): Terrain => {
  if (col < LEGACY_COLS && row < LEGACY_ROWS) return LEGACY_TERRAIN[row * LEGACY_COLS + col];
  if (col === BRAZIL_CITY_POS.col && row === BRAZIL_CITY_POS.row) return "grass";
  if (col === BRAZIL_SCOUT_START.col && row === BRAZIL_SCOUT_START.row) return "forest";
  if (row === ROWS - 1 && col > 9 && col % 3 === 0) return "water";
  return EXPANSION_PATTERN[(col * 5 + row * 7) % EXPANSION_PATTERN.length];
};
const MAP_TILES = Array.from({ length: COLS * ROWS }, (_, index) => {
  const pos = { col: index % COLS, row: Math.floor(index / COLS) };
  return { ...pos, terrain: terrainAt(pos) };
});

function hexGeometry({ col, row }: Position) {
  const x = col * 70;
  const y = row * 82 + (col % 2) * 41;
  return {
    cx: x + 46,
    cy: y + 40,
    points: `${x + 23},${y} ${x + 69},${y} ${x + 92},${y + 40} ${x + 69},${y + 80} ${x + 23},${y + 80} ${x},${y + 40}`,
  };
}

function neighbors(pos: Position) {
  const offsets = pos.col % 2
    ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  return offsets.map(([dc, dr]) => ({ col: pos.col + dc, row: pos.row + dr })).filter(inBounds);
}

function hexDistance(a: Position, b: Position) {
  const cube = (pos: Position) => {
    const x = pos.col;
    const z = pos.row - (pos.col - (pos.col & 1)) / 2;
    return { x, y: -x - z, z };
  };
  const ac = cube(a);
  const bc = cube(b);
  return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
}

function isArgentineTerritory(pos: Position) {
  return hexDistance(pos, CITY_POS) <= 2;
}

function isBrazilianTerritory(pos: Position) {
  return hexDistance(pos, BRAZIL_CITY_POS) <= 2;
}

function territoryEdgePath(predicate: (pos: Position) => boolean) {
  const segments: string[] = [];
  for (const tile of MAP_TILES) {
    const pos = { col: tile.col, row: tile.row };
    if (!predicate(pos)) continue;
    const x = pos.col * 70;
    const y = pos.row * 82 + (pos.col % 2) * 41;
    const vertices = [[x + 23, y], [x + 69, y], [x + 92, y + 40], [x + 69, y + 80], [x + 23, y + 80], [x, y + 40]];
    const rawOffsets = pos.col % 2
      ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
      : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
    rawOffsets.forEach(([dc, dr], edge) => {
      const adjacent = { col: pos.col + dc, row: pos.row + dr };
      if (!inBounds(adjacent) || !predicate(adjacent)) {
        const start = vertices[edge];
        const end = vertices[(edge + 1) % vertices.length];
        segments.push(`M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`);
      }
    });
  }
  return segments.join(" ");
}

const ARGENTINA_EDGE_PATH = territoryEdgePath(isArgentineTerritory);
const BRAZIL_EDGE_PATH = territoryEdgePath(isBrazilianTerritory);
const CAPITAL_DISTANCE = hexDistance(CITY_POS, BRAZIL_CITY_POS);

function movementRange(start: Position, remainingMoves: number, enemyIds: ReadonlySet<string>, knownTiles?: ReadonlySet<string>) {
  const reachable = new Map<string, number>();
  const budget = Math.max(0, Math.floor(remainingMoves));
  if (!inBounds(start) || budget === 0) return reachable;

  const visited = new Map<string, number>([[idFor(start), 0]]);
  const queue: Position[] = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    const currentCost = visited.get(idFor(current))!;
    if (currentCost >= budget) continue;
    for (const next of neighbors(current)) {
      const nextId = idFor(next);
      const terrain = terrainAt(next);
      const terrainKnown = !knownTiles || knownTiles.has(nextId);
      const blocked = enemyIds.has(nextId) || (terrainKnown && (terrain === "water" || terrain === "mountain"));
      if (blocked || visited.has(nextId)) continue;
      const nextCost = currentCost + 1;
      if (nextCost > budget) continue;
      visited.set(nextId, nextCost);
      reachable.set(nextId, nextCost);
      if (terrainKnown) queue.push(next);
    }
  }
  return reachable;
}

function reveal(discovered: Set<string>, center: Position, radius = 1) {
  const next = new Set(discovered);
  const frontier: Position[] = [center];
  next.add(idFor(center));
  let current = frontier;
  for (let depth = 0; depth < radius; depth += 1) {
    const expanded = current.flatMap(neighbors);
    expanded.forEach((pos) => next.add(idFor(pos)));
    current = expanded;
  }
  return next;
}

function initialDiscovered() {
  let set = new Set<string>();
  set = reveal(set, CITY_POS, 2);
  set = reveal(set, { col: 6, row: 3 }, 1);
  set.add(idFor(BRAZIL_CITY_POS));
  set.add(idFor(BRAZIL_SCOUT_START));
  return set;
}

const CITY_BUILDABLE_IDS = reveal(new Set<string>(), CITY_POS, 2);

function placedProductionAt(state: GameState, tileId: string) {
  const entry = Object.entries(state.buildingPlacements).find(([, placedTile]) => placedTile === tileId);
  return (entry?.[0] as BuildingId | undefined) ?? null;
}

function placementAdjacencyFor(productionId: BuildingId, pos: Position) {
  const adjacent = neighbors(pos);
  const count = adjacent.filter((neighbor) => {
    const terrain = terrainAt(neighbor);
    if (productionId === "monument") return idFor(neighbor) === idFor(CITY_POS) || terrain === "grass";
    if (productionId === "granary") return terrain === "grass" || IMPROVEMENTS[idFor(neighbor)]?.type === "farm";
    if (productionId === "academy") return terrain === "mountain" || terrain === "hills";
    return terrain === "hills" || terrain === "forest";
  }).length;
  return Math.min(3, count);
}

function completedPlacementBonus(state: GameState, productionId: BuildingId) {
  const tileId = state.buildingPlacements[productionId];
  return tileId && state.completedBuildings.includes(productionId)
    ? placementAdjacencyFor(productionId, posForId(tileId))
    : 0;
}

function productionPlacementError(state: GameState, productionId: BuildingId, pos: Position) {
  const tileId = idFor(pos);
  const production = PRODUCTIONS.find((item): item is BuildingProject => item.id === productionId && item.kind === "building")!;
  const terrain = terrainAt(pos);
  if (!state.discovered.has(tileId)) return "尚未探索这块地";
  if (!isArgentineTerritory(pos)) return "不在布宜诺斯艾利斯领土内";
  if (!CITY_BUILDABLE_IDS.has(tileId)) return "超出首都两格建设范围";
  if (tileId === idFor(CITY_POS)) return "首都宫殿已占用这块地";
  if (terrain === "water" || terrain === "mountain") return `${TERRAIN_INFO[terrain].label}不能建设`;
  if (IMPROVEMENTS[tileId]) return `${IMPROVEMENTS[tileId].name}已占用这块地`;
  if (placedProductionAt(state, tileId)) return "已有城市建筑占用这块地";
  if (state.units.some((unit) => tileId === idFor(unit.pos)) || tileId === idFor(state.brazilPos)) return "单位正在占用这块地";
  if (!production.allowedTerrains.includes(terrain)) return production.placementRule;
  return null;
}

function bestAvailableAdjacency(state: GameState, productionId: BuildingId) {
  return MAP_TILES.reduce((best, tile) => {
    const pos = { col: tile.col, row: tile.row };
    return productionPlacementError(state, productionId, pos) ? best : Math.max(best, placementAdjacencyFor(productionId, pos));
  }, 0);
}

function tileProductionFor(state: GameState, pos: Position) {
  if (placedProductionAt(state, idFor(pos))) return 0;
  const terrain = TERRAIN_INFO[terrainAt(pos)];
  const improvement = IMPROVEMENTS[idFor(pos)];
  return terrain.production + (improvement?.bonus.production ?? 0);
}

function cityProductionFor(state: GameState) {
  const workable = [CITY_POS, ...neighbors(CITY_POS)]
    .filter((pos) => state.discovered.has(idFor(pos)) && isArgentineTerritory(pos))
    .map((pos) => tileProductionFor(state, pos))
    .sort((a, b) => b - a);
  const workedTileProduction = workable.slice(0, Math.max(1, state.population)).reduce((total, value) => total + value, 0);
  return Math.max(1, workedTileProduction) + (state.completedBuildings.includes("workshop") ? 2 + completedPlacementBonus(state, "workshop") : 0);
}

function maxMovesForUnit(type: UnitType, completedTechs: readonly TechId[], footballTurns: number) {
  return UNIT_INFO[type].baseMoves + (type === "gaucho" && completedTechs.includes("riding") ? 1 : 0) + (footballTurns > 0 ? 1 : 0);
}

function findUnitDeployment(state: GameState) {
  const candidates = [CITY_POS, ...neighbors(CITY_POS)];
  const occupied = new Set(state.units.map((unit) => idFor(unit.pos)));
  return candidates.find((pos, index) => {
    const terrain = terrainAt(pos);
    return candidates.findIndex((candidate) => idFor(candidate) === idFor(pos)) === index
      && isArgentineTerritory(pos)
      && terrain !== "water"
      && terrain !== "mountain"
      && !occupied.has(idFor(pos))
      && idFor(pos) !== idFor(state.brazilPos);
  }) ?? null;
}

function createInitialState(): GameState {
  return {
    turn: 1,
    gold: 80,
    science: 0,
    culture: 8,
    greatPoints: 18,
    population: 3,
    food: 4,
    activeTech: "husbandry",
    techProgress: 0,
    completedTechs: [],
    activeProduction: null,
    productionProgress: { monument: 0, granary: 0, academy: 0, workshop: 0, scout: 0, gaucho: 0 },
    completedBuildings: [],
    buildingPlacements: {},
    units: [{ id: "gaucho-1", type: "gaucho", pos: { col: 6, row: 3 }, moves: 3 }],
    selectedUnitId: "gaucho-1",
    nextUnitSerial: 2,
    brazilPos: BRAZIL_SCOUT_START,
    brazilInfluence: 18,
    discovered: initialDiscovered(),
    selectedTile: idFor({ col: 6, row: 3 }),
    messiRecruited: false,
    messiAbilityUsed: false,
    footballTurns: 0,
    message: "阿根廷的曙光从潘帕斯升起。选择绿色落点开始探索。",
    log: ["高乔侦骑在布宜诺斯艾利斯整装待发。"],
    result: null,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonNegativeInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const isTileId = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(0|[1-9]\d*)-(0|[1-9]\d*)$/.exec(value);
  return Boolean(match && inBounds({ col: Number(match[1]), row: Number(match[2]) }));
};
const isPosition = (value: unknown): value is Position => {
  if (!isRecord(value) || !Number.isInteger(value.col) || !Number.isInteger(value.row)) return false;
  return inBounds({ col: Number(value.col), row: Number(value.row) });
};
const isTechId = (value: unknown): value is TechId => typeof value === "string" && TECHS.some((tech) => tech.id === value);
const isProductionId = (value: unknown): value is ProductionId => typeof value === "string" && PRODUCTIONS.some((production) => production.id === value);
const isBuildingId = (value: unknown): value is BuildingId => typeof value === "string" && PRODUCTIONS.some((production) => production.kind === "building" && production.id === value);
const isUnitType = (value: unknown): value is UnitType => value === "scout" || value === "gaucho";

function makeLocalSave(game: GameState): SaveEnvelope {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    game: { ...game, discovered: Array.from(game.discovered) },
  };
}

function readLocalSave(raw: string | null): SaveReadResult {
  if (!raw) return { ok: false, reason: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "corrupt" };
  if (parsed.version !== SAVE_VERSION) return { ok: false, reason: "version" };
  if (typeof parsed.savedAt !== "string" || Number.isNaN(Date.parse(parsed.savedAt)) || !isRecord(parsed.game)) return { ok: false, reason: "corrupt" };

  const value = parsed.game;
  const integerFields = ["turn", "gold", "science", "culture", "greatPoints", "population", "food", "techProgress", "brazilInfluence", "footballTurns"] as const;
  if (integerFields.some((field) => !isNonNegativeInteger(value[field])) || Number(value.turn) < 1 || Number(value.population) < 1) return { ok: false, reason: "corrupt" };
  if (!isPosition(value.brazilPos)) return { ok: false, reason: "corrupt" };
  if (value.activeTech !== null && !isTechId(value.activeTech)) return { ok: false, reason: "corrupt" };
  if (value.activeProduction !== null && !isProductionId(value.activeProduction)) return { ok: false, reason: "corrupt" };
  if (!Array.isArray(value.completedTechs) || !value.completedTechs.every(isTechId)) return { ok: false, reason: "corrupt" };
  if (!Array.isArray(value.completedBuildings) || !value.completedBuildings.every(isBuildingId)) return { ok: false, reason: "corrupt" };
  if (!Array.isArray(value.discovered) || !value.discovered.every(isTileId)) return { ok: false, reason: "corrupt" };
  if (value.selectedTile !== null && !isTileId(value.selectedTile)) return { ok: false, reason: "corrupt" };
  if (typeof value.messiRecruited !== "boolean" || typeof value.messiAbilityUsed !== "boolean") return { ok: false, reason: "corrupt" };
  if (typeof value.message !== "string" || !Array.isArray(value.log) || !value.log.every((entry) => typeof entry === "string")) return { ok: false, reason: "corrupt" };
  if (value.result !== null && value.result !== "win" && value.result !== "lose") return { ok: false, reason: "corrupt" };
  const completedTechs = value.completedTechs as TechId[];
  const completedBuildings = value.completedBuildings as BuildingId[];
  if (new Set(completedTechs).size !== completedTechs.length || new Set(completedBuildings).size !== completedBuildings.length) return { ok: false, reason: "corrupt" };
  if (value.activeTech !== null && completedTechs.includes(value.activeTech)) return { ok: false, reason: "corrupt" };
  if (value.activeProduction !== null && isBuildingId(value.activeProduction) && completedBuildings.includes(value.activeProduction)) return { ok: false, reason: "corrupt" };
  if ((Number(value.brazilInfluence) >= 100 && value.result === null) || (value.result === "lose" && Number(value.brazilInfluence) < 100)) return { ok: false, reason: "corrupt" };
  const savedProductionProgress = value.productionProgress;
  const savedBuildingPlacements = value.buildingPlacements;
  if (!isRecord(savedProductionProgress) || PRODUCTIONS.some((production) => savedProductionProgress[production.id] !== undefined && !isNonNegativeInteger(savedProductionProgress[production.id]))) return { ok: false, reason: "corrupt" };
  if (!isRecord(savedBuildingPlacements) || Object.keys(savedBuildingPlacements).some((key) => !isBuildingId(key))) return { ok: false, reason: "corrupt" };

  const buildingPlacements: Partial<Record<BuildingId, string>> = {};
  const occupiedTiles = new Set<string>();
  const discoveredTiles = new Set(value.discovered as string[]);
  const buildingProjects = PRODUCTIONS.filter((production): production is BuildingProject => production.kind === "building");
  for (const production of buildingProjects) {
    const tileId = savedBuildingPlacements[production.id];
    if (tileId === undefined) continue;
    if (!isTileId(tileId) || occupiedTiles.has(tileId)) return { ok: false, reason: "corrupt" };
    const placementPos = posForId(tileId);
    if (!discoveredTiles.has(tileId) || !isArgentineTerritory(placementPos) || !CITY_BUILDABLE_IDS.has(tileId) || tileId === idFor(CITY_POS) || IMPROVEMENTS[tileId] || !production.allowedTerrains.includes(terrainAt(placementPos))) return { ok: false, reason: "corrupt" };
    buildingPlacements[production.id] = tileId;
    occupiedTiles.add(tileId);
  }
  if (value.activeProduction !== null && isBuildingId(value.activeProduction) && !buildingPlacements[value.activeProduction]) return { ok: false, reason: "corrupt" };
  if (completedBuildings.some((productionId) => !buildingPlacements[productionId])) return { ok: false, reason: "corrupt" };

  const productionProgress = Object.fromEntries(PRODUCTIONS.map((production) => [production.id, Number(savedProductionProgress[production.id] ?? 0)])) as Record<ProductionId, number>;
  if (PRODUCTIONS.some((production) => production.kind === "building" && completedBuildings.includes(production.id) ? productionProgress[production.id] !== production.cost : productionProgress[production.id] >= production.cost)) return { ok: false, reason: "corrupt" };

  let units: PlayerUnit[];
  let selectedUnitId: string | null;
  let nextUnitSerial: number;
  if (Array.isArray(value.units)) {
    units = [];
    const unitIds = new Set<string>();
    const unitTiles = new Set<string>();
    for (const candidate of value.units) {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || !/^(scout|gaucho)-\d+$/.test(candidate.id) || !isUnitType(candidate.type) || !isPosition(candidate.pos) || !isNonNegativeInteger(candidate.moves)) return { ok: false, reason: "corrupt" };
      if (unitIds.has(candidate.id) || unitTiles.has(idFor(candidate.pos))) return { ok: false, reason: "corrupt" };
      unitIds.add(candidate.id);
      unitTiles.add(idFor(candidate.pos));
      units.push({ id: candidate.id, type: candidate.type, pos: candidate.pos, moves: Number(candidate.moves) });
    }
    if (value.selectedUnitId !== null && (typeof value.selectedUnitId !== "string" || !unitIds.has(value.selectedUnitId))) return { ok: false, reason: "corrupt" };
    selectedUnitId = value.selectedUnitId as string | null;
    nextUnitSerial = isNonNegativeInteger(value.nextUnitSerial) ? Math.max(Number(value.nextUnitSerial), units.length + 1) : units.length + 1;
  } else {
    if (!isPosition(value.unitPos) || !isNonNegativeInteger(value.unitMoves) || typeof value.selectedUnit !== "boolean") return { ok: false, reason: "corrupt" };
    units = [{ id: "gaucho-1", type: "gaucho", pos: value.unitPos, moves: Number(value.unitMoves) }];
    selectedUnitId = value.selectedUnit ? "gaucho-1" : null;
    nextUnitSerial = 2;
  }
  const legacySave = !Array.isArray(value.units);
  const migratedBrazilPos = isBrazilianTerritory(value.brazilPos) ? value.brazilPos : BRAZIL_SCOUT_START;
  const migratedSelectedTile = legacySave && value.selectedTile === "7-0"
    ? idFor(BRAZIL_CITY_POS)
    : legacySave && value.selectedUnit === false && value.selectedTile === idFor(value.brazilPos) && idFor(migratedBrazilPos) !== idFor(value.brazilPos)
      ? idFor(migratedBrazilPos)
      : value.selectedTile as string | null;
  const game: GameState = {
    turn: Number(value.turn),
    gold: Number(value.gold),
    science: Number(value.science),
    culture: Number(value.culture),
    greatPoints: Number(value.greatPoints),
    population: Number(value.population),
    food: Number(value.food),
    activeTech: value.activeTech as TechId | null,
    techProgress: Number(value.techProgress),
    completedTechs,
    activeProduction: value.activeProduction as ProductionId | null,
    productionProgress,
    completedBuildings,
    buildingPlacements,
    units,
    selectedUnitId,
    nextUnitSerial,
    brazilPos: migratedBrazilPos,
    brazilInfluence: Number(value.brazilInfluence),
    discovered: new Set([...(value.discovered as string[]), idFor(BRAZIL_CITY_POS)]),
    selectedTile: migratedSelectedTile,
    messiRecruited: value.messiRecruited,
    messiAbilityUsed: value.messiAbilityUsed,
    footballTurns: Number(value.footballTurns),
    message: value.message,
    log: (value.log as string[]).slice(0, 4),
    result: value.result as "win" | "lose" | null,
  };
  return { ok: true, savedAt: parsed.savedAt, game };
}

function formatSaveTime(savedAt: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(savedAt));
}

function nextBrazilPosition(state: GameState) {
  const candidates = neighbors(state.brazilPos).filter((pos) => {
    const terrain = terrainAt(pos);
    return isBrazilianTerritory(pos) && terrain !== "water" && terrain !== "mountain" && !state.units.some((unit) => idFor(unit.pos) === idFor(pos)) && idFor(pos) !== idFor(BRAZIL_CITY_POS);
  });
  return candidates.length ? candidates[state.turn % candidates.length] : state.brazilPos;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [productionDrawerOpen, setProductionDrawerOpen] = useState(false);
  const [placingProduction, setPlacingProduction] = useState<BuildingId | null>(null);
  const [placementCandidate, setPlacementCandidate] = useState<string | null>(null);
  const [hoveredPlacementTile, setHoveredPlacementTile] = useState<string | null>(null);
  const [placementDetailed, setPlacementDetailed] = useState(false);
  const [productionCategory, setProductionCategory] = useState<"buildings" | "units">("buildings");
  const [productionReminderBypassed, setProductionReminderBypassed] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showYields, setShowYields] = useState(true);
  const [saveMeta, setSaveMeta] = useState<SaveMeta | null>(null);
  const [saveNotice, setSaveNotice] = useState("仅保存在当前设备的浏览器中");
  const [pendingSystemAction, setPendingSystemAction] = useState<"load" | "restart" | null>(null);
  const [mapDragging, setMapDragging] = useState(false);
  const aiLockRef = useRef(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const mapBoardRef = useRef<HTMLDivElement>(null);
  const mapDragRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const ignoreMapClickRef = useRef(false);

  const focusMapOn = useCallback((pos: Position, behavior: ScrollBehavior = "smooth") => {
    const viewport = mapViewportRef.current;
    const board = mapBoardRef.current;
    if (!viewport || !board) return;
    const geometry = hexGeometry(pos);
    viewport.scrollTo({
      left: Math.max(0, board.offsetLeft + geometry.cx - viewport.clientWidth / 2),
      top: Math.max(0, board.offsetTop + geometry.cy - viewport.clientHeight / 2),
      behavior,
    });
  }, []);

  const handleMapPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !mapViewportRef.current) return;
    mapDragRef.current = { x: event.clientX, y: event.clientY, left: mapViewportRef.current.scrollLeft, top: mapViewportRef.current.scrollTop, moved: false };
  };

  const handleMapPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = mapDragRef.current;
    const viewport = mapViewportRef.current;
    if (!drag || !viewport) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true;
      setMapDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
    event.preventDefault();
  };

  const handleMapPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const moved = mapDragRef.current?.moved ?? false;
    mapDragRef.current = null;
    setMapDragging(false);
    ignoreMapClickRef.current = moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const activeTech = TECHS.find((tech) => tech.id === game.activeTech) ?? null;
  const activeProduction = PRODUCTIONS.find((item) => item.id === game.activeProduction) ?? null;
  const productionPerTurn = cityProductionFor(game);
  const activeProductionProgress = activeProduction ? game.productionProgress[activeProduction.id] : 0;
  const productionTurnsRemaining = activeProduction
    ? Math.max(1, Math.ceil((activeProduction.cost - activeProductionProgress) / productionPerTurn))
    : null;
  const hasAvailableProduction = true;
  const selectedUnit = game.units.find((unit) => unit.id === game.selectedUnitId) ?? null;
  const selectedUnitInfo = selectedUnit ? UNIT_INFO[selectedUnit.type] : null;
  const citySelected = !selectedUnit && game.selectedTile === idFor(CITY_POS);
  const brazilCitySelected = !selectedUnit && game.selectedTile === idFor(BRAZIL_CITY_POS);
  const brazilPopulation = 3 + Math.floor((game.turn - 1) / 5);
  const brazilYields = {
    food: 6 + Math.floor((game.turn - 1) / 3),
    production: 5 + Math.floor((game.turn - 1) / 4),
    science: 3 + Math.floor((game.turn - 1) / 2),
    culture: 2 + Math.floor(Math.max(0, game.brazilInfluence - 18) / 24),
  };
  const visibleTiles = useMemo(() => {
    let visible = reveal(new Set<string>(), CITY_POS, 2);
    game.units.forEach((unit) => { visible = reveal(visible, unit.pos, unit.type === "scout" ? 2 : 1); });
    return visible;
  }, [game.units]);
  const rivalScoutVisible = visibleTiles.has(idFor(game.brazilPos));
  const placingItem = PRODUCTIONS.find((item): item is BuildingProject => item.id === placingProduction && item.kind === "building") ?? null;
  const placedProductionByTile = useMemo(() => {
    const map = new Map<string, BuildingId>();
    Object.entries(game.buildingPlacements).forEach(([productionId, tileId]) => {
      if (tileId) map.set(tileId, productionId as BuildingId);
    });
    return map;
  }, [game.buildingPlacements]);
  const placementOptions = useMemo(() => {
    const map = new Map<string, { error: string | null; adjacency: number }>();
    if (!placingProduction) return map;
    MAP_TILES.forEach((tile) => {
      const pos = { col: tile.col, row: tile.row };
      const tileId = idFor(pos);
      map.set(tileId, {
        error: productionPlacementError(game, placingProduction, pos),
        adjacency: placementAdjacencyFor(placingProduction, pos),
      });
    });
    return map;
  }, [game, placingProduction]);
  const bestPlacementAdjacency = placingProduction
    ? Math.max(0, ...Array.from(placementOptions.values()).filter((option) => !option.error).map((option) => option.adjacency))
    : 0;
  const placementPreviewTile = placementCandidate ?? hoveredPlacementTile;
  const placementPreviewOption = placementPreviewTile ? placementOptions.get(placementPreviewTile) ?? null : null;
  const placementPreviewPos = placementPreviewTile ? posForId(placementPreviewTile) : null;
  const placementPreviewTerrain = placementPreviewPos ? TERRAIN_INFO[terrainAt(placementPreviewPos)] : null;
  const selectedPos = game.selectedTile
    ? posForId(game.selectedTile)
    : selectedUnit?.pos ?? CITY_POS;
  const selectedKnown = game.discovered.has(idFor(selectedPos));
  const selectedIsBrazilCity = selectedKnown && idFor(selectedPos) === idFor(BRAZIL_CITY_POS);
  const selectedTerrain = terrainAt(selectedPos);
  const selectedImprovement = IMPROVEMENTS[idFor(selectedPos)] ?? null;
  const selectedPlacedProductionId = placedProductionByTile.get(idFor(selectedPos)) ?? null;
  const selectedPlacedProduction = PRODUCTIONS.find((item) => item.id === selectedPlacedProductionId) ?? null;
  const selectedPlacedStatus = selectedPlacedProductionId
    ? game.completedBuildings.includes(selectedPlacedProductionId)
      ? "已建成"
      : game.activeProduction === selectedPlacedProductionId ? "建造中" : "已规划"
    : null;
  const yieldsFor = (pos: Position) => {
    const terrain = terrainAt(pos);
    const base = TERRAIN_INFO[terrain];
    const improvement = IMPROVEMENTS[idFor(pos)];
    const placedProductionId = placedProductionByTile.get(idFor(pos)) ?? null;
    const completedPlacedProduction = placedProductionId && game.completedBuildings.includes(placedProductionId)
      ? PRODUCTIONS.find((item): item is BuildingProject => item.id === placedProductionId && item.kind === "building") ?? null
      : null;
    const placedYield = completedPlacedProduction ? 2 + placementAdjacencyFor(completedPlacedProduction.id, pos) : 0;
    if (placedProductionId) {
      return {
        ...base,
        food: completedPlacedProduction?.yield === "food" ? placedYield : 0,
        production: completedPlacedProduction?.yield === "production" ? placedYield : 0,
        science: completedPlacedProduction?.yield === "science" ? placedYield : 0,
        culture: completedPlacedProduction?.yield === "culture" ? placedYield : 0,
      };
    }
    const owned = isArgentineTerritory(pos);
    const footballBonus = game.footballTurns > 0 && owned ? 1 : 0;
    const husbandryBonus = owned && terrain === "grass" && game.completedTechs.includes("husbandry") ? 1 : 0;
    const argentinaCulture = owned && terrain === "grass" ? 1 : 0;
    return {
      ...base,
      food: base.food + footballBonus + husbandryBonus + (improvement?.bonus.food ?? 0) + (completedPlacedProduction?.yield === "food" ? placedYield : 0),
      production: base.production + (improvement?.bonus.production ?? 0) + (completedPlacedProduction?.yield === "production" ? placedYield : 0),
      science: base.science + footballBonus + (improvement?.bonus.science ?? 0) + (completedPlacedProduction?.yield === "science" ? placedYield : 0),
      culture: base.culture + argentinaCulture + (improvement?.bonus.culture ?? 0) + (completedPlacedProduction?.yield === "culture" ? placedYield : 0),
    };
  };
  const selectedYield = yieldsFor(selectedPos);
  const maxMoves = selectedUnit ? maxMovesForUnit(selectedUnit.type, game.completedTechs, game.footballTurns) : 0;
  const movementCosts = (() => {
    if (placingProduction || !selectedUnit || selectedUnit.moves <= 0) return new Map<string, number>();
    const blockers = new Set<string>([idFor(BRAZIL_CITY_POS)]);
    if (rivalScoutVisible) blockers.add(idFor(game.brazilPos));
    game.units.forEach((unit) => { if (unit.id !== selectedUnit.id) blockers.add(idFor(unit.pos)); });
    return movementRange(selectedUnit.pos, selectedUnit.moves, blockers, game.discovered);
  })();
  const revealedCount = game.discovered.size;
  const objectives = [
    { label: "首都达到 5 人口", value: game.population, target: 5, done: game.population >= 5 },
    { label: "完成 2 项科技", value: game.completedTechs.length, target: 2, done: game.completedTechs.length >= 2 },
    { label: `探索 ${EXPLORE_TARGET} 个地块`, value: revealedCount, target: EXPLORE_TARGET, done: revealedCount >= EXPLORE_TARGET },
    { label: "招募梅西", value: game.messiRecruited ? 1 : 0, target: 1, done: game.messiRecruited },
  ];

  const addLog = (log: string[], entry: string) => [entry, ...log].slice(0, 4);

  const stopTransientFlow = () => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
    aiLockRef.current = false;
    setAiThinking(false);
    setTechPickerOpen(false);
    setProductionDrawerOpen(false);
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setPlacementDetailed(false);
    setProductionCategory("buildings");
    setProductionReminderBypassed(false);
    setPendingSystemAction(null);
  };

  const cancelProductionPlacement = (keepDrawerOpen = true) => {
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setPlacementDetailed(false);
    setProductionDrawerOpen(keepDrawerOpen);
    setGame((prev) => ({ ...prev, selectedTile: idFor(CITY_POS), selectedUnitId: null, message: keepDrawerOpen ? "已返回生产列表。" : "已关闭首都生产。" }));
  };

  const closeProductionDrawer = () => {
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setPlacementDetailed(false);
    setProductionDrawerOpen(false);
  };

  const openCapitalProduction = () => {
    if (aiThinking || game.result) return;
    setProductionCategory(activeProduction?.kind === "unit" ? "units" : "buildings");
    setGame((prev) => {
      const currentProject = PRODUCTIONS.find((item) => item.id === prev.activeProduction);
      return {
        ...prev,
        selectedTile: idFor(CITY_POS),
        selectedUnitId: null,
        message: currentProject
          ? `布宜诺斯艾利斯正在${currentProject.kind === "unit" ? "训练" : "建造"}${currentProject.name}。`
          : "请为布宜诺斯艾利斯安排一个生产项目。",
      };
    });
    setTechPickerOpen(false);
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setProductionDrawerOpen(true);
  };

  const handleTileClick = (pos: Position) => {
    if (aiThinking || game.result) return;
    if (placingProduction) {
      const tileId = idFor(pos);
      const placementError = productionPlacementError(game, placingProduction, pos);
      if (placementError) {
        setPlacementCandidate(null);
        setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `不能在这里建造：${placementError}。` }));
        return;
      }
      const item = PRODUCTIONS.find((production) => production.id === placingProduction)!;
      const adjacency = placementAdjacencyFor(placingProduction, pos);
      setPlacementCandidate(tileId);
      setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `预览${item.name}：${TERRAIN_INFO[terrainAt(pos)].label}，相邻加成 +${adjacency} ${YIELD_META[item.yield].label}。` }));
      return;
    }
    if (idFor(pos) === idFor(CITY_POS) && !selectedUnit) {
      openCapitalProduction();
      return;
    }
    setGame((prev) => {
      const tileId = idFor(pos);
      const terrain = terrainAt(pos);
      const known = prev.discovered.has(tileId);
      const terrainBlocked = terrain === "water" || terrain === "mountain";
      const cityBlocked = tileId === idFor(BRAZIL_CITY_POS);
      const rivalOccupied = tileId === idFor(prev.brazilPos);
      const blockers = new Set<string>([idFor(BRAZIL_CITY_POS)]);
      if (rivalScoutVisible) blockers.add(idFor(prev.brazilPos));
      const activeUnit = prev.units.find((unit) => unit.id === prev.selectedUnitId) ?? null;
      prev.units.forEach((unit) => { if (unit.id !== activeUnit?.id) blockers.add(idFor(unit.pos)); });
      const friendlyOccupied = prev.units.some((unit) => unit.id !== activeUnit?.id && idFor(unit.pos) === tileId);
      const moveCosts = activeUnit ? movementRange(activeUnit.pos, activeUnit.moves, blockers, prev.discovered) : new Map<string, number>();
      const moveCost = moveCosts.get(tileId);
      if (activeUnit && moveCost !== undefined && !terrainBlocked && !cityBlocked && !rivalOccupied && !friendlyOccupied) {
        const discovered = reveal(prev.discovered, pos, activeUnit.type === "scout" ? 2 : 1);
        const found = discovered.size - prev.discovered.size;
        const points = Math.min(2, found);
        const unitName = UNIT_INFO[activeUnit.type].name;
        const entry = found > 0
          ? `${unitName}发现了 ${found} 个新地块，获得 ${points} 伟人点。`
          : `${unitName}移动 ${moveCost} 格，到达${TERRAIN_INFO[terrain].label}。`;
        return {
          ...prev,
          units: prev.units.map((unit) => unit.id === activeUnit.id ? { ...unit, pos, moves: unit.moves - moveCost } : unit),
          greatPoints: prev.greatPoints + points,
          discovered,
          selectedTile: tileId,
          message: entry,
          log: addLog(prev.log, entry),
        };
      }
      return {
        ...prev,
        selectedTile: tileId,
        selectedUnitId: null,
        message: !known
          ? "这片区域仍在战争迷雾中；请派单位靠近后侦察。"
          : cityBlocked
            ? "里约热内卢由巴西控制；当前没有攻城行动。"
            : rivalOccupied
              ? "战争迷雾中有单位阻挡，移动中止。"
              : friendlyOccupied
                ? "己方单位已占用这块地。"
              : terrainBlocked ? `${TERRAIN_INFO[terrain].label}目前无法通行。` : `已查看${TERRAIN_INFO[terrain].label}地块。`,
      };
    });
  };

  const handleExplore = () => {
    if (!selectedUnit || selectedUnit.moves <= 0 || aiThinking || game.result) return;
    setGame((prev) => {
      const unit = prev.units.find((candidate) => candidate.id === prev.selectedUnitId);
      if (!unit || unit.moves <= 0) return prev;
      const discovered = reveal(prev.discovered, unit.pos, unit.type === "scout" ? 3 : 2);
      const found = discovered.size - prev.discovered.size;
      const points = Math.min(3, found);
      const message = found > 0 ? `远眺发现 ${found} 个地块，伟人点 +${points}。` : "附近已经探索完毕。";
      return { ...prev, discovered, greatPoints: prev.greatPoints + points, units: prev.units.map((candidate) => candidate.id === unit.id ? { ...candidate, moves: candidate.moves - 1 } : candidate), message, log: addLog(prev.log, message) };
    });
  };

  const handleWait = () => {
    if (!selectedUnit || selectedUnit.moves <= 0 || aiThinking || game.result) return;
    setGame((prev) => {
      const unit = prev.units.find((candidate) => candidate.id === prev.selectedUnitId);
      if (!unit) return prev;
      const unitName = UNIT_INFO[unit.type].name;
      return {
        ...prev,
        units: prev.units.map((candidate) => candidate.id === unit.id ? { ...candidate, moves: 0 } : candidate),
        culture: prev.culture + 1,
        message: `${unitName}驻扎，为当地带来 1 点文化。`,
        log: addLog(prev.log, `${unitName}在潘帕斯驻扎。`),
      };
    });
  };

  const chooseTech = (techId: TechId) => {
    setGame((prev) => ({
      ...prev,
      activeTech: techId,
      message: `开始研究${TECHS.find((tech) => tech.id === techId)?.name}。`,
    }));
    setTechPickerOpen(false);
  };

  const chooseProduction = (productionId: ProductionId) => {
    const item = PRODUCTIONS.find((production) => production.id === productionId);
    if (!item || aiThinking || game.result || (item.kind === "building" && game.completedBuildings.includes(item.id))) return;
    if (item.kind === "unit") {
      setGame((prev) => ({
        ...prev,
        activeProduction: item.id,
        selectedTile: idFor(CITY_POS),
        selectedUnitId: null,
        message: `${item.name}已加入首都生产队列；完成后会自动部署到城市中心或相邻空格。`,
        log: addLog(prev.log, `布宜诺斯艾利斯开始训练${item.name}。`),
      }));
      setProductionDrawerOpen(false);
      setPlacingProduction(null);
      setPlacementCandidate(null);
      setHoveredPlacementTile(null);
      setProductionReminderBypassed(false);
      return;
    }
    const existingPlacement = game.buildingPlacements[item.id];
    if (existingPlacement) {
      setGame((prev) => ({
        ...prev,
        activeProduction: item.id,
        selectedTile: existingPlacement,
        selectedUnitId: null,
        message: `继续建造${item.name}，已有进度会保留。`,
        log: addLog(prev.log, `布宜诺斯艾利斯继续建造${item.name}。`),
      }));
      setProductionDrawerOpen(false);
      setPlacingProduction(null);
      setPlacementCandidate(null);
      setHoveredPlacementTile(null);
    } else {
      setPlacingProduction(item.id);
      setPlacementCandidate(null);
      setHoveredPlacementTile(null);
      setPlacementDetailed(false);
      setGame((prev) => ({
        ...prev,
        selectedTile: idFor(CITY_POS),
        selectedUnitId: null,
        message: `请在地图上为${item.name}选择一个绿色六角格。`,
      }));
    }
    setProductionReminderBypassed(false);
  };

  const confirmProductionPlacement = () => {
    if (!placingProduction || !placementCandidate) return;
    const item = PRODUCTIONS.find((production) => production.id === placingProduction)!;
    const pos = posForId(placementCandidate);
    const placementError = productionPlacementError(game, placingProduction, pos);
    if (placementError) {
      setGame((prev) => ({ ...prev, message: `不能在这里建造：${placementError}。` }));
      return;
    }
    const adjacency = placementAdjacencyFor(placingProduction, pos);
    const productionId = placingProduction;
    const tileId = placementCandidate;
    setGame((prev) => ({
      ...prev,
      activeProduction: productionId,
      buildingPlacements: { ...prev.buildingPlacements, [productionId]: tileId },
      selectedTile: tileId,
      selectedUnitId: null,
      message: `${item.name}已落位，开始建造；相邻加成 +${adjacency} ${YIELD_META[item.yield].label}。`,
      log: addLog(prev.log, `布宜诺斯艾利斯在${TERRAIN_INFO[terrainAt(pos)].label}上开工建造${item.name}。`),
    }));
    setProductionReminderBypassed(false);
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setProductionDrawerOpen(false);
  };

  const recruitMessi = () => {
    if (game.greatPoints < 30 || game.messiRecruited || aiThinking || game.result) return;
    setGame((prev) => ({
      ...prev,
      messiRecruited: true,
      greatPoints: prev.greatPoints - 30,
      gold: prev.gold + 10,
      culture: prev.culture + 8,
      message: "莱昂内尔·梅西来到布宜诺斯艾利斯！文化 +8，金币 +10。",
      log: addLog(prev.log, "伟人梅西加入了阿根廷。"),
    }));
  };

  const activateMessi = () => {
    if (!game.messiRecruited || game.messiAbilityUsed || aiThinking || game.result) return;
    setGame((prev) => ({
      ...prev,
      messiAbilityUsed: true,
      footballTurns: 3,
      culture: prev.culture + 12,
      units: prev.units.map((unit) => ({ ...unit, moves: Math.min(maxMovesForUnit(unit.type, prev.completedTechs, 3), unit.moves + 1) })),
      message: "黄金助攻发动：全民足球热潮持续 3 回合！",
      log: addLog(prev.log, "梅西发动“黄金助攻”，全国进入足球热潮。"),
    }));
  };

  const endTurn = useCallback(() => {
    if (aiLockRef.current || game.result) return;
    aiLockRef.current = true;
    setAiThinking(true);
    setGame((prev) => ({ ...prev, message: "巴西正在行动……" }));

    aiTimerRef.current = setTimeout(() => {
      setGame((prev) => {
        const scienceGain = 4 + prev.population + (prev.completedTechs.includes("federalism") ? 2 : 0) + (prev.completedBuildings.includes("academy") ? 2 + completedPlacementBonus(prev, "academy") : 0) + (prev.footballTurns > 0 ? 2 : 0);
        const cultureGain = 3 + (prev.messiRecruited ? 2 : 0) + (prev.completedBuildings.includes("monument") ? 2 + completedPlacementBonus(prev, "monument") : 0) + (prev.footballTurns > 0 ? 2 : 0);
        const goldGain = 7 + (prev.footballTurns > 0 ? 3 : 0);
        const foodGain = 4 + prev.population + (prev.completedTechs.includes("husbandry") ? 1 : 0) + (prev.completedBuildings.includes("granary") ? 2 + completedPlacementBonus(prev, "granary") : 0) + (prev.footballTurns > 0 ? 2 : 0);
        const productionGain = cityProductionFor(prev);
        let food = prev.food + foodGain;
        let population = prev.population;
        let grew = false;
        const foodTarget = 10 + prev.population * 4;
        if (food >= foodTarget) {
          food -= foodTarget;
          population += 1;
          grew = true;
        }

        let techProgress = prev.techProgress + scienceGain;
        let activeTechId = prev.activeTech;
        const completedTechs = [...prev.completedTechs];
        let completedName = "";
        if (activeTechId) {
          const tech = TECHS.find((item) => item.id === activeTechId)!;
          if (techProgress >= tech.cost) {
            techProgress -= tech.cost;
            completedTechs.push(activeTechId);
            completedName = tech.name;
            activeTechId = null;
          }
        }

        const productionProgress = { ...prev.productionProgress };
        const completedBuildings = [...prev.completedBuildings];
        let units = [...prev.units];
        let nextUnitSerial = prev.nextUnitSerial;
        let selectedUnitId = prev.selectedUnitId;
        let selectedTile = prev.selectedTile;
        let activeProductionId = prev.activeProduction;
        let completedProduction: ProductionProject | null = null;
        let deployedUnit: PlayerUnit | null = null;
        let deploymentBlocked = false;
        if (activeProductionId) {
          const production = PRODUCTIONS.find((item) => item.id === activeProductionId)!;
          productionProgress[activeProductionId] = Math.min(production.cost, productionProgress[activeProductionId] + productionGain);
          if (productionProgress[activeProductionId] >= production.cost) {
            if (production.kind === "building") {
              if (!completedBuildings.includes(production.id)) completedBuildings.push(production.id);
              completedProduction = production;
              activeProductionId = null;
            } else {
              const deployment = findUnitDeployment({ ...prev, units });
              if (deployment) {
                const unitId = `${production.unitType}-${nextUnitSerial}`;
                deployedUnit = { id: unitId, type: production.unitType, pos: deployment, moves: UNIT_INFO[production.unitType].baseMoves };
                units = [...units, deployedUnit];
                nextUnitSerial += 1;
                selectedUnitId = unitId;
                selectedTile = idFor(deployment);
                productionProgress[production.id] = 0;
                completedProduction = production;
                activeProductionId = null;
              } else {
                productionProgress[production.id] = production.cost - 1;
                deploymentBlocked = true;
              }
            }
          }
        }

        const footballTurns = Math.max(0, prev.footballTurns - 1);
        const greatPointGain = 3 + Math.floor(population / 2) + (completedTechs.includes("broadcast") ? 2 : 0);
        const brazilInfluence = prev.brazilInfluence + 4 + (grew ? 1 : 0);
        const nextTurn = prev.turn + 1;
        units = units.map((unit) => ({ ...unit, moves: maxMovesForUnit(unit.type, completedTechs, footballTurns) }));
        const recruited = prev.messiRecruited;
        const won = population >= 5 && completedTechs.length >= 2 && prev.discovered.size >= EXPLORE_TARGET && recruited;
        const lost = brazilInfluence >= 100;
        const turnEvents: string[] = [];
        if (completedProduction) {
          if (completedProduction.kind === "building") {
            const placement = prev.buildingPlacements[completedProduction.id];
            const adjacency = placement ? placementAdjacencyFor(completedProduction.id, posForId(placement)) : 0;
            turnEvents.push(`布宜诺斯艾利斯完成了${completedProduction.name}：${completedProduction.effect}，相邻加成 +${adjacency} ${YIELD_META[completedProduction.yield].label}。`);
          } else if (deployedUnit) {
            turnEvents.push(`${completedProduction.name}训练完成，已自动部署到首都${idFor(deployedUnit.pos) === idFor(CITY_POS) ? "中心" : "相邻空格"}。`);
          }
        }
        if (deploymentBlocked) turnEvents.push("单位训练已完成，但首都附近没有合法部署空格；进度会保留到空位出现。");
        if (completedName) turnEvents.push(`完成科技：${completedName}。请选择下一项研究。`);
        if (grew) turnEvents.push(`布宜诺斯艾利斯增长到 ${population} 人口！`);
        const summary = turnEvents.length ? turnEvents.join(" ") : `第 ${nextTurn} 回合开始，所有单位恢复行动。`;

        return {
          ...prev,
          turn: nextTurn,
          gold: prev.gold + goldGain,
          science: prev.science + scienceGain,
          culture: prev.culture + cultureGain,
          greatPoints: prev.greatPoints + greatPointGain,
          food,
          population,
          activeTech: activeTechId,
          techProgress,
          completedTechs,
          activeProduction: activeProductionId,
          productionProgress,
          completedBuildings,
          units,
          selectedUnitId,
          selectedTile,
          nextUnitSerial,
          brazilPos: nextBrazilPosition(prev),
          brazilInfluence,
          footballTurns,
          message: summary,
          log: addLog(prev.log, summary),
          result: won ? "win" : lost ? "lose" : null,
        };
      });
      aiLockRef.current = false;
      setAiThinking(false);
    }, 650);
  }, [game.result]);

  const requestEndTurn = useCallback(() => {
    if (aiThinking || game.result || techPickerOpen || productionDrawerOpen || placingProduction) return;
    if (!game.activeProduction && !productionReminderBypassed) {
      setGame((prev) => ({
        ...prev,
        selectedTile: idFor(CITY_POS),
        selectedUnitId: null,
        message: "请先为布宜诺斯艾利斯安排生产，或选择本回合暂不生产。",
      }));
      setProductionDrawerOpen(true);
      return;
    }
    setProductionReminderBypassed(false);
    endTurn();
  }, [aiThinking, endTurn, game.activeProduction, game.result, placingProduction, productionDrawerOpen, productionReminderBypassed, techPickerOpen]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => focusMapOn(CITY_POS, "auto"));
    return () => cancelAnimationFrame(frame);
  }, [focusMapOn]);

  useEffect(() => {
    const refreshSaveMeta = () => {
      try {
        const saved = readLocalSave(window.localStorage.getItem(SAVE_KEY));
        setSaveMeta(saved.ok ? { savedAt: saved.savedAt, turn: saved.game.turn } : null);
        if (!saved.ok && saved.reason !== "missing") setSaveNotice(saved.reason === "version" ? "临时存档版本不兼容" : "临时存档已损坏");
      } catch {
        setSaveMeta(null);
        setSaveNotice("当前浏览器无法使用本地存档");
      }
    };
    refreshSaveMeta();
    window.addEventListener("storage", refreshSaveMeta);
    return () => window.removeEventListener("storage", refreshSaveMeta);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Enter" && !pendingSystemAction && !["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) requestEndTurn();
      if (event.key === "Escape") {
        if (pendingSystemAction) {
          setPendingSystemAction(null);
        } else if (placingProduction) {
          setPlacingProduction(null);
          setPlacementCandidate(null);
          setHoveredPlacementTile(null);
          setPlacementDetailed(false);
          setGame((prev) => ({ ...prev, selectedTile: idFor(CITY_POS), message: "已取消建筑选址，返回生产列表。" }));
        } else if (productionDrawerOpen) {
          setProductionDrawerOpen(false);
        } else {
          setTechPickerOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingSystemAction, placingProduction, productionDrawerOpen, requestEndTurn]);

  useEffect(() => () => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
  }, []);

  const resetGame = () => {
    stopTransientFlow();
    setGame(createInitialState());
    setSaveNotice(saveMeta ? "已重新开始；原临时存档仍可读取" : "已重新开始新游戏");
    requestAnimationFrame(() => focusMapOn(CITY_POS, "auto"));
  };

  const saveGame = () => {
    if (aiThinking || aiLockRef.current || placingProduction) {
      setSaveNotice(placingProduction ? "请先确认或取消建筑选址" : "请等待巴西行动结束");
      return;
    }
    try {
      const payload = makeLocalSave(game);
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      setSaveMeta({ savedAt: payload.savedAt, turn: game.turn });
      setSaveNotice(`第 ${game.turn} 回合已暂时保存`);
      setPendingSystemAction(null);
      setGame((prev) => ({ ...prev, message: `游戏已保存到当前浏览器：第 ${prev.turn} 回合。` }));
    } catch {
      setSaveNotice("保存失败：浏览器存储不可用");
    }
  };

  const loadGame = () => {
    let saved: SaveReadResult;
    try {
      saved = readLocalSave(window.localStorage.getItem(SAVE_KEY));
    } catch {
      setSaveNotice("读取失败：浏览器存储不可用");
      return;
    }
    if (!saved.ok) {
      setSaveMeta(null);
      setSaveNotice(saved.reason === "version" ? "临时存档版本不兼容" : saved.reason === "missing" ? "当前还没有临时存档" : "临时存档已损坏");
      setPendingSystemAction(null);
      return;
    }
    stopTransientFlow();
    setGame({ ...saved.game, message: `已读取第 ${saved.game.turn} 回合的临时存档。` });
    setSaveMeta({ savedAt: saved.savedAt, turn: saved.game.turn });
    setSaveNotice(`已恢复第 ${saved.game.turn} 回合`);
    const savedUnit = saved.game.units.find((unit) => unit.id === saved.game.selectedUnitId);
    const focusTarget = savedUnit?.pos ?? (saved.game.selectedTile ? posForId(saved.game.selectedTile) : CITY_POS);
    requestAnimationFrame(() => focusMapOn(focusTarget, "auto"));
  };

  const confirmSystemAction = () => {
    if (pendingSystemAction === "load") loadGame();
    if (pendingSystemAction === "restart") resetGame();
  };

  const techPercent = activeTech ? Math.min(100, (game.techProgress / activeTech.cost) * 100) : 0;
  const productionPercent = activeProduction ? Math.min(100, activeProductionProgress / activeProduction.cost * 100) : 0;
  const cityGrowthTarget = 10 + game.population * 4;
  const sciencePerTurn = 4 + game.population + (game.completedTechs.includes("federalism") ? 2 : 0) + (game.completedBuildings.includes("academy") ? 2 + completedPlacementBonus(game, "academy") : 0) + (game.footballTurns > 0 ? 2 : 0);
  const culturePerTurn = 3 + (game.messiRecruited ? 2 : 0) + (game.completedBuildings.includes("monument") ? 2 + completedPlacementBonus(game, "monument") : 0) + (game.footballTurns > 0 ? 2 : 0);
  const cityTileLeft = CITY_POS.col * 70;
  const cityTileTop = CITY_POS.row * 82 + (CITY_POS.col % 2) * 41;
  const cityStyle = { left: cityTileLeft - 39, top: cityTileTop + 57 };
  const brazilCityTileLeft = BRAZIL_CITY_POS.col * 70;
  const brazilCityTileTop = BRAZIL_CITY_POS.row * 82 + (BRAZIL_CITY_POS.col % 2) * 41;
  const brazilCityStyle = { left: brazilCityTileLeft - 31, top: brazilCityTileTop + 55 };
  const messiStyle = { left: cityTileLeft + 67, top: cityTileTop + 18 };
  const brazilStyle = { left: game.brazilPos.col * 70 + 22, top: game.brazilPos.row * 82 + (game.brazilPos.col % 2) * 41 + 15 };
  const miniCityGeometry = hexGeometry(CITY_POS);
  const miniBrazilGeometry = hexGeometry(game.brazilPos);
  const miniBrazilCityGeometry = hexGeometry(BRAZIL_CITY_POS);
  const miniBrazilLabelGeometry = hexGeometry(BRAZIL_LABEL_POS);
  const selectedMiniGeometry = game.selectedTile && game.discovered.has(game.selectedTile) ? hexGeometry(posForId(game.selectedTile)) : null;
  const savedAtLabel = saveMeta ? formatSaveTime(saveMeta.savedAt) : "暂无临时存档";

  const tiles = MAP_TILES;

  return (
    <main className={`game-shell ${game.footballTurns > 0 ? "football-active" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✺</span>
          <span>文明：曙光</span>
          <span className="civ-chip">🇦🇷 阿根廷</span>
        </div>
        <div className="resource-strip" aria-label="文明资源">
          <span><b className="gold">●</b><small>金币</small><strong>{game.gold}</strong><em>+7</em></span>
          <span><b className="science">◆</b><small>科技</small><strong>{game.science}</strong><em>+{sciencePerTurn}</em></span>
          <span><b className="culture">✦</b><small>文化</small><strong>{game.culture}</strong><em>+{culturePerTurn}</em></span>
          <span><b className="people">★</b><small>伟人</small><strong>{game.greatPoints}</strong><em>/ 30</em></span>
        </div>
        <div className="turn-indicator"><small>探索时代</small><strong>回合 {game.turn}</strong></div>
      </header>

      {game.footballTurns > 0 && (
        <div className="football-banner" role="status">⚽ 全民足球热潮 · 剩余 {game.footballTurns} 回合</div>
      )}

      <section className="game-layout">
        <aside className="left-rail">
          <section className="paper-card research-card">
            <div className="card-kicker">当前研究</div>
            <div className="card-title-row">
              <div>
                <h2>{activeTech?.name ?? "选择科技"}</h2>
                <p>{activeTech?.effect ?? "科研点会保留，不会浪费"}</p>
              </div>
              <span className="research-icon" aria-hidden="true">{activeTech?.icon ?? "?"}</span>
            </div>
            <div className="progress-ring" style={{ "--progress": `${techPercent}%` } as CSSProperties}>
              <div><strong>{game.techProgress}</strong><span>/ {activeTech?.cost ?? "—"}</span></div>
            </div>
            <div className="progress-copy"><span>预计完成</span><strong>{activeTech ? `${Math.max(1, Math.ceil((activeTech.cost - game.techProgress) / (4 + game.population)))} 回合` : "等待选择"}</strong></div>
            <button className="tech-change" onClick={() => { closeProductionDrawer(); setTechPickerOpen(true); }} data-testid="open-tech-picker">{activeTech ? "更换研究" : "选择下一项研究"}</button>
          </section>

          <section className="paper-card mission-card">
            <div className="card-kicker">胜利目标 · 阿根廷曙光</div>
            {objectives.map((objective) => (
              <div className={`objective-row ${objective.done ? "done" : ""}`} key={objective.label}>
                <span>{objective.done ? "✓" : "○"}</span><p>{objective.label}</p><b>{objective.value}/{objective.target}</b>
              </div>
            ))}
          </section>

          <section className="paper-card legend-card selection-card">
            <div className="card-kicker">当前选择</div>
            <div className="selection-heading">
              <span className={`selection-swatch ${selectedKnown ? selectedTerrain : "unknown"}`} aria-hidden="true"><i /></span>
              <div><h3>{!selectedKnown ? "未知区域" : selectedIsBrazilCity ? "里约热内卢" : selectedPlacedProduction?.name ?? selectedImprovement?.name ?? selectedYield.label}</h3><p>{!selectedKnown ? "战争迷雾覆盖，尚无地形情报" : selectedIsBrazilCity ? `巴西首都 · 人口 ${brazilPopulation}` : selectedPlacedProduction ? `${selectedYield.label}上的城市建筑 · ${selectedPlacedStatus}` : selectedImprovement ? `${selectedYield.label}上的改良设施` : "未改良地块"}</p></div>
            </div>
            <div className="selection-meta"><span>{!selectedKnown ? "未知领土" : selectedIsBrazilCity ? "巴西文明" : isArgentineTerritory(selectedPos) ? "阿根廷领土" : isBrazilianTerritory(selectedPos) ? "巴西领土" : "中立地块"}</span><b>{!selectedKnown ? "无情报" : selectedIsBrazilCity ? "文明总产出/回合" : selectedPlacedStatus ?? (selectedImprovement ? "已建设" : "自然地貌")}</b></div>
            <div><span><i className="yield-dot food">粮</i>食物</span><b>{!selectedKnown ? "?" : selectedIsBrazilCity ? `+${brazilYields.food}` : selectedYield.food}</b></div>
            <div><span><i className="yield-dot production">锤</i>生产</span><b>{!selectedKnown ? "?" : selectedIsBrazilCity ? `+${brazilYields.production}` : selectedYield.production}</b></div>
            <div><span><i className="yield-dot science">科</i>科技</span><b>{!selectedKnown ? "?" : selectedIsBrazilCity ? `+${brazilYields.science}` : selectedYield.science}</b></div>
            <div><span><i className="yield-dot culture">文</i>文化</span><b>{!selectedKnown ? "?" : selectedIsBrazilCity ? `+${brazilYields.culture}` : selectedYield.culture}</b></div>
          </section>
        </aside>

        <section className={`map-stage ${placingProduction ? "placement-lens" : ""}`} aria-label="世界地图">
          <div className="map-wash map-wash-one" />
          <div className="map-wash map-wash-two" />
          <div className="map-focus-controls" aria-label="地图定位">
            <button onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(CITY_POS), message: "镜头已返回阿根廷首都布宜诺斯艾利斯。" })); focusMapOn(CITY_POS); }} data-testid="focus-argentina">★ 阿根廷</button>
            <button className="brazil" onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(BRAZIL_CITY_POS), message: `里约热内卢与我国首都相距 ${CAPITAL_DISTANCE} 格。` })); focusMapOn(BRAZIL_CITY_POS); }} data-testid="focus-brazil">◆ 巴西</button>
            <span className="territory-key"><i className="argentina" />城市边界<i className="brazil" />城市边界</span>
          </div>
          <div className="yield-controls" aria-label="地块收益图例">
            {showYields && <div className="yield-legend" aria-hidden="true"><span className="food">粮</span><span className="production">锤</span><span className="science">科</span><span className="culture">文</span></div>}
            <button className={showYields ? "active" : ""} aria-pressed={showYields} onClick={() => setShowYields((value) => !value)} data-testid="yield-toggle">
              {showYields ? "隐藏收益" : "显示收益"}
            </button>
          </div>
          {placingItem && <div className="placement-lens-banner" role="status"><span>{placingItem.icon}</span><div><b>为{placingItem.name}选择地块</b><small>绿色六角格可以建造 · 点击后在右侧确认</small></div><kbd>Esc 取消</kbd></div>}
          <div
            ref={mapViewportRef}
            className={`map-viewport ${mapDragging ? "dragging" : ""}`}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerCancel={handleMapPointerUp}
            onClickCapture={(event) => { if (ignoreMapClickRef.current) { ignoreMapClickRef.current = false; event.preventDefault(); event.stopPropagation(); } }}
            data-testid="map-viewport"
          >
            <div className="map-pan-surface">
          <div ref={mapBoardRef} className={`hex-board ${placingProduction ? "placement-mode" : ""}`} style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }} role="grid" aria-label={placingItem ? `为${placingItem.name}选择建设地块` : "潘帕斯六角格地图"}>
            <svg className="territory-layer territory-fill-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
              <g>{tiles.filter((tile) => isArgentineTerritory(tile)).map((tile) => <polygon key={`argentina-fill-${tile.col}-${tile.row}`} points={hexGeometry(tile).points} className="territory-fill argentina" />)}</g>
              <g>{tiles.filter((tile) => isBrazilianTerritory(tile)).map((tile) => <polygon key={`brazil-fill-${tile.col}-${tile.row}`} points={hexGeometry(tile).points} className="territory-fill brazil" />)}</g>
            </svg>
            <svg className="territory-layer territory-edge-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
              <path d={ARGENTINA_EDGE_PATH} className="territory-edge argentina" />
              <path d={BRAZIL_EDGE_PATH} className="territory-edge brazil" />
            </svg>
            {tiles.map(({ terrain, col, row }) => {
              const pos = { col, row };
              const tileId = idFor(pos);
              const info = TERRAIN_INFO[terrain];
              const discovered = game.discovered.has(tileId);
              const visible = visibleTiles.has(tileId);
              const moveCost = movementCosts.get(tileId);
              const reachable = moveCost !== undefined;
              const selected = game.selectedTile === tileId;
              const owned = isArgentineTerritory(pos);
              const rival = isBrazilianTerritory(pos);
              const improvement = IMPROVEMENTS[tileId];
              const placedProductionId = placedProductionByTile.get(tileId) ?? null;
              const placedProduction = PRODUCTIONS.find((item): item is BuildingProject => item.id === placedProductionId && item.kind === "building") ?? null;
              const buildingCompleted = placedProductionId ? game.completedBuildings.includes(placedProductionId) : false;
              const buildingUnderConstruction = Boolean(placedProduction && !buildingCompleted);
              const placementOption = placementOptions.get(tileId) ?? null;
              const placementValid = Boolean(placingItem && placementOption && !placementOption.error);
              const placementInvalid = Boolean(placingItem && placementOption?.error && discovered && owned && CITY_BUILDABLE_IDS.has(tileId));
              const placementCandidateSelected = placementCandidate === tileId;
              const placementFeatured = placementValid && placementOption!.adjacency === bestPlacementAdjacency && bestPlacementAdjacency > 0;
              const tileYield = yieldsFor(pos);
              const friendlyUnit = game.units.find((unit) => tileId === idFor(unit.pos));
              const containsUnit = friendlyUnit ? `，${UNIT_INFO[friendlyUnit.type].name}在此` : tileId === idFor(game.brazilPos) && rivalScoutVisible ? "，巴西斥候在此" : "";
              const yieldLabel = discovered ? `，粮食 ${tileYield.food}，生产 ${tileYield.production}，科技 ${tileYield.science}，文化 ${tileYield.culture}` : "";
              const tileName = placedProduction ? `${placedProduction.name}，位于${info.label}，${buildingCompleted ? "已建成" : "建造中"}` : improvement ? `${improvement.name}，位于${info.label}` : info.label;
              const placementLabel = placingItem
                ? placementValid
                  ? `，可以建造${placingItem.name}，预计总加成 ${2 + placementOption!.adjacency} ${YIELD_META[placingItem.yield].label}`
                  : `，不能建造${placingItem.name}：${placementOption?.error ?? "不可用"}`
                : "";
              return (
                <button
                  className={`hex-tile ${terrain} ${owned ? "owned" : ""} ${rival ? "rival" : ""} ${discovered ? visible ? "visible" : "surveyed" : "fog"} ${reachable ? "reachable" : ""} ${selected && !placingProduction ? "selected" : ""} ${game.footballTurns > 0 && discovered && owned ? "football-benefit" : ""} ${placedProduction ? "has-city-building" : ""} ${buildingUnderConstruction ? "construction-site" : ""} ${placementValid ? "placement-valid" : ""} ${placementInvalid ? "placement-invalid" : ""} ${placingItem && !placementValid && !placementInvalid ? "placement-dim" : ""} ${placementCandidateSelected ? "placement-candidate" : ""}`}
                  key={tileId}
                  style={{ left: col * 70, top: row * 82 + (col % 2) * 41 }}
                  aria-label={`${discovered ? tileName : "未知"}地块，第 ${row + 1} 行第 ${col + 1} 列${yieldLabel}${containsUnit}${reachable ? `，可以移动，需要 ${moveCost} 点移动力` : ""}${placementLabel}`}
                  aria-selected={placementCandidateSelected || (!placingProduction && selected)}
                  role="gridcell"
                  data-testid={`tile-${tileId}`}
                  onClick={() => handleTileClick(pos)}
                  onMouseEnter={() => placingProduction && setHoveredPlacementTile(tileId)}
                  onMouseLeave={() => hoveredPlacementTile === tileId && setHoveredPlacementTile(null)}
                  onFocus={() => placingProduction && setHoveredPlacementTile(tileId)}
                  tabIndex={placingProduction && !placementValid ? -1 : 0}
                  disabled={aiThinking || Boolean(game.result)}
                >
                  {discovered ? placedProduction ? (
                    <span className={`city-building-art building-${placedProduction.id} ${buildingCompleted ? "completed" : "building"}`} aria-hidden="true"><i /><i /><i /><i /><b>{buildingCompleted ? placedProduction.icon : "⌁"}</b></span>
                  ) : improvement ? (
                    <span className={`improvement-art improvement-${improvement.type}`} aria-hidden="true"><i /><i /><i /><i /><b /></span>
                  ) : (
                    <span className={`terrain-art art-${terrain}`} aria-hidden="true"><i /><i /><i /><i /></span>
                  ) : (
                    <span className="fog-mark" aria-hidden="true">?</span>
                  )}
                  {discovered && (
                    <span className={`tile-yields ${showYields || Boolean(placingProduction) ? "visible" : ""}`} aria-hidden="true">
                      {tileYield.food > 0 && <i className="food">粮<b>{tileYield.food}</b></i>}
                      {tileYield.production > 0 && <i className="production">锤<b>{tileYield.production}</b></i>}
                      {tileYield.science > 0 && <i className="science">科<b>{tileYield.science}</b></i>}
                      {tileYield.culture > 0 && <i className="culture">文<b>{tileYield.culture}</b></i>}
                    </span>
                  )}
                  {reachable && <span className="move-overlay" aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><i /><b>{moveCost}</b></span>}
                  {placementValid && placingItem && <span className={`placement-overlay ${placementFeatured ? "featured" : ""} ${placementCandidateSelected ? "candidate" : ""}`} aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><b>{placementCandidateSelected ? "✓" : `+${2 + placementOption!.adjacency}${YIELD_META[placingItem.yield].symbol}`}</b><small>{placementCandidateSelected ? "已选择" : placementFeatured ? "高收益" : "可建造"}</small></span>}
                  {placementInvalid && <span className="placement-invalid-mark" aria-hidden="true">×</span>}
                  {selected && !placingProduction && <span className="selection-overlay" aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg></span>}
                </button>
              );
            })}

            <button className={`map-piece capital-piece ${citySelected ? "capital-selected" : ""} ${placingProduction ? "placement-locked" : ""}`} style={cityStyle} aria-label={`布宜诺斯艾利斯，阿根廷首都，${game.population} 人口，${activeProduction ? `正在${activeProduction.kind === "unit" ? "训练" : "建造"}${activeProduction.name}，还需 ${productionTurnsRemaining} 回合` : "等待安排生产"}`} onClick={openCapitalProduction} data-testid="capital-city" disabled={Boolean(placingProduction)}>
              <span className="place-label"><b>★</b> 布宜诺斯艾利斯 <em>{game.population}</em><small className={activeProduction ? "building" : "idle"}>锤 {activeProduction ? `${activeProduction.name} · ${productionTurnsRemaining}` : "待生产"}</small></span>
            </button>

            <button className={`map-piece capital-piece brazil-city-piece ${brazilCitySelected ? "capital-selected" : ""} ${placingProduction ? "placement-locked" : ""}`} style={brazilCityStyle} aria-label={`里约热内卢，巴西首都，${brazilPopulation} 人口；距离布宜诺斯艾利斯 ${CAPITAL_DISTANCE} 格；每回合食物 ${brazilYields.food}，生产 ${brazilYields.production}，科技 ${brazilYields.science}，文化 ${brazilYields.culture}`} onClick={() => setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(BRAZIL_CITY_POS), message: `里约热内卢：巴西首都，与布宜诺斯艾利斯相距 ${CAPITAL_DISTANCE} 格。` }))} data-testid="brazil-city" disabled={Boolean(placingProduction)}>
              <span className="place-label"><b>◆</b> 里约热内卢 <em>{brazilPopulation}</em><small>巴西首都</small></span>
            </button>

            {game.units.map((unit) => {
              const info = UNIT_INFO[unit.type];
              const cityGarrison = idFor(unit.pos) === idFor(CITY_POS);
              const unitStyle = { left: unit.pos.col * 70 + 22, top: unit.pos.row * 82 + (unit.pos.col % 2) * 41 + (cityGarrison ? 5 : 15) };
              return <button key={unit.id} className={`map-piece unit-piece trained-unit-piece ${unit.type}-piece ${cityGarrison ? "city-garrison" : ""} ${game.selectedUnitId === unit.id ? "piece-selected" : ""} ${placingProduction ? "placement-locked" : ""}`} style={unitStyle} aria-label={`${info.name}，${unit.moves} 点移动力`} data-testid={unit.id === "gaucho-1" ? "gaucho-unit" : `unit-${unit.id}`} onClick={() => setGame((prev) => ({ ...prev, selectedUnitId: unit.id, selectedTile: idFor(unit.pos), message: `${info.name}已选择；绿色六角格是本回合可达范围。` }))} disabled={Boolean(placingProduction)}>
                <span className={`unit-token ${unit.type}`} aria-hidden="true"><b>{info.short}</b><small>{unit.moves}</small></span>
                <span className="unit-label">{info.name}</span>
              </button>;
            })}

            {rivalScoutVisible && <button className={`map-piece rival-piece ${placingProduction ? "placement-locked" : ""}`} style={brazilStyle} aria-label="巴西斥候" onClick={() => setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(prev.brazilPos), message: "巴西斥候：目前保持中立。" }))} disabled={Boolean(placingProduction)}>
              <span className="unit-token" aria-hidden="true"><b>巴</b></span>
              <span className="unit-label">巴西斥候</span>
            </button>}

            {game.messiRecruited && (
              <button className={`map-piece messi-piece ${placingProduction ? "placement-locked" : ""}`} style={messiStyle} aria-label="伟人莱昂内尔·梅西位于布宜诺斯艾利斯" onClick={activateMessi} disabled={Boolean(placingProduction)}>
                <span className="messi-map-token"><b>10</b><i>⚽</i></span>
              </button>
            )}
          </div>
            </div>
          </div>

          <div className="map-caption">
            <span>潘帕斯草原</span>
            <small>{game.message}</small>
          </div>
          {aiThinking && <div className="ai-overlay" role="status"><span>巴西正在行动</span><i /><i /><i /></div>}
        </section>

        <aside className="right-rail">
          <section className="paper-card civ-card">
            <div className="card-kicker">你的文明</div>
            <div className="civ-heading">
              <span className="flag-orb">🇦🇷</span>
              <div><h2>阿根廷</h2><p>总统制共和国 · 探索时代</p></div>
            </div>
            <div className="trait"><span>太阳五月</span><b>草原文化 +1</b></div>
            <div className="trait"><span>潘帕斯牧场</span><b>骑乘单位 +1 移动</b></div>
            <div className="city-growth"><span>首都成长</span><b>{game.food}/{cityGrowthTarget} 食物</b><i><em style={{ width: `${Math.min(100, game.food / cityGrowthTarget * 100)}%` }} /></i></div>
            <button className={`city-production-summary ${activeProduction ? "active" : "idle"}`} onClick={openCapitalProduction} disabled={aiThinking || Boolean(game.result)} data-testid="open-production-picker">
              <span className="production-summary-icon" aria-hidden="true">⚒</span>
              <span className="production-summary-copy"><small>首都生产 · +{productionPerTurn} 锤/回合</small><strong>{activeProduction?.name ?? (hasAvailableProduction ? "待安排生产" : "全部项目已完成")}</strong>{activeProduction && <i><em style={{ width: `${productionPercent}%` }} /></i>}</span>
              <b>{activeProduction ? `${productionTurnsRemaining} 回合` : hasAvailableProduction ? "安排 ›" : "完成 ✓"}</b>
            </button>
            {game.completedBuildings.length > 0 && <div className="completed-buildings" aria-label="已建成建筑">{game.completedBuildings.map((id) => <span key={id}>{PRODUCTIONS.find((item) => item.id === id)?.name}</span>)}</div>}
          </section>

          <section className="paper-card save-card" aria-label="本地临时存档">
            <div className="save-card-heading"><div><div className="card-kicker">临时存档 · 单槽</div><strong>{saveMeta ? `第 ${saveMeta.turn} 回合` : "空存档槽"}</strong></div><small>{savedAtLabel}</small></div>
            {pendingSystemAction ? (
              <div className="save-confirm" role="alert"><p>{pendingSystemAction === "load" ? "读取会覆盖当前未保存的进度。" : "确定重新开始？临时存档会保留。"}</p><div><button onClick={() => setPendingSystemAction(null)}>取消</button><button className="confirm" onClick={confirmSystemAction} data-testid={`confirm-${pendingSystemAction}-game`}>{pendingSystemAction === "load" ? "确认读取" : "确认重开"}</button></div></div>
            ) : (
              <div className="save-actions"><button onClick={saveGame} disabled={aiThinking || Boolean(placingProduction)} data-testid="save-game"><b>▣</b><span>暂时保存</span></button><button onClick={() => setPendingSystemAction("load")} disabled={!saveMeta || aiThinking} data-testid="load-game"><b>↥</b><span>读取</span></button><button onClick={() => setPendingSystemAction("restart")} disabled={aiThinking} data-testid="restart-game"><b>↻</b><span>重新开局</span></button></div>
            )}
            <p className="save-note">{saveNotice}；重开会保留此存档。</p>
          </section>

          <section className="paper-card world-card">
            <div className="world-map-heading">
              <div><div className="card-kicker">世界小地图</div><small>已探索 {revealedCount}/{COLS * ROWS} 个地块</small></div>
              <b>巴西影响力 {game.brazilInfluence}/100</b>
            </div>
            <div className="influence-track" role="progressbar" aria-label="巴西影响力" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, game.brazilInfluence)}><i style={{ width: `${Math.min(100, game.brazilInfluence)}%` }} /></div>
            <div className="strategic-mini-map" style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}>
              <svg viewBox={`-4 -4 ${BOARD_WIDTH + 8} ${BOARD_HEIGHT + 8}`} role="img" aria-label={`世界小地图：已探索 ${revealedCount} 个地块；两国首都相距 ${CAPITAL_DISTANCE} 格；显示布宜诺斯艾利斯、里约热内卢和 ${game.units.length} 支阿根廷单位${rivalScoutVisible ? "，以及当前视野内的巴西斥候" : ""}`}>
                <defs>
                  <pattern id="mini-fog-pattern" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="20" height="20" fill="#59615e" /><line x1="0" y1="0" x2="0" y2="20" stroke="#737a76" strokeWidth="6" /></pattern>
                </defs>
                {tiles.map(({ terrain, col, row }) => {
                  const pos = { col, row };
                  const tileId = idFor(pos);
                  const geometry = hexGeometry(pos);
                  const discovered = game.discovered.has(tileId);
                  return <polygon key={`mini-${tileId}`} points={geometry.points} className={`mini-hex mini-${terrain} ${discovered ? visibleTiles.has(tileId) ? "visible" : "surveyed" : "fog"}`} />;
                })}
                <path d={ARGENTINA_EDGE_PATH} className="mini-territory-edge argentina" />
                <path d={BRAZIL_EDGE_PATH} className="mini-territory-edge brazil" />
                {selectedMiniGeometry && <polygon points={selectedMiniGeometry.points} className="mini-selected" />}
                <g className="mini-brazil-country" transform={`translate(${miniBrazilLabelGeometry.cx} ${miniBrazilLabelGeometry.cy})`}><rect x="-48" y="-18" width="96" height="36" rx="18" /><text textAnchor="middle" dominantBaseline="central">巴西</text></g>
                <g className="mini-token mini-city-token" transform={`translate(${miniCityGeometry.cx} ${miniCityGeometry.cy})`}><circle r="29" /><text textAnchor="middle" dominantBaseline="central">★</text></g>
                <g className="mini-token mini-brazil-city-token" transform={`translate(${miniBrazilCityGeometry.cx} ${miniBrazilCityGeometry.cy})`}><circle className="mini-rival-halo" r="43" /><circle r="30" /><text textAnchor="middle" dominantBaseline="central">◆</text></g>
                {game.units.map((unit) => { const geometry = hexGeometry(unit.pos); return <g key={`mini-unit-${unit.id}`} className="mini-token mini-unit-token" transform={`translate(${geometry.cx} ${geometry.cy})`}><circle r="24" /><text textAnchor="middle" dominantBaseline="central">{UNIT_INFO[unit.type].short}</text></g>; })}
                {rivalScoutVisible && <g className="mini-token mini-rival-token" transform={`translate(${miniBrazilGeometry.cx} ${miniBrazilGeometry.cy})`}><circle r="23" /><text textAnchor="middle" dominantBaseline="central">斥</text></g>}
              </svg>
            </div>
            <div className="mini-map-legend" aria-hidden="true"><span><i className="argentina" />阿根廷领土</span><span><i className="brazil" />巴西领土</span><span><i className="surveyed" />已探索</span><span><i className="fog" />未探索</span></div>
            <p className="world-threat-copy">蓝色连续外缘是布宜诺斯艾利斯城市边界，绿黄色外缘是里约热内卢城市边界；两国首都相距 <b>{CAPITAL_DISTANCE}</b> 格。</p>
            <button className="locate-rival" onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(BRAZIL_CITY_POS), message: `已定位巴西首都；距离我国首都 ${CAPITAL_DISTANCE} 格。` })); focusMapOn(BRAZIL_CITY_POS); }} disabled={aiThinking || Boolean(placingProduction)} data-testid="locate-brazil">⌖ 定位巴西首都 · {CAPITAL_DISTANCE} 格</button>
            <div className="diplomacy-row"><span><b className="avatar argentina">A</b>阿根廷</span><em>你</em></div>
            <div className="diplomacy-row"><span><b className="avatar brazil">B</b>巴西</span><em>{aiThinking ? "行动中" : "已接触"}</em></div>
            <div className="foreign-yield-ribbon" aria-label={`巴西文明每回合总产出：食物 ${brazilYields.food}，生产 ${brazilYields.production}，科技 ${brazilYields.science}，文化 ${brazilYields.culture}`}>
              <div><strong>巴西总产出</strong><small>始终显示 · 每回合</small></div>
              <span className="food">粮 <b>+{brazilYields.food}</b></span><span className="production">锤 <b>+{brazilYields.production}</b></span><span className="science">科 <b>+{brazilYields.science}</b></span><span className="culture">文 <b>+{brazilYields.culture}</b></span>
            </div>
          </section>

          <section className={`paper-card great-person-card ${game.messiRecruited ? "recruited" : ""}`}>
            <div className="card-kicker">{game.messiRecruited ? "伟人 · 已加入" : "伟人候选"}</div>
            <div className="great-person-heading">
              <span className="messi-medal"><b>10</b><i>⚽</i></span>
              <div><h3>莱昂内尔·梅西</h3><p>文化与体育伟人</p></div>
            </div>
            <p className="ability-copy">“黄金助攻”：文化 +12，并让全国进入 3 回合足球热潮。</p>
            {!game.messiRecruited ? (
              <>
                <div className="candidate-progress"><span style={{ width: `${Math.min(100, game.greatPoints / 30 * 100)}%` }} /></div>
                <button className={`recruit-button ${game.greatPoints >= 30 ? "ready" : ""}`} disabled={game.greatPoints < 30 || aiThinking} onClick={recruitMessi} data-testid="recruit-messi">{game.greatPoints >= 30 ? "招募梅西" : `还需 ${30 - game.greatPoints} 伟人点`}</button>
              </>
            ) : (
              <button className="ability-button" disabled={game.messiAbilityUsed || aiThinking} onClick={activateMessi} data-testid="messi-ability">{game.messiAbilityUsed ? "黄金助攻 · 已使用" : "发动黄金助攻"}</button>
            )}
          </section>
        </aside>
      </section>

      <div className={`action-dock ${citySelected ? "city-mode" : ""} ${brazilCitySelected ? "foreign-mode" : ""} ${placingProduction ? "placement-hidden" : ""}`} role="region" aria-label={citySelected ? "首都生产操作" : brazilCitySelected ? "巴西文明情报" : "选中单位操作"}>
        <div className="selected-unit">
          <span className="unit-portrait" aria-hidden="true">{selectedUnitInfo?.short ?? (citySelected ? "★" : brazilCitySelected ? "◆" : selectedKnown ? "⌖" : "?")}</span>
          <div className="selected-copy"><small>{selectedUnit ? "● 单位已选择" : citySelected ? "● 首都已选择" : brazilCitySelected ? "● 外国首都已选择" : selectedKnown ? "当前地块" : "● 未知区域"}</small><strong>{selectedUnitInfo?.name ?? (citySelected ? "布宜诺斯艾利斯" : brazilCitySelected ? "里约热内卢" : selectedKnown ? selectedImprovement?.name ?? selectedYield.label : "战争迷雾")}</strong>{selectedUnit && <span className="movement-pips" aria-label={`${selectedUnit.moves} / ${maxMoves} 移动力`}>{Array.from({ length: maxMoves }, (_, index) => <i className={index < selectedUnit.moves ? "available" : "spent"} key={index} />)}<b>{selectedUnit.moves}/{maxMoves}</b></span>}<span>{selectedUnit ? selectedUnit.moves > 0 ? "选择绿色六角格移动" : "本回合移动力已用完" : citySelected ? `人口 ${game.population} · +${productionPerTurn} 锤/回合` : brazilCitySelected ? `巴西人口 ${brazilPopulation} · 距我国首都 ${CAPITAL_DISTANCE} 格` : selectedKnown ? "点击单位或首都下达命令" : "派侦察单位靠近以获取情报"}</span></div>
        </div>
        {citySelected ? (
          <div className="city-production-dock">
            <div className="dock-production-copy"><small>当前生产 · 建筑或单位</small><strong>{activeProduction?.name ?? "尚未安排生产"}</strong><span>{activeProduction ? `${activeProductionProgress}/${activeProduction.cost} 锤 · 预计 ${productionTurnsRemaining} 回合` : "选择建筑选址，或训练一个会自动部署的单位"}</span>{activeProduction && <i><em style={{ width: `${productionPercent}%` }} /></i>}</div>
            <button onClick={openCapitalProduction} disabled={aiThinking || !hasAvailableProduction} data-testid="dock-production-button"><b>⚒</b><span>{activeProduction ? "更换生产" : hasAvailableProduction ? "选择生产" : "建设完成"}</span></button>
          </div>
        ) : brazilCitySelected ? (
          <div className="foreign-city-dock" aria-label="巴西文明每回合总产出">
            <div><small>领袖条情报 · 始终显示</small><strong>巴西每回合总产出</strong></div>
            <span className="food">粮 <b>+{brazilYields.food}</b></span><span className="production">锤 <b>+{brazilYields.production}</b></span><span className="science">科 <b>+{brazilYields.science}</b></span><span className="culture">文 <b>+{brazilYields.culture}</b></span>
          </div>
        ) : (
          <div className="action-buttons">
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={() => setGame((prev) => ({ ...prev, message: "请选择带白色落点的绿色六角格；数字表示需要的移动力。" }))}><b>⌖</b><span>移动</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleExplore} data-testid="explore-action"><b>◉</b><span>侦察</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleWait}><b>⚑</b><span>驻扎</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleWait}><b>↶</b><span>休整</span></button>
          </div>
        )}
      </div>

      <button className="end-turn-button" onClick={requestEndTurn} disabled={aiThinking || Boolean(game.result) || Boolean(placingProduction) || productionDrawerOpen} data-testid="end-turn"><span>{aiThinking ? "巴西行动中" : placingProduction ? "请选择地块" : "结束回合"}</span><small>Enter</small></button>

      <div className="event-toast" role="status" aria-live="polite">{game.message}</div>

      {techPickerOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTechPickerOpen(false)}>
          <section className="tech-modal" role="dialog" aria-modal="true" aria-labelledby="tech-title">
            <div className="modal-header"><div><span>科技树</span><h2 id="tech-title">选择下一项研究</h2></div><button onClick={() => setTechPickerOpen(false)} aria-label="关闭科技树">×</button></div>
            <div className="tech-grid">
              {TECHS.map((tech) => {
                const done = game.completedTechs.includes(tech.id);
                const active = game.activeTech === tech.id;
                return <button key={tech.id} disabled={done} className={active ? "active" : ""} onClick={() => chooseTech(tech.id)}><span>{tech.icon}</span><div><h3>{tech.name}</h3><p>{tech.effect}</p><small>{done ? "已完成" : active ? "研究中" : `${tech.cost} 科研`}</small></div></button>;
              })}
            </div>
          </section>
        </div>
      )}

      <aside className={`production-drawer ${productionDrawerOpen ? "open" : ""} ${placingItem ? "placing" : ""}`} role="dialog" aria-modal="false" aria-labelledby="production-title" aria-hidden={!productionDrawerOpen}>
        <header className="production-drawer-header">
          {placingItem && <button className="drawer-back" onClick={() => cancelProductionPlacement(true)} aria-label="返回生产列表">‹</button>}
          <div><span>{placingItem ? "建筑选址" : "城市生产"}</span><h2 id="production-title">{placingItem ? placingItem.name : "布宜诺斯艾利斯"}</h2><p>{placingItem ? placingItem.placementRule : `每回合 +${productionPerTurn} 锤 · 人口 ${game.population}`}</p></div>
          <button className="drawer-close" onClick={closeProductionDrawer} aria-label="关闭生产面板">×</button>
        </header>

        {!placingItem && <div className="production-section-tabs" role="tablist" aria-label="生产分类"><button className={productionCategory === "buildings" ? "active" : ""} role="tab" aria-selected={productionCategory === "buildings"} onClick={() => setProductionCategory("buildings")} data-testid="production-tab-buildings">▦ 建筑与城区</button><button className={productionCategory === "units" ? "active" : ""} role="tab" aria-selected={productionCategory === "units"} onClick={() => setProductionCategory("units")} data-testid="production-tab-units">⚑ 单位</button></div>}

        {!placingItem && activeProduction && (
          <section className="active-production-card" aria-label="当前生产">
            <span className="active-project-icon">{activeProduction.icon}</span>
            <div><small>当前生产</small><strong>{activeProduction.name}</strong><p>{game.productionProgress[activeProduction.id]}/{activeProduction.cost} 锤 · {productionTurnsRemaining} 回合</p><i><b style={{ width: `${productionPercent}%` }} /></i></div>
            <em>{activeProduction.kind === "building" ? game.buildingPlacements[activeProduction.id] ? "已落位" : "待选址" : "完成后自动部署"}</em>
          </section>
        )}

        {placingItem ? (
          <div className="placement-inspector">
            <section className="placement-project-card">
              <span className={`project-yield ${placingItem.yield}`}>{placingItem.icon}</span>
              <div><small>{placingItem.category}</small><h3>{placingItem.name}</h3><p>{placingItem.effect}</p></div>
            </section>
            <div className="placement-steps"><span className="done">1 选择项目</span><i /><span className={placementCandidate ? "done" : "active"}>2 选择地块</span><i /><span className={placementCandidate ? "active" : ""}>3 确认</span></div>
            <p className="placement-instruction">在地图上选择一个绿色六角格。格内数字是建成后的建筑产出；自然地块产出会被城区替换。</p>

            <section className={`placement-tile-preview ${placementPreviewOption?.error ? "invalid" : placementPreviewTile ? "valid" : "empty"}`} aria-live="polite">
              {placementPreviewTile && placementPreviewTerrain && placementPreviewOption ? (
                <>
                  <div className="preview-heading"><span className={`preview-hex ${terrainAt(posForId(placementPreviewTile))}`} aria-hidden="true" /><div><small>第 {posForId(placementPreviewTile).row + 1} 行 · 第 {posForId(placementPreviewTile).col + 1} 列</small><strong>{placementPreviewTerrain.label}</strong></div><b>{placementPreviewOption.error ? "不可建造" : placementCandidate === placementPreviewTile ? "已选择" : "地块预览"}</b></div>
                  {placementPreviewOption.error ? <p className="placement-error">× {placementPreviewOption.error}</p> : <><div className="yield-delta-row"><span>替换自然产出</span><b>粮 {placementPreviewTerrain.food} · 锤 {placementPreviewTerrain.production} · 科 {placementPreviewTerrain.science} · 文 {placementPreviewTerrain.culture}</b></div><div className="yield-delta-row"><span>建筑基础</span><b className={placingItem.yield}>+2 {YIELD_META[placingItem.yield].label}</b></div><div className="yield-delta-row"><span>相邻加成</span><b className={placingItem.yield}>+{placementPreviewOption.adjacency} {YIELD_META[placingItem.yield].label}</b></div><div className="yield-delta-total"><span>建成后地块产出</span><strong className={placingItem.yield}>+{2 + placementPreviewOption.adjacency} {YIELD_META[placingItem.yield].label}</strong></div></>}
                </>
              ) : <div className="preview-empty"><span>⬡</span><p>将鼠标移到绿色地块上查看收益<br />点击地块进行选择</p></div>}
            </section>

            {placementPreviewTile && placementPreviewOption && !placementPreviewOption.error && <button className="placement-detail-toggle" onClick={() => setPlacementDetailed((value) => !value)} aria-expanded={placementDetailed}>{placementDetailed ? "收起详细数据" : "查看详细数据"}</button>}
            {placementDetailed && placementPreviewTerrain && placementPreviewOption && !placementPreviewOption.error && <section className="placement-details"><div><span>原地块</span><b>粮 {placementPreviewTerrain.food} · 锤 {placementPreviewTerrain.production} · 科 {placementPreviewTerrain.science} · 文 {placementPreviewTerrain.culture}</b></div><div><span>邻接来源</span><b>{placementPreviewOption.adjacency > 0 ? `${placementPreviewOption.adjacency} 个相邻地貌` : "无相邻加成"}</b></div><div><span>占用规则</span><b>转为城区 · 替换自然产出</b></div></section>}

            <div className="placement-actions"><button onClick={() => cancelProductionPlacement(true)}>取消选址</button><button className="confirm" onClick={confirmProductionPlacement} disabled={!placementCandidate} data-testid="confirm-production-placement">{placementCandidate ? "确认在此建造" : "请先选择地块"}</button></div>
          </div>
        ) : (
          <div className="production-choice-view">
            <div className="production-category-heading"><div><span>▾</span><strong>{productionCategory === "buildings" ? "建筑与城区" : "训练单位"}</strong></div><small>{productionCategory === "buildings" ? `${PRODUCTIONS.filter((item) => item.kind === "building").length - game.completedBuildings.length} 项未完成` : "2 项可重复训练"}</small></div>
            <section className={`production-list-section ${productionCategory}`}>
            <div className="production-list">
              {PRODUCTIONS.filter((production) => productionCategory === "buildings" ? production.kind === "building" : production.kind === "unit").map((production) => {
                const done = production.kind === "building" && game.completedBuildings.includes(production.id);
                const active = game.activeProduction === production.id;
                const progress = game.productionProgress[production.id];
                const turns = Math.max(1, Math.ceil((production.cost - progress) / productionPerTurn));
                const adjacency = production.kind === "building" ? bestAvailableAdjacency(game, production.id) : null;
                const placed = production.kind === "building" && Boolean(game.buildingPlacements[production.id]);
                return <button key={production.id} disabled={done} className={`production-list-item ${production.kind === "unit" ? "unit-production" : ""} ${active ? "active" : ""}`} onClick={() => chooseProduction(production.id)} data-testid={`production-${production.id}`}><span className={`project-yield ${production.kind === "unit" ? "unit" : production.yield}`}>{production.icon}</span><div className="production-item-copy"><em>{production.category}</em><h3>{production.name}</h3><p>{production.effect}{adjacency !== null ? ` · 最高相邻 +${adjacency}` : ""}</p>{progress > 0 && !done && <i><b style={{ width: `${Math.min(100, progress / production.cost * 100)}%` }} /></i>}<small>{done ? "已建成" : production.kind === "unit" ? "完成后从首都或相邻空格自动部署" : placed ? "已落位 · 可继续建造" : production.placementRule}</small></div><div className="production-item-cost"><strong>{done ? "✓" : turns}</strong><span>{done ? "完成" : "回合"}</span><small>{production.cost} 锤</small></div></button>;
              })}
            </div>
            </section>
            <button className="production-skip" onClick={() => { setProductionReminderBypassed(true); setProductionDrawerOpen(false); setGame((prev) => ({ ...prev, message: "本回合暂不生产；再次点击结束回合即可继续。" })); }}>本回合暂不生产</button>
          </div>
        )}
      </aside>

      {game.result && (
        <div className="modal-backdrop result-backdrop">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <span className="result-emblem">{game.result === "win" ? "✺" : "◒"}</span>
            <div className="card-kicker">{game.result === "win" ? "历史性胜利" : "时代落幕"}</div>
            <h2 id="result-title">{game.result === "win" ? "阿根廷迎来文明曙光" : "巴西赢得地区影响力"}</h2>
            <p>{game.result === "win" ? "布宜诺斯艾利斯繁荣昌盛，科技、探索与梅西凝聚了整个文明。" : "重新规划探索与科技节奏，再次带领阿根廷出发。"}</p>
            <button onClick={resetGame}>重新开始</button>
          </section>
        </div>
      )}
    </main>
  );
}
