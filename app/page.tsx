"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

type Terrain = "water" | "desert" | "forest" | "hills" | "grass" | "mountain";
type Position = { col: number; row: number };
type TechId = "husbandry" | "riding" | "federalism" | "broadcast";
type CivicId = "craftsmanship" | "foreignTrade" | "publicService" | "popularSovereignty";
type PolicyId = "urbanPlanning" | "caravansaries" | "publicWorks" | "charismaticLeader";
type CelebrationId = "harvestFestival" | "industryFair" | "maySquare";
type BuildingId = "monument" | "granary" | "academy" | "workshop";
type UnitProductionId = "scout" | "gaucho" | "settler";
type ProductionId = BuildingId | UnitProductionId;
type UnitType = "scout" | "gaucho" | "settler";
type YieldKey = "food" | "production" | "science" | "culture";
type ImprovementType = "palace" | "ranch" | "farm" | "mine" | "lumbermill" | "plantation";
type BuildableImprovementType = Exclude<ImprovementType, "palace">;
type ResourceId = "wheat" | "horses" | "iron" | "coffee";
type RivalId = "brazil" | "inca" | "maya" | "egypt" | "han";
type NarrativeEventId = "worldCouncil" | "pampasVoices" | "distantHorizon" | "coffeeExchange" | "footballNation";
type LegacyCategory = "science" | "culture" | "economy" | "exploration";
type RivalTurnPlan = { rivalId: RivalId; action: string; expandedTile: string | null; developedTile: string | null; grew: boolean };
type RivalEmpireSnapshot = { population: number; development: number; ownedTiles: string[]; developedTiles: string[] };
type CityId = string;
type WarStatus = "peace" | "war";
type ResultReason = "legacy" | "influence" | "conquest" | null;
type PlayerUnit = { id: string; type: UnitType; pos: Position; moves: number; hp: number };
type RivalUnit = { id: string; rivalId: RivalId; type: "warrior"; pos: Position; moves: number; hp: number };
type TileYields = { food: number; production: number; science: number; culture: number; gold: number };
type BuildingProject = { id: BuildingId; kind: "building"; name: string; cost: number; icon: string; effect: string; category: string; yield: YieldKey; allowedTerrains: Terrain[]; placementRule: string };
type UnitProject = { id: UnitProductionId; kind: "unit"; unitType: UnitType; name: string; cost: number; icon: string; effect: string; category: string; yield: "production" };
type ProductionProject = BuildingProject | UnitProject;
type PlayerCity = {
  id: CityId;
  name: string;
  pos: Position;
  isCapital: boolean;
  population: number;
  food: number;
  growthPending: number;
  ruralTiles: string[];
  activeProduction: ProductionId | null;
  productionProgress: Record<ProductionId, number>;
  completedBuildings: BuildingId[];
  buildingPlacements: Partial<Record<BuildingId, string>>;
  hp: number;
};

type GameState = {
  turn: number;
  gold: number;
  science: number;
  culture: number;
  greatPoints: number;
  cities: PlayerCity[];
  nextCitySerial: number;
  ownedTiles: string[];
  builtImprovements: Partial<Record<string, BuildableImprovementType>>;
  activeTech: TechId | null;
  techProgress: number;
  completedTechs: TechId[];
  activeCivic: CivicId | null;
  civicProgress: number;
  completedCivics: CivicId[];
  activePolicy: PolicyId | null;
  units: PlayerUnit[];
  selectedUnitId: string | null;
  nextUnitSerial: number;
  brazilPos: Position;
  brazilInfluence: number;
  influence: number;
  brazilRelationship: number;
  rivalRelationships: Record<RivalId, number>;
  rivalInfluence: Record<RivalId, number>;
  tradePartner: RivalId | null;
  researchPartner: RivalId | null;
  sanctionedRival: RivalId | null;
  tradeRouteTurns: number;
  researchCollaborationTurns: number;
  sanctionTurns: number;
  wars: Record<RivalId, WarStatus>;
  rivalUnits: RivalUnit[];
  rivalMilitaryProgress: Record<RivalId, number>;
  rivalCityHp: Record<RivalId, number>;
  defeatedRivals: RivalId[];
  nextRivalUnitSerial: number;
  happiness: number;
  celebration: CelebrationId | null;
  celebrationTurns: number;
  celebrationPending: boolean;
  discovered: Set<string>;
  selectedTile: string | null;
  messiRecruited: boolean;
  messiAbilityUsed: boolean;
  footballTurns: number;
  triggeredEvents: NarrativeEventId[];
  pendingEvent: NarrativeEventId | null;
  nextEventTurn: number;
  claimedLegacyMilestones: string[];
  legacyPoints: Record<LegacyCategory, number>;
  message: string;
  log: string[];
  result: "win" | "lose" | null;
  resultReason: ResultReason;
};

type SavedGameState = Omit<GameState, "discovered"> & { discovered: string[] };
type SaveEnvelope = { version: 6; savedAt: string; game: SavedGameState };
type SaveReadResult =
  | { ok: true; savedAt: string; game: GameState }
  | { ok: false; reason: "missing" | "version" | "corrupt" };
type SaveMeta = { savedAt: string; turn: number };

const LEGACY_COLS = 9;
const LEGACY_ROWS = 6;
const V3_COLS = 15;
const V3_ROWS = 8;
const COLS = 32;
const ROWS = 18;
const CITY_POS = { col: 4, row: 4 };
const BRAZIL_CITY_POS = { col: 16, row: 4 };
const BRAZIL_SCOUT_START = { col: 15, row: 5 };
const BOARD_WIDTH = (COLS - 1) * 70 + 92;
const BOARD_HEIGHT = (ROWS - 1) * 82 + 41 + 80;
const HAPPINESS_TARGET = 60;
const UNIT_MAX_HP = 100;
const CITY_MAX_HP = 200;
const RIVAL_UNIT_COST = 24;
const AI_STEP_MS = 650;
const SAVE_KEY = "civilization-dawn.single-slot";
const SAVE_VERSION = 6 as const;

type RivalDefinition = {
  id: RivalId;
  name: string;
  flag: string;
  leader: string;
  capitalName: string;
  capital: Position;
  token: string;
  color: string;
  tint: string;
  agenda: string;
  agendaDetail: string;
  specialty: string;
  resource: ResourceId;
  baseYields: Pick<TileYields, "food" | "production" | "science" | "culture">;
};

const RIVALS: RivalDefinition[] = [
  { id: "brazil", name: "巴西", flag: "🇧🇷", leader: "佩德罗二世", capitalName: "里约热内卢", capital: BRAZIL_CITY_POS, token: "B", color: "#2f9a5b", tint: "#dcefdc", agenda: "文化赞助者", agendaDetail: "欣赏文化产出高、愿意维持贸易的文明。", specialty: "文化与雨林", resource: "coffee", baseYields: { food: 6, production: 5, science: 3, culture: 2 } },
  { id: "inca", name: "印加", flag: "🇵🇪", leader: "帕查库特克", capitalName: "库斯科", capital: { col: 4, row: 13 }, token: "I", color: "#d8872f", tint: "#f5e3ca", agenda: "山岳之王", agendaDetail: "尊重开发丘陵与山地资源的文明。", specialty: "山地经济", resource: "iron", baseYields: { food: 5, production: 7, science: 2, culture: 3 } },
  { id: "maya", name: "玛雅", flag: "🇲🇽", leader: "六天夫人", capitalName: "瓦卡", capital: { col: 16, row: 13 }, token: "M", color: "#8b5bb5", tint: "#eadff2", agenda: "群星历法", agendaDetail: "欣赏领先科技、完成研究的文明。", specialty: "科技与历法", resource: "wheat", baseYields: { food: 5, production: 4, science: 7, culture: 3 } },
  { id: "egypt", name: "埃及", flag: "🇪🇬", leader: "哈特谢普苏特", capitalName: "底比斯", capital: { col: 27, row: 4 }, token: "E", color: "#c5a02c", tint: "#f3e9bd", agenda: "尼罗河贸易", agendaDetail: "偏爱建立商路并积累财富的文明。", specialty: "贸易与奇观", resource: "horses", baseYields: { food: 5, production: 5, science: 3, culture: 6 } },
  { id: "han", name: "汉", flag: "🇨🇳", leader: "孔子", capitalName: "长安", capital: { col: 27, row: 13 }, token: "H", color: "#b84b45", tint: "#f2d9d4", agenda: "礼乐教化", agendaDetail: "欣赏文化、市政和稳定幸福度。", specialty: "文化与治理", resource: "wheat", baseYields: { food: 6, production: 4, science: 5, culture: 5 } },
];

const RIVAL_BY_ID = Object.fromEntries(RIVALS.map((rival) => [rival.id, rival])) as Record<RivalId, RivalDefinition>;
const DEFAULT_RIVAL_RELATIONSHIPS: Record<RivalId, number> = { brazil: 50, inca: 56, maya: 48, egypt: 45, han: 52 };
const DEFAULT_RIVAL_INFLUENCE: Record<RivalId, number> = { brazil: 18, inca: 12, maya: 14, egypt: 11, han: 13 };
const DEFAULT_WARS: Record<RivalId, WarStatus> = { brazil: "peace", inca: "peace", maya: "peace", egypt: "peace", han: "peace" };
const DEFAULT_RIVAL_MILITARY_PROGRESS: Record<RivalId, number> = { brazil: 0, inca: 0, maya: 0, egypt: 0, han: 0 };
const DEFAULT_RIVAL_CITY_HP: Record<RivalId, number> = { brazil: CITY_MAX_HP, inca: CITY_MAX_HP, maya: CITY_MAX_HP, egypt: CITY_MAX_HP, han: CITY_MAX_HP };
const DEFAULT_LEGACY_POINTS: Record<LegacyCategory, number> = { science: 0, culture: 0, economy: 0, exploration: 0 };
const LEGACY_MILESTONE_META: ReadonlyArray<{ id: string; category: LegacyCategory }> = [
  { id: "science-1", category: "science" }, { id: "science-2", category: "science" },
  { id: "culture-1", category: "culture" }, { id: "culture-2", category: "culture" },
  { id: "economy-1", category: "economy" }, { id: "economy-2", category: "economy" },
  { id: "exploration-1", category: "exploration" }, { id: "exploration-2", category: "exploration" },
];

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

const INITIAL_IMPROVEMENTS: Record<string, ImprovementType> = {
  "4-4": "palace",
};

const IMPROVEMENT_INFO: Record<ImprovementType, { name: string; bonus: Partial<TileYields> }> = {
  palace: { name: "首都宫殿", bonus: { production: 1, science: 1, culture: 1 } },
  ranch: { name: "潘帕斯牧场", bonus: { food: 1, production: 1 } },
  farm: { name: "灌溉农场", bonus: { food: 2 } },
  mine: { name: "丘陵矿山", bonus: { production: 2 } },
  lumbermill: { name: "森林伐木场", bonus: { production: 1, gold: 1 } },
  plantation: { name: "咖啡种植园", bonus: { culture: 1, gold: 2 } },
};

const RESOURCE_TILES: Record<string, ResourceId> = {
  "5-3": "wheat",
  "5-4": "horses",
  "4-5": "iron",
  "3-3": "coffee",
  "15-4": "coffee",
  "17-4": "wheat",
  "16-5": "horses",
  "26-4": "horses",
  "28-4": "wheat",
  "27-5": "coffee",
  "3-13": "iron",
  "5-13": "coffee",
  "4-14": "horses",
  "15-13": "wheat",
  "17-13": "coffee",
  "16-14": "iron",
  "26-13": "wheat",
  "28-13": "iron",
  "27-14": "coffee",
  "9-8": "iron",
  "11-15": "wheat",
  "22-9": "coffee",
  "30-8": "horses",
};

const RESOURCE_INFO: Record<ResourceId, { name: string; icon: string; yield: Partial<TileYields>; improvement: BuildableImprovementType }> = {
  wheat: { name: "小麦", icon: "穗", yield: { food: 1 }, improvement: "farm" },
  horses: { name: "马", icon: "马", yield: { production: 1 }, improvement: "ranch" },
  iron: { name: "铁", icon: "铁", yield: { production: 1 }, improvement: "mine" },
  coffee: { name: "咖啡", icon: "咖", yield: { culture: 1, gold: 1 }, improvement: "plantation" },
};

const TECHS: Array<{ id: TechId; name: string; cost: number; icon: string; effect: string }> = [
  { id: "husbandry", name: "畜牧业", cost: 12, icon: "♞", effect: "潘帕斯地块食物 +1" },
  { id: "riding", name: "骑术传统", cost: 16, icon: "⚑", effect: "高乔侦骑移动力 +1" },
  { id: "federalism", name: "联邦制度", cost: 20, icon: "◈", effect: "首都每回合科研 +2" },
  { id: "broadcast", name: "大众广播", cost: 24, icon: "◉", effect: "每回合伟人点 +2" },
];

const CIVICS: Array<{ id: CivicId; name: string; cost: number; icon: string; effect: string; unlock: PolicyId }> = [
  { id: "craftsmanship", name: "工艺传统", cost: 14, icon: "⚒", effect: "解锁政策“城市规划”", unlock: "urbanPlanning" },
  { id: "foreignTrade", name: "对外贸易", cost: 18, icon: "⇄", effect: "解锁政策“商队旅馆”", unlock: "caravansaries" },
  { id: "publicService", name: "公共服务", cost: 22, icon: "♟", effect: "解锁政策“公共工程”", unlock: "publicWorks" },
  { id: "popularSovereignty", name: "人民主权", cost: 26, icon: "✦", effect: "解锁政策“魅力领袖”", unlock: "charismaticLeader" },
];

const POLICIES: Record<PolicyId, { name: string; category: string; icon: string; effect: string; unlockedBy: CivicId }> = {
  urbanPlanning: { name: "城市规划", category: "经济政策", icon: "锤", effect: "首都生产力 +1", unlockedBy: "craftsmanship" },
  caravansaries: { name: "商队旅馆", category: "经济政策", icon: "金", effect: "贸易路线金币 +2", unlockedBy: "foreignTrade" },
  publicWorks: { name: "公共工程", category: "经济政策", icon: "粮", effect: "首都食物 +2", unlockedBy: "publicService" },
  charismaticLeader: { name: "魅力领袖", category: "外交政策", icon: "鸽", effect: "每回合影响力 +1", unlockedBy: "popularSovereignty" },
};

const CELEBRATIONS: Record<CelebrationId, { name: string; icon: string; effect: string; yield: YieldKey }> = {
  harvestFestival: { name: "丰收节", icon: "穗", effect: "4 回合内食物 +3", yield: "food" },
  industryFair: { name: "工业博览会", icon: "锤", effect: "4 回合内生产力 +3", yield: "production" },
  maySquare: { name: "五月广场庆典", icon: "文", effect: "4 回合内文化 +3", yield: "culture" },
};

const PRODUCTIONS: ProductionProject[] = [
  { id: "monument", kind: "building", name: "五月纪念碑", cost: 14, icon: "✦", effect: "每回合文化 +2", category: "文化建筑", yield: "culture", allowedTerrains: ["grass", "desert", "hills"], placementRule: "建在草原、沙漠或丘陵" },
  { id: "granary", kind: "building", name: "潘帕斯粮仓", cost: 21, icon: "♨", effect: "每回合食物 +2", category: "农业建筑", yield: "food", allowedTerrains: ["grass", "forest"], placementRule: "建在草原或森林" },
  { id: "academy", kind: "building", name: "国立学院", cost: 28, icon: "◆", effect: "每回合科技 +2", category: "科技建筑", yield: "science", allowedTerrains: ["grass", "desert", "hills", "forest"], placementRule: "建在陆地；山脉与丘陵提供相邻加成" },
  { id: "workshop", kind: "building", name: "布宜诺斯工坊", cost: 32, icon: "⚒", effect: "首都每回合生产力 +2", category: "工业建筑", yield: "production", allowedTerrains: ["forest", "hills", "desert"], placementRule: "建在森林、丘陵或沙漠" },
  { id: "scout", kind: "unit", unitType: "scout", name: "潘帕斯侦察兵", cost: 12, icon: "侦", effect: "移动力 2 · 擅长揭开战争迷雾", category: "侦察单位", yield: "production" },
  { id: "gaucho", kind: "unit", unitType: "gaucho", name: "高乔骑手", cost: 20, icon: "高", effect: "移动力 3 · 阿根廷特色骑乘单位", category: "骑乘单位", yield: "production" },
  { id: "settler", kind: "unit", unitType: "settler", name: "开拓者", cost: 30, icon: "拓", effect: "移动力 2 · 在合法陆地建立一座分城", category: "平民单位", yield: "production" },
];

const UNIT_INFO: Record<UnitType, { name: string; short: string; baseMoves: number; strength: number; role: "combat" | "civilian" }> = {
  scout: { name: "潘帕斯侦察兵", short: "侦", baseMoves: 2, strength: 16, role: "combat" },
  gaucho: { name: "高乔骑手", short: "高", baseMoves: 3, strength: 32, role: "combat" },
  settler: { name: "开拓者", short: "拓", baseMoves: 2, strength: 0, role: "civilian" },
};

const makeProductionProgress = () => Object.fromEntries(PRODUCTIONS.map((production) => [production.id, 0])) as Record<ProductionId, number>;
const CITY_NAME_POOL = ["科尔多瓦", "罗萨里奥", "门多萨", "拉普拉塔", "萨尔塔", "圣菲"];

function createPlayerCity(id: CityId, name: string, pos: Position, isCapital = false): PlayerCity {
  return {
    id,
    name,
    pos,
    isCapital,
    population: 1,
    food: isCapital ? 8 : 0,
    growthPending: 0,
    ruralTiles: [],
    activeProduction: null,
    productionProgress: makeProductionProgress(),
    completedBuildings: [],
    buildingPlacements: {},
    hp: CITY_MAX_HP,
  };
}

const YIELD_META: Record<YieldKey, { label: string; symbol: string }> = {
  food: { label: "食物", symbol: "粮" },
  production: { label: "生产", symbol: "锤" },
  science: { label: "科技", symbol: "科" },
  culture: { label: "文化", symbol: "文" },
};

const idFor = ({ col, row }: Position) => `${col}-${row}`;
const posForId = (id: string): Position => ({ col: Number(id.split("-")[0]), row: Number(id.split("-")[1]) });
const addLog = (log: string[], entry: string) => [entry, ...log].slice(0, 4);
const inBounds = ({ col, row }: Position) => col >= 0 && col < COLS && row >= 0 && row < ROWS;
const EXPANSION_PATTERN: Terrain[] = ["grass", "forest", "hills", "grass", "desert", "forest", "grass", "hills", "water", "grass", "mountain", "forest"];
const v3TerrainAt = ({ col, row }: Position): Terrain => {
  if (col < LEGACY_COLS && row < LEGACY_ROWS) return LEGACY_TERRAIN[row * LEGACY_COLS + col];
  if (row === V3_ROWS - 1 && col > 9 && col % 3 === 0) return "water";
  return EXPANSION_PATTERN[(col * 5 + row * 7) % EXPANSION_PATTERN.length];
};
const terrainAt = ({ col, row }: Position): Terrain => {
  if (idFor({ col, row }) === idFor(CITY_POS) || RIVALS.some((rival) => rival.capital.col === col && rival.capital.row === row)) return "grass";
  if (col === BRAZIL_SCOUT_START.col && row === BRAZIL_SCOUT_START.row) return "forest";
  const resource = RESOURCE_TILES[idFor({ col, row })];
  if (resource === "iron") return "hills";
  if (resource === "coffee") return "forest";
  if (resource === "wheat" || resource === "horses") return "grass";
  if (col < V3_COLS && row < V3_ROWS) return v3TerrainAt({ col, row });
  if (row === ROWS - 1 && col > 5 && col % 4 === 0) return "water";
  if (col > 17 && row > 5 && (col + row) % 7 === 0) return "water";
  const terrainSeed = Math.abs(((col + 11) * 73856093) ^ ((row + 17) * 19349663) ^ ((col * row + 7) * 83492791));
  return EXPANSION_PATTERN[terrainSeed % EXPANSION_PATTERN.length];
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

function territoryFromDeveloped(developedTileIds: Iterable<string>) {
  const territory = new Set<string>();
  for (const tileId of developedTileIds) {
    const pos = posForId(tileId);
    if (!inBounds(pos)) continue;
    territory.add(tileId);
    neighbors(pos).forEach((neighbor) => territory.add(idFor(neighbor)));
  }
  return MAP_TILES.map((tile) => idFor(tile)).filter((tileId) => territory.has(tileId));
}

function cityDevelopedTileIds(city: PlayerCity) {
  const buildingTiles = Object.values(city.buildingPlacements).filter((tileId): tileId is string => Boolean(tileId));
  return Array.from(new Set([idFor(city.pos), ...city.ruralTiles, ...buildingTiles]));
}

function playerDevelopedTileIds(state: Pick<GameState, "cities">) {
  return Array.from(new Set(state.cities.flatMap(cityDevelopedTileIds)));
}

function playerOwnedTilesForCities(cities: PlayerCity[]) {
  return territoryFromDeveloped(cities.flatMap(cityDevelopedTileIds));
}

function capitalCity(state: Pick<GameState, "cities">) {
  return state.cities.find((city) => city.isCapital) ?? state.cities[0];
}

function playerCityAt(state: Pick<GameState, "cities">, pos: Position) {
  return state.cities.find((city) => idFor(city.pos) === idFor(pos)) ?? null;
}

function cityById(state: Pick<GameState, "cities">, cityId: CityId) {
  return state.cities.find((city) => city.id === cityId) ?? null;
}

function allRuralTiles(state: Pick<GameState, "cities">) {
  return state.cities.flatMap((city) => city.ruralTiles);
}

function totalPopulation(state: Pick<GameState, "cities">) {
  return state.cities.reduce((sum, city) => sum + city.population, 0);
}

function allCompletedBuildings(state: Pick<GameState, "cities">) {
  return state.cities.flatMap((city) => city.completedBuildings);
}

function isArgentineTerritory(state: Pick<GameState, "ownedTiles">, pos: Position) {
  return state.ownedTiles.includes(idFor(pos));
}

function rivalTileDevelopmentScore(rival: RivalDefinition, pos: Position) {
  const terrain = terrainAt(pos);
  const base = TERRAIN_INFO[terrain];
  const resource = RESOURCE_TILES[idFor(pos)];
  let score = base.food * 1.2 + base.production + base.science * .9 + base.culture * .9 + base.gold * .5 + (resource ? 3 : 0);
  if (rival.id === "inca" && (terrain === "hills" || terrain === "mountain")) score += 3;
  if (rival.id === "maya" && (terrain === "grass" || terrain === "forest")) score += 1.5;
  if (rival.id === "egypt" && (terrain === "desert" || terrain === "water")) score += 2;
  if (rival.id === "han" && terrain === "grass") score += 2;
  if (rival.id === "brazil" && terrain === "forest") score += 2;
  return score;
}

function initialRivalOwnedTilesFor(rival: RivalDefinition) {
  return territoryFromDeveloped([idFor(rival.capital)]);
}

function rivalPopulationFor(turn: number, rival: RivalDefinition) {
  const foodCycle = Math.max(4, Math.ceil(30 / rival.baseYields.food));
  return 1 + Math.floor(Math.max(0, turn - 1) / foodCycle);
}

function rivalDevelopmentFor(turn: number, rival: RivalDefinition) {
  const productionCycle = Math.max(4, Math.ceil(28 / rival.baseYields.production));
  return Math.floor(Math.max(0, turn - 1) / productionCycle);
}

function deriveRivalEmpires(state: Pick<GameState, "turn" | "ownedTiles">): Record<RivalId, RivalEmpireSnapshot> {
  type RivalModel = { developedTiles: string[]; ownedTiles: string[] };
  const models = Object.fromEntries(RIVALS.map((rival) => [rival.id, {
    developedTiles: [],
    ownedTiles: initialRivalOwnedTilesFor(rival),
  }])) as unknown as Record<RivalId, RivalModel>;
  const globallyClaimed = new Set(state.ownedTiles);
  RIVALS.forEach((rival) => models[rival.id].ownedTiles.forEach((tileId) => globallyClaimed.add(tileId)));

  // Replay the computer turns in civilization order. AI develops at most one connected
  // core tile per turn; its political border is always that core plus one surrounding ring.
  const replayThrough = Math.min(state.turn, 256);
  for (let simulatedTurn = 2; simulatedTurn <= replayThrough; simulatedTurn += 1) {
    for (const rival of RIVALS) {
      const model = models[rival.id];
      const capitalId = idFor(rival.capital);
      const coreIds = [capitalId, ...model.developedTiles];
      const coreSet = new Set(coreIds);
      const ownedSet = new Set(model.ownedTiles);
      const desiredDeveloped = Math.max(rivalPopulationFor(simulatedTurn, rival) - 1, rivalDevelopmentFor(simulatedTurn, rival));
      if (model.developedTiles.length >= desiredDeveloped) continue;

      const candidates = model.ownedTiles
        .filter((tileId) => !coreSet.has(tileId))
        .filter((tileId) => hexDistance(posForId(tileId), rival.capital) <= 3)
        .filter((tileId) => {
          const terrain = terrainAt(posForId(tileId));
          return terrain !== "water" && terrain !== "mountain" && Boolean(automaticImprovementFor(posForId(tileId)));
        })
        .filter((tileId) => {
          const proposed = territoryFromDeveloped([...coreIds, tileId]);
          return proposed.every((claimedTile) => ownedSet.has(claimedTile) || !globallyClaimed.has(claimedTile));
        })
        .sort((a, b) => {
          const aPos = posForId(a);
          const bPos = posForId(b);
          const aCompactness = neighbors(aPos).filter((neighbor) => coreSet.has(idFor(neighbor))).length;
          const bCompactness = neighbors(bPos).filter((neighbor) => coreSet.has(idFor(neighbor))).length;
          const aScore = rivalTileDevelopmentScore(rival, aPos) + (RESOURCE_TILES[a] ? 5 : 0) + aCompactness * 2 - hexDistance(aPos, rival.capital) * .8;
          const bScore = rivalTileDevelopmentScore(rival, bPos) + (RESOURCE_TILES[b] ? 5 : 0) + bCompactness * 2 - hexDistance(bPos, rival.capital) * .8;
          return bScore - aScore || a.localeCompare(b);
        });
      const nextDeveloped = candidates[0];
      if (!nextDeveloped) continue;
      model.developedTiles.push(nextDeveloped);
      model.ownedTiles = territoryFromDeveloped([capitalId, ...model.developedTiles]);
      model.ownedTiles.forEach((tileId) => globallyClaimed.add(tileId));
    }
  }

  return Object.fromEntries(RIVALS.map((rival) => {
    const model = models[rival.id];
    return [rival.id, {
      population: rivalPopulationFor(state.turn, rival),
      development: model.developedTiles.length,
      ownedTiles: model.ownedTiles,
      developedTiles: model.developedTiles,
    }];
  })) as Record<RivalId, RivalEmpireSnapshot>;
}

function rivalTurnPlansFor(state: Pick<GameState, "turn" | "ownedTiles">): RivalTurnPlan[] {
  const current = deriveRivalEmpires(state);
  const next = deriveRivalEmpires({ turn: state.turn + 1, ownedTiles: state.ownedTiles });
  return RIVALS.map((rival) => {
    const before = current[rival.id];
    const after = next[rival.id];
    const expanded = after.ownedTiles.filter((tileId) => !before.ownedTiles.includes(tileId));
    const developed = after.developedTiles.filter((tileId) => !before.developedTiles.includes(tileId));
    const grew = after.population > before.population;
    let action = "积累粮食与生产，巡逻队重新部署";
    if (developed.length) action = `开发 1 格${grew ? `，人口增长至 ${after.population}` : ""}${expanded.length ? `，边界外推 ${expanded.length} 格` : ""}`;
    else if (grew) action = `人口增长至 ${after.population}，积累下一次开发`;
    else if (expanded.length) action = `发展成果转化为 ${expanded.length} 格新领土`;
    return { rivalId: rival.id, action, expandedTile: expanded[0] ?? null, developedTile: developed[0] ?? null, grew };
  });
}

function isBrazilianTerritory(pos: Position) {
  return hexDistance(pos, BRAZIL_CITY_POS) <= 2;
}

function rivalTerritoryAt(state: Pick<GameState, "turn" | "ownedTiles">, pos: Position) {
  const tileId = idFor(pos);
  const empires = deriveRivalEmpires(state);
  return RIVALS.find((rival) => empires[rival.id].ownedTiles.includes(tileId)) ?? null;
}

function initialRivalTerritoryAt(pos: Position) {
  const tileId = idFor(pos);
  return RIVALS.find((rival) => initialRivalOwnedTilesFor(rival).includes(tileId)) ?? null;
}

function rivalCapitalAt(pos: Position) {
  return RIVALS.find((rival) => idFor(rival.capital) === idFor(pos)) ?? null;
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
  set = reveal(set, { col: 6, row: 5 }, 1);
  RIVALS.forEach((rival) => set.add(idFor(rival.capital)));
  set.add(idFor(BRAZIL_SCOUT_START));
  return set;
}

const INITIAL_RURAL_TILES: string[] = [];
const INITIAL_OWNED_TILES = territoryFromDeveloped([idFor(CITY_POS)]);

function improvementTypeAt(state: GameState, tileId: string) {
  const initialImprovement = tileId === idFor(capitalCity(state).pos) ? "palace" : null;
  return state.builtImprovements[tileId] ?? initialImprovement ?? null;
}

function improvementAt(state: GameState, tileId: string) {
  const type = improvementTypeAt(state, tileId);
  return type ? { type, ...IMPROVEMENT_INFO[type] } : null;
}

function improvementAllowedAt(pos: Position, type: BuildableImprovementType) {
  const tileId = idFor(pos);
  const resource = RESOURCE_TILES[tileId];
  if (resource) return RESOURCE_INFO[resource].improvement === type;
  const terrain = terrainAt(pos);
  return (terrain === "grass" && type === "farm")
    || (terrain === "forest" && type === "lumbermill")
    || (terrain === "hills" && type === "mine");
}

function automaticImprovementFor(pos: Position): BuildableImprovementType | null {
  const tileId = idFor(pos);
  const resource = RESOURCE_TILES[tileId];
  if (resource) return RESOURCE_INFO[resource].improvement;
  const terrain = terrainAt(pos);
  if (terrain === "grass") return "farm";
  if (terrain === "forest") return "lumbermill";
  if (terrain === "hills") return "mine";
  return null;
}

function growthTileError(state: GameState, cityId: CityId, pos: Position, knownForeignTerritory?: RivalDefinition | null) {
  const city = cityById(state, cityId);
  if (!city) return "城市不存在";
  const tileId = idFor(pos);
  const owned = isArgentineTerritory(state, pos);
  if (!state.discovered.has(tileId)) return "尚未探索这块地";
  if (state.cities.some((candidate) => tileId === idFor(candidate.pos))) return "城市中心不需要开发";
  if (hexDistance(pos, city.pos) > 3) return `超出${city.name}三格发展范围`;
  const foreignTerritory = knownForeignTerritory === undefined ? rivalTerritoryAt(state, pos) : knownForeignTerritory;
  if (foreignTerritory) return `${foreignTerritory.name}领土不能纳入城市边界`;
  if (allRuralTiles(state).includes(tileId)) return "这块地已经开发";
  if (placedProductionAt(state, tileId)) return "城市建筑已占用这块地";
  if (!automaticImprovementFor(pos)) return `${TERRAIN_INFO[terrainAt(pos)].label}暂时无法形成农村改良`;
  if (!owned) return "只能开发当前城市边界内的地块";
  const developed = new Set(cityDevelopedTileIds(city));
  if (!neighbors(pos).some((neighbor) => developed.has(idFor(neighbor)))) return "只能开发紧邻现有开发区的地块";
  return null;
}

function placedBuildingAt(state: GameState, tileId: string) {
  for (const city of state.cities) {
    const entry = Object.entries(city.buildingPlacements).find(([, placedTile]) => placedTile === tileId);
    if (entry) return { cityId: city.id, buildingId: entry[0] as BuildingId, completed: city.completedBuildings.includes(entry[0] as BuildingId) };
  }
  return null;
}

function placedProductionAt(state: GameState, tileId: string) {
  return placedBuildingAt(state, tileId)?.buildingId ?? null;
}

function placementAdjacencyFor(state: GameState, productionId: BuildingId, pos: Position) {
  const adjacent = neighbors(pos);
  const count = adjacent.filter((neighbor) => {
    const terrain = terrainAt(neighbor);
    if (productionId === "monument") return state.cities.some((city) => idFor(neighbor) === idFor(city.pos)) || terrain === "grass";
    if (productionId === "granary") return terrain === "grass" || improvementTypeAt(state, idFor(neighbor)) === "farm";
    if (productionId === "academy") return terrain === "mountain" || terrain === "hills";
    return terrain === "hills" || terrain === "forest";
  }).length;
  return Math.min(3, count);
}

function productionPlacementError(state: GameState, cityId: CityId, productionId: BuildingId, pos: Position, rivalPatrolTileIds?: ReadonlySet<string>) {
  const city = cityById(state, cityId);
  if (!city) return "城市不存在";
  const tileId = idFor(pos);
  const production = PRODUCTIONS.find((item): item is BuildingProject => item.id === productionId && item.kind === "building")!;
  const terrain = terrainAt(pos);
  if (!state.discovered.has(tileId)) return "尚未探索这块地";
  if (!isArgentineTerritory(state, pos)) return `不在${city.name}可用领土内`;
  if (hexDistance(pos, city.pos) > 3) return `超出${city.name}三格建设范围`;
  if (state.cities.some((candidate) => tileId === idFor(candidate.pos))) return "城市中心已占用这块地";
  if (terrain === "water" || terrain === "mountain") return `${TERRAIN_INFO[terrain].label}不能建设`;
  const improvement = improvementAt(state, tileId);
  if (improvement) return `${improvement.name}已占用这块地`;
  if (placedProductionAt(state, tileId)) return "已有城市建筑占用这块地";
  const rivalPatrolOccupied = rivalPatrolTileIds ? rivalPatrolTileIds.has(tileId) : rivalPatrolsFor(state).some((patrol) => tileId === idFor(patrol.pos));
  if (state.units.some((unit) => tileId === idFor(unit.pos)) || rivalPatrolOccupied || Boolean(rivalCapitalAt(pos))) return "单位或外国首都正在占用这块地";
  if (!production.allowedTerrains.includes(terrain)) return production.placementRule;
  return null;
}

function bestAvailableAdjacency(state: GameState, cityId: CityId, productionId: BuildingId) {
  return MAP_TILES.reduce((best, tile) => {
    const pos = { col: tile.col, row: tile.row };
    return productionPlacementError(state, cityId, productionId, pos) ? best : Math.max(best, placementAdjacencyFor(state, productionId, pos));
  }, 0);
}

const EMPTY_YIELDS: TileYields = { food: 0, production: 0, science: 0, culture: 0, gold: 0 };

function addYields(total: TileYields, value: Partial<TileYields>) {
  total.food += value.food ?? 0;
  total.production += value.production ?? 0;
  total.science += value.science ?? 0;
  total.culture += value.culture ?? 0;
  total.gold += value.gold ?? 0;
  return total;
}

function tileYieldsForState(state: GameState, pos: Position): TileYields {
  const tileId = idFor(pos);
  const terrain = terrainAt(pos);
  const base = TERRAIN_INFO[terrain];
  const placedBuilding = placedBuildingAt(state, tileId);
  if (placedBuilding) {
    if (!placedBuilding.completed) return { ...EMPTY_YIELDS };
    const project = PRODUCTIONS.find((item): item is BuildingProject => item.kind === "building" && item.id === placedBuilding.buildingId)!;
    const value = 2 + placementAdjacencyFor(state, project.id, pos);
    return { ...EMPTY_YIELDS, [project.yield]: value };
  }

  const total: TileYields = { food: base.food, production: base.production, science: base.science, culture: base.culture, gold: base.gold };
  const improvement = improvementAt(state, tileId);
  if (improvement) addYields(total, improvement.bonus);
  const resource = RESOURCE_TILES[tileId];
  if (resource) addYields(total, RESOURCE_INFO[resource].yield);
  const owned = isArgentineTerritory(state, pos);
  if (owned && terrain === "grass") total.culture += 1;
  if (owned && terrain === "grass" && state.completedTechs.includes("husbandry")) total.food += 1;
  if (owned && state.footballTurns > 0) {
    total.food += 1;
    total.science += 1;
  }
  return total;
}

function cityYieldTotalsFor(state: GameState, cityId: CityId): TileYields {
  const city = cityById(state, cityId);
  const total = { ...EMPTY_YIELDS };
  if (!city) return total;
  const developed = new Set([idFor(city.pos), ...city.ruralTiles]);
  developed.forEach((tileId) => addYields(total, tileYieldsForState(state, posForId(tileId))));
  city.completedBuildings.forEach((buildingId) => {
    const tileId = city.buildingPlacements[buildingId];
    if (tileId && !developed.has(tileId)) addYields(total, tileYieldsForState(state, posForId(tileId)));
  });
  if (city.isCapital && state.activePolicy === "urbanPlanning") total.production += 1;
  if (city.isCapital && state.activePolicy === "publicWorks") total.food += 2;
  if (city.isCapital && state.activePolicy === "caravansaries" && state.tradeRouteTurns > 0) total.gold += 2;
  if (city.isCapital && state.completedTechs.includes("federalism")) total.science += 2;
  if (city.isCapital && state.messiRecruited) total.culture += 2;
  if (city.isCapital && state.tradePartner && state.tradeRouteTurns > 0) addYields(total, RESOURCE_INFO[RIVAL_BY_ID[state.tradePartner].resource].yield);
  if (city.isCapital && state.celebration && state.celebrationTurns > 0) total[CELEBRATIONS[state.celebration].yield] += 3;
  if (state.happiness <= 10) {
    total.food = Math.max(1, Math.floor(total.food * .8));
    total.production = Math.max(1, Math.floor(total.production * .8));
    total.science = Math.max(1, Math.floor(total.science * .8));
    total.culture = Math.max(1, Math.floor(total.culture * .8));
    total.gold = Math.max(0, Math.floor(total.gold * .8));
  }
  return total;
}

function cityYieldTotals(state: GameState): TileYields {
  return state.cities.reduce((total, city) => addYields(total, cityYieldTotalsFor(state, city.id)), { ...EMPTY_YIELDS });
}

function rivalYieldsFor(state: Pick<GameState, "turn" | "ownedTiles" | "rivalInfluence">, rivalId: RivalId, empire = deriveRivalEmpires(state)[rivalId]) {
  const rival = RIVAL_BY_ID[rivalId];
  const influence = state.rivalInfluence[rivalId];
  const populationBonus = Math.max(0, empire.population - 1);
  const developmentBonus = Math.max(0, empire.development);
  return {
    food: rival.baseYields.food + populationBonus * 2 + Math.floor(developmentBonus / 2),
    production: rival.baseYields.production + developmentBonus + Math.floor(populationBonus / 2),
    science: rival.baseYields.science + Math.floor(developmentBonus / 2) + Math.floor(populationBonus / 2),
    culture: rival.baseYields.culture + Math.floor(developmentBonus / 2) + Math.floor(Math.max(0, influence - DEFAULT_RIVAL_INFLUENCE[rivalId]) / 22),
  };
}

function relationshipLabelFor(value: number) {
  return value >= 75 ? "互助" : value >= 60 ? "友好" : value >= 40 ? "中立" : value >= 20 ? "警惕" : "敌对";
}

function agendaRelationDelta(state: GameState, rivalId: RivalId) {
  if (rivalId === "brazil") return state.culture >= state.science ? 1 : 0;
  if (rivalId === "inca") return allRuralTiles(state).filter((tileId) => terrainAt(posForId(tileId)) === "hills").length >= 2 ? 1 : 0;
  if (rivalId === "maya") return state.completedTechs.length >= 2 ? 1 : 0;
  if (rivalId === "egypt") return state.tradePartner === "egypt" && state.tradeRouteTurns > 0 ? 1 : 0;
  return state.completedCivics.length >= 2 || state.happiness >= 40 ? 1 : 0;
}

type LegacyMilestone = { id: string; category: LegacyCategory; name: string; progress: number; target: number; reward: string; icon: string };

function legacyMilestonesFor(state: GameState): LegacyMilestone[] {
  const developedResources = new Set(allRuralTiles(state).map((tileId) => RESOURCE_TILES[tileId]).filter(Boolean)).size;
  return [
    { id: "science-1", category: "science", name: "知识萌芽", progress: state.completedTechs.length, target: 1, reward: "+10 科技", icon: "◆" },
    { id: "science-2", category: "science", name: "理性时代", progress: state.completedTechs.length, target: 3, reward: "+1 遗产点", icon: "◆" },
    { id: "culture-1", category: "culture", name: "共同记忆", progress: state.completedCivics.length, target: 1, reward: "+10 文化", icon: "✦" },
    { id: "culture-2", category: "culture", name: "民族偶像", progress: state.messiRecruited ? 1 : 0, target: 1, reward: "+12 伟人点", icon: "★" },
    { id: "economy-1", category: "economy", name: "资源网络", progress: developedResources, target: 2, reward: "+20 金币", icon: "●" },
    { id: "economy-2", category: "economy", name: "跨洲商路", progress: state.tradePartner ? 1 : 0, target: 1, reward: "+15 影响力", icon: "⇄" },
    { id: "exploration-1", category: "exploration", name: "越过地平线", progress: state.discovered.size, target: 110, reward: "+15 金币", icon: "⌖" },
    { id: "exploration-2", category: "exploration", name: "绘制世界", progress: state.discovered.size, target: 220, reward: "+15 科技", icon: "◎" },
  ];
}

function hasWonDawn(state: Pick<GameState, "cities" | "messiRecruited" | "legacyPoints">) {
  return totalPopulation(state) >= 6
    && state.messiRecruited
    && (Object.keys(DEFAULT_LEGACY_POINTS) as LegacyCategory[]).every((category) => state.legacyPoints[category] >= 2);
}

const NARRATIVE_EVENTS: Record<NarrativeEventId, { kicker: string; title: string; text: string; trigger: (state: GameState) => boolean; choices: Array<{ id: string; label: string; detail: string; reward: string }> }> = {
  worldCouncil: { kicker: "世界初见", title: "远方使节抵达潘帕斯", text: "五个文明的旗帜第一次同时出现在布宜诺斯艾利斯。年轻的共和国要以什么姿态进入这个更大的世界？", trigger: (state) => state.turn >= 2, choices: [
    { id: "embassy", label: "互派使节", detail: "用礼节建立第一印象。", reward: "影响力 +18；各国关系 +3" },
    { id: "markets", label: "开放市场", detail: "让港口先于政客说话。", reward: "金币 +30" },
    { id: "scholars", label: "召开学会", detail: "以知识作为共同语言。", reward: "科技 +15；文化 +8" },
  ] },
  pampasVoices: { kicker: "城市成长", title: "新城区需要一种性格", text: "人口增长带来了新的街区。市民要求政府明确：这片土地首先应该养活人、制造工具，还是讲述共同的故事？", trigger: (state) => totalPopulation(state) >= 4, choices: [
    { id: "fields", label: "优先粮食", detail: "扶持近郊农庄。", reward: "粮食 +12；幸福度 +5" },
    { id: "shops", label: "优先工坊", detail: "奖励城市手工业。", reward: "当前生产 +10" },
    { id: "squares", label: "优先广场", detail: "为公共生活留出空间。", reward: "文化 +12；伟人点 +5" },
  ] },
  distantHorizon: { kicker: "探索发现", title: "地图边缘不再是空白", text: "侦察队带回了山脉、海岸与陌生都城的完整路线。地理学会请求决定下一阶段的探索方向。", trigger: (state) => state.discovered.size >= 55, choices: [
    { id: "survey", label: "系统测绘", detail: "整理地形与资源情报。", reward: "科技 +12" },
    { id: "stories", label: "记录见闻", detail: "把远行故事带回广场。", reward: "文化 +12" },
    { id: "outposts", label: "设立补给站", detail: "为后续远征准备资金。", reward: "金币 +24" },
  ] },
  coffeeExchange: { kicker: "资源故事", title: "咖啡走进世界市场", text: "新开发的咖啡园吸引了商人与学者。出口可以迅速获利，本地消费则可能孕育一种新的城市文化。", trigger: (state) => allRuralTiles(state).some((tileId) => RESOURCE_TILES[tileId] === "coffee"), choices: [
    { id: "export", label: "扩大出口", detail: "优先签订海外订单。", reward: "金币 +28；影响力 +6" },
    { id: "cafes", label: "扶持咖啡馆", detail: "让讨论与艺术在城市生根。", reward: "文化 +16；伟人点 +4" },
  ] },
  footballNation: { kicker: "伟人时刻", title: "梅西属于每一条街道", text: "梅西的名字已经传遍世界。学校、工人和外交官都希望把这股热情转化成国家的长期力量。", trigger: (state) => state.messiRecruited, choices: [
    { id: "academies", label: "全民青训", detail: "把足球写进教育体系。", reward: "科技 +10；幸福度 +8" },
    { id: "tour", label: "世界巡回", detail: "以比赛连接各国人民。", reward: "影响力 +18；各国关系 +4" },
    { id: "festival", label: "街头庆典", detail: "让胜利成为共同记忆。", reward: "文化 +18；金币 +12" },
  ] },
};

function happinessGainFor(state: GameState, population = totalPopulation(state), completedBuildingCount = allCompletedBuildings(state).length, relationship = Math.max(...Object.values(state.rivalRelationships))) {
  return Math.max(0, 3 + completedBuildingCount + (state.tradeRouteTurns > 0 ? 2 : 0) + (relationship >= 65 ? 1 : 0) - Math.max(0, population - 4));
}

function influenceGainFor(state: GameState) {
  return 3 + (state.activePolicy === "charismaticLeader" ? 1 : 0);
}

function maxMovesForUnit(type: UnitType, completedTechs: readonly TechId[], footballTurns: number) {
  return UNIT_INFO[type].baseMoves + (type === "gaucho" && completedTechs.includes("riding") ? 1 : 0) + (footballTurns > 0 ? 1 : 0);
}

function findUnitDeployment(state: GameState, cityPos: Position) {
  const candidates = [cityPos, ...neighbors(cityPos)];
  const occupied = new Set([...state.units, ...state.rivalUnits].map((unit) => idFor(unit.pos)));
  return candidates.find((pos, index) => {
    const terrain = terrainAt(pos);
    return candidates.findIndex((candidate) => idFor(candidate) === idFor(pos)) === index
      && isArgentineTerritory(state, pos)
      && terrain !== "water"
      && terrain !== "mountain"
      && !occupied.has(idFor(pos))
      && !state.cities.some((city) => idFor(city.pos) === idFor(pos));
  }) ?? null;
}

function initialRivalUnits(): RivalUnit[] {
  return RIVALS.map((rival, index) => {
    const pos = neighbors(rival.capital).find((candidate) => {
      const terrain = terrainAt(candidate);
      return terrain !== "water" && terrain !== "mountain" && !RIVALS.some((other) => idFor(other.capital) === idFor(candidate));
    }) ?? rival.capital;
    return { id: `rival-warrior-${index + 1}`, rivalId: rival.id, type: "warrior", pos, moves: 2, hp: UNIT_MAX_HP };
  });
}

function settlementError(state: GameState, pos: Position, settlerId?: string) {
  const tileId = idFor(pos);
  const terrain = terrainAt(pos);
  if (!state.discovered.has(tileId)) return "尚未探索这块地";
  if (terrain === "water" || terrain === "mountain") return `${TERRAIN_INFO[terrain].label}不能建立城市`;
  if (state.cities.some((city) => hexDistance(city.pos, pos) < 4)) return "距离现有城市至少需要 4 格";
  if (RIVALS.some((rival) => !state.defeatedRivals.includes(rival.id) && hexDistance(rival.capital, pos) < 4)) return "距离其他文明城市至少需要 4 格";
  if (state.units.some((unit) => unit.id !== settlerId && idFor(unit.pos) === tileId) || state.rivalUnits.some((unit) => idFor(unit.pos) === tileId)) return "已有单位占据这块地";
  const newTerritory = territoryFromDeveloped([tileId]);
  const foreignTerritory = deriveRivalEmpires(state);
  const overlappingRival = RIVALS.find((rival) => !state.defeatedRivals.includes(rival.id) && newTerritory.some((claimed) => foreignTerritory[rival.id].ownedTiles.includes(claimed)));
  if (overlappingRival) return `新城边界会与${overlappingRival.name}重叠`;
  return null;
}

function foundCity(state: GameState, settlerId: string): GameState {
  const settler = state.units.find((unit) => unit.id === settlerId && unit.type === "settler");
  if (!settler) return { ...state, message: "需要选中开拓者才能建立城市。" };
  const error = settlementError(state, settler.pos, settlerId);
  if (error) return { ...state, message: `无法建城：${error}。` };
  const cityId = `city-${state.nextCitySerial}`;
  const cityName = CITY_NAME_POOL[state.nextCitySerial - 2] ?? `阿根廷城 ${state.nextCitySerial}`;
  const city = createPlayerCity(cityId, cityName, settler.pos);
  const cities = [...state.cities, city];
  const message = `${cityName}建立！开拓者已转化为城市，新的生产与成长循环已经开始。`;
  return {
    ...state,
    cities,
    nextCitySerial: state.nextCitySerial + 1,
    ownedTiles: playerOwnedTilesForCities(cities),
    units: state.units.filter((unit) => unit.id !== settlerId),
    selectedUnitId: null,
    selectedTile: idFor(city.pos),
    discovered: reveal(state.discovered, city.pos, 2),
    message,
    log: addLog(state.log, message),
  };
}

function combatDamage(attackerStrength: number, defenderStrength: number) {
  return Math.max(10, Math.min(45, 24 + attackerStrength - defenderStrength));
}

function declareWar(state: GameState, rivalId: RivalId): GameState {
  if (state.defeatedRivals.includes(rivalId) || state.wars[rivalId] === "war") return state;
  const rival = RIVAL_BY_ID[rivalId];
  const message = `阿根廷已向${rival.name}宣战。双方战斗单位现在可以交战，${rival.name}军队会在电脑回合主动进攻。`;
  return {
    ...state,
    wars: { ...state.wars, [rivalId]: "war" },
    rivalRelationships: { ...state.rivalRelationships, [rivalId]: Math.min(15, state.rivalRelationships[rivalId]) },
    tradePartner: state.tradePartner === rivalId ? null : state.tradePartner,
    tradeRouteTurns: state.tradePartner === rivalId ? 0 : state.tradeRouteTurns,
    researchPartner: state.researchPartner === rivalId ? null : state.researchPartner,
    researchCollaborationTurns: state.researchPartner === rivalId ? 0 : state.researchCollaborationTurns,
    message,
    log: addLog(state.log, message),
  };
}

function resolvePlayerAttack(state: GameState, attackerId: string, target: Position): GameState {
  const attacker = state.units.find((unit) => unit.id === attackerId);
  if (!attacker || attacker.moves <= 0 || UNIT_INFO[attacker.type].role !== "combat" || hexDistance(attacker.pos, target) !== 1) return state;
  const targetId = idFor(target);
  const enemy = state.rivalUnits.find((unit) => idFor(unit.pos) === targetId);
  const capital = RIVALS.find((rival) => !state.defeatedRivals.includes(rival.id) && idFor(rival.capital) === targetId);
  const rivalId = enemy?.rivalId ?? capital?.id;
  if (!rivalId) return state;
  if (state.wars[rivalId] !== "war") {
    const message = `与${RIVAL_BY_ID[rivalId].name}仍处于和平状态，请先在外交窗口宣战。`;
    return { ...state, message, log: addLog(state.log, message) };
  }
  const attackStrength = UNIT_INFO[attacker.type].strength;
  if (enemy) {
    const dealt = combatDamage(attackStrength, 24);
    const returned = combatDamage(24, attackStrength);
    const enemyHp = enemy.hp - dealt;
    const attackerHp = attacker.hp - (enemyHp > 0 ? returned : Math.floor(returned / 2));
    let rivalUnits = state.rivalUnits.filter((unit) => unit.id !== enemy.id);
    if (enemyHp > 0) rivalUnits = [...rivalUnits, { ...enemy, hp: enemyHp, moves: 0 }];
    let units = state.units.filter((unit) => unit.id !== attacker.id);
    if (attackerHp > 0) units = [...units, { ...attacker, hp: attackerHp, moves: 0, pos: enemyHp <= 0 ? target : attacker.pos }];
    const message = enemyHp <= 0
      ? `${UNIT_INFO[attacker.type].name}击溃${RIVAL_BY_ID[rivalId].name}战士并推进到目标格。`
      : `${UNIT_INFO[attacker.type].name}发起攻击：敌军 -${dealt} HP，我军 -${returned} HP。`;
    return { ...state, units, rivalUnits, selectedUnitId: attackerHp > 0 ? attacker.id : null, selectedTile: attackerHp > 0 ? idFor(enemyHp <= 0 ? target : attacker.pos) : targetId, message, log: addLog(state.log, message) };
  }

  const cityHp = Math.max(0, state.rivalCityHp[rivalId] - combatDamage(attackStrength, 28));
  const returned = combatDamage(28, attackStrength);
  const attackerHp = attacker.hp - (cityHp > 0 ? returned : Math.floor(returned / 2));
  let units = state.units.filter((unit) => unit.id !== attacker.id);
  if (attackerHp > 0) units = [...units, { ...attacker, hp: attackerHp, moves: 0, pos: cityHp <= 0 ? target : attacker.pos }];
  const defeatedRivals = cityHp <= 0 ? [...state.defeatedRivals, rivalId] : state.defeatedRivals;
  const rivalUnits = cityHp <= 0 ? state.rivalUnits.filter((unit) => unit.rivalId !== rivalId) : state.rivalUnits;
  const conquestWin = defeatedRivals.length === RIVALS.length;
  const message = cityHp <= 0
    ? `${RIVAL_BY_ID[rivalId].capitalName}陷落，${RIVAL_BY_ID[rivalId].name}退出曙光时代。${conquestWin ? "阿根廷取得征服胜利！" : ""}`
    : `我军攻打${RIVAL_BY_ID[rivalId].capitalName}，城防剩余 ${cityHp}/${CITY_MAX_HP}。`;
  return {
    ...state,
    units,
    rivalUnits,
    rivalCityHp: { ...state.rivalCityHp, [rivalId]: cityHp },
    defeatedRivals,
    selectedUnitId: attackerHp > 0 ? attacker.id : null,
    selectedTile: targetId,
    result: conquestWin ? "win" : state.result,
    resultReason: conquestWin ? "conquest" : state.resultReason,
    message,
    log: addLog(state.log, message),
  };
}

function nextStepToward(start: Position, targets: Position[], blocked: ReadonlySet<string>) {
  const targetIds = new Set(targets.map(idFor));
  const queue: Position[] = [start];
  const previous = new Map<string, string | null>([[idFor(start), null]]);
  let reached: string | null = null;
  for (let head = 0; head < queue.length && head < COLS * ROWS; head += 1) {
    const current = queue[head];
    const currentId = idFor(current);
    if (currentId !== idFor(start) && targetIds.has(currentId)) { reached = currentId; break; }
    for (const next of neighbors(current)) {
      const nextId = idFor(next);
      const terrain = terrainAt(next);
      if (previous.has(nextId) || blocked.has(nextId) || terrain === "water" || terrain === "mountain") continue;
      previous.set(nextId, currentId);
      queue.push(next);
    }
  }
  if (!reached) return null;
  let step = reached;
  while (previous.get(step) && previous.get(step) !== idFor(start)) step = previous.get(step)!;
  return posForId(step);
}

function advanceRivalMilitaryPhase(state: GameState, rivalId: RivalId): GameState {
  if (state.defeatedRivals.includes(rivalId)) return state;
  const rival = RIVAL_BY_ID[rivalId];
  const atWar = state.wars[rivalId] === "war";
  let units = [...state.units];
  let cities = state.cities.map((city) => ({ ...city }));
  const builtImprovements = { ...state.builtImprovements };
  const rivalUnits = state.rivalUnits.map((unit) => ({ ...unit, moves: unit.rivalId === rivalId ? 2 : unit.moves }));
  const actions: string[] = [];

  for (const original of rivalUnits.filter((unit) => unit.rivalId === rivalId)) {
    const index = rivalUnits.findIndex((unit) => unit.id === original.id);
    if (index < 0) continue;
    const unit = rivalUnits[index];
    if (!atWar) {
      const empire = deriveRivalEmpires(state)[rivalId];
      const patrol = neighbors(unit.pos).find((pos) => empire.ownedTiles.includes(idFor(pos)) && terrainAt(pos) !== "water" && terrainAt(pos) !== "mountain" && !rivalUnits.some((other) => other.id !== unit.id && idFor(other.pos) === idFor(pos)));
      if (patrol) rivalUnits[index] = { ...unit, pos: patrol, moves: 0 };
      continue;
    }

    const adjacentPlayer = units.find((target) => hexDistance(unit.pos, target.pos) === 1);
    if (adjacentPlayer) {
      const dealt = combatDamage(24, UNIT_INFO[adjacentPlayer.type].strength);
      const returned = UNIT_INFO[adjacentPlayer.type].role === "combat" ? combatDamage(UNIT_INFO[adjacentPlayer.type].strength, 24) : 0;
      const playerHp = adjacentPlayer.hp - dealt;
      const enemyHp = unit.hp - (playerHp > 0 ? returned : Math.floor(returned / 2));
      units = units.filter((target) => target.id !== adjacentPlayer.id);
      if (playerHp > 0) units.push({ ...adjacentPlayer, hp: playerHp });
      if (enemyHp <= 0) rivalUnits.splice(index, 1);
      else rivalUnits[index] = { ...unit, hp: enemyHp, moves: 0, pos: playerHp <= 0 ? adjacentPlayer.pos : unit.pos };
      actions.push(playerHp <= 0 ? `击败我方${UNIT_INFO[adjacentPlayer.type].name}` : `攻击我方${UNIT_INFO[adjacentPlayer.type].name}`);
      continue;
    }

    const adjacentCity = cities.find((city) => hexDistance(unit.pos, city.pos) === 1);
    if (adjacentCity) {
      const dealt = combatDamage(24, 28);
      const returned = combatDamage(28, 24);
      const cityHp = adjacentCity.hp - dealt;
      const enemyHp = unit.hp - (cityHp > 0 ? returned : Math.floor(returned / 2));
      if (cityHp <= 0) {
        adjacentCity.ruralTiles.forEach((tileId) => { delete builtImprovements[tileId]; });
        cities = cities.filter((city) => city.id !== adjacentCity.id);
        if (cities.length > 0 && !cities.some((city) => city.isCapital)) cities = cities.map((city, cityIndex) => cityIndex === 0 ? { ...city, isCapital: true } : city);
      }
      else cities = cities.map((city) => city.id === adjacentCity.id ? { ...city, hp: cityHp } : city);
      if (enemyHp <= 0) rivalUnits.splice(index, 1);
      else rivalUnits[index] = { ...unit, hp: enemyHp, moves: 0, pos: cityHp <= 0 ? adjacentCity.pos : unit.pos };
      actions.push(cityHp <= 0 ? `攻陷${adjacentCity.name}` : `围攻${adjacentCity.name}（城防 ${Math.max(0, cityHp)}）`);
      continue;
    }

    const targets = [...units.map((target) => target.pos), ...cities.map((city) => city.pos)];
    const blocked = new Set(rivalUnits.filter((other) => other.id !== unit.id).map((other) => idFor(other.pos)));
    const step = nextStepToward(unit.pos, targets, blocked);
    if (step && !units.some((target) => idFor(target.pos) === idFor(step)) && !cities.some((city) => idFor(city.pos) === idFor(step))) {
      rivalUnits[index] = { ...unit, pos: step, moves: 0 };
      actions.push("向阿根廷目标推进");
    }
  }

  const defeated = cities.length === 0;
  const message = actions.length ? `${rival.name}军队：${actions.join("、")}。` : `${rival.name}完成本回合部署。`;
  return {
    ...state,
    units,
    cities,
    ownedTiles: playerOwnedTilesForCities(cities),
    builtImprovements,
    rivalUnits,
    selectedUnitId: units.some((unit) => unit.id === state.selectedUnitId) ? state.selectedUnitId : null,
    result: defeated ? "lose" : state.result,
    resultReason: defeated ? "conquest" : state.resultReason,
    message,
    log: addLog(state.log, message),
  };
}

function advanceRivalProduction(state: GameState, rivalId: RivalId): GameState {
  if (state.defeatedRivals.includes(rivalId)) return state;
  const gain = rivalYieldsFor(state, rivalId).production;
  let progress = state.rivalMilitaryProgress[rivalId] + gain;
  const rivalUnits = [...state.rivalUnits];
  let nextSerial = state.nextRivalUnitSerial;
  if (progress >= RIVAL_UNIT_COST) {
    const rival = RIVAL_BY_ID[rivalId];
    const occupied = new Set([...state.units, ...rivalUnits].map((unit) => idFor(unit.pos)));
    const deployment = [rival.capital, ...neighbors(rival.capital)].find((pos) => terrainAt(pos) !== "water" && terrainAt(pos) !== "mountain" && !occupied.has(idFor(pos)));
    if (deployment) {
      rivalUnits.push({ id: `rival-warrior-${nextSerial}`, rivalId, type: "warrior", pos: deployment, moves: 0, hp: UNIT_MAX_HP });
      nextSerial += 1;
      progress -= RIVAL_UNIT_COST;
    }
  }
  return { ...state, rivalUnits, nextRivalUnitSerial: nextSerial, rivalMilitaryProgress: { ...state.rivalMilitaryProgress, [rivalId]: progress } };
}

function resolvePlayerEconomyRound(state: GameState): GameState {
  const turnYields = cityYieldTotals(state);
  const scienceGain = turnYields.science + (state.tradeRouteTurns > 0 ? 1 : 0) + (state.researchCollaborationTurns > 0 ? 2 : 0);
  const cultureGain = turnYields.culture;
  const goldGain = turnYields.gold + (state.tradeRouteTurns > 0 ? 4 : 0);
  const events: string[] = [];
  const cities = state.cities.map((city) => ({ ...city, productionProgress: { ...city.productionProgress }, completedBuildings: [...city.completedBuildings], buildingPlacements: { ...city.buildingPlacements } }));
  let units = [...state.units];
  let nextUnitSerial = state.nextUnitSerial;
  let selectedUnitId = state.selectedUnitId;
  let selectedTile = state.selectedTile;

  for (let index = 0; index < cities.length; index += 1) {
    let city = cities[index];
    const yields = cityYieldTotalsFor({ ...state, cities }, city.id);
    let food = city.food + yields.food;
    let growthPending = city.growthPending;
    const growthTarget = 10 + city.population * 4;
    if (food >= growthTarget) {
      food -= growthTarget;
      growthPending += 1;
      events.push(`${city.name}可以增长人口，请选择新的开发地块。`);
    }
    city = { ...city, food, growthPending, hp: Math.min(CITY_MAX_HP, city.hp + 8) };

    if (city.activeProduction) {
      const production = PRODUCTIONS.find((project) => project.id === city.activeProduction)!;
      const progress = Math.min(production.cost, city.productionProgress[production.id] + Math.max(1, yields.production));
      city.productionProgress[production.id] = progress;
      if (progress >= production.cost) {
        if (production.kind === "building") {
          if (!city.completedBuildings.includes(production.id)) city.completedBuildings.push(production.id);
          city.activeProduction = null;
          events.push(`${city.name}完成${production.name}。`);
        } else {
          const deploymentState: GameState = { ...state, cities, units, rivalUnits: state.rivalUnits };
          const deployment = findUnitDeployment(deploymentState, city.pos);
          if (deployment) {
            const unitId = `${production.unitType}-${nextUnitSerial}`;
            units.push({ id: unitId, type: production.unitType, pos: deployment, moves: 0, hp: UNIT_MAX_HP });
            nextUnitSerial += 1;
            selectedUnitId = unitId;
            selectedTile = idFor(deployment);
            city.productionProgress[production.id] = 0;
            city.activeProduction = null;
            events.push(`${city.name}完成${production.name}，单位已在城市旁部署。`);
          } else {
            city.productionProgress[production.id] = production.cost - 1;
            events.push(`${city.name}周边没有部署空格，${production.name}等待出城。`);
          }
        }
      }
    }
    cities[index] = city;
  }

  let techProgress = state.techProgress + scienceGain;
  let activeTech = state.activeTech;
  const completedTechs = [...state.completedTechs];
  if (activeTech) {
    const tech = TECHS.find((item) => item.id === activeTech)!;
    if (techProgress >= tech.cost) {
      techProgress -= tech.cost;
      if (!completedTechs.includes(activeTech)) completedTechs.push(activeTech);
      events.push(`完成科技：${tech.name}。`);
      activeTech = null;
    }
  }
  let civicProgress = state.civicProgress + cultureGain;
  let activeCivic = state.activeCivic;
  const completedCivics = [...state.completedCivics];
  if (activeCivic) {
    const civic = CIVICS.find((item) => item.id === activeCivic)!;
    if (civicProgress >= civic.cost) {
      civicProgress -= civic.cost;
      if (!completedCivics.includes(activeCivic)) completedCivics.push(activeCivic);
      events.push(`完成市政：${civic.name}。`);
      activeCivic = null;
    }
  }

  const footballTurns = Math.max(0, state.footballTurns - 1);
  const tradeRouteTurns = Math.max(0, state.tradeRouteTurns - 1);
  const researchCollaborationTurns = Math.max(0, state.researchCollaborationTurns - 1);
  const sanctionTurns = Math.max(0, state.sanctionTurns - 1);
  const celebrationTurns = Math.max(0, state.celebrationTurns - 1);
  const rivalRelationships = Object.fromEntries(RIVALS.map((rival) => {
    if (state.wars[rival.id] === "war") return [rival.id, Math.min(15, state.rivalRelationships[rival.id])];
    const diplomacyDelta = (state.tradePartner === rival.id && state.tradeRouteTurns > 0 ? 1 : 0)
      + (state.researchPartner === rival.id && state.researchCollaborationTurns > 0 ? 1 : 0)
      - (state.sanctionedRival === rival.id && state.sanctionTurns > 0 ? 1 : 0);
    return [rival.id, Math.max(0, Math.min(100, state.rivalRelationships[rival.id] + diplomacyDelta + agendaRelationDelta(state, rival.id)))];
  })) as Record<RivalId, number>;
  const nextRivalEmpires = deriveRivalEmpires({ turn: state.turn + 1, ownedTiles: state.ownedTiles });
  const rivalInfluence = Object.fromEntries(RIVALS.map((rival) => {
    if (state.defeatedRivals.includes(rival.id)) return [rival.id, state.rivalInfluence[rival.id]];
    const outputs = rivalYieldsFor(state, rival.id, nextRivalEmpires[rival.id]);
    const sanctioned = state.sanctionedRival === rival.id && state.sanctionTurns > 0;
    const gain = Math.max(1, Math.min(4, 1 + Math.floor((outputs.food + outputs.production + outputs.science + outputs.culture) / 6)) - (sanctioned ? 2 : 0));
    return [rival.id, state.rivalInfluence[rival.id] + gain];
  })) as Record<RivalId, number>;
  const happiness = Math.min(HAPPINESS_TARGET, state.happiness + happinessGainFor({ ...state, cities }, totalPopulation({ cities }), allCompletedBuildings({ cities }).length, Math.max(...Object.values(rivalRelationships))));
  const celebrationPending = state.celebrationPending || (happiness >= HAPPINESS_TARGET && celebrationTurns === 0);
  units = units.map((unit) => ({ ...unit, hp: Math.min(UNIT_MAX_HP, unit.hp + 10), moves: maxMovesForUnit(unit.type, completedTechs, footballTurns) }));
  const nextTurn = state.turn + 1;
  const legacyWin = hasWonDawn({ cities, messiRecruited: state.messiRecruited, legacyPoints: state.legacyPoints });
  const influenceLoss = Math.max(...Object.values(rivalInfluence)) >= 100;
  events.push(`第 ${nextTurn} 回合开始；${cities.length} 座城市与所有单位已完成结算。`);
  const message = events.join(" ");
  return {
    ...state,
    turn: nextTurn,
    cities,
    ownedTiles: playerOwnedTilesForCities(cities),
    units,
    selectedUnitId,
    selectedTile,
    nextUnitSerial,
    gold: state.gold + goldGain,
    science: state.science + scienceGain,
    culture: state.culture + cultureGain,
    greatPoints: state.greatPoints + 3 + Math.floor(totalPopulation({ cities }) / 2) + (completedTechs.includes("broadcast") ? 2 : 0),
    activeTech,
    techProgress,
    completedTechs,
    activeCivic,
    civicProgress,
    completedCivics,
    brazilInfluence: rivalInfluence.brazil,
    influence: state.influence + influenceGainFor(state),
    brazilRelationship: rivalRelationships.brazil,
    rivalRelationships,
    rivalInfluence,
    tradePartner: tradeRouteTurns > 0 ? state.tradePartner : null,
    researchPartner: researchCollaborationTurns > 0 ? state.researchPartner : null,
    sanctionedRival: sanctionTurns > 0 ? state.sanctionedRival : null,
    tradeRouteTurns,
    researchCollaborationTurns,
    sanctionTurns,
    happiness,
    celebration: celebrationTurns > 0 ? state.celebration : null,
    celebrationTurns,
    celebrationPending,
    footballTurns,
    message,
    log: addLog(state.log, message),
    result: legacyWin ? "win" : influenceLoss ? "lose" : state.result,
    resultReason: legacyWin ? "legacy" : influenceLoss ? "influence" : state.resultReason,
  };
}

function createInitialState(): GameState {
  const capital = createPlayerCity("city-1", "布宜诺斯艾利斯", CITY_POS, true);
  return {
    turn: 1,
    gold: 80,
    science: 0,
    culture: 8,
    greatPoints: 18,
    cities: [capital],
    nextCitySerial: 2,
    ownedTiles: playerOwnedTilesForCities([capital]),
    builtImprovements: {},
    activeTech: "husbandry",
    techProgress: 0,
    completedTechs: [],
    activeCivic: "craftsmanship",
    civicProgress: 0,
    completedCivics: [],
    activePolicy: null,
    units: [{ id: "gaucho-1", type: "gaucho", pos: { col: 6, row: 5 }, moves: 3, hp: UNIT_MAX_HP }],
    selectedUnitId: "gaucho-1",
    nextUnitSerial: 2,
    brazilPos: BRAZIL_SCOUT_START,
    brazilInfluence: 18,
    influence: 30,
    brazilRelationship: 50,
    rivalRelationships: { ...DEFAULT_RIVAL_RELATIONSHIPS },
    rivalInfluence: { ...DEFAULT_RIVAL_INFLUENCE },
    tradePartner: null,
    researchPartner: null,
    sanctionedRival: null,
    tradeRouteTurns: 0,
    researchCollaborationTurns: 0,
    sanctionTurns: 0,
    wars: { ...DEFAULT_WARS },
    rivalUnits: initialRivalUnits(),
    rivalMilitaryProgress: { ...DEFAULT_RIVAL_MILITARY_PROGRESS },
    rivalCityHp: { ...DEFAULT_RIVAL_CITY_HP },
    defeatedRivals: [],
    nextRivalUnitSerial: RIVALS.length + 1,
    happiness: 28,
    celebration: null,
    celebrationTurns: 0,
    celebrationPending: false,
    discovered: initialDiscovered(),
    selectedTile: idFor({ col: 6, row: 5 }),
    messiRecruited: false,
    messiAbilityUsed: false,
    footballTurns: 0,
    triggeredEvents: [],
    pendingEvent: null,
    nextEventTurn: 2,
    claimedLegacyMilestones: [],
    legacyPoints: { ...DEFAULT_LEGACY_POINTS },
    message: "从右侧为首都安排生产：训练开拓者可建立分城；在外交窗口宣战后，战斗单位可进攻敌军与首都。",
    log: ["曙光循环开始：城市生产、开拓建城、外交宣战、单位作战与电脑回合已经连通。"],
    result: null,
    resultReason: null,
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
const isCivicId = (value: unknown): value is CivicId => typeof value === "string" && CIVICS.some((civic) => civic.id === value);
const isPolicyId = (value: unknown): value is PolicyId => typeof value === "string" && Object.prototype.hasOwnProperty.call(POLICIES, value);
const isCelebrationId = (value: unknown): value is CelebrationId => typeof value === "string" && Object.prototype.hasOwnProperty.call(CELEBRATIONS, value);
const isProductionId = (value: unknown): value is ProductionId => typeof value === "string" && PRODUCTIONS.some((production) => production.id === value);
const isBuildingId = (value: unknown): value is BuildingId => typeof value === "string" && PRODUCTIONS.some((production) => production.kind === "building" && production.id === value);
const isUnitType = (value: unknown): value is UnitType => value === "scout" || value === "gaucho" || value === "settler";
const isLegacyUnitType = (value: unknown) => isUnitType(value) || value === "builder";
const isBuildableImprovementType = (value: unknown): value is BuildableImprovementType => value === "farm" || value === "ranch" || value === "mine" || value === "lumbermill" || value === "plantation";
const isRivalId = (value: unknown): value is RivalId => typeof value === "string" && RIVALS.some((rival) => rival.id === value);
const isNarrativeEventId = (value: unknown): value is NarrativeEventId => typeof value === "string" && Object.prototype.hasOwnProperty.call(NARRATIVE_EVENTS, value);
const isLegacyCategory = (value: unknown): value is LegacyCategory => value === "science" || value === "culture" || value === "economy" || value === "exploration";

function makeLocalSave(game: GameState): SaveEnvelope {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    game: { ...game, discovered: Array.from(game.discovered) },
  };
}

/* The v1-v5 migration parser is intentionally retired in v6. The user explicitly
   chose a clean save break so cities and persistent armies can be validated as one model.
function readLocalSaveV5(raw: string | null): SaveReadResult {
  if (!raw) return { ok: false, reason: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!isRecord(parsed)) return { ok: false, reason: "corrupt" };
  if (parsed.version !== SAVE_VERSION) return { ok: false, reason: "version" };
  const saveVersion = Number(parsed.version);
  const legacyVersion = saveVersion === 1;
  const previousVersion = saveVersion < SAVE_VERSION;
  const preGrowthVersion = saveVersion < 3;
  if (typeof parsed.savedAt !== "string" || Number.isNaN(Date.parse(parsed.savedAt)) || !isRecord(parsed.game)) return { ok: false, reason: "corrupt" };

  const value = parsed.game;
  const integerFields = ["turn", "gold", "science", "culture", "greatPoints", "population", "food", "techProgress", "brazilInfluence", "footballTurns"] as const;
  if (integerFields.some((field) => !isNonNegativeInteger(value[field])) || Number(value.turn) < 1 || Number(value.population) < 1) return { ok: false, reason: "corrupt" };
  if (!isPosition(value.brazilPos)) return { ok: false, reason: "corrupt" };
  if (value.activeTech !== null && !isTechId(value.activeTech)) return { ok: false, reason: "corrupt" };
  const migratedBuilderProduction = preGrowthVersion && value.activeProduction === "builder";
  if (value.activeProduction !== null && !isProductionId(value.activeProduction) && !migratedBuilderProduction) return { ok: false, reason: "corrupt" };
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
  if (saveVersion < 4 && ((Number(value.brazilInfluence) >= 100 && value.result === null) || (value.result === "lose" && Number(value.brazilInfluence) < 100))) return { ok: false, reason: "corrupt" };
  const savedProductionProgress = value.productionProgress;
  const savedBuildingPlacements = value.buildingPlacements;
  if (!isRecord(savedProductionProgress) || PRODUCTIONS.some((production) => savedProductionProgress[production.id] !== undefined && !isNonNegativeInteger(savedProductionProgress[production.id]))) return { ok: false, reason: "corrupt" };
  if (!previousVersion && PRODUCTIONS.some((production) => savedProductionProgress[production.id] === undefined)) return { ok: false, reason: "corrupt" };
  if (!isRecord(savedBuildingPlacements) || Object.keys(savedBuildingPlacements).some((key) => !isBuildingId(key))) return { ok: false, reason: "corrupt" };

  const discoveredTiles = new Set(value.discovered as string[]);
  let ownedTiles: string[];
  if (Array.isArray(value.ownedTiles)) {
    if (!value.ownedTiles.every(isTileId) || new Set(value.ownedTiles).size !== value.ownedTiles.length || !value.ownedTiles.includes(idFor(CITY_POS))) return { ok: false, reason: "corrupt" };
    ownedTiles = value.ownedTiles as string[];
    if (ownedTiles.some((tileId) => !discoveredTiles.has(tileId) || hexDistance(posForId(tileId), CITY_POS) > 4 || Boolean(initialRivalTerritoryAt(posForId(tileId))))) return { ok: false, reason: "corrupt" };
  } else if (previousVersion) {
    ownedTiles = MAP_TILES.map((tile) => idFor(tile)).filter((tileId) => hexDistance(posForId(tileId), CITY_POS) <= 2);
  } else return { ok: false, reason: "corrupt" };
  if (ownedTiles.some((tileId) => !discoveredTiles.has(tileId))) return { ok: false, reason: "corrupt" };
  const ownedTileSet = new Set(ownedTiles);

  const builtImprovements: Partial<Record<string, BuildableImprovementType>> = {};
  if (value.builtImprovements !== undefined) {
    if (!isRecord(value.builtImprovements)) return { ok: false, reason: "corrupt" };
    for (const [tileId, type] of Object.entries(value.builtImprovements)) {
      const migratedType = preGrowthVersion && RESOURCE_TILES[tileId] === "coffee" && type === "lumbermill" ? "plantation" : type;
      if (previousVersion && INITIAL_IMPROVEMENTS[tileId] === migratedType) continue;
      if (!isTileId(tileId) || !isBuildableImprovementType(migratedType) || !discoveredTiles.has(tileId) || INITIAL_IMPROVEMENTS[tileId] || !ownedTileSet.has(tileId) || !improvementAllowedAt(posForId(tileId), migratedType)) return { ok: false, reason: "corrupt" };
      builtImprovements[tileId] = migratedType;
    }
  } else if (!previousVersion) return { ok: false, reason: "corrupt" };

  const buildingPlacements: Partial<Record<BuildingId, string>> = {};
  const occupiedTiles = new Set<string>();
  const buildingProjects = PRODUCTIONS.filter((production): production is BuildingProject => production.kind === "building");
  for (const production of buildingProjects) {
    const tileId = savedBuildingPlacements[production.id];
    if (tileId === undefined) continue;
    if (!isTileId(tileId) || occupiedTiles.has(tileId)) return { ok: false, reason: "corrupt" };
    const placementPos = posForId(tileId);
    // Old saves could place a city building here before this tile became the starting mine.
    // Keep accepting that placement after it has been re-saved as v4, so migration is stable.
    const migratedMineConflict = tileId === "5-2" && INITIAL_IMPROVEMENTS[tileId] === "mine";
    if (!discoveredTiles.has(tileId) || !ownedTileSet.has(tileId) || !CITY_MAX_BUILDABLE_IDS.has(tileId) || tileId === idFor(CITY_POS) || (INITIAL_IMPROVEMENTS[tileId] && !migratedMineConflict) || builtImprovements[tileId] || !production.allowedTerrains.includes(terrainAt(placementPos))) return { ok: false, reason: "corrupt" };
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
  let migratedBuilderUnits = 0;
  if (Array.isArray(value.units)) {
    units = [];
    const unitIds = new Set<string>();
    const playableUnitIds = new Set<string>();
    const unitTiles = new Set<string>();
    let maxSerial = 0;
    for (const candidate of value.units) {
      if (!isRecord(candidate) || typeof candidate.id !== "string" || !/^(scout|gaucho|builder)-\d+$/.test(candidate.id) || !isLegacyUnitType(candidate.type) || (!preGrowthVersion && !isUnitType(candidate.type)) || !isPosition(candidate.pos) || !isNonNegativeInteger(candidate.moves)) return { ok: false, reason: "corrupt" };
      if (candidate.type === "builder" && (!preGrowthVersion || !isNonNegativeInteger(candidate.charges) || Number(candidate.charges) < 1 || Number(candidate.charges) > 3)) return { ok: false, reason: "corrupt" };
      if (unitIds.has(candidate.id) || unitTiles.has(idFor(candidate.pos))) return { ok: false, reason: "corrupt" };
      unitIds.add(candidate.id);
      unitTiles.add(idFor(candidate.pos));
      maxSerial = Math.max(maxSerial, Number(candidate.id.split("-").at(-1)) || 0);
      if (candidate.type === "builder") { migratedBuilderUnits += Number(candidate.charges); continue; }
      playableUnitIds.add(candidate.id);
      units.push({ id: candidate.id, type: candidate.type, pos: candidate.pos, moves: Number(candidate.moves) });
    }
    if (value.selectedUnitId !== null && (typeof value.selectedUnitId !== "string" || !unitIds.has(value.selectedUnitId))) return { ok: false, reason: "corrupt" };
    selectedUnitId = typeof value.selectedUnitId === "string" && playableUnitIds.has(value.selectedUnitId) ? value.selectedUnitId : null;
    nextUnitSerial = isNonNegativeInteger(value.nextUnitSerial) ? Math.max(Number(value.nextUnitSerial), maxSerial + 1) : maxSerial + 1;
  } else {
    if (!isPosition(value.unitPos) || !isNonNegativeInteger(value.unitMoves) || typeof value.selectedUnit !== "boolean") return { ok: false, reason: "corrupt" };
    units = [{ id: "gaucho-1", type: "gaucho", pos: value.unitPos, moves: Number(value.unitMoves) }];
    selectedUnitId = value.selectedUnit ? "gaucho-1" : null;
    nextUnitSerial = 2;
  }

  let ruralTiles: string[];
  if (Array.isArray(value.ruralTiles)) {
    if (!value.ruralTiles.every(isTileId) || new Set(value.ruralTiles).size !== value.ruralTiles.length || value.ruralTiles.length > Number(value.population)) return { ok: false, reason: "corrupt" };
    ruralTiles = value.ruralTiles as string[];
    if (ruralTiles.some((tileId) => tileId === idFor(CITY_POS) || !discoveredTiles.has(tileId) || !ownedTileSet.has(tileId) || occupiedTiles.has(tileId) || !automaticImprovementFor(posForId(tileId)) || (!INITIAL_IMPROVEMENTS[tileId] && !builtImprovements[tileId]))) return { ok: false, reason: "corrupt" };
  } else if (previousVersion) {
    const savedWorked = Array.isArray(value.workedTiles) && value.workedTiles.every(isTileId) ? value.workedTiles as string[] : [];
    const candidates = [...savedWorked, ...INITIAL_RURAL_TILES, ...ownedTiles].filter((tileId, index, all) => all.indexOf(tileId) === index && tileId !== idFor(CITY_POS) && discoveredTiles.has(tileId) && ownedTileSet.has(tileId) && !occupiedTiles.has(tileId) && Boolean(automaticImprovementFor(posForId(tileId))));
    ruralTiles = candidates.slice(0, Number(value.population));
    ruralTiles.forEach((tileId) => { if (!INITIAL_IMPROVEMENTS[tileId] && !builtImprovements[tileId]) builtImprovements[tileId] = automaticImprovementFor(posForId(tileId))!; });
  } else return { ok: false, reason: "corrupt" };

  const expectedOwnedTiles = territoryFromDeveloped([idFor(CITY_POS), ...ruralTiles, ...Object.values(buildingPlacements).filter((tileId): tileId is string => Boolean(tileId))]);
  if (expectedOwnedTiles.length !== ownedTiles.length || expectedOwnedTiles.some((tileId) => !ownedTileSet.has(tileId))) return { ok: false, reason: "corrupt" };

  const growthPending = value.growthPending === undefined && preGrowthVersion ? migratedBuilderUnits + (migratedBuilderProduction ? 1 : 0) : value.growthPending;
  if (!isNonNegativeInteger(growthPending)) return { ok: false, reason: "corrupt" };

  const completedCivics = Array.isArray(value.completedCivics) ? value.completedCivics as CivicId[] : legacyVersion ? [] : null;
  if (!completedCivics || !completedCivics.every(isCivicId) || new Set(completedCivics).size !== completedCivics.length) return { ok: false, reason: "corrupt" };
  const activeCivic = value.activeCivic === undefined && legacyVersion ? "craftsmanship" : value.activeCivic;
  if (activeCivic !== null && !isCivicId(activeCivic)) return { ok: false, reason: "corrupt" };
  if (activeCivic !== null && completedCivics.includes(activeCivic)) return { ok: false, reason: "corrupt" };
  const civicProgress = value.civicProgress === undefined && legacyVersion ? 0 : value.civicProgress;
  if (!isNonNegativeInteger(civicProgress)) return { ok: false, reason: "corrupt" };
  const activePolicy = value.activePolicy === undefined && legacyVersion ? null : value.activePolicy;
  if (activePolicy !== null && !isPolicyId(activePolicy)) return { ok: false, reason: "corrupt" };
  if (activePolicy !== null && !completedCivics.includes(POLICIES[activePolicy].unlockedBy)) return { ok: false, reason: "corrupt" };

  const influence = value.influence === undefined && legacyVersion ? 30 : value.influence;
  const brazilRelationship = value.brazilRelationship === undefined && legacyVersion ? 50 : value.brazilRelationship;
  const tradeRouteTurns = value.tradeRouteTurns === undefined && legacyVersion ? 0 : value.tradeRouteTurns;
  const researchCollaborationTurns = value.researchCollaborationTurns === undefined && legacyVersion ? 0 : value.researchCollaborationTurns;
  const sanctionTurns = value.sanctionTurns === undefined && legacyVersion ? 0 : value.sanctionTurns;
  const happiness = value.happiness === undefined && legacyVersion ? 28 : value.happiness;
  const celebrationTurns = value.celebrationTurns === undefined && legacyVersion ? 0 : value.celebrationTurns;
  if (![influence, brazilRelationship, tradeRouteTurns, researchCollaborationTurns, sanctionTurns, happiness, celebrationTurns].every(isNonNegativeInteger) || Number(brazilRelationship) > 100) return { ok: false, reason: "corrupt" };
  const celebration = value.celebration === undefined && legacyVersion ? null : value.celebration;
  if (celebration !== null && !isCelebrationId(celebration)) return { ok: false, reason: "corrupt" };
  if ((celebration === null && Number(celebrationTurns) !== 0) || (celebration !== null && Number(celebrationTurns) === 0)) return { ok: false, reason: "corrupt" };
  const celebrationPending = value.celebrationPending === undefined && legacyVersion ? false : value.celebrationPending;
  if (typeof celebrationPending !== "boolean") return { ok: false, reason: "corrupt" };

  const readRivalNumberRecord = (candidate: unknown, fallback: Record<RivalId, number>, capped = true) => {
    if (candidate === undefined && previousVersion) return { ...fallback };
    if (!isRecord(candidate)) return null;
    const result = { ...fallback };
    for (const rival of RIVALS) {
      if (!isNonNegativeInteger(candidate[rival.id]) || (capped && Number(candidate[rival.id]) > 100)) return null;
      result[rival.id] = Number(candidate[rival.id]);
    }
    return result;
  };
  const rivalRelationships = readRivalNumberRecord(value.rivalRelationships, { ...DEFAULT_RIVAL_RELATIONSHIPS, brazil: Number(brazilRelationship) });
  const rivalInfluence = readRivalNumberRecord(value.rivalInfluence, { ...DEFAULT_RIVAL_INFLUENCE, brazil: Number(value.brazilInfluence) }, false);
  if (!rivalRelationships || !rivalInfluence) return { ok: false, reason: "corrupt" };
  const greatestRivalInfluence = Math.max(...Object.values(rivalInfluence));
  if (saveVersion >= 4 && ((greatestRivalInfluence >= 100 && value.result === null) || (value.result === "lose" && greatestRivalInfluence < 100))) return { ok: false, reason: "corrupt" };
  const tradePartner = value.tradePartner === undefined && previousVersion ? (Number(tradeRouteTurns) > 0 ? "brazil" : null) : value.tradePartner;
  const researchPartner = value.researchPartner === undefined && previousVersion ? (Number(researchCollaborationTurns) > 0 ? "brazil" : null) : value.researchPartner;
  const sanctionedRival = value.sanctionedRival === undefined && previousVersion ? (Number(sanctionTurns) > 0 ? "brazil" : null) : value.sanctionedRival;
  if (tradePartner !== null && !isRivalId(tradePartner) || researchPartner !== null && !isRivalId(researchPartner) || sanctionedRival !== null && !isRivalId(sanctionedRival)) return { ok: false, reason: "corrupt" };
  if ((tradePartner !== null) !== (Number(tradeRouteTurns) > 0) || (researchPartner !== null) !== (Number(researchCollaborationTurns) > 0) || (sanctionedRival !== null) !== (Number(sanctionTurns) > 0)) return { ok: false, reason: "corrupt" };
  const triggeredEvents = value.triggeredEvents === undefined && previousVersion ? [] : value.triggeredEvents;
  if (!Array.isArray(triggeredEvents) || !triggeredEvents.every(isNarrativeEventId) || new Set(triggeredEvents).size !== triggeredEvents.length) return { ok: false, reason: "corrupt" };
  const pendingEvent = value.pendingEvent === undefined && previousVersion ? null : value.pendingEvent;
  if (pendingEvent !== null && !isNarrativeEventId(pendingEvent)) return { ok: false, reason: "corrupt" };
  const nextEventTurn = value.nextEventTurn === undefined && previousVersion ? Math.max(2, Number(value.turn) + 1) : value.nextEventTurn;
  if (!isNonNegativeInteger(nextEventTurn)) return { ok: false, reason: "corrupt" };
  const migratedLegacyWin = previousVersion && value.result === "win";
  const claimedLegacyMilestones = value.claimedLegacyMilestones === undefined && previousVersion ? (migratedLegacyWin ? LEGACY_MILESTONE_META.map((milestone) => milestone.id) : []) : value.claimedLegacyMilestones;
  const knownLegacyMilestoneIds = new Set(LEGACY_MILESTONE_META.map((milestone) => milestone.id));
  if (!Array.isArray(claimedLegacyMilestones) || !claimedLegacyMilestones.every((entry) => typeof entry === "string" && knownLegacyMilestoneIds.has(entry)) || new Set(claimedLegacyMilestones).size !== claimedLegacyMilestones.length) return { ok: false, reason: "corrupt" };
  const legacyPointsCandidate = value.legacyPoints === undefined && previousVersion ? (migratedLegacyWin ? { science: 2, culture: 2, economy: 2, exploration: 2 } : DEFAULT_LEGACY_POINTS) : value.legacyPoints;
  if (!isRecord(legacyPointsCandidate) || Object.entries(legacyPointsCandidate).some(([key, points]) => !isLegacyCategory(key) || !isNonNegativeInteger(points))) return { ok: false, reason: "corrupt" };
  if (!previousVersion && (Object.keys(DEFAULT_LEGACY_POINTS) as LegacyCategory[]).some((category) => legacyPointsCandidate[category] === undefined)) return { ok: false, reason: "corrupt" };
  const legacyPoints = Object.fromEntries((Object.keys(DEFAULT_LEGACY_POINTS) as LegacyCategory[]).map((category) => [category, Number(legacyPointsCandidate[category] ?? 0)])) as Record<LegacyCategory, number>;
  if (!previousVersion && (Object.keys(DEFAULT_LEGACY_POINTS) as LegacyCategory[]).some((category) => legacyPoints[category] !== claimedLegacyMilestones.filter((id) => LEGACY_MILESTONE_META.find((milestone) => milestone.id === id)?.category === category).length)) return { ok: false, reason: "corrupt" };

  const legacySave = !Array.isArray(value.units);
  const migratedBrazilPos = !previousVersion || isBrazilianTerritory(value.brazilPos) ? value.brazilPos : BRAZIL_SCOUT_START;
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
    ownedTiles,
    ruralTiles,
    builtImprovements,
    growthPending: Number(growthPending),
    activeTech: value.activeTech as TechId | null,
    techProgress: Number(value.techProgress),
    completedTechs,
    activeCivic: activeCivic as CivicId | null,
    civicProgress: Number(civicProgress),
    completedCivics,
    activePolicy: activePolicy as PolicyId | null,
    activeProduction: migratedBuilderProduction ? null : value.activeProduction as ProductionId | null,
    productionProgress,
    completedBuildings,
    buildingPlacements,
    units,
    selectedUnitId,
    nextUnitSerial,
    brazilPos: migratedBrazilPos,
    brazilInfluence: Number(value.brazilInfluence),
    influence: Number(influence),
    brazilRelationship: Number(brazilRelationship),
    rivalRelationships,
    rivalInfluence,
    tradePartner: tradePartner as RivalId | null,
    researchPartner: researchPartner as RivalId | null,
    sanctionedRival: sanctionedRival as RivalId | null,
    tradeRouteTurns: Number(tradeRouteTurns),
    researchCollaborationTurns: Number(researchCollaborationTurns),
    sanctionTurns: Number(sanctionTurns),
    happiness: Number(happiness),
    celebration: celebration as CelebrationId | null,
    celebrationTurns: Number(celebrationTurns),
    celebrationPending,
    discovered: new Set([...(value.discovered as string[]), ...RIVALS.map((rival) => idFor(rival.capital))]),
    selectedTile: migratedSelectedTile,
    messiRecruited: value.messiRecruited,
    messiAbilityUsed: value.messiAbilityUsed,
    footballTurns: Number(value.footballTurns),
    triggeredEvents: triggeredEvents as NarrativeEventId[],
    pendingEvent: pendingEvent as NarrativeEventId | null,
    nextEventTurn: Number(nextEventTurn),
    claimedLegacyMilestones: claimedLegacyMilestones as string[],
    legacyPoints,
    message: Number(growthPending) > 0 && preGrowthVersion ? `旧存档已升级：建造者已转为 ${Number(growthPending)} 次城市成长选择。` : value.message,
    log: Number(growthPending) > 0 && preGrowthVersion ? ["旧存档中的建造者已并入城市成长系统。", ...(value.log as string[])].slice(0, 4) : (value.log as string[]).slice(0, 4),
    result: value.result as "win" | "lose" | null,
  };
  return { ok: true, savedAt: parsed.savedAt, game };
}
*/

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

  if (!Array.isArray(value.cities) || value.cities.length < 1 || !Array.isArray(value.units) || !Array.isArray(value.rivalUnits)) return { ok: false, reason: "corrupt" };
  const cityIds = new Set<string>();
  const cityCenters = new Set<string>();
  const developedTiles = new Set<string>();
  const cities: PlayerCity[] = [];
  for (const candidate of value.cities) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.isCapital !== "boolean" || !isPosition(candidate.pos)) return { ok: false, reason: "corrupt" };
    if (!isNonNegativeInteger(candidate.population) || Number(candidate.population) < 1 || !isNonNegativeInteger(candidate.food) || !isNonNegativeInteger(candidate.growthPending) || !isNonNegativeInteger(candidate.hp) || Number(candidate.hp) > CITY_MAX_HP) return { ok: false, reason: "corrupt" };
    if (cityIds.has(candidate.id) || cityCenters.has(idFor(candidate.pos))) return { ok: false, reason: "corrupt" };
    if (!Array.isArray(candidate.ruralTiles) || !candidate.ruralTiles.every(isTileId) || new Set(candidate.ruralTiles).size !== candidate.ruralTiles.length) return { ok: false, reason: "corrupt" };
    if (candidate.activeProduction !== null && !isProductionId(candidate.activeProduction)) return { ok: false, reason: "corrupt" };
    if (!isRecord(candidate.productionProgress)) return { ok: false, reason: "corrupt" };
    const progressRecord = candidate.productionProgress;
    if (PRODUCTIONS.some((project) => !isNonNegativeInteger(progressRecord[project.id]) || Number(progressRecord[project.id]) > project.cost)) return { ok: false, reason: "corrupt" };
    if (!Array.isArray(candidate.completedBuildings) || !candidate.completedBuildings.every(isBuildingId) || new Set(candidate.completedBuildings).size !== candidate.completedBuildings.length || !isRecord(candidate.buildingPlacements)) return { ok: false, reason: "corrupt" };
    const buildingPlacements: Partial<Record<BuildingId, string>> = {};
    for (const building of PRODUCTIONS.filter((project): project is BuildingProject => project.kind === "building")) {
      const tileId = candidate.buildingPlacements[building.id];
      if (tileId === undefined) continue;
      if (!isTileId(tileId) || terrainAt(posForId(tileId)) === "water" || terrainAt(posForId(tileId)) === "mountain" || hexDistance(candidate.pos, posForId(tileId)) > 3) return { ok: false, reason: "corrupt" };
      buildingPlacements[building.id] = tileId;
    }
    const city: PlayerCity = {
      id: candidate.id,
      name: candidate.name,
      pos: candidate.pos,
      isCapital: candidate.isCapital,
      population: Number(candidate.population),
      food: Number(candidate.food),
      growthPending: Number(candidate.growthPending),
      ruralTiles: candidate.ruralTiles as string[],
      activeProduction: candidate.activeProduction as ProductionId | null,
      productionProgress: Object.fromEntries(PRODUCTIONS.map((project) => [project.id, Number(progressRecord[project.id])])) as Record<ProductionId, number>,
      completedBuildings: candidate.completedBuildings as BuildingId[],
      buildingPlacements,
      hp: Number(candidate.hp),
    };
    for (const tileId of cityDevelopedTileIds(city)) {
      if (developedTiles.has(tileId)) return { ok: false, reason: "corrupt" };
      developedTiles.add(tileId);
    }
    cityIds.add(city.id);
    cityCenters.add(idFor(city.pos));
    cities.push(city);
  }
  if (cities.filter((city) => city.isCapital).length !== 1 || cities.some((city, index) => cities.slice(index + 1).some((other) => hexDistance(city.pos, other.pos) < 4))) return { ok: false, reason: "corrupt" };

  const readPlayerUnits: PlayerUnit[] = [];
  const unitIds = new Set<string>();
  const unitTiles = new Set<string>();
  for (const candidate of value.units) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !isUnitType(candidate.type) || !isPosition(candidate.pos) || !isNonNegativeInteger(candidate.moves) || !isNonNegativeInteger(candidate.hp) || Number(candidate.hp) < 1 || Number(candidate.hp) > UNIT_MAX_HP) return { ok: false, reason: "corrupt" };
    if (unitIds.has(candidate.id) || unitTiles.has(idFor(candidate.pos))) return { ok: false, reason: "corrupt" };
    unitIds.add(candidate.id);
    unitTiles.add(idFor(candidate.pos));
    readPlayerUnits.push({ id: candidate.id, type: candidate.type, pos: candidate.pos, moves: Number(candidate.moves), hp: Number(candidate.hp) });
  }
  const readRivalUnits: RivalUnit[] = [];
  for (const candidate of value.rivalUnits) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !isRivalId(candidate.rivalId) || candidate.type !== "warrior" || !isPosition(candidate.pos) || !isNonNegativeInteger(candidate.moves) || !isNonNegativeInteger(candidate.hp) || Number(candidate.hp) < 1 || Number(candidate.hp) > UNIT_MAX_HP) return { ok: false, reason: "corrupt" };
    if (unitIds.has(candidate.id) || unitTiles.has(idFor(candidate.pos))) return { ok: false, reason: "corrupt" };
    unitIds.add(candidate.id);
    unitTiles.add(idFor(candidate.pos));
    readRivalUnits.push({ id: candidate.id, rivalId: candidate.rivalId, type: "warrior", pos: candidate.pos, moves: Number(candidate.moves), hp: Number(candidate.hp) });
  }

  if (!Array.isArray(value.ownedTiles) || !value.ownedTiles.every(isTileId) || !Array.isArray(value.discovered) || !value.discovered.every(isTileId)) return { ok: false, reason: "corrupt" };
  const expectedOwned = playerOwnedTilesForCities(cities);
  const savedOwned = new Set(value.ownedTiles as string[]);
  if (savedOwned.size !== expectedOwned.length || expectedOwned.some((tileId) => !savedOwned.has(tileId))) return { ok: false, reason: "corrupt" };
  if (!isRecord(value.wars) || !isRecord(value.rivalMilitaryProgress) || !isRecord(value.rivalCityHp) || !Array.isArray(value.defeatedRivals) || !value.defeatedRivals.every(isRivalId)) return { ok: false, reason: "corrupt" };
  if (RIVALS.some((rival) => (value.wars as Record<string, unknown>)[rival.id] !== "peace" && (value.wars as Record<string, unknown>)[rival.id] !== "war")) return { ok: false, reason: "corrupt" };
  if (RIVALS.some((rival) => !isNonNegativeInteger((value.rivalMilitaryProgress as Record<string, unknown>)[rival.id]) || !isNonNegativeInteger((value.rivalCityHp as Record<string, unknown>)[rival.id]) || Number((value.rivalCityHp as Record<string, unknown>)[rival.id]) > CITY_MAX_HP)) return { ok: false, reason: "corrupt" };
  const requiredIntegers = ["turn", "gold", "science", "culture", "greatPoints", "techProgress", "civicProgress", "nextUnitSerial", "nextCitySerial", "nextRivalUnitSerial", "influence", "brazilInfluence", "tradeRouteTurns", "researchCollaborationTurns", "sanctionTurns", "happiness", "celebrationTurns", "footballTurns", "nextEventTurn"];
  if (requiredIntegers.some((field) => !isNonNegativeInteger(value[field])) || Number(value.turn) < 1 || !isPosition(value.brazilPos) || typeof value.message !== "string" || !Array.isArray(value.log)) return { ok: false, reason: "corrupt" };

  const game = {
    ...(value as unknown as SavedGameState),
    cities,
    units: readPlayerUnits,
    rivalUnits: readRivalUnits,
    ownedTiles: expectedOwned,
    discovered: new Set(value.discovered as string[]),
  } as GameState;
  if (game.selectedUnitId !== null && !readPlayerUnits.some((unit) => unit.id === game.selectedUnitId)) game.selectedUnitId = null;
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

function rivalPatrolsFor(state: Pick<GameState, "rivalUnits">) {
  return state.rivalUnits.map((unit) => ({ ...unit, rival: RIVAL_BY_ID[unit.rivalId] }));
}

export default function Home() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [managingCityId, setManagingCityId] = useState<CityId>("city-1");
  const [selectedRivalId, setSelectedRivalId] = useState<RivalId>("brazil");
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [productionDrawerOpen, setProductionDrawerOpen] = useState(false);
  const [strategyDrawerOpen, setStrategyDrawerOpen] = useState(false);
  const [strategyTab, setStrategyTab] = useState<"civics" | "diplomacy" | "happiness">("civics");
  const [growthDrawerOpen, setGrowthDrawerOpen] = useState(false);
  const [growthCandidate, setGrowthCandidate] = useState<string | null>(null);
  const [hoveredGrowthTile, setHoveredGrowthTile] = useState<string | null>(null);
  const [newlyClaimedTile, setNewlyClaimedTile] = useState<string | null>(null);
  const [placingProduction, setPlacingProduction] = useState<BuildingId | null>(null);
  const [placementCandidate, setPlacementCandidate] = useState<string | null>(null);
  const [hoveredPlacementTile, setHoveredPlacementTile] = useState<string | null>(null);
  const [placementDetailed, setPlacementDetailed] = useState(false);
  const [productionCategory, setProductionCategory] = useState<"buildings" | "units">("buildings");
  const [productionReminderBypassed, setProductionReminderBypassed] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiPhaseIndex, setAiPhaseIndex] = useState<number | null>(null);
  const [aiTurnPlan, setAiTurnPlan] = useState<RivalTurnPlan[]>([]);
  const [showYields, setShowYields] = useState(true);
  const [saveMeta, setSaveMeta] = useState<SaveMeta | null>(null);
  const [saveNotice, setSaveNotice] = useState("仅保存在当前设备的浏览器中");
  const [pendingSystemAction, setPendingSystemAction] = useState<"load" | "restart" | null>(null);
  const [mapDragging, setMapDragging] = useState(false);
  const aiLockRef = useRef(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiRunIdRef = useRef(0);
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
  const activeCivic = CIVICS.find((civic) => civic.id === game.activeCivic) ?? null;
  const managingCity = cityById(game, managingCityId) ?? capitalCity(game) ?? game.cities[0];
  const pendingGrowthCity = game.cities.find((city) => city.growthPending > 0) ?? null;
  const totalGrowthPending = game.cities.reduce((sum, city) => sum + city.growthPending, 0);
  const activeProduction = PRODUCTIONS.find((item) => item.id === managingCity.activeProduction) ?? null;
  const cityYields = cityYieldTotals(game);
  const managingCityYields = cityYieldTotalsFor(game, managingCity.id);
  const productionPerTurn = Math.max(1, managingCityYields.production);
  const activeProductionProgress = activeProduction ? managingCity.productionProgress[activeProduction.id] : 0;
  const productionTurnsRemaining = activeProduction
    ? Math.max(1, Math.ceil((activeProduction.cost - activeProductionProgress) / productionPerTurn))
    : null;
  const hasAvailableProduction = true;
  const selectedUnit = game.units.find((unit) => unit.id === game.selectedUnitId) ?? null;
  const selectedUnitInfo = selectedUnit ? UNIT_INFO[selectedUnit.type] : null;
  const selectedPlayerCity = !selectedUnit && game.selectedTile ? playerCityAt(game, posForId(game.selectedTile)) : null;
  const citySelected = Boolean(selectedPlayerCity);
  const selectedForeignCivCandidate = !selectedUnit && game.selectedTile ? rivalCapitalAt(posForId(game.selectedTile)) : null;
  const selectedForeignCiv = selectedForeignCivCandidate && !game.defeatedRivals.includes(selectedForeignCivCandidate.id) ? selectedForeignCivCandidate : null;
  const foreignCitySelected = Boolean(selectedForeignCiv);
  const selectedRival = RIVAL_BY_ID[selectedRivalId];
  const rivalEmpires = useMemo(() => deriveRivalEmpires({ turn: game.turn, ownedTiles: game.ownedTiles }), [game.turn, game.ownedTiles]);
  const rivalTerritoryOwnerByTile = useMemo(() => {
    const map = new Map<string, RivalDefinition>();
    RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).forEach((rival) => rivalEmpires[rival.id].ownedTiles.forEach((tileId) => map.set(tileId, rival)));
    return map;
  }, [game.defeatedRivals, rivalEmpires]);
  const rivalEdgePaths = useMemo(() => Object.fromEntries(RIVALS.map((rival) => {
    const territory = new Set(game.defeatedRivals.includes(rival.id) ? [] : rivalEmpires[rival.id].ownedTiles);
    return [rival.id, territoryEdgePath((pos) => territory.has(idFor(pos)))];
  })) as Record<RivalId, string>, [game.defeatedRivals, rivalEmpires]);
  const activeAiPlan = aiPhaseIndex === null ? null : aiTurnPlan[aiPhaseIndex] ?? null;
  const activeAiRival = activeAiPlan ? RIVAL_BY_ID[activeAiPlan.rivalId] : null;
  const foreignPopulation = selectedForeignCiv ? rivalEmpires[selectedForeignCiv.id].population : 0;
  const growthChoosing = growthDrawerOpen && managingCity.growthPending > 0;
  const happinessPerTurn = happinessGainFor(game);
  const influencePerTurn = influenceGainFor(game);
  const selectedRelationship = game.rivalRelationships[selectedRivalId];
  const relationshipLabel = relationshipLabelFor(selectedRelationship);
  const foreignYields = selectedForeignCiv ? rivalYieldsFor(game, selectedForeignCiv.id, rivalEmpires[selectedForeignCiv.id]) : null;
  const worldLeader = RIVALS.reduce((leader, rival) => game.rivalInfluence[rival.id] > game.rivalInfluence[leader.id] ? rival : leader, RIVALS[0]);
  const visibleTiles = useMemo(() => {
    let visible = new Set<string>();
    game.cities.forEach((city) => { visible = reveal(visible, city.pos, 2); });
    game.ownedTiles.forEach((tileId) => { visible = reveal(visible, posForId(tileId), 1); });
    game.units.forEach((unit) => { visible = reveal(visible, unit.pos, unit.type === "scout" ? 2 : 1); });
    return visible;
  }, [game.cities, game.ownedTiles, game.units]);
  const argentinaEdgePath = useMemo(() => territoryEdgePath((pos) => isArgentineTerritory(game, pos)), [game]);
  const rivalPatrols = rivalPatrolsFor(game);
  const rivalPatrolTileIds = useMemo(() => new Set(rivalPatrols.map((patrol) => idFor(patrol.pos))), [rivalPatrols]);
  const visibleRivalPatrols = rivalPatrols.filter((patrol) => visibleTiles.has(idFor(patrol.pos)));
  const placingItem = PRODUCTIONS.find((item): item is BuildingProject => item.id === placingProduction && item.kind === "building") ?? null;
  const placedProductionByTile = useMemo(() => {
    const map = new Map<string, { cityId: CityId; buildingId: BuildingId }>();
    game.cities.forEach((city) => Object.entries(city.buildingPlacements).forEach(([productionId, tileId]) => {
      if (tileId) map.set(tileId, { cityId: city.id, buildingId: productionId as BuildingId });
    }));
    return map;
  }, [game.cities]);
  const playerDevelopedTiles = useMemo(() => new Set(playerDevelopedTileIds(game)), [game]);
  const placementOptions = useMemo(() => {
    const map = new Map<string, { error: string | null; adjacency: number }>();
    if (!placingProduction) return map;
    MAP_TILES.forEach((tile) => {
      const pos = { col: tile.col, row: tile.row };
      const tileId = idFor(pos);
      map.set(tileId, {
        error: productionPlacementError(game, managingCity.id, placingProduction, pos, rivalPatrolTileIds),
        adjacency: placementAdjacencyFor(game, placingProduction, pos),
      });
    });
    return map;
  }, [game, managingCity.id, placingProduction, rivalPatrolTileIds]);
  const bestPlacementAdjacency = placingProduction
    ? Math.max(0, ...Array.from(placementOptions.values()).filter((option) => !option.error).map((option) => option.adjacency))
    : 0;
  const placementPreviewTile = placementCandidate ?? hoveredPlacementTile;
  const placementPreviewOption = placementPreviewTile ? placementOptions.get(placementPreviewTile) ?? null : null;
  const placementPreviewPos = placementPreviewTile ? posForId(placementPreviewTile) : null;
  const placementPreviewTerrain = placementPreviewPos ? TERRAIN_INFO[terrainAt(placementPreviewPos)] : null;
  const growthOptions = useMemo(() => {
    const map = new Map<string, { improvement: BuildableImprovementType; expands: boolean; borderGain: number; before: TileYields; after: TileYields; score: number }>();
    if (managingCity.growthPending <= 0) return map;
    MAP_TILES.forEach((tile) => {
      const pos = { col: tile.col, row: tile.row };
      const tileId = idFor(pos);
      if (growthTileError(game, managingCity.id, pos, rivalTerritoryOwnerByTile.get(tileId) ?? null)) return;
      const improvement = automaticImprovementFor(pos)!;
      const cities = game.cities.map((city) => city.id === managingCity.id ? { ...city, ruralTiles: [...city.ruralTiles, tileId] } : city);
      const ownedTiles = playerOwnedTilesForCities(cities);
      const borderGain = ownedTiles.filter((ownedTile) => !game.ownedTiles.includes(ownedTile)).length;
      const expands = borderGain > 0;
      const before = tileYieldsForState(game, pos);
      const previewState: GameState = { ...game, cities, ownedTiles, builtImprovements: { ...game.builtImprovements, [tileId]: improvement } };
      const after = tileYieldsForState(previewState, pos);
      const score = after.food * 1.25 + after.production * 1.2 + after.science + after.culture + after.gold * .75 + borderGain * .12;
      map.set(tileId, { improvement, expands, borderGain, before, after, score });
    });
    return map;
  }, [game, managingCity, rivalTerritoryOwnerByTile]);
  const recommendedGrowthOptions = Array.from(growthOptions.entries()).sort((a, b) => b[1].score - a[1].score).slice(0, 3);
  const growthPreviewTile = growthCandidate ?? hoveredGrowthTile;
  const growthPreviewOption = growthPreviewTile ? growthOptions.get(growthPreviewTile) ?? null : null;
  const growthPreviewPos = growthPreviewTile ? posForId(growthPreviewTile) : null;
  const growthPreviewResource = growthPreviewTile && RESOURCE_TILES[growthPreviewTile] ? RESOURCE_INFO[RESOURCE_TILES[growthPreviewTile]] : null;
  const developedResources = allRuralTiles(game).flatMap((tileId) => RESOURCE_TILES[tileId] ? [RESOURCE_INFO[RESOURCE_TILES[tileId]]] : []);
  const selectedPos = game.selectedTile
    ? posForId(game.selectedTile)
    : selectedUnit?.pos ?? CITY_POS;
  const selectedKnown = game.discovered.has(idFor(selectedPos));
  const selectedForeignCityCandidate = selectedKnown ? rivalCapitalAt(selectedPos) : null;
  const selectedForeignCity = selectedForeignCityCandidate && !game.defeatedRivals.includes(selectedForeignCityCandidate.id) ? selectedForeignCityCandidate : null;
  const selectedTerritoryRival = selectedKnown ? rivalTerritoryOwnerByTile.get(idFor(selectedPos)) ?? null : null;
  const selectedTerrain = terrainAt(selectedPos);
  const selectedImprovement = improvementAt(game, idFor(selectedPos));
  const selectedPlacedInfo = placedProductionByTile.get(idFor(selectedPos)) ?? null;
  const selectedPlacedProductionId = selectedPlacedInfo?.buildingId ?? null;
  const selectedPlacedProduction = PRODUCTIONS.find((item) => item.id === selectedPlacedProductionId) ?? null;
  const selectedPlacedStatus = selectedPlacedProductionId
    ? cityById(game, selectedPlacedInfo!.cityId)?.completedBuildings.includes(selectedPlacedProductionId)
      ? "已建成"
      : cityById(game, selectedPlacedInfo!.cityId)?.activeProduction === selectedPlacedProductionId ? "建造中" : "已规划"
    : null;
  const yieldsFor = (pos: Position) => tileYieldsForState(game, pos);
  const selectedYield = yieldsFor(selectedPos);
  const selectedResource = RESOURCE_TILES[idFor(selectedPos)] ? RESOURCE_INFO[RESOURCE_TILES[idFor(selectedPos)]] : null;
  const maxMoves = selectedUnit ? maxMovesForUnit(selectedUnit.type, game.completedTechs, game.footballTurns) : 0;
  const movementCosts = (() => {
    if (placingProduction || growthChoosing || !selectedUnit || selectedUnit.moves <= 0) return new Map<string, number>();
    const blockers = new Set<string>(RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => idFor(rival.capital)));
    visibleRivalPatrols.forEach((patrol) => blockers.add(idFor(patrol.pos)));
    game.units.forEach((unit) => { if (unit.id !== selectedUnit.id) blockers.add(idFor(unit.pos)); });
    return movementRange(selectedUnit.pos, selectedUnit.moves, blockers, game.discovered);
  })();
  const attackTargets = (() => {
    const targets = new Set<string>();
    if (!selectedUnit || selectedUnit.moves <= 0 || UNIT_INFO[selectedUnit.type].role !== "combat") return targets;
    game.rivalUnits.forEach((unit) => {
      if (game.wars[unit.rivalId] === "war" && hexDistance(selectedUnit.pos, unit.pos) === 1) targets.add(idFor(unit.pos));
    });
    RIVALS.forEach((rival) => {
      if (!game.defeatedRivals.includes(rival.id) && game.wars[rival.id] === "war" && hexDistance(selectedUnit.pos, rival.capital) === 1) targets.add(idFor(rival.capital));
    });
    return targets;
  })();
  const revealedCount = game.discovered.size;
  const legacyMilestones = legacyMilestonesFor(game);
  const readyLegacyMilestone = legacyMilestones.find((milestone) => milestone.progress >= milestone.target && !game.claimedLegacyMilestones.includes(milestone.id)) ?? null;
  const victoryReady = hasWonDawn(game);
  const stopTransientFlow = () => {
    aiRunIdRef.current += 1;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
    aiLockRef.current = false;
    setAiThinking(false);
    setAiPhaseIndex(null);
    setAiTurnPlan([]);
    setTechPickerOpen(false);
    setProductionDrawerOpen(false);
    setStrategyDrawerOpen(false);
    setGrowthDrawerOpen(false);
    setGrowthCandidate(null);
    setHoveredGrowthTile(null);
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

  const openCapitalProduction = (cityId: CityId = managingCity.id, preferredCategory?: "buildings" | "units") => {
    if (aiThinking || game.result) return;
    const targetCity = cityById(game, cityId) ?? managingCity;
    setManagingCityId(targetCity.id);
    if (targetCity.growthPending > 0) {
      setProductionDrawerOpen(false); setStrategyDrawerOpen(false); setGrowthCandidate(null); setGrowthDrawerOpen(true);
      setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(targetCity.pos), message: `请先完成${targetCity.name}的成长选择，再安排生产。` }));
      return;
    }
    const targetProduction = PRODUCTIONS.find((item) => item.id === targetCity.activeProduction) ?? null;
    setProductionCategory(preferredCategory ?? (targetProduction?.kind === "unit" ? "units" : "buildings"));
    setGame((prev) => {
      const currentCity = cityById(prev, targetCity.id) ?? targetCity;
      const currentProject = PRODUCTIONS.find((item) => item.id === currentCity.activeProduction);
      return {
        ...prev,
        selectedTile: idFor(currentCity.pos),
        selectedUnitId: null,
        message: currentProject
          ? `${currentCity.name}正在${currentProject.kind === "unit" ? "训练" : "建造"}${currentProject.name}。`
          : `请为${currentCity.name}安排一个生产项目。`,
      };
    });
    setTechPickerOpen(false);
    setStrategyDrawerOpen(false);
    setGrowthDrawerOpen(false);
    setGrowthCandidate(null);
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setProductionDrawerOpen(true);
  };

  const openGrowth = () => {
    if (aiThinking || game.result) return;
    setTechPickerOpen(false); closeProductionDrawer(); setStrategyDrawerOpen(false); setGrowthCandidate(null); setHoveredGrowthTile(null); setGrowthDrawerOpen(true);
    setGame((prev) => {
      const city = cityById(prev, managingCity.id) ?? managingCity;
      return { ...prev, selectedUnitId: null, selectedTile: idFor(city.pos), message: city.growthPending > 0 ? `${city.name}人口已增长：请选择一个六角格，系统会同时扩张边界并自动建设改良。` : `${city.name}的成长由粮食驱动；成长槽满后即可开发一个新地块。` };
    });
  };

  const openStrategy = (tab: "civics" | "diplomacy" | "happiness") => {
    if (aiThinking || game.result) return;
    const pendingGrowthCity = game.cities.find((city) => city.growthPending > 0);
    if (pendingGrowthCity) {
      setManagingCityId(pendingGrowthCity.id);
      setStrategyDrawerOpen(false); setGrowthCandidate(null); setGrowthDrawerOpen(true);
      setGame((prev) => ({ ...prev, selectedTile: idFor(pendingGrowthCity.pos), message: `请先为${pendingGrowthCity.name}的新人口选择开发地块；随后可以继续管理帝国。` }));
      return;
    }
    setTechPickerOpen(false);
    setProductionDrawerOpen(false);
    setGrowthDrawerOpen(false);
    setGrowthCandidate(null);
    setPlacingProduction(null);
    setPlacementCandidate(null);
    setHoveredPlacementTile(null);
    setStrategyTab(tab);
    setStrategyDrawerOpen(true);
    setGame((prev) => ({
      ...prev,
      message: prev.message,
    }));
  };

  const chooseCivic = (civicId: CivicId) => {
    if (aiThinking || aiLockRef.current) return;
    if (game.completedCivics.includes(civicId)) return;
    const civic = CIVICS.find((item) => item.id === civicId)!;
    setGame((prev) => ({ ...prev, activeCivic: civicId, message: `开始推进市政：${civic.name}。文化进度会保留。` }));
  };

  const slotPolicy = (policyId: PolicyId | null) => {
    if (aiThinking || aiLockRef.current) return;
    if (policyId && !game.completedCivics.includes(POLICIES[policyId].unlockedBy)) return;
    setGame((prev) => ({
      ...prev,
      activePolicy: policyId,
      message: policyId ? `${POLICIES[policyId].name}已装入政策槽，效果立即生效。` : "政策槽已清空。",
    }));
  };

  const handleDiplomaticAction = (action: "trade" | "research" | "sanction" | "war") => {
    if (aiThinking || aiLockRef.current) return;
    const targetId = selectedRivalId;
    const target = RIVAL_BY_ID[targetId];
    if (action === "war") {
      setGame((prev) => declareWar(prev, targetId));
      return;
    }
    const config = {
      trade: { cost: 12, relation: 6, message: `阿根廷与${target.name}建立了 6 回合贸易路线，并引入${RESOURCE_INFO[target.resource].name}。` },
      research: { cost: 18, relation: 5, message: `阿根廷与${target.name}启动 4 回合联合研究计划。` },
      sanction: { cost: 15, relation: -12, message: `阿根廷公开谴责${target.name}，其地区影响增长将在 3 回合内受限。` },
    }[action];
    setGame((prev) => ({
      ...(() => {
        const targetRelationship = prev.rivalRelationships[targetId];
        const relationshipBlocked = (action === "trade" && targetRelationship < 40) || (action === "research" && targetRelationship < 55);
        const conflictBlocked = action === "sanction"
          ? prev.tradeRouteTurns > 0 || prev.researchCollaborationTurns > 0 || prev.sanctionTurns > 0
          : prev.sanctionTurns > 0 || (action === "trade" ? prev.tradeRouteTurns > 0 : prev.researchCollaborationTurns > 0);
        if (prev.influence < config.cost || relationshipBlocked || conflictBlocked) {
          const reason = prev.influence < config.cost ? "影响力不足" : relationshipBlocked ? "当前关系等级不足" : "已有冲突或相同外交行动正在进行";
          return { ...prev, message: `无法执行：${reason}。` };
        }
        return {
          ...prev,
          influence: prev.influence - config.cost,
          rivalRelationships: { ...prev.rivalRelationships, [targetId]: Math.max(0, Math.min(100, targetRelationship + config.relation)) },
          brazilRelationship: targetId === "brazil" ? Math.max(0, Math.min(100, prev.brazilRelationship + config.relation)) : prev.brazilRelationship,
          tradePartner: action === "trade" ? targetId : prev.tradePartner,
          researchPartner: action === "research" ? targetId : prev.researchPartner,
          sanctionedRival: action === "sanction" ? targetId : prev.sanctionedRival,
          tradeRouteTurns: action === "trade" ? 6 : prev.tradeRouteTurns,
          researchCollaborationTurns: action === "research" ? 4 : prev.researchCollaborationTurns,
          sanctionTurns: action === "sanction" ? 3 : prev.sanctionTurns,
          message: config.message,
          log: addLog(prev.log, config.message),
        };
      })(),
    }));
  };

  const chooseCelebration = (celebrationId: CelebrationId) => {
    if (aiThinking || aiLockRef.current) return;
    if (!game.celebrationPending) return;
    const celebration = CELEBRATIONS[celebrationId];
    setGame((prev) => ({
      ...prev,
      happiness: 0,
      celebration: celebrationId,
      celebrationTurns: 4,
      celebrationPending: false,
      message: `${celebration.name}开始：${celebration.effect}。`,
      log: addLog(prev.log, `布宜诺斯艾利斯举办${celebration.name}。`),
    }));
  };

  const handleNarrativeChoice = (choiceId: string) => {
    if (!game.pendingEvent || aiThinking || aiLockRef.current) return;
    setGame((prev) => {
      const eventId = prev.pendingEvent;
      if (!eventId) return prev;
      let next: GameState = { ...prev, pendingEvent: null, nextEventTurn: prev.turn + 2 };
      const improveAllRelations = (amount: number) => Object.fromEntries(RIVALS.map((rival) => [rival.id, Math.min(100, next.rivalRelationships[rival.id] + amount)])) as Record<RivalId, number>;
      if (eventId === "worldCouncil" && choiceId === "embassy") { next = { ...next, influence: next.influence + 18, rivalRelationships: improveAllRelations(3), brazilRelationship: Math.min(100, next.brazilRelationship + 3) }; }
      if (eventId === "worldCouncil" && choiceId === "markets") next = { ...next, gold: next.gold + 30 };
      if (eventId === "worldCouncil" && choiceId === "scholars") next = { ...next, science: next.science + 15, techProgress: next.techProgress + 15, culture: next.culture + 8, civicProgress: next.civicProgress + 8 };
      if (eventId === "pampasVoices" && choiceId === "fields") next = { ...next, cities: next.cities.map((city) => city.isCapital ? { ...city, food: city.food + 12 } : city), happiness: next.happiness + 5 };
      if (eventId === "pampasVoices" && choiceId === "shops") {
        const capital = capitalCity(next);
        const project = PRODUCTIONS.find((item) => item.id === capital?.activeProduction);
        next = project && capital ? { ...next, cities: next.cities.map((city) => city.id === capital.id ? { ...city, productionProgress: { ...city.productionProgress, [project.id]: Math.min(project.cost - 1, city.productionProgress[project.id] + 10) } } : city) } : { ...next, gold: next.gold + 18 };
      }
      if (eventId === "pampasVoices" && choiceId === "squares") next = { ...next, culture: next.culture + 12, civicProgress: next.civicProgress + 12, greatPoints: next.greatPoints + 5 };
      if (eventId === "distantHorizon" && choiceId === "survey") next = { ...next, science: next.science + 12, techProgress: next.techProgress + 12 };
      if (eventId === "distantHorizon" && choiceId === "stories") next = { ...next, culture: next.culture + 12, civicProgress: next.civicProgress + 12 };
      if (eventId === "distantHorizon" && choiceId === "outposts") next = { ...next, gold: next.gold + 24 };
      if (eventId === "coffeeExchange" && choiceId === "export") next = { ...next, gold: next.gold + 28, influence: next.influence + 6 };
      if (eventId === "coffeeExchange" && choiceId === "cafes") next = { ...next, culture: next.culture + 16, civicProgress: next.civicProgress + 16, greatPoints: next.greatPoints + 4 };
      if (eventId === "footballNation" && choiceId === "academies") next = { ...next, science: next.science + 10, techProgress: next.techProgress + 10, happiness: next.happiness + 8 };
      if (eventId === "footballNation" && choiceId === "tour") next = { ...next, influence: next.influence + 18, rivalRelationships: improveAllRelations(4), brazilRelationship: Math.min(100, next.brazilRelationship + 4) };
      if (eventId === "footballNation" && choiceId === "festival") next = { ...next, culture: next.culture + 18, civicProgress: next.civicProgress + 18, gold: next.gold + 12 };
      const choice = NARRATIVE_EVENTS[eventId].choices.find((item) => item.id === choiceId);
      const message = `${NARRATIVE_EVENTS[eventId].title}：${choice?.label ?? "帝国作出了选择"}。${choice?.reward ?? ""}`;
      return { ...next, message, log: addLog(next.log, message) };
    });
  };

  const confirmGrowthSelection = () => {
    if (aiThinking || aiLockRef.current || !growthCandidate || managingCity.growthPending <= 0) return;
    const tileId = growthCandidate;
    const pos = posForId(tileId);
    if (growthTileError(game, managingCity.id, pos) || !growthOptions.get(tileId)) return;
    const remainingAfterChoice = Math.max(0, managingCity.growthPending - 1);
    const nextPopulation = managingCity.population + 1;
    const chainedGrowth = remainingAfterChoice === 0 && managingCity.food >= 10 + nextPopulation * 4;
    setGame((prev) => {
      const currentCity = cityById(prev, managingCity.id);
      if (!currentCity) return prev;
      const error = growthTileError(prev, currentCity.id, pos);
      if (error || currentCity.growthPending <= 0) return { ...prev, message: error ? `无法开发：${error}。` : prev.message };
      const improvement = automaticImprovementFor(pos)!;
      const population = currentCity.population + 1;
      let growthPending = Math.max(0, currentCity.growthPending - 1);
      let food = currentCity.food;
      const nextTarget = 10 + population * 4;
      if (growthPending === 0 && food >= nextTarget) { food -= nextTarget; growthPending += 1; }
      const ruralTiles = [...currentCity.ruralTiles, tileId];
      const cities = prev.cities.map((city) => city.id === currentCity.id ? { ...city, population, food, growthPending, ruralTiles } : city);
      const ownedTiles = playerOwnedTilesForCities(cities);
      const borderGain = ownedTiles.filter((ownedTile) => !prev.ownedTiles.includes(ownedTile)).length;
      const builtImprovements = { ...prev.builtImprovements, [tileId]: improvement };
      const discovered = reveal(prev.discovered, pos, 1);
      const message = `开发区新增${IMPROVEMENT_INFO[improvement].name}，边界${borderGain > 0 ? `向外新增 ${borderGain} 格` : "保持紧凑"}；${currentCity.name}达到 ${population} 人口。`;
      const won = hasWonDawn({ cities, messiRecruited: prev.messiRecruited, legacyPoints: prev.legacyPoints });
      return { ...prev, cities, ownedTiles, builtImprovements, discovered, selectedTile: tileId, selectedUnitId: null, message, log: addLog(prev.log, message), result: won ? "win" : prev.result, resultReason: won ? "legacy" : prev.resultReason };
    });
    setNewlyClaimedTile(tileId); setGrowthCandidate(null); setHoveredGrowthTile(null);
    if (!chainedGrowth && remainingAfterChoice === 0) setGrowthDrawerOpen(false);
    requestAnimationFrame(() => focusMapOn(pos));
  };

  const handleTileClick = (pos: Position) => {
    if (aiThinking || game.result) return;
    if (growthChoosing) {
      const tileId = idFor(pos);
      const error = growthTileError(game, managingCity.id, pos);
      if (error) { setGrowthCandidate(null); setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `不能选择这里：${error}。` })); return; }
      const option = growthOptions.get(tileId)!;
      setGrowthCandidate(tileId);
      setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `开发预览：自动建设${IMPROVEMENT_INFO[option.improvement].name}${option.borderGain > 0 ? `，边界外推 ${option.borderGain} 格` : "，填充现有边界"}。` }));
      return;
    }
    if (placingProduction) {
      const tileId = idFor(pos);
      const placementError = productionPlacementError(game, managingCity.id, placingProduction, pos);
      if (placementError) {
        setPlacementCandidate(null);
        setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `不能在这里建造：${placementError}。` }));
        return;
      }
      const item = PRODUCTIONS.find((production) => production.id === placingProduction)!;
      const adjacency = placementAdjacencyFor(game, placingProduction, pos);
      setPlacementCandidate(tileId);
      setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `预览${item.name}：${TERRAIN_INFO[terrainAt(pos)].label}，相邻加成 +${adjacency} ${YIELD_META[item.yield].label}。` }));
      return;
    }
    const clickedPlayerCity = playerCityAt(game, pos);
    if (clickedPlayerCity && !selectedUnit) {
      openCapitalProduction(clickedPlayerCity.id);
      return;
    }
    const clickedRivalCandidate = rivalCapitalAt(pos);
    const clickedRival = clickedRivalCandidate && !game.defeatedRivals.includes(clickedRivalCandidate.id) ? clickedRivalCandidate : null;
    if (clickedRival) setSelectedRivalId(clickedRival.id);
    const clickedEnemyUnit = game.rivalUnits.find((unit) => idFor(unit.pos) === idFor(pos)) ?? null;
    const peaceTargetId = clickedEnemyUnit?.rivalId ?? clickedRival?.id;
    if (selectedUnit && peaceTargetId && UNIT_INFO[selectedUnit.type].role === "combat" && hexDistance(selectedUnit.pos, pos) === 1 && game.wars[peaceTargetId] === "peace") {
      setSelectedRivalId(peaceTargetId);
      setTechPickerOpen(false); closeProductionDrawer(); setGrowthDrawerOpen(false); setStrategyTab("diplomacy"); setStrategyDrawerOpen(true);
      setGame((prev) => ({ ...prev, message: `与${RIVAL_BY_ID[peaceTargetId].name}仍处于和平状态；请在右侧外交窗口宣战后再攻击。` }));
      return;
    }
    setGame((prev) => {
      const tileId = idFor(pos);
      const terrain = terrainAt(pos);
      const known = prev.discovered.has(tileId);
      const terrainBlocked = terrain === "water" || terrain === "mountain";
      const cityBlocked = Boolean(clickedRival);
      const occupiedByPatrol = rivalPatrolsFor(prev).find((patrol) => tileId === idFor(patrol.pos)) ?? null;
      const rivalOccupied = Boolean(occupiedByPatrol);
      const blockers = new Set<string>(RIVALS.filter((rival) => !prev.defeatedRivals.includes(rival.id)).map((rival) => idFor(rival.capital)));
      rivalPatrolsFor(prev).filter((patrol) => visibleTiles.has(idFor(patrol.pos))).forEach((patrol) => blockers.add(idFor(patrol.pos)));
      const activeUnit = prev.units.find((unit) => unit.id === prev.selectedUnitId) ?? null;
      if (activeUnit && hexDistance(activeUnit.pos, pos) === 1 && (occupiedByPatrol || clickedRival) && UNIT_INFO[activeUnit.type].role === "combat") {
        return resolvePlayerAttack(prev, activeUnit.id, pos);
      }
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
            ? `${clickedRival!.capitalName}由${clickedRival!.name}控制；${prev.wars[clickedRival!.id] === "war" ? `城防 ${prev.rivalCityHp[clickedRival!.id]}/${CITY_MAX_HP}` : "可在外交面板宣战或交涉"}。`
            : rivalOccupied
              ? visibleTiles.has(tileId) ? `${occupiedByPatrol!.rival.name}战士正在此处，${prev.wars[occupiedByPatrol!.rival.id] === "war" ? "选中相邻战斗单位即可攻击" : "宣战后才可攻击"}。` : "战争迷雾中有单位阻挡，移动中止。"
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

  const handleFoundCity = () => {
    if (!selectedUnit || selectedUnit.type !== "settler" || aiThinking || game.result) return;
    const error = settlementError(game, selectedUnit.pos, selectedUnit.id);
    if (error) {
      setGame((prev) => ({ ...prev, message: `无法建城：${error}。` }));
      return;
    }
    const newCityId = `city-${game.nextCitySerial}`;
    setGame((prev) => foundCity(prev, selectedUnit.id));
    setManagingCityId(newCityId);
    setProductionCategory("buildings");
    setProductionDrawerOpen(true);
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
    if (!item || aiThinking || game.result || (item.kind === "building" && managingCity.completedBuildings.includes(item.id))) return;
    if (item.kind === "unit") {
      setGame((prev) => ({
        ...prev,
        cities: prev.cities.map((city) => city.id === managingCity.id ? { ...city, activeProduction: item.id } : city),
        selectedTile: idFor(managingCity.pos),
        selectedUnitId: null,
        message: `${item.name}已加入${managingCity.name}生产队列；完成后会自动部署到城市中心或相邻空格。`,
        log: addLog(prev.log, `${managingCity.name}开始训练${item.name}。`),
      }));
      setProductionDrawerOpen(false);
      setPlacingProduction(null);
      setPlacementCandidate(null);
      setHoveredPlacementTile(null);
      setProductionReminderBypassed(false);
      return;
    }
    const existingPlacement = managingCity.buildingPlacements[item.id];
    if (existingPlacement) {
      setGame((prev) => ({
        ...prev,
        cities: prev.cities.map((city) => city.id === managingCity.id ? { ...city, activeProduction: item.id } : city),
        selectedTile: existingPlacement,
        selectedUnitId: null,
        message: `继续建造${item.name}，已有进度会保留。`,
        log: addLog(prev.log, `${managingCity.name}继续建造${item.name}。`),
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
        selectedTile: idFor(managingCity.pos),
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
    const placementError = productionPlacementError(game, managingCity.id, placingProduction, pos);
    if (placementError) {
      setGame((prev) => ({ ...prev, message: `不能在这里建造：${placementError}。` }));
      return;
    }
    const adjacency = placementAdjacencyFor(game, placingProduction, pos);
    const productionId = placingProduction;
    const tileId = placementCandidate;
    setGame((prev) => {
      const city = cityById(prev, managingCity.id);
      if (!city) return prev;
      const buildingPlacements = { ...city.buildingPlacements, [productionId]: tileId };
      const cities = prev.cities.map((candidate) => candidate.id === city.id ? { ...candidate, activeProduction: productionId, buildingPlacements } : candidate);
      const ownedTiles = playerOwnedTilesForCities(cities);
      const borderGain = ownedTiles.filter((ownedTile) => !prev.ownedTiles.includes(ownedTile)).length;
      const message = `${item.name}已落位并形成城区，边界${borderGain > 0 ? `外推 ${borderGain} 格` : "保持紧凑"}；相邻加成 +${adjacency} ${YIELD_META[item.yield].label}。`;
      return {
        ...prev,
        cities,
        ownedTiles,
        discovered: reveal(prev.discovered, pos, 1),
        selectedTile: tileId,
        selectedUnitId: null,
        message,
        log: addLog(prev.log, message),
      };
    });
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

  /* v5 single-city turn resolver retained only as migration history.
  const endTurnV5 = useCallback(() => {
    if (aiLockRef.current || game.result || game.celebrationPending || game.growthPending > 0) return;
    const plans = rivalTurnPlansFor({ turn: game.turn, ownedTiles: game.ownedTiles });
    const runId = aiRunIdRef.current + 1;
    aiRunIdRef.current = runId;
    aiLockRef.current = true;
    setAiThinking(true);
    setAiTurnPlan(plans);

    const runAiPhase = (index: number) => {
      if (aiRunIdRef.current !== runId) return;
      const plan = plans[index];
      const rival = RIVAL_BY_ID[plan.rivalId];
      setAiPhaseIndex(index);
      setGame((prev) => ({ ...prev, message: `电脑回合 ${index + 1}/${plans.length}：${rival.name}正在行动 · ${plan.action}` }));
      aiTimerRef.current = setTimeout(() => {
        if (aiRunIdRef.current !== runId) return;
        aiTimerRef.current = null;
        if (index < plans.length - 1) {
          runAiPhase(index + 1);
          return;
        }
        setGame((prev) => {
        const turnYields = cityYieldTotals(prev);
        const scienceGain = turnYields.science + (prev.tradeRouteTurns > 0 ? 1 : 0) + (prev.researchCollaborationTurns > 0 ? 2 : 0);
        const cultureGain = turnYields.culture;
        const goldGain = turnYields.gold + (prev.tradeRouteTurns > 0 ? 4 : 0);
        const foodGain = turnYields.food;
        const productionGain = Math.max(1, turnYields.production);
        let food = prev.food + foodGain;
        const population = prev.population;
        let growthReady = false;
        const foodTarget = 10 + prev.population * 4;
        if (food >= foodTarget) {
          food -= foodTarget;
          growthReady = true;
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

        let civicProgress = prev.civicProgress + cultureGain;
        let activeCivicId = prev.activeCivic;
        const completedCivics = [...prev.completedCivics];
        let completedCivicName = "";
        if (activeCivicId) {
          const civic = CIVICS.find((item) => item.id === activeCivicId)!;
          if (civicProgress >= civic.cost) {
            civicProgress -= civic.cost;
            if (!completedCivics.includes(activeCivicId)) completedCivics.push(activeCivicId);
            completedCivicName = civic.name;
            activeCivicId = null;
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
                deployedUnit = {
                  id: unitId,
                  type: production.unitType,
                  pos: deployment,
                  moves: UNIT_INFO[production.unitType].baseMoves,
                };
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
        const tradeRouteTurns = Math.max(0, prev.tradeRouteTurns - 1);
        const researchCollaborationTurns = Math.max(0, prev.researchCollaborationTurns - 1);
        const sanctionTurns = Math.max(0, prev.sanctionTurns - 1);
        const celebrationTurns = Math.max(0, prev.celebrationTurns - 1);
        const celebration = celebrationTurns > 0 ? prev.celebration : null;
        const greatPointGain = 3 + Math.floor(population / 2) + (completedTechs.includes("broadcast") ? 2 : 0);
        const influenceGain = influenceGainFor(prev);
        const influence = prev.influence + influenceGain;
        const rivalRelationships = Object.fromEntries(RIVALS.map((rival) => {
          const diplomacyDelta = (prev.tradePartner === rival.id && prev.tradeRouteTurns > 0 ? 1 : 0)
            + (prev.researchPartner === rival.id && prev.researchCollaborationTurns > 0 ? 1 : 0)
            - (prev.sanctionedRival === rival.id && prev.sanctionTurns > 0 ? 1 : 0);
          return [rival.id, Math.max(0, Math.min(100, prev.rivalRelationships[rival.id] + diplomacyDelta + agendaRelationDelta(prev, rival.id)))];
        })) as Record<RivalId, number>;
        const nextRivalEmpires = deriveRivalEmpires({ turn: prev.turn + 1, ownedTiles: prev.ownedTiles });
        const rivalInfluence = Object.fromEntries(RIVALS.map((rival) => {
          const relationship = rivalRelationships[rival.id];
          const sanctioned = prev.sanctionedRival === rival.id && prev.sanctionTurns > 0;
          const outputs = rivalYieldsFor(prev, rival.id, nextRivalEmpires[rival.id]);
          const economicMomentum = Math.min(4, 1 + Math.floor((outputs.food + outputs.production + outputs.science + outputs.culture) / 6));
          const gain = Math.max(1, economicMomentum - (sanctioned ? 2 : 0) - (relationship >= 75 ? 1 : 0));
          return [rival.id, prev.rivalInfluence[rival.id] + gain];
        })) as Record<RivalId, number>;
        const brazilRelationship = rivalRelationships.brazil;
        const brazilInfluence = rivalInfluence.brazil;
        const happinessGain = happinessGainFor(prev, population, completedBuildings.length, Math.max(...Object.values(rivalRelationships)));
        const happiness = Math.min(HAPPINESS_TARGET, prev.happiness + happinessGain);
        const celebrationPending = prev.celebrationPending || (happiness >= HAPPINESS_TARGET && celebrationTurns === 0);
        const nextTurn = prev.turn + 1;
        units = units.map((unit) => ({ ...unit, moves: maxMovesForUnit(unit.type, completedTechs, footballTurns) }));
        const recruited = prev.messiRecruited;
        const won = hasWonDawn({ population, messiRecruited: recruited, legacyPoints: prev.legacyPoints });
        const lost = Math.max(...Object.values(rivalInfluence)) >= 100;
        const turnEvents: string[] = [];
        if (completedProduction) {
          if (completedProduction.kind === "building") {
            const placement = prev.buildingPlacements[completedProduction.id];
            const adjacency = placement ? placementAdjacencyFor(prev, completedProduction.id, posForId(placement)) : 0;
            turnEvents.push(`布宜诺斯艾利斯完成了${completedProduction.name}：${completedProduction.effect}，相邻加成 +${adjacency} ${YIELD_META[completedProduction.yield].label}。`);
          } else if (deployedUnit) {
            turnEvents.push(`${completedProduction.name}训练完成，已自动部署到首都${idFor(deployedUnit.pos) === idFor(CITY_POS) ? "中心" : "相邻空格"}。`);
          }
        }
        if (deploymentBlocked) turnEvents.push("单位训练已完成，但首都附近没有合法部署空格；进度会保留到空位出现。");
        if (completedName) turnEvents.push(`完成科技：${completedName}。请选择下一项研究。`);
        if (completedCivicName) turnEvents.push(`完成市政：${completedCivicName}。新政策已经解锁。`);
        if (growthReady) turnEvents.push("城市成长槽已满！请选择一个地块；人口、边界与改良会同时生效。");
        if (celebrationPending && !prev.celebrationPending) turnEvents.push("城市幸福度已满！请先选择一项庆典奖励。");
        const aiHighlights = plans.filter((plan) => plan.grew || plan.expandedTile || plan.developedTile).map((plan) => `${RIVAL_BY_ID[plan.rivalId].name}${plan.action}`);
        turnEvents.push(aiHighlights.length ? `电脑回合：${aiHighlights.join("；")}。` : "五个电脑文明完成了发展与巡逻。");
        turnEvents.push(`第 ${nextTurn} 回合开始，所有单位恢复行动。`);
        const summary = turnEvents.join(" ");

        return {
          ...prev,
          turn: nextTurn,
          gold: prev.gold + goldGain,
          science: prev.science + scienceGain,
          culture: prev.culture + cultureGain,
          greatPoints: prev.greatPoints + greatPointGain,
          food,
          population,
          growthPending: prev.growthPending + (growthReady ? 1 : 0),
          activeTech: activeTechId,
          techProgress,
          completedTechs,
          activeCivic: activeCivicId,
          civicProgress,
          completedCivics,
          activeProduction: activeProductionId,
          productionProgress,
          completedBuildings,
          units,
          selectedUnitId,
          selectedTile,
          nextUnitSerial,
          brazilPos: nextBrazilPosition({ ...prev, units }),
          brazilInfluence,
          influence,
          brazilRelationship,
          rivalRelationships,
          rivalInfluence,
          tradePartner: tradeRouteTurns > 0 ? prev.tradePartner : null,
          researchPartner: researchCollaborationTurns > 0 ? prev.researchPartner : null,
          sanctionedRival: sanctionTurns > 0 ? prev.sanctionedRival : null,
          tradeRouteTurns,
          researchCollaborationTurns,
          sanctionTurns,
          happiness,
          celebration,
          celebrationTurns,
          celebrationPending,
          footballTurns,
          message: summary,
          log: addLog(prev.log, summary),
          result: won ? "win" : lost ? "lose" : null,
        };
        });
        aiLockRef.current = false;
        setAiThinking(false);
        setAiPhaseIndex(null);
        setAiTurnPlan([]);
      }, AI_STEP_MS);
    };

    runAiPhase(0);
  }, [game.celebrationPending, game.growthPending, game.ownedTiles, game.result, game.turn]);
  */

  const endTurn = useCallback(() => {
    if (aiLockRef.current || game.result || game.celebrationPending || game.cities.some((city) => city.growthPending > 0)) return;
    const plans = rivalTurnPlansFor({ turn: game.turn, ownedTiles: game.ownedTiles });
    const runId = aiRunIdRef.current + 1;
    aiRunIdRef.current = runId;
    aiLockRef.current = true;
    setAiThinking(true);
    setAiTurnPlan(plans);

    const runAiPhase = (index: number) => {
      if (aiRunIdRef.current !== runId) return;
      const plan = plans[index];
      const rival = RIVAL_BY_ID[plan.rivalId];
      setAiPhaseIndex(index);
      setGame((prev) => {
        if (prev.defeatedRivals.includes(rival.id)) return { ...prev, message: `电脑回合 ${index + 1}/${plans.length}：${rival.name}已退出曙光时代。` };
        const afterMilitary = advanceRivalMilitaryPhase(prev, rival.id);
        const afterProduction = advanceRivalProduction(afterMilitary, rival.id);
        return { ...afterProduction, message: `电脑回合 ${index + 1}/${plans.length}：${rival.name} · ${afterProduction.message}` };
      });
      aiTimerRef.current = setTimeout(() => {
        if (aiRunIdRef.current !== runId) return;
        aiTimerRef.current = null;
        if (index < plans.length - 1) {
          runAiPhase(index + 1);
          return;
        }
        setGame((prev) => prev.result ? prev : resolvePlayerEconomyRound(prev));
        aiLockRef.current = false;
        setAiThinking(false);
        setAiPhaseIndex(null);
        setAiTurnPlan([]);
      }, AI_STEP_MS);
    };

    runAiPhase(0);
  }, [game.celebrationPending, game.cities, game.ownedTiles, game.result, game.turn]);

  const requestEndTurn = useCallback(() => {
    if (aiThinking || game.result || techPickerOpen || productionDrawerOpen || strategyDrawerOpen || growthDrawerOpen || placingProduction) return;
    if (game.pendingEvent) {
      setGame((prev) => ({ ...prev, message: "请先完成右侧的文明故事选择。" }));
      return;
    }
    const growthCity = game.cities.find((city) => city.growthPending > 0);
    if (growthCity) {
      setManagingCityId(growthCity.id);
      setGrowthCandidate(null); setHoveredGrowthTile(null); setGrowthDrawerOpen(true);
      setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(growthCity.pos), message: `请先选择${growthCity.name}新人口要开发的地块。` }));
      return;
    }
    if (game.celebrationPending) {
      setStrategyTab("happiness");
      setStrategyDrawerOpen(true);
      setGame((prev) => ({ ...prev, message: "幸福度已满，请先选择本次城市庆典。" }));
      return;
    }
    const idleCity = game.cities.find((city) => !city.activeProduction);
    if (idleCity && !productionReminderBypassed) {
      setManagingCityId(idleCity.id);
      setGame((prev) => ({
        ...prev,
        selectedTile: idFor(idleCity.pos),
        selectedUnitId: null,
        message: `请先为${idleCity.name}安排生产，或选择本回合暂不生产。`,
      }));
      setProductionDrawerOpen(true);
      return;
    }
    setProductionReminderBypassed(false);
    endTurn();
  }, [aiThinking, endTurn, game.celebrationPending, game.cities, game.pendingEvent, game.result, growthDrawerOpen, placingProduction, productionDrawerOpen, productionReminderBypassed, strategyDrawerOpen, techPickerOpen]);

  useEffect(() => {
    if (!pendingGrowthCity || aiThinking || game.result) return;
    const timer = window.setTimeout(() => { setManagingCityId(pendingGrowthCity.id); setProductionDrawerOpen(false); setStrategyDrawerOpen(false); setGrowthCandidate(null); setHoveredGrowthTile(null); setGrowthDrawerOpen(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [aiThinking, game.result, pendingGrowthCity]);

  useEffect(() => {
    if (aiThinking || game.result || game.pendingEvent || totalGrowthPending > 0 || game.celebrationPending || game.turn < game.nextEventTurn) return;
    const nextEvent = (Object.keys(NARRATIVE_EVENTS) as NarrativeEventId[]).find((eventId) => !game.triggeredEvents.includes(eventId) && NARRATIVE_EVENTS[eventId].trigger(game));
    if (!nextEvent) return;
    const timer = window.setTimeout(() => {
      setProductionDrawerOpen(false); setStrategyDrawerOpen(false); setGrowthDrawerOpen(false); setTechPickerOpen(false);
      setGame((prev) => prev.pendingEvent ? prev : { ...prev, pendingEvent: nextEvent, triggeredEvents: [...prev.triggeredEvents, nextEvent], selectedUnitId: null, message: `文明故事：${NARRATIVE_EVENTS[nextEvent].title}` });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aiThinking, game, game.celebrationPending, game.nextEventTurn, game.pendingEvent, game.result, game.triggeredEvents, totalGrowthPending]);

  useEffect(() => {
    if (!readyLegacyMilestone || aiThinking || game.result) return;
    const timer = window.setTimeout(() => setGame((prev) => {
      if (prev.claimedLegacyMilestones.includes(readyLegacyMilestone.id)) return prev;
      const points = { ...prev.legacyPoints, [readyLegacyMilestone.category]: prev.legacyPoints[readyLegacyMilestone.category] + 1 };
      let reward: Partial<GameState> = {};
      if (readyLegacyMilestone.id === "science-1") reward = { science: prev.science + 10, techProgress: prev.techProgress + 10 };
      if (readyLegacyMilestone.id === "culture-1") reward = { culture: prev.culture + 10, civicProgress: prev.civicProgress + 10 };
      if (readyLegacyMilestone.id === "culture-2") reward = { greatPoints: prev.greatPoints + 12 };
      if (readyLegacyMilestone.id === "economy-1") reward = { gold: prev.gold + 20 };
      if (readyLegacyMilestone.id === "economy-2") reward = { influence: prev.influence + 15 };
      if (readyLegacyMilestone.id === "exploration-1") reward = { gold: prev.gold + 15 };
      if (readyLegacyMilestone.id === "exploration-2") reward = { science: prev.science + 15, techProgress: prev.techProgress + 15 };
      const message = `遗产里程碑完成：${readyLegacyMilestone.name}，${readyLegacyMilestone.reward}。`;
      return { ...prev, ...reward, legacyPoints: points, claimedLegacyMilestones: [...prev.claimedLegacyMilestones, readyLegacyMilestone.id], message, log: addLog(prev.log, message) };
    }), 0);
    return () => window.clearTimeout(timer);
  }, [aiThinking, game.result, readyLegacyMilestone]);

  useEffect(() => {
    if (game.result || !victoryReady) return;
    const timer = window.setTimeout(() => setGame((prev) => {
      if (prev.result || !hasWonDawn(prev)) return prev;
      const message = "文明曙光胜利：四条遗产路径均已奠基，梅西与繁荣的首都共同开启新时代。";
      return { ...prev, result: "win", resultReason: "legacy", message, log: addLog(prev.log, message) };
    }), 0);
    return () => window.clearTimeout(timer);
  }, [game.result, victoryReady]);

  useEffect(() => {
    if (!newlyClaimedTile) return;
    const timer = window.setTimeout(() => setNewlyClaimedTile(null), 900);
    return () => window.clearTimeout(timer);
  }, [newlyClaimedTile]);

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
        } else if (growthDrawerOpen) {
          setGrowthDrawerOpen(false); setGrowthCandidate(null); setHoveredGrowthTile(null);
        } else if (strategyDrawerOpen) {
          setStrategyDrawerOpen(false);
        } else {
          setTechPickerOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [growthDrawerOpen, pendingSystemAction, placingProduction, productionDrawerOpen, requestEndTurn, strategyDrawerOpen]);

  useEffect(() => () => {
    aiRunIdRef.current += 1;
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
  }, []);

  const resetGame = () => {
    stopTransientFlow();
    setSelectedRivalId("brazil");
    setManagingCityId("city-1");
    setGame(createInitialState());
    setSaveNotice(saveMeta ? "已重新开始；原临时存档仍可读取" : "已重新开始新游戏");
    requestAnimationFrame(() => focusMapOn(CITY_POS, "auto"));
  };

  const saveGame = () => {
    if (aiThinking || aiLockRef.current || placingProduction) {
      setSaveNotice(placingProduction ? "请先确认或取消建筑选址" : "请等待世界行动结束");
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
    const savedRival = saved.game.selectedTile ? rivalCapitalAt(posForId(saved.game.selectedTile)) : null;
    const savedCity = saved.game.selectedTile ? playerCityAt(saved.game, posForId(saved.game.selectedTile)) : null;
    setSelectedRivalId(savedRival?.id ?? "brazil");
    setManagingCityId(savedCity?.id ?? capitalCity(saved.game)?.id ?? "city-1");
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
  const civicPercent = activeCivic ? Math.min(100, (game.civicProgress / activeCivic.cost) * 100) : 0;
  const productionPercent = activeProduction ? Math.min(100, activeProductionProgress / activeProduction.cost * 100) : 0;
  const cityGrowthTarget = 10 + managingCity.population * 4;
  const sciencePerTurn = cityYields.science + (game.tradeRouteTurns > 0 ? 1 : 0) + (game.researchCollaborationTurns > 0 ? 2 : 0);
  const culturePerTurn = cityYields.culture;
  const goldPerTurn = cityYields.gold + (game.tradeRouteTurns > 0 ? 4 : 0);
  const capital = capitalCity(game) ?? managingCity;
  const cityTileLeft = capital.pos.col * 70;
  const cityTileTop = capital.pos.row * 82 + (capital.pos.col % 2) * 41;
  const playerCityStyle = (city: PlayerCity) => ({ left: city.pos.col * 70 - 39, top: city.pos.row * 82 + (city.pos.col % 2) * 41 + 57 });
  const rivalCityStyle = (rival: RivalDefinition) => ({ left: rival.capital.col * 70 - 31, top: rival.capital.row * 82 + (rival.capital.col % 2) * 41 + 55 });
  const messiStyle = { left: cityTileLeft + 67, top: cityTileTop + 18 };
  const miniCityGeometry = hexGeometry(CITY_POS);
  const selectedMiniGeometry = game.selectedTile && game.discovered.has(game.selectedTile) ? hexGeometry(posForId(game.selectedTile)) : null;
  const activeTradeRoutePath = game.tradePartner ? (() => { const start = hexGeometry(CITY_POS); const end = hexGeometry(RIVAL_BY_ID[game.tradePartner].capital); return `M ${start.cx} ${start.cy} C ${start.cx + (end.cx - start.cx) * .34} ${start.cy - 150}, ${start.cx + (end.cx - start.cx) * .68} ${end.cy + 150}, ${end.cx} ${end.cy}`; })() : null;
  const activeNarrativeEvent = game.pendingEvent ? NARRATIVE_EVENTS[game.pendingEvent] : null;
  const savedAtLabel = saveMeta ? formatSaveTime(saveMeta.savedAt) : "暂无临时存档";
  const idleProductionCity = game.cities.find((city) => !city.activeProduction) ?? null;
  const pendingDecision = totalGrowthPending > 0
    ? { kind: "growth" as const, label: "选择新人口地块", detail: `${totalGrowthPending} 次成长待分配` }
    : game.celebrationPending ? { kind: "celebration" as const, label: "选择城市庆典", detail: "幸福度已满" }
      : !game.activeTech && TECHS.some((tech) => !game.completedTechs.includes(tech.id)) ? { kind: "tech" as const, label: "选择下一项科技", detail: "科研点会保留" }
        : !game.activeCivic && CIVICS.some((civic) => !game.completedCivics.includes(civic.id)) ? { kind: "civic" as const, label: "选择下一项市政", detail: "文化点会保留" }
          : idleProductionCity ? { kind: "production" as const, label: `安排${idleProductionCity.name}生产`, detail: "建筑、单位或开拓者" } : null;
  const handlePrimaryDecision = () => {
    if (!pendingDecision) return;
    if (pendingDecision.kind === "growth") {
      if (pendingGrowthCity) setManagingCityId(pendingGrowthCity.id);
      openGrowth();
    }
    if (pendingDecision.kind === "celebration") openStrategy("happiness");
    if (pendingDecision.kind === "tech") { closeProductionDrawer(); setStrategyDrawerOpen(false); setGrowthDrawerOpen(false); setTechPickerOpen(true); }
    if (pendingDecision.kind === "civic") openStrategy("civics");
    if (pendingDecision.kind === "production" && idleProductionCity) openCapitalProduction(idleProductionCity.id);
  };

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
          <span><b className="gold">●</b><small>金币</small><strong>{game.gold}</strong><em>+{goldPerTurn}</em></span>
          <span><b className="science">◆</b><small>科技</small><strong>{game.science}</strong><em>+{sciencePerTurn}</em></span>
          <span><b className="culture">✦</b><small>文化</small><strong>{game.culture}</strong><em>+{culturePerTurn}</em></span>
          <span><b className="influence">◇</b><small>影响力</small><strong>{game.influence}</strong><em>+{influencePerTurn}</em></span>
          <span><b className="people">★</b><small>伟人</small><strong>{game.greatPoints}</strong><em>/ 30</em></span>
        </div>
        <div className="turn-indicator"><small>{activeAiRival ? `${activeAiRival.flag} ${activeAiRival.name}行动中` : "探索时代"}</small><strong>{aiThinking ? "电脑回合" : `回合 ${game.turn}`}</strong></div>
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
            <div className="progress-copy"><span>预计完成</span><strong>{activeTech ? `${Math.max(1, Math.ceil((activeTech.cost - game.techProgress) / Math.max(1, sciencePerTurn)))} 回合` : "等待选择"}</strong></div>
            <button className="tech-change" onClick={() => { closeProductionDrawer(); setStrategyDrawerOpen(false); setGrowthDrawerOpen(false); setTechPickerOpen(true); }} disabled={aiThinking || totalGrowthPending > 0} data-testid="open-tech-picker">{activeTech ? "更换研究" : "选择下一项研究"}</button>
          </section>

          <section className="paper-card civic-compact-card">
            <div className="card-kicker">文化与市政</div>
            <div className="civic-compact-heading"><span>{activeCivic?.icon ?? "⚖"}</span><div><strong>{activeCivic?.name ?? "选择下一项市政"}</strong><small>{activeCivic?.effect ?? "用文化解锁政策卡"}</small></div></div>
            <div className="civic-compact-progress"><i><em style={{ width: `${civicPercent}%` }} /></i><b>{game.civicProgress}/{activeCivic?.cost ?? "—"}</b></div>
            <button onClick={() => openStrategy("civics")} disabled={aiThinking} data-testid="open-civics">市政树与政策 ›</button>
          </section>

          <section className="paper-card mission-card legacy-card">
            <div className="card-kicker">探索时代 · 遗产路径</div>
            {([
              ["science", "◆", "科技"], ["culture", "✦", "文化"], ["economy", "●", "经济"], ["exploration", "⌖", "探索"],
            ] as Array<[LegacyCategory, string, string]>).map(([category, icon, label]) => {
              const milestones = legacyMilestones.filter((milestone) => milestone.category === category);
              const completed = milestones.filter((milestone) => game.claimedLegacyMilestones.includes(milestone.id)).length;
              const active = milestones.find((milestone) => !game.claimedLegacyMilestones.includes(milestone.id)) ?? milestones[milestones.length - 1];
              return <div className={`legacy-row ${completed === milestones.length ? "done" : ""}`} key={category}>
                <span>{icon}</span><div><p>{label}路径 <b>{game.legacyPoints[category]} 点</b></p><small>{active.name} · {Math.min(active.progress, active.target)}/{active.target}</small><i><em style={{ width: `${Math.min(100, active.progress / active.target * 100)}%` }} /></i></div><strong>{completed}/{milestones.length}</strong>
              </div>;
            })}
            <p className="legacy-victory-rule">胜利：四条路径各获 2 点 · 首都 6 人口 · 招募梅西</p>
          </section>

          <section className="paper-card legend-card selection-card">
            <div className="card-kicker">当前选择</div>
            <div className="selection-heading">
              <span className={`selection-swatch ${selectedKnown ? selectedTerrain : "unknown"}`} aria-hidden="true"><i /></span>
              <div><h3>{!selectedKnown ? "未知区域" : selectedForeignCity ? selectedForeignCity.capitalName : selectedPlacedProduction?.name ?? selectedImprovement?.name ?? selectedResource?.name ?? TERRAIN_INFO[selectedTerrain].label}</h3><p>{!selectedKnown ? "战争迷雾覆盖，尚无地形情报" : selectedForeignCity ? `${selectedForeignCity.name}首都 · 人口 ${foreignPopulation}` : selectedPlacedProduction ? `${TERRAIN_INFO[selectedTerrain].label}上的城市建筑 · ${selectedPlacedStatus}` : selectedImprovement ? `${TERRAIN_INFO[selectedTerrain].label}上的改良设施` : selectedResource ? `${TERRAIN_INFO[selectedTerrain].label}上的资源 · 需要${IMPROVEMENT_INFO[selectedResource.improvement].name}` : "未改良地块"}</p></div>
            </div>
            <div className="selection-meta"><span>{!selectedKnown ? "未知领土" : selectedForeignCity ? `${selectedForeignCity.name}文明` : isArgentineTerritory(game, selectedPos) ? playerDevelopedTiles.has(idFor(selectedPos)) ? "阿根廷开发区" : "阿根廷边界缓冲区" : selectedTerritoryRival ? `${selectedTerritoryRival.name}领土` : "中立地块"}</span><b>{!selectedKnown ? "无情报" : selectedForeignCity ? "文明总产出/回合" : selectedPlacedStatus ?? (selectedImprovement ? "已开发" : "自然地貌")}</b></div>
            <div><span><i className="yield-dot food">粮</i>食物</span><b>{!selectedKnown ? "?" : foreignYields ? `+${foreignYields.food}` : selectedYield.food}</b></div>
            <div><span><i className="yield-dot production">锤</i>生产</span><b>{!selectedKnown ? "?" : foreignYields ? `+${foreignYields.production}` : selectedYield.production}</b></div>
            <div><span><i className="yield-dot science">科</i>科技</span><b>{!selectedKnown ? "?" : foreignYields ? `+${foreignYields.science}` : selectedYield.science}</b></div>
            <div><span><i className="yield-dot culture">文</i>文化</span><b>{!selectedKnown ? "?" : foreignYields ? `+${foreignYields.culture}` : selectedYield.culture}</b></div>
            <div><span><i className="yield-dot gold">金</i>金币</span><b>{!selectedKnown ? "?" : foreignYields ? "—" : selectedYield.gold}</b></div>
          </section>
        </aside>

        <section className={`map-stage ${placingProduction ? "placement-lens" : ""} ${growthChoosing ? "growth-lens" : ""}`} aria-label="世界地图">
          <div className="map-wash map-wash-one" />
          <div className="map-wash map-wash-two" />
          <div className="map-focus-controls" aria-label="地图定位">
            <button onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(CITY_POS), message: "镜头已返回阿根廷首都布宜诺斯艾利斯。" })); focusMapOn(CITY_POS); }} disabled={aiThinking} data-testid="focus-argentina">★ 阿根廷</button>
            <select aria-label="选择外国文明" value={selectedRivalId} onChange={(event) => setSelectedRivalId(event.target.value as RivalId)} disabled={aiThinking}>{RIVALS.map((rival) => <option value={rival.id} key={rival.id}>{rival.flag} {rival.name}</option>)}</select>
            <button className="rival-focus" style={{ "--civ-color": selectedRival.color } as CSSProperties} onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(selectedRival.capital), message: `${selectedRival.capitalName}与我国首都相距 ${hexDistance(CITY_POS, selectedRival.capital)} 格。` })); focusMapOn(selectedRival.capital); }} disabled={aiThinking} data-testid="focus-rival">◆ 定位首都</button>
            <span className="territory-key"><i className="argentina" />浅色边界 · 深色开发区<i style={{ color: selectedRival.color, background: selectedRival.tint }} />所选文明</span>
          </div>
          <div className="yield-controls" aria-label="地块收益图例">
            {showYields && <div className="yield-legend" aria-hidden="true"><span className="food">粮</span><span className="production">锤</span><span className="science">科</span><span className="culture">文</span></div>}
            <button className={showYields ? "active" : ""} aria-pressed={showYields} onClick={() => setShowYields((value) => !value)} disabled={aiThinking} data-testid="yield-toggle">
              {showYields ? "隐藏收益" : "显示收益"}
            </button>
          </div>
          {placingItem && <div className="placement-lens-banner" role="status"><span>{placingItem.icon}</span><div><b>为{placingItem.name}选择地块</b><small>绿色六角格可以建造 · 点击后在右侧确认</small></div><kbd>Esc 取消</kbd></div>}
          {growthChoosing && <div className="placement-lens-banner growth-banner" role="status"><span>＋1</span><div><b>为新人口选择开发地块</b><small>只能选择边界内、紧邻开发区的青色六角格</small></div><kbd>右侧确认</kbd></div>}
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
              <g>{tiles.filter((tile) => isArgentineTerritory(game, tile)).map((tile) => { const tileId = idFor(tile); return <polygon key={`argentina-fill-${tileId}`} points={hexGeometry(tile).points} className={`territory-fill argentina ${playerDevelopedTiles.has(tileId) ? "developed" : "fringe"}`} />; })}</g>
              {RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => { const developed = new Set([idFor(rival.capital), ...rivalEmpires[rival.id].developedTiles]); return <g key={`territory-${rival.id}`}>{rivalEmpires[rival.id].ownedTiles.map((tileId) => { const tile = posForId(tileId); return <polygon key={`${rival.id}-fill-${tileId}`} points={hexGeometry(tile).points} className={`territory-fill foreign ${developed.has(tileId) ? "developed" : "fringe"}`} style={{ fill: `${rival.color}${developed.has(tileId) ? "55" : "24"}` }} />; })}</g>; })}
            </svg>
            <svg className="territory-layer territory-edge-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
              <path d={argentinaEdgePath} className="territory-edge argentina" />
              {RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => <path key={`edge-${rival.id}`} d={rivalEdgePaths[rival.id]} className="territory-edge foreign" style={{ stroke: rival.color }} />)}
            </svg>
            {game.tradeRouteTurns > 0 && activeTradeRoutePath && <svg className="trade-route-layer" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true"><path d={activeTradeRoutePath} className="trade-route-shadow" /><path d={activeTradeRoutePath} className="trade-route" /></svg>}
            {tiles.map(({ terrain, col, row }) => {
              const pos = { col, row };
              const tileId = idFor(pos);
              const info = TERRAIN_INFO[terrain];
              const discovered = game.discovered.has(tileId);
              const visible = visibleTiles.has(tileId);
              const moveCost = movementCosts.get(tileId);
              const reachable = moveCost !== undefined;
              const selected = game.selectedTile === tileId;
              const owned = isArgentineTerritory(game, pos);
              const rival = rivalTerritoryOwnerByTile.get(tileId) ?? null;
              const foreignImprovementType = rival && rivalEmpires[rival.id].developedTiles.includes(tileId) ? automaticImprovementFor(pos) : null;
              const foreignImprovement = foreignImprovementType ? IMPROVEMENT_INFO[foreignImprovementType] : null;
              const improvement = improvementAt(game, tileId);
              const resourceId = RESOURCE_TILES[tileId] ?? null;
              const resource = resourceId ? RESOURCE_INFO[resourceId] : null;
              const placedInfo = placedProductionByTile.get(tileId) ?? null;
              const placedProductionId = placedInfo?.buildingId ?? null;
              const placedProduction = PRODUCTIONS.find((item): item is BuildingProject => item.id === placedProductionId && item.kind === "building") ?? null;
              const buildingCompleted = placedInfo ? Boolean(cityById(game, placedInfo.cityId)?.completedBuildings.includes(placedInfo.buildingId)) : false;
              const buildingUnderConstruction = Boolean(placedProduction && !buildingCompleted);
              const placementOption = placementOptions.get(tileId) ?? null;
              const placementValid = Boolean(placingItem && placementOption && !placementOption.error);
              const placementInvalid = Boolean(placingItem && placementOption?.error && discovered && owned && hexDistance(pos, managingCity.pos) <= 3);
              const placementCandidateSelected = placementCandidate === tileId;
              const placementFeatured = placementValid && placementOption!.adjacency === bestPlacementAdjacency && bestPlacementAdjacency > 0;
              const tileYield = yieldsFor(pos);
              const growthOption = growthOptions.get(tileId) ?? null;
              const growthValid = Boolean(growthChoosing && growthOption);
              const growthCandidateSelected = growthCandidate === tileId;
              const growthDim = growthChoosing && !growthValid;
              const ruralDeveloped = allRuralTiles(game).includes(tileId);
              const attackable = attackTargets.has(tileId);
              const displayYield = growthValid ? growthOption!.after : tileYield;
              const friendlyUnit = game.units.find((unit) => tileId === idFor(unit.pos));
              const foreignPatrol = visibleRivalPatrols.find((patrol) => tileId === idFor(patrol.pos)) ?? null;
              const containsUnit = friendlyUnit ? `，${UNIT_INFO[friendlyUnit.type].name}在此` : foreignPatrol ? `，${foreignPatrol.rival.name}巡逻队在此` : "";
              const yieldLabel = discovered ? `，粮食 ${tileYield.food}，生产 ${tileYield.production}，科技 ${tileYield.science}，文化 ${tileYield.culture}，金币 ${tileYield.gold}` : "";
              const tileName = placedProduction ? `${placedProduction.name}，位于${info.label}，${buildingCompleted ? "已建成" : "建造中"}` : improvement ? `${improvement.name}，位于${info.label}` : foreignImprovement && rival ? `${rival.name}${foreignImprovement.name}，位于${info.label}` : info.label;
              const placementLabel = placingItem
                ? placementValid
                  ? `，可以建造${placingItem.name}，预计总加成 ${2 + placementOption!.adjacency} ${YIELD_META[placingItem.yield].label}`
                  : `，不能建造${placingItem.name}：${placementOption?.error ?? "不可用"}`
                : "";
              return (
                <button
                  className={`hex-tile ${terrain} ${owned ? "owned" : ""} ${playerDevelopedTiles.has(tileId) ? "player-developed-core" : ""} ${rival ? "rival" : ""} ${foreignImprovement ? "foreign-developed" : ""} ${discovered ? visible ? "visible" : "surveyed" : "fog"} ${reachable ? "reachable" : ""} ${attackable ? "attackable" : ""} ${selected && !placingProduction && !growthChoosing ? "selected" : ""} ${game.footballTurns > 0 && discovered && owned ? "football-benefit" : ""} ${placedProduction ? "has-city-building" : ""} ${buildingUnderConstruction ? "construction-site" : ""} ${placementValid ? "placement-valid" : ""} ${placementInvalid ? "placement-invalid" : ""} ${placingItem && !placementValid && !placementInvalid ? "placement-dim" : ""} ${placementCandidateSelected ? "placement-candidate" : ""} ${growthChoosing ? "growth-mode" : ""} ${growthValid ? "growth-valid" : ""} ${growthDim ? "growth-dim" : ""} ${growthCandidateSelected ? "growth-candidate-selected" : ""} ${ruralDeveloped ? "rural-developed" : ""} ${newlyClaimedTile === tileId ? "newly-claimed" : ""}`}
                  key={tileId}
                  style={{ left: col * 70, top: row * 82 + (col % 2) * 41 }}
                  aria-label={`${discovered ? tileName : "未知"}地块，第 ${row + 1} 行第 ${col + 1} 列${yieldLabel}${containsUnit}${reachable ? `，可以移动，需要 ${moveCost} 点移动力` : ""}${placementLabel}`}
                  aria-selected={placementCandidateSelected || growthCandidateSelected || (!placingProduction && !growthChoosing && selected)}
                  role="gridcell"
                  data-testid={`tile-${tileId}`}
                  onClick={() => handleTileClick(pos)}
                  onMouseEnter={() => { if (placingProduction) setHoveredPlacementTile(tileId); if (growthChoosing && growthValid) setHoveredGrowthTile(tileId); }}
                  onMouseLeave={() => { if (hoveredPlacementTile === tileId) setHoveredPlacementTile(null); if (hoveredGrowthTile === tileId) setHoveredGrowthTile(null); }}
                  onFocus={() => { if (placingProduction) setHoveredPlacementTile(tileId); if (growthChoosing && growthValid) setHoveredGrowthTile(tileId); }}
                  tabIndex={(placingProduction && !placementValid) || (growthChoosing && !growthValid) ? -1 : 0}
                  disabled={aiThinking || Boolean(game.result)}
                >
                  {discovered ? placedProduction ? (
                    <span className={`city-building-art building-${placedProduction.id} ${buildingCompleted ? "completed" : "building"}`} aria-hidden="true"><i /><i /><i /><i /><b>{buildingCompleted ? placedProduction.icon : "⌁"}</b></span>
                  ) : improvement ? (
                    <span className={`improvement-art improvement-${improvement.type}`} aria-hidden="true"><i /><i /><i /><i /><b /></span>
                  ) : foreignImprovementType ? (
                    <span className={`improvement-art improvement-${foreignImprovementType} foreign-improvement-art`} aria-hidden="true"><i /><i /><i /><i /><b /></span>
                  ) : (
                    <span className={`terrain-art art-${terrain}`} aria-hidden="true"><i /><i /><i /><i /></span>
                  ) : (
                    <span className="fog-mark" aria-hidden="true">?</span>
                  )}
                  {discovered && resource && !placedProduction && <span className={`resource-badge ${resourceId}`} aria-label={resource.name}>{resource.icon}</span>}
                  {discovered && foreignImprovement && rival && <span className="foreign-development-marker" style={{ "--civ-color": rival.color } as CSSProperties} aria-hidden="true">{rival.token}</span>}
                  {discovered && (
                    <span className={`tile-yields ${showYields || Boolean(placingProduction) || growthValid ? "visible" : ""}`} aria-hidden="true">
                      {displayYield.food > 0 && <i className="food">粮<b>{displayYield.food}</b></i>}
                      {displayYield.production > 0 && <i className="production">锤<b>{displayYield.production}</b></i>}
                      {displayYield.science > 0 && <i className="science">科<b>{displayYield.science}</b></i>}
                      {displayYield.culture > 0 && <i className="culture">文<b>{displayYield.culture}</b></i>}
                      {displayYield.gold > 0 && <i className="gold">金<b>{displayYield.gold}</b></i>}
                    </span>
                  )}
                  {reachable && <span className="move-overlay" aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><i /><b>{moveCost}</b></span>}
                  {attackable && <span className="attack-overlay" aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><b>⚔</b><small>攻击</small></span>}
                  {placementValid && placingItem && <span className={`placement-overlay ${placementFeatured ? "featured" : ""} ${placementCandidateSelected ? "candidate" : ""}`} aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><b>{placementCandidateSelected ? "✓" : `+${2 + placementOption!.adjacency}${YIELD_META[placingItem.yield].symbol}`}</b><small>{placementCandidateSelected ? "已选择" : placementFeatured ? "高收益" : "可建造"}</small></span>}
                  {placementInvalid && <span className="placement-invalid-mark" aria-hidden="true">×</span>}
                  {growthValid && growthOption && <span className={`growth-overlay ${growthCandidateSelected ? "candidate" : ""}`} aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg><b>{growthCandidateSelected ? "✓" : "+1"}</b><small>{growthCandidateSelected ? "已选择" : growthOption.expands ? "扩张" : "开发"}</small></span>}
                  {ruralDeveloped && !growthChoosing && <span className="rural-marker" aria-hidden="true">●</span>}
                  {selected && !placingProduction && !growthChoosing && <span className="selection-overlay" aria-hidden="true"><svg className="hex-ring" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="25,2 75,2 98,50 75,98 25,98 2,50" /></svg></span>}
                </button>
              );
            })}

            {game.cities.map((city) => {
              const project = PRODUCTIONS.find((item) => item.id === city.activeProduction) ?? null;
              const cityProduction = Math.max(1, cityYieldTotalsFor(game, city.id).production);
              const turns = project ? Math.max(1, Math.ceil((project.cost - city.productionProgress[project.id]) / cityProduction)) : null;
              const selected = !selectedUnit && game.selectedTile === idFor(city.pos);
              return <button key={city.id} className={`map-piece capital-piece ${city.isCapital ? "" : "secondary-city-piece"} ${selected ? "capital-selected" : ""} ${placingProduction || growthChoosing ? "placement-locked" : ""}`} style={playerCityStyle(city)} aria-label={`${city.name}，阿根廷${city.isCapital ? "首都" : "城市"}，${city.population} 人口，城防 ${city.hp}/${CITY_MAX_HP}`} onClick={() => openCapitalProduction(city.id)} data-testid={city.isCapital ? "capital-city" : `city-${city.id}`} disabled={aiThinking || Boolean(placingProduction || growthChoosing)}>
                <span className="place-label"><b>{city.isCapital ? "★" : "●"}</b> {city.name} <em>{city.population}</em><small className={project ? "building" : "idle"}>锤 {project ? `${project.name} · ${turns}` : "待生产"}</small><i className="city-hp"><u style={{ width: `${city.hp / CITY_MAX_HP * 100}%` }} /></i></span>
              </button>;
            })}

            {RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => {
              const empire = rivalEmpires[rival.id];
              const yields = rivalYieldsFor(game, rival.id, empire);
              const population = empire.population;
              const selected = !selectedUnit && game.selectedTile === idFor(rival.capital);
              return <button key={`capital-${rival.id}`} className={`map-piece capital-piece foreign-city-piece ${selected ? "capital-selected" : ""} ${activeAiRival?.id === rival.id ? "ai-active" : ""} ${placingProduction || growthChoosing ? "placement-locked" : ""}`} style={{ ...rivalCityStyle(rival), "--civ-color": rival.color, "--civ-tint": rival.tint } as CSSProperties} aria-label={`${rival.capitalName}，${rival.name}首都，${population} 人口，城防 ${game.rivalCityHp[rival.id]}/${CITY_MAX_HP}；每回合食物 ${yields.food}，生产 ${yields.production}，科技 ${yields.science}，文化 ${yields.culture}`} onClick={() => { setSelectedRivalId(rival.id); if (selectedUnit) handleTileClick(rival.capital); else setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(rival.capital), message: `${rival.capitalName}：${rival.name}首都 · ${prev.wars[rival.id] === "war" ? `交战中，城防 ${prev.rivalCityHp[rival.id]}/${CITY_MAX_HP}` : "和平状态"}。` })); }} data-testid={`${rival.id}-city`} disabled={aiThinking || Boolean(placingProduction || growthChoosing)}>
                <span className="place-label"><b>◆</b> {rival.capitalName} <em>{population}</em><small>{rival.flag} {rival.name} · {game.wars[rival.id] === "war" ? "交战" : `开发 ${empire.development}`}</small><i className="city-hp"><u style={{ width: `${game.rivalCityHp[rival.id] / CITY_MAX_HP * 100}%` }} /></i></span>
              </button>;
            })}

            {game.units.map((unit) => {
              const info = UNIT_INFO[unit.type];
              const cityGarrison = game.cities.some((city) => idFor(unit.pos) === idFor(city.pos));
              const unitStyle = { left: unit.pos.col * 70 + 22, top: unit.pos.row * 82 + (unit.pos.col % 2) * 41 + (cityGarrison ? 5 : 15) };
              return <button key={unit.id} className={`map-piece unit-piece trained-unit-piece ${unit.type}-piece ${cityGarrison ? "city-garrison" : ""} ${game.selectedUnitId === unit.id ? "piece-selected" : ""} ${placingProduction || growthChoosing ? "placement-locked" : ""}`} style={unitStyle} aria-label={`${info.name}，${unit.moves} 点移动力，${unit.hp} 生命`} data-testid={unit.id === "gaucho-1" ? "gaucho-unit" : `unit-${unit.id}`} onClick={() => { setStrategyDrawerOpen(false); setGrowthDrawerOpen(false); setGame((prev) => ({ ...prev, selectedUnitId: unit.id, selectedTile: idFor(unit.pos), message: `${info.name}已选择；${unit.type === "settler" ? "可在合法陆地建立分城" : "绿色格可移动，红色格可攻击"}。` })); }} disabled={aiThinking || Boolean(placingProduction || growthChoosing)}>
                <span className={`unit-token ${unit.type}`} aria-hidden="true"><b>{info.short}</b><small>{unit.moves}</small><i><u style={{ width: `${unit.hp}%` }} /></i></span>
                <span className="unit-label">{info.name}</span>
              </button>;
            })}

            {visibleRivalPatrols.map(({ id, rival, pos, hp }) => {
              const patrolStyle = { left: pos.col * 70 + 22, top: pos.row * 82 + (pos.col % 2) * 41 + 15, "--civ-color": rival.color } as CSSProperties;
              return <button key={id} className={`map-piece rival-piece ${game.wars[rival.id] === "war" ? "at-war" : ""} ${activeAiRival?.id === rival.id ? "ai-active" : ""} ${placingProduction || growthChoosing ? "placement-locked" : ""}`} style={patrolStyle} aria-label={`${rival.name}战士，${hp} 生命`} onClick={() => { setSelectedRivalId(rival.id); if (selectedUnit) handleTileClick(pos); else setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(pos), message: `${rival.name}战士 · ${hp}/${UNIT_MAX_HP} HP · ${prev.wars[rival.id] === "war" ? "交战中" : "和平状态"}。` })); }} disabled={aiThinking || Boolean(placingProduction || growthChoosing)}>
                <span className="unit-token" aria-hidden="true"><b>{rival.token}</b><i><u style={{ width: `${hp}%` }} /></i></span>
                <span className="unit-label">{rival.name}战士</span>
              </button>;
            })}

            {game.messiRecruited && (
              <button className={`map-piece messi-piece ${placingProduction ? "placement-locked" : ""}`} style={messiStyle} aria-label="伟人莱昂内尔·梅西位于布宜诺斯艾利斯" onClick={activateMessi} disabled={aiThinking || Boolean(placingProduction)}>
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
          {aiThinking && activeAiRival && activeAiPlan && (
            <div className="ai-overlay" role="status" aria-live="polite" aria-atomic="true" style={{ "--civ-color": activeAiRival.color } as CSSProperties}>
              <span className="ai-turn-flag" aria-hidden="true">{activeAiRival.flag}</span>
              <span className="ai-turn-copy">
                <small className="ai-turn-kicker">电脑回合 {Number(aiPhaseIndex) + 1} / {RIVALS.length}</small>
                <strong className="ai-turn-civ">{activeAiRival.name} · {activeAiRival.capitalName}</strong>
                <span className="ai-turn-action">{game.message}</span>
                <span className="ai-turn-progress" aria-hidden="true">{RIVALS.map((rival, index) => <i key={`ai-progress-${rival.id}`} className={`ai-turn-dot ${index < Number(aiPhaseIndex) ? "done" : index === aiPhaseIndex ? "active" : ""}`} />)}</span>
              </span>
            </div>
          )}
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
            <div className="core-loop-shortcuts" aria-label="核心玩法快捷入口"><button onClick={() => openCapitalProduction(managingCity.id, "units")} disabled={aiThinking || Boolean(game.result)} data-testid="shortcut-settler"><b>拓</b><span>训练开拓者<small>建立分城</small></span></button><button onClick={() => openStrategy("diplomacy")} disabled={aiThinking || Boolean(game.result)} data-testid="shortcut-war"><b>⚔</b><span>外交与宣战<small>开启战斗</small></span></button></div>
            <div className="city-tabs" aria-label="城市列表">{game.cities.map((city) => <button key={city.id} className={city.id === managingCity.id ? "active" : ""} onClick={() => { setManagingCityId(city.id); setGame((prev) => ({ ...prev, selectedTile: idFor(city.pos), selectedUnitId: null, message: `正在管理${city.name}。` })); requestAnimationFrame(() => focusMapOn(city.pos)); }}><b>{city.isCapital ? "★" : "●"}</b><span>{city.name}</span><em>{city.population}</em></button>)}</div>
            <div className={`city-growth ${managingCity.growthPending > 0 ? "growth-ready" : ""}`}><span>{managingCity.growthPending > 0 ? "人口已增长" : `${managingCity.name}成长`}</span><b>{managingCity.growthPending > 0 ? `${managingCity.growthPending} 次待选择` : `${managingCity.food}/${cityGrowthTarget} 食物`}</b><i><em style={{ width: `${managingCity.growthPending > 0 ? 100 : Math.min(100, managingCity.food / cityGrowthTarget * 100)}%` }} /></i></div>
            <div className="city-growth happiness-track"><span>城市幸福度</span><b>{game.happiness}/{HAPPINESS_TARGET} · +{happinessPerTurn}</b><i><em style={{ width: `${Math.min(100, game.happiness / HAPPINESS_TARGET * 100)}%` }} /></i></div>
            <div className="city-management-actions"><button onClick={openGrowth} className={managingCity.growthPending > 0 ? "attention" : ""} data-testid="manage-growth">{managingCity.growthPending > 0 ? "选择成长地块！" : "城市成长"}</button><button onClick={() => openStrategy("happiness")} className={game.celebrationPending ? "attention" : ""} data-testid="open-happiness">{game.celebrationPending ? "选择庆典！" : "幸福与庆典"}</button></div>
            {developedResources.length > 0 && <div className="developed-resources"><small>已开发资源</small>{developedResources.map((resource, index) => <span key={`${resource.name}-${index}`}><b>{resource.icon}</b>{resource.name}</span>)}</div>}
            <button className={`city-production-summary ${activeProduction ? "active" : "idle"}`} onClick={() => openCapitalProduction()} disabled={aiThinking || Boolean(game.result) || managingCity.growthPending > 0} data-testid="open-production-picker">
              <span className="production-summary-icon" aria-hidden="true">⚒</span>
              <span className="production-summary-copy"><small>{managingCity.name} · +{productionPerTurn} 锤/回合</small><strong>{activeProduction?.name ?? (hasAvailableProduction ? "待安排生产" : "全部项目已完成")}</strong>{activeProduction && <i><em style={{ width: `${productionPercent}%` }} /></i>}</span>
              <b>{activeProduction ? `${productionTurnsRemaining} 回合` : hasAvailableProduction ? "安排 ›" : "完成 ✓"}</b>
            </button>
            {managingCity.completedBuildings.length > 0 && <div className="completed-buildings" aria-label="已建成建筑">{managingCity.completedBuildings.map((id) => <span key={id}>{PRODUCTIONS.find((item) => item.id === id)?.name}</span>)}</div>}
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
              <div><div className="card-kicker">已知世界 · 六个文明</div><small>已探索 {revealedCount}/{COLS * ROWS} 个地块</small></div>
              <b>{worldLeader.name}领先 {game.rivalInfluence[worldLeader.id]}/100</b>
            </div>
            <div className="influence-track" role="progressbar" aria-label={`${worldLeader.name}地区影响力`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, game.rivalInfluence[worldLeader.id])}><i style={{ width: `${Math.min(100, game.rivalInfluence[worldLeader.id])}%` }} /></div>
            <div className="strategic-mini-map" style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}>
              <svg viewBox={`-4 -4 ${BOARD_WIDTH + 8} ${BOARD_HEIGHT + 8}`} role="img" aria-label={`世界小地图：已探索 ${revealedCount} 个地块；显示六个文明首都、${game.units.length} 支阿根廷单位和当前可见的外国巡逻队`}>
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
                <path d={argentinaEdgePath} className="mini-territory-edge argentina" />
                {RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => <path key={`mini-edge-${rival.id}`} d={rivalEdgePaths[rival.id]} className="mini-territory-edge foreign" style={{ stroke: rival.color }} />)}
                {selectedMiniGeometry && <polygon points={selectedMiniGeometry.points} className="mini-selected" />}
                {game.cities.map((city) => { const geometry = hexGeometry(city.pos); return <g key={`mini-city-${city.id}`} className="mini-token mini-city-token" transform={`translate(${geometry.cx} ${geometry.cy})`}><circle r={city.isCapital ? 29 : 24} /><text textAnchor="middle" dominantBaseline="central">{city.isCapital ? "★" : "●"}</text></g>; })}
                {RIVALS.filter((rival) => !game.defeatedRivals.includes(rival.id)).map((rival) => { const geometry = hexGeometry(rival.capital); return <g key={`mini-capital-${rival.id}`} className={`mini-token mini-foreign-city-token ${activeAiRival?.id === rival.id ? "ai-active" : ""}`} transform={`translate(${geometry.cx} ${geometry.cy})`}><circle className="mini-rival-halo" r={selectedRivalId === rival.id || activeAiRival?.id === rival.id ? 38 : 0} style={{ stroke: rival.color }} /><circle r="27" style={{ fill: rival.color }} /><text textAnchor="middle" dominantBaseline="central">{rival.token}</text></g>; })}
                {game.units.map((unit) => { const geometry = hexGeometry(unit.pos); return <g key={`mini-unit-${unit.id}`} className="mini-token mini-unit-token" transform={`translate(${geometry.cx} ${geometry.cy})`}><circle r="24" /><text textAnchor="middle" dominantBaseline="central">{UNIT_INFO[unit.type].short}</text></g>; })}
                {visibleRivalPatrols.map(({ id, rival, pos }) => { const geometry = hexGeometry(pos); return <g key={`mini-patrol-${id}`} className="mini-token mini-rival-token" transform={`translate(${geometry.cx} ${geometry.cy})`}><circle r="23" style={{ fill: rival.color }} /><text textAnchor="middle" dominantBaseline="central">{rival.token}</text></g>; })}
              </svg>
            </div>
            <div className="mini-map-legend" aria-hidden="true"><span><i className="argentina" />阿根廷领土</span><span><i className="foreign" />外国领土</span><span><i className="surveyed" />已探索</span><span><i className="fog" />未探索</span></div>
            <div className="world-ranking" aria-label="六个文明每回合总产出列表">
              <button className={citySelected ? "selected" : ""} style={{ "--civ-color": "#2b78cf", "--civ-tint": "#dceaf7" } as CSSProperties} onClick={() => { setManagingCityId(capital.id); setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(capital.pos), message: `已选择阿根廷；${prev.cities.length} 座城市的总产出显示在这里。` })); focusMapOn(capital.pos); }} disabled={aiThinking}>
                <span className="world-civ"><b>🇦🇷</b><i><strong>阿根廷</strong><small>我国 · {game.cities.length} 座城市 · 人口 {totalPopulation(game)}</small></i></span>
                <span className="world-yields"><i className="food">粮 {cityYields.food}</i><i className="production">锤 {cityYields.production}</i><i className="science">科 {sciencePerTurn}</i><i className="culture">文 {culturePerTurn}</i></span>
              </button>
              {RIVALS.map((rival) => { const empire = rivalEmpires[rival.id]; const yields = rivalYieldsFor(game, rival.id, empire); const relation = game.rivalRelationships[rival.id]; return <button key={`rank-${rival.id}`} className={`${!citySelected && selectedRivalId === rival.id ? "selected" : ""} ${activeAiRival?.id === rival.id ? "ai-active" : ""}`} style={{ "--civ-color": rival.color, "--civ-tint": rival.tint } as CSSProperties} onClick={() => { setSelectedRivalId(rival.id); setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(rival.capital), message: `已选择${rival.name}：${rival.agenda}。` })); }} disabled={aiThinking}>
                <span className="world-civ"><b>{rival.flag}</b><i><strong>{rival.name}</strong><small>人口 {empire.population} · 开发 {empire.development} · {relationshipLabelFor(relation)} {relation}</small></i></span>
                <span className="world-yields"><i className="food">粮 {yields.food}</i><i className="production">锤 {yields.production}</i><i className="science">科 {yields.science}</i><i className="culture">文 {yields.culture}</i></span>
              </button>; })}
            </div>
            <div className="world-card-actions"><button className="locate-rival" onClick={() => { setGame((prev) => ({ ...prev, selectedUnitId: null, selectedTile: idFor(selectedRival.capital), message: `已定位${selectedRival.name}首都；距离我国首都 ${hexDistance(CITY_POS, selectedRival.capital)} 格。` })); focusMapOn(selectedRival.capital); }} disabled={aiThinking || Boolean(placingProduction)} data-testid="locate-rival">⌖ 定位</button><button className="locate-rival diplomacy-open" onClick={() => openStrategy("diplomacy")} disabled={aiThinking || Boolean(placingProduction)} data-testid="open-diplomacy">◇ 外交</button></div>
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

      <div className={`action-dock ${citySelected ? "city-mode" : ""} ${foreignCitySelected ? "foreign-mode" : ""} ${placingProduction || growthChoosing ? "placement-hidden" : ""}`} role="region" aria-label={citySelected ? "首都生产操作" : foreignCitySelected ? `${selectedForeignCiv?.name}文明情报` : "选中单位操作"}>
        <div className="selected-unit">
          <span className="unit-portrait" aria-hidden="true">{selectedUnitInfo?.short ?? (citySelected ? "★" : foreignCitySelected ? selectedForeignCiv?.token : selectedKnown ? "⌖" : "?")}</span>
          <div className="selected-copy"><small>{selectedUnit ? "● 单位已选择" : citySelected ? `● ${selectedPlayerCity?.isCapital ? "首都" : "城市"}已选择` : foreignCitySelected ? "● 外国首都已选择" : selectedKnown ? "当前地块" : "● 未知区域"}</small><strong>{selectedUnitInfo?.name ?? (citySelected ? selectedPlayerCity?.name : foreignCitySelected ? selectedForeignCiv?.capitalName : selectedKnown ? selectedImprovement?.name ?? selectedResource?.name ?? TERRAIN_INFO[selectedTerrain].label : "战争迷雾")}</strong>{selectedUnit && <span className="movement-pips" aria-label={`${selectedUnit.moves} / ${maxMoves} 移动力`}>{Array.from({ length: maxMoves }, (_, index) => <i className={index < selectedUnit.moves ? "available" : "spent"} key={index} />)}<b>{selectedUnit.moves}/{maxMoves}</b></span>}<span>{selectedUnit ? `${selectedUnit.hp}/${UNIT_MAX_HP} HP · ${selectedUnit.moves > 0 ? selectedUnit.type === "settler" ? "移动到合法地点后建立城市" : "绿色格移动，红色格攻击" : "本回合行动力已用完"}` : citySelected ? `人口 ${selectedPlayerCity?.population} · 城防 ${selectedPlayerCity?.hp}/${CITY_MAX_HP}` : foreignCitySelected ? `${selectedForeignCiv?.name}人口 ${foreignPopulation} · ${game.wars[selectedForeignCiv!.id] === "war" ? "交战中" : "和平"}` : selectedKnown ? "点击单位或城市下达命令" : "派侦察单位靠近以获取情报"}</span></div>
        </div>
        {citySelected ? (
          <div className="city-production-dock">
            <div className="dock-production-copy"><small>当前生产 · 建筑或单位</small><strong>{activeProduction?.name ?? "尚未安排生产"}</strong><span>{activeProduction ? `${activeProductionProgress}/${activeProduction.cost} 锤 · 预计 ${productionTurnsRemaining} 回合` : "选择建筑选址，或训练一个会自动部署的单位"}</span>{activeProduction && <i><em style={{ width: `${productionPercent}%` }} /></i>}</div>
            <button onClick={() => openCapitalProduction()} disabled={aiThinking || !hasAvailableProduction} data-testid="dock-production-button"><b>⚒</b><span>{activeProduction ? "更换生产" : hasAvailableProduction ? "选择生产" : "建设完成"}</span></button>
          </div>
        ) : foreignCitySelected && selectedForeignCiv && foreignYields ? (
          <div className="foreign-city-dock" aria-label={`${selectedForeignCiv.name}文明每回合总产出`}>
            <div><small>{selectedForeignCiv.leader} · {selectedForeignCiv.agenda}</small><strong>{selectedForeignCiv.name}每回合总产出</strong></div>
            <span className="food">粮 <b>+{foreignYields.food}</b></span><span className="production">锤 <b>+{foreignYields.production}</b></span><span className="science">科 <b>+{foreignYields.science}</b></span><span className="culture">文 <b>+{foreignYields.culture}</b></span>
          </div>
        ) : (
          <div className="action-buttons">
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={() => setGame((prev) => ({ ...prev, message: "请选择带白色落点的绿色六角格；数字表示需要的移动力。" }))}><b>⌖</b><span>移动</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleExplore} data-testid="explore-action"><b>◉</b><span>侦察</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleWait}><b>⚑</b><span>驻扎</span></button>
            <button disabled={!selectedUnit || selectedUnit.moves <= 0 || aiThinking} onClick={handleWait}><b>↶</b><span>休整</span></button>
            {selectedUnit?.type === "settler" && <button className="found-city-action" disabled={Boolean(settlementError(game, selectedUnit.pos, selectedUnit.id)) || aiThinking} onClick={handleFoundCity} data-testid="found-city"><b>★</b><span>建立城市</span></button>}
          </div>
        )}
      </div>

      {pendingDecision && !aiThinking && !game.result && !productionDrawerOpen && !strategyDrawerOpen && !growthDrawerOpen && !techPickerOpen && <button className="decision-prompt" onClick={handlePrimaryDecision} data-testid="primary-decision"><span>需要决定</span><div><strong>{pendingDecision.label}</strong><small>{pendingDecision.detail}</small></div><b>›</b></button>}
      <button className="end-turn-button" onClick={requestEndTurn} disabled={aiThinking || Boolean(game.result) || Boolean(placingProduction) || productionDrawerOpen || strategyDrawerOpen || growthDrawerOpen || techPickerOpen} data-testid="end-turn"><span>{aiThinking ? "世界行动中" : game.pendingEvent ? "先决定故事" : totalGrowthPending > 0 ? "先选择成长" : game.celebrationPending ? "先选择庆典" : placingProduction ? "请选择地块" : "结束回合"}</span><small>{game.pendingEvent || totalGrowthPending > 0 || game.celebrationPending ? "!" : "Enter"}</small></button>

      <div className="event-toast" role={aiThinking ? "presentation" : "status"} aria-live={aiThinking ? "off" : "polite"}>{game.message}</div>

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

      <aside className={`narrative-drawer ${activeNarrativeEvent ? "open" : ""}`} role="dialog" aria-modal="false" aria-labelledby="narrative-title" aria-hidden={!activeNarrativeEvent}>
        {activeNarrativeEvent && <>
          <header className="narrative-header"><span>✺</span><div><small>{activeNarrativeEvent.kicker}</small><h2 id="narrative-title">{activeNarrativeEvent.title}</h2></div></header>
          <div className="narrative-illustration" aria-hidden="true"><i /><i /><i /><b>文明的道路<br />由选择写成</b></div>
          <p className="narrative-copy">{activeNarrativeEvent.text}</p>
          <div className="narrative-choices">
            {activeNarrativeEvent.choices.map((choice, index) => <button key={choice.id} onClick={() => handleNarrativeChoice(choice.id)} data-testid={`narrative-choice-${choice.id}`}><span>{index + 1}</span><div><strong>{choice.label}</strong><p>{choice.detail}</p><small>{choice.reward}</small></div><b>›</b></button>)}
          </div>
          <footer><span>没有错误答案</span><p>选择会进入帝国日志，并可能改变其他文明对你的看法。</p></footer>
        </>}
      </aside>

      <aside className={`production-drawer ${productionDrawerOpen ? "open" : ""} ${placingItem ? "placing" : ""}`} role="dialog" aria-modal="false" aria-labelledby="production-title" aria-hidden={!productionDrawerOpen}>
        <header className="production-drawer-header">
          {placingItem && <button className="drawer-back" onClick={() => cancelProductionPlacement(true)} aria-label="返回生产列表">‹</button>}
          <div><span>{placingItem ? "建筑选址" : "城市生产"}</span><h2 id="production-title">{placingItem ? placingItem.name : managingCity.name}</h2><p>{placingItem ? placingItem.placementRule : `每回合 +${productionPerTurn} 锤 · 人口 ${managingCity.population}`}</p></div>
          <button className="drawer-close" onClick={closeProductionDrawer} aria-label="关闭生产面板">×</button>
        </header>

        {!placingItem && <div className="production-section-tabs" role="tablist" aria-label="生产分类"><button className={productionCategory === "buildings" ? "active" : ""} role="tab" aria-selected={productionCategory === "buildings"} onClick={() => setProductionCategory("buildings")} data-testid="production-tab-buildings">▦ 建筑与城区</button><button className={productionCategory === "units" ? "active" : ""} role="tab" aria-selected={productionCategory === "units"} onClick={() => setProductionCategory("units")} data-testid="production-tab-units">⚑ 单位</button></div>}

        {!placingItem && activeProduction && (
          <section className="active-production-card" aria-label="当前生产">
            <span className="active-project-icon">{activeProduction.icon}</span>
            <div><small>当前生产</small><strong>{activeProduction.name}</strong><p>{managingCity.productionProgress[activeProduction.id]}/{activeProduction.cost} 锤 · {productionTurnsRemaining} 回合</p><i><b style={{ width: `${productionPercent}%` }} /></i></div>
            <em>{activeProduction.kind === "building" ? managingCity.buildingPlacements[activeProduction.id] ? "已落位" : "待选址" : "完成后自动部署"}</em>
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
            <div className="production-category-heading"><div><span>▾</span><strong>{productionCategory === "buildings" ? "建筑与城区" : "训练单位"}</strong></div><small>{productionCategory === "buildings" ? `${PRODUCTIONS.filter((item) => item.kind === "building").length - managingCity.completedBuildings.length} 项未完成` : `${PRODUCTIONS.filter((item) => item.kind === "unit").length} 项可重复训练`}</small></div>
            <section className={`production-list-section ${productionCategory}`}>
            <div className="production-list">
              {PRODUCTIONS.filter((production) => productionCategory === "buildings" ? production.kind === "building" : production.kind === "unit").map((production) => {
                const done = production.kind === "building" && managingCity.completedBuildings.includes(production.id);
                const active = managingCity.activeProduction === production.id;
                const progress = managingCity.productionProgress[production.id];
                const turns = Math.max(1, Math.ceil((production.cost - progress) / productionPerTurn));
                const adjacency = production.kind === "building" ? bestAvailableAdjacency(game, managingCity.id, production.id) : null;
                const placed = production.kind === "building" && Boolean(managingCity.buildingPlacements[production.id]);
                return <button key={production.id} disabled={done} className={`production-list-item ${production.kind === "unit" ? "unit-production" : ""} ${active ? "active" : ""}`} onClick={() => chooseProduction(production.id)} data-testid={`production-${production.id}`}><span className={`project-yield ${production.kind === "unit" ? "unit" : production.yield}`}>{production.icon}</span><div className="production-item-copy"><em>{production.category}</em><h3>{production.name}</h3><p>{production.effect}{adjacency !== null ? ` · 最高相邻 +${adjacency}` : ""}</p>{progress > 0 && !done && <i><b style={{ width: `${Math.min(100, progress / production.cost * 100)}%` }} /></i>}<small>{done ? "已建成" : production.kind === "unit" ? `完成后从${managingCity.name}旁自动部署` : placed ? "已落位 · 可继续建造" : production.placementRule}</small></div><div className="production-item-cost"><strong>{done ? "✓" : turns}</strong><span>{done ? "完成" : "回合"}</span><small>{production.cost} 锤</small></div></button>;
              })}
            </div>
            </section>
            <button className="production-skip" onClick={() => { setProductionReminderBypassed(true); setProductionDrawerOpen(false); setGame((prev) => ({ ...prev, message: "本回合暂不生产；再次点击结束回合即可继续。" })); }}>本回合暂不生产</button>
          </div>
        )}
      </aside>

      <aside className={`growth-drawer ${growthDrawerOpen ? "open" : ""}`} role="dialog" aria-modal="false" aria-labelledby="growth-title" aria-hidden={!growthDrawerOpen}>
        <header className="growth-drawer-header"><div><span>城市成长 · 粮食驱动</span><h2 id="growth-title">{managingCity.growthPending > 0 ? `${managingCity.name} · 人口 +1` : `${managingCity.name}成长`}</h2><p>{managingCity.growthPending > 0 ? "开发一格后，政治边界自动覆盖它外围的一圈。" : "开发区块决定城市边界；成长槽满后直接开发地块。"}</p></div><button className="drawer-close" onClick={() => { setGrowthDrawerOpen(false); setGrowthCandidate(null); }} aria-label="关闭城市成长">×</button></header>
        <div className="growth-drawer-body">
          <section className={`growth-hero-card ${managingCity.growthPending > 0 ? "ready" : ""}`}><div className="growth-pop-change"><span>{managingCity.population}</span><i>→</i><strong>{managingCity.population + (managingCity.growthPending > 0 ? 1 : 0)}</strong><small>人口</small></div><div className="growth-hero-copy"><small>{managingCity.growthPending > 0 ? `待分配 ${managingCity.growthPending} 次成长` : "下一次成长"}</small><strong>{managingCity.growthPending > 0 ? "选择一个青色六角格" : `还需 ${Math.max(0, cityGrowthTarget - managingCity.food)} 食物`}</strong><i><b style={{ width: `${managingCity.growthPending > 0 ? 100 : Math.min(100, managingCity.food / cityGrowthTarget * 100)}%` }} /></i><p>{managingCity.name}开发核心 {cityDevelopedTileIds(managingCity).length} 格 · 全国边界 {game.ownedTiles.length} 格</p></div></section>
          {managingCity.growthPending > 0 ? <>
            <div className="growth-steps"><span className="done">1 粮食槽满</span><i /><span className={growthCandidate ? "done" : "active"}>2 选择地块</span><i /><span className={growthCandidate ? "active" : ""}>3 确认</span></div>
            <p className="growth-instruction">青色格属于当前边界，并且紧邻已有开发区；设施由地形和资源自动匹配。</p>
            <section className="growth-recommendations"><header><strong>总督建议</strong><span>{growthOptions.size} 格可选</span></header>{recommendedGrowthOptions.map(([tileId, option], index) => { const pos = posForId(tileId); return <button key={tileId} className={growthCandidate === tileId ? "active" : ""} onClick={() => { setGrowthCandidate(tileId); setGame((prev) => ({ ...prev, selectedTile: tileId, selectedUnitId: null, message: `已选择${IMPROVEMENT_INFO[option.improvement].name}方案。` })); focusMapOn(pos); }} data-testid={`growth-option-${tileId}`}><b>{index + 1}</b><div><strong>{RESOURCE_TILES[tileId] ? RESOURCE_INFO[RESOURCE_TILES[tileId]].name : TERRAIN_INFO[terrainAt(pos)].label}</strong><small>{option.borderGain > 0 ? `边界 +${option.borderGain}` : "填充核心"} · {IMPROVEMENT_INFO[option.improvement].name}</small></div><span>粮{option.after.food} 锤{option.after.production}<br />科{option.after.science} 文{option.after.culture} 金{option.after.gold}</span></button>; })}</section>
            <section className={`growth-tile-preview ${growthPreviewOption ? "selected" : "empty"}`}>{growthPreviewOption && growthPreviewPos ? <><header><div><small>{growthPreviewOption.borderGain > 0 ? `开发后边界 +${growthPreviewOption.borderGain} 格` : "填充现有开发区"}</small><strong>{growthPreviewResource?.name ?? TERRAIN_INFO[terrainAt(growthPreviewPos)].label}</strong></div><b>{IMPROVEMENT_INFO[growthPreviewOption.improvement].name}</b></header><div className="growth-yield-compare"><span>自然：粮{growthPreviewOption.before.food} 锤{growthPreviewOption.before.production} 科{growthPreviewOption.before.science} 文{growthPreviewOption.before.culture} 金{growthPreviewOption.before.gold}</span><i>→</i><strong>开发：粮{growthPreviewOption.after.food} 锤{growthPreviewOption.after.production} 科{growthPreviewOption.after.science} 文{growthPreviewOption.after.culture} 金{growthPreviewOption.after.gold}</strong></div></> : <div className="growth-preview-empty"><span>⬡</span><strong>在地图或建议中选择一格</strong><p>确认前会显示产出与边界变化。</p></div>}</section>
            <div className="growth-actions"><button onClick={() => setGrowthCandidate(null)}>重新选择</button><button className="confirm" onClick={confirmGrowthSelection} disabled={!growthCandidate} data-testid="confirm-growth">{growthCandidate ? "确认开发并外推边界" : "请先选择地块"}</button></div>
          </> : <div className="growth-rule-list"><p><b>1</b><span><strong>粮食推动成长</strong>成长槽满后获得人口。</span></p><p><b>2</b><span><strong>选择边界内相邻格</strong>开发核心必须连续。</span></p><p><b>3</b><span><strong>边界自动外推一圈</strong>农场、矿山或城区都会成为新核心。</span></p></div>}
        </div>
      </aside>

      <aside className={`strategy-drawer ${strategyDrawerOpen ? "open" : ""}`} role="dialog" aria-modal="false" aria-labelledby="strategy-title" aria-hidden={!strategyDrawerOpen}>
        <header className="strategy-header">
          <div><span>帝国管理</span><h2 id="strategy-title">{strategyTab === "civics" ? "市政与政策" : strategyTab === "diplomacy" ? "阿根廷外交部" : "幸福与庆典"}</h2><p>{strategyTab === "civics" ? "文化推进市政，完成后将一张政策装入政府槽位。" : strategyTab === "diplomacy" ? "影响力是每回合积累、用于国际行动的外交货币。" : "幸福度达到上限后，选择一种持续四回合的庆典。"}</p></div>
          <button className="drawer-close" onClick={() => setStrategyDrawerOpen(false)} aria-label="关闭帝国管理">×</button>
        </header>
        <div className="strategy-tabs" role="tablist" aria-label="帝国管理分类">
          <button className={strategyTab === "civics" ? "active" : ""} role="tab" aria-selected={strategyTab === "civics"} onClick={() => setStrategyTab("civics")}><b>⚖</b><span>市政</span></button>
          <button className={strategyTab === "diplomacy" ? "active" : ""} role="tab" aria-selected={strategyTab === "diplomacy"} onClick={() => setStrategyTab("diplomacy")}><b>◇</b><span>外交</span></button>
          <button className={strategyTab === "happiness" ? "active" : ""} role="tab" aria-selected={strategyTab === "happiness"} onClick={() => setStrategyTab("happiness")}><b>☀</b><span>幸福</span></button>
        </div>

        {strategyTab === "civics" && <section className="strategy-panel" role="tabpanel">
          <div className="strategy-summary"><div><small>文化积累</small><strong>{game.civicProgress}</strong><em>+{culturePerTurn}/回合</em></div><div><small>已完成市政</small><strong>{game.completedCivics.length}/{CIVICS.length}</strong><em>逐项解锁</em></div><div><small>政策槽</small><strong>1</strong><em>{game.activePolicy ? "已采用" : "空置"}</em></div></div>
          <h3>市政树</h3>
          <div className="civic-tree">
            {CIVICS.map((civic) => {
              const done = game.completedCivics.includes(civic.id);
              const active = game.activeCivic === civic.id;
              const percent = active ? Math.min(100, game.civicProgress / civic.cost * 100) : done ? 100 : 0;
              return <button className={`civic-node ${done ? "done" : ""} ${active ? "active" : ""}`} key={civic.id} disabled={done || aiThinking} onClick={() => chooseCivic(civic.id)}><small>{civic.icon} {civic.cost} 文化</small><h4>{civic.name}</h4><p>{civic.effect}</p><i className="mini-progress"><span style={{ width: `${percent}%` }} /></i></button>;
            })}
          </div>
          <h3>共和国政策槽</h3>
          <div className="policy-grid">
            {(Object.keys(POLICIES) as PolicyId[]).map((policyId) => {
              const policy = POLICIES[policyId];
              const unlocked = game.completedCivics.includes(policy.unlockedBy);
              const active = game.activePolicy === policyId;
              return <button className={`policy-card ${active ? "slotted" : ""}`} aria-pressed={active} key={policyId} disabled={!unlocked || aiThinking} onClick={() => slotPolicy(active ? null : policyId)}><small>{policy.icon} {policy.category}</small><h4>{policy.name}</h4><p>{policy.effect}</p><b>{unlocked ? active ? "点击卸下" : "点击采用" : `完成${CIVICS.find((civic) => civic.id === policy.unlockedBy)?.name}解锁`}</b></button>;
            })}
          </div>
        </section>}

        {strategyTab === "diplomacy" && <section className="strategy-panel" role="tabpanel">
          <div className="diplomacy-civ-tabs" aria-label="选择外交对象">{RIVALS.map((rival) => <button key={`diplomacy-${rival.id}`} className={selectedRivalId === rival.id ? "active" : ""} style={{ "--civ-color": rival.color } as CSSProperties} onClick={() => setSelectedRivalId(rival.id)}><span>{rival.flag}</span><small>{rival.name}</small></button>)}</div>
          <div className="diplomacy-hero" style={{ "--civ-color": selectedRival.color } as CSSProperties}><span className="leader-medallion">{selectedRival.token}</span><div><small>{selectedRival.leader} · {selectedRival.name}</small><h3>{game.defeatedRivals.includes(selectedRivalId) ? "已退出时代" : game.wars[selectedRivalId] === "war" ? "交战中" : relationshipLabel}</h3><p>首都{selectedRival.capitalName} · 距离 {hexDistance(capital.pos, selectedRival.capital)} 格</p></div><b>{game.wars[selectedRivalId] === "war" ? `城防 ${game.rivalCityHp[selectedRivalId]}` : `影响力 ${game.influence}`}</b></div>
          <div className="leader-agenda"><span>领袖议程</span><div><strong>{selectedRival.agenda}</strong><p>{selectedRival.agendaDetail}</p></div><b>{agendaRelationDelta(game, selectedRivalId) > 0 ? "+1/回合" : "未满足"}</b></div>
          <div className="relationship-meter"><header><span>双边关系</span><strong>{selectedRelationship}/100 · {relationshipLabel}</strong></header><i><span style={{ width: `${selectedRelationship}%`, background: selectedRival.color }} /></i><footer><span>敌对</span><span>中立</span><span>互助</span></footer></div>
          <div className="strategy-summary"><div><small>我国影响力</small><strong>{game.influence}</strong><em>+{influencePerTurn}/回合</em></div><div><small>{selectedRival.name}地区影响</small><strong>{game.rivalInfluence[selectedRivalId]}/100</strong><em>达到 100 将失败</em></div><div><small>贸易路线</small><strong>{game.tradePartner === selectedRivalId ? game.tradeRouteTurns : "—"}</strong><em>{game.tradePartner === selectedRivalId ? `输入${RESOURCE_INFO[selectedRival.resource].name}` : game.tradePartner ? `正与${RIVAL_BY_ID[game.tradePartner].name}贸易` : "尚未建立"}</em></div></div>
          <h3>外交行动</h3>
          <div className="diplomatic-actions">
            <button className={`action-card ${game.tradePartner === selectedRivalId && game.tradeRouteTurns > 0 ? "active" : ""}`} disabled={aiThinking || game.wars[selectedRivalId] === "war" || game.influence < 12 || selectedRelationship < 40 || game.tradeRouteTurns > 0 || game.sanctionTurns > 0} onClick={() => handleDiplomaticAction("trade")} data-testid="diplomacy-trade"><span className="action-icon">⇄</span><div><h4>建立贸易路线</h4><p>6 回合金币 +4、科技 +1，并复制{RESOURCE_INFO[selectedRival.resource].name}资源加成。</p></div><b className="action-cost">◇12</b></button>
            <button className={`action-card ${game.researchPartner === selectedRivalId && game.researchCollaborationTurns > 0 ? "active" : ""}`} disabled={aiThinking || game.wars[selectedRivalId] === "war" || game.influence < 18 || selectedRelationship < 55 || game.researchCollaborationTurns > 0 || game.sanctionTurns > 0} onClick={() => handleDiplomaticAction("research")} data-testid="diplomacy-research"><span className="action-icon">◆</span><div><h4>联合研究</h4><p>需要友好关系；4 回合科技 +2，关系逐回合改善。</p></div><b className="action-cost">◇18</b></button>
            <button className={`action-card ${game.sanctionedRival === selectedRivalId && game.sanctionTurns > 0 ? "active" : ""}`} disabled={aiThinking || game.influence < 15 || game.sanctionTurns > 0 || game.tradeRouteTurns > 0 || game.researchCollaborationTurns > 0} onClick={() => handleDiplomaticAction("sanction")} data-testid="diplomacy-sanction"><span className="action-icon">!</span><div><h4>公开谴责</h4><p>3 回合压低{selectedRival.name}影响力增长，但显著恶化关系。</p></div><b className="action-cost">◇15</b></button>
            <button className={`action-card war-action ${game.wars[selectedRivalId] === "war" ? "active" : ""}`} disabled={aiThinking || game.wars[selectedRivalId] === "war" || game.defeatedRivals.includes(selectedRivalId)} onClick={() => handleDiplomaticAction("war")} data-testid="diplomacy-war"><span className="action-icon">⚔</span><div><h4>{game.wars[selectedRivalId] === "war" ? "战争进行中" : `向${selectedRival.name}宣战`}</h4><p>宣战后双方单位可交战；电脑军队会寻路攻击单位与城市。</p></div><b className="action-cost">{game.wars[selectedRivalId] === "war" ? "战争" : "宣战"}</b></button>
          </div>
        </section>}

        {strategyTab === "happiness" && <section className="strategy-panel" role="tabpanel">
          <div className="happiness-hero"><div className="happiness-ring" style={{ "--happiness": `${Math.min(100, game.happiness / HAPPINESS_TARGET * 100)}%` } as CSSProperties}><div><strong>{game.happiness}</strong><small>/ {HAPPINESS_TARGET}</small></div></div><div><h3>{game.celebrationPending ? "人民期待一场庆典" : game.celebration ? CELEBRATIONS[game.celebration].name : "城市安居乐业"}</h3><p>建筑、外交与贸易提高每回合幸福度；人口压力会降低增长。幸福过低时城市总产出下降。</p><b>{game.celebration ? `奖励剩余 ${game.celebrationTurns} 回合` : `每回合 +${happinessPerTurn}`}</b></div></div>
          <div className="strategy-summary"><div><small>建筑贡献</small><strong>+{allCompletedBuildings(game).length}</strong><em>每座建筑 +1</em></div><div><small>外交与贸易</small><strong>+{(game.tradeRouteTurns > 0 ? 2 : 0) + (Math.max(...Object.values(game.rivalRelationships)) >= 65 ? 1 : 0)}</strong><em>稳定关系有益</em></div><div><small>人口压力</small><strong>-{Math.max(0, totalPopulation(game) - 4)}</strong><em>5 人口后增加</em></div></div>
          <h3>{game.celebrationPending ? "选择本次庆典" : "庆典奖励"}</h3>
          <div className="celebration-grid">
            {(Object.keys(CELEBRATIONS) as CelebrationId[]).map((celebrationId) => {
              const celebration = CELEBRATIONS[celebrationId];
              const active = game.celebration === celebrationId && game.celebrationTurns > 0;
              return <button className={`celebration-card ${active ? "active" : ""}`} aria-pressed={active} key={celebrationId} disabled={!game.celebrationPending || aiThinking} onClick={() => chooseCelebration(celebrationId)}><span className="celebration-icon">{celebration.icon}</span><h4>{celebration.name}</h4><p>{celebration.effect}</p><b>{active ? `${game.celebrationTurns} 回合` : game.celebrationPending ? "选择" : "幸福度满后可选"}</b></button>;
            })}
          </div>
        </section>}
      </aside>

      {game.result && (
        <div className="modal-backdrop result-backdrop">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <span className="result-emblem">{game.result === "win" ? "✺" : "◒"}</span>
            <div className="card-kicker">{game.result === "win" ? "历史性胜利" : "时代落幕"}</div>
            <h2 id="result-title">{game.result === "win" ? game.resultReason === "conquest" ? "阿根廷赢得征服胜利" : "阿根廷迎来文明曙光" : game.resultReason === "conquest" ? "阿根廷失去了最后一座城市" : `${worldLeader.name}赢得地区影响力`}</h2>
            <p>{game.result === "win" ? game.resultReason === "conquest" ? "五个对手的首都已经陷落，阿根廷军队结束了曙光时代的战争。" : "多座城市共同推动科技、文化、经济与探索，照亮新时代。" : game.resultReason === "conquest" ? "电脑军队攻破了所有阿根廷城市；利用城防、单位与分城重新组织战线。" : "重新规划探索、发展与外交节奏，再次带领阿根廷出发。"}</p>
            <button onClick={resetGame}>重新开始</button>
          </section>
        </div>
      )}
    </main>
  );
}
