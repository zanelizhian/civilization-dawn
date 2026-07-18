import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";

const source = `${readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")}
export {
  createInitialState,
  makeLocalSave,
  readLocalSave,
  deriveRivalEmpires,
  improvementTypeAt,
  hexDistance,
  CITY_POS,
  RIVALS,
  COLS,
  ROWS,
  territoryFromDeveloped,
  playerDevelopedTileIds,
  playerOwnedTilesForCities,
  settlementError,
  foundCity,
  skipCityGrowth,
  planUnitMovement,
  resolvePlayerMovement,
  resolvePlayerEconomyRound,
  declareWar,
  resolvePlayerAttack,
  advanceRivalMilitaryPhase,
  advanceRivalProduction,
  PRODUCTIONS,
  RIVAL_UNIT_COST,
  UNIT_MAX_HP,
  terrainAt,
  neighbors,
};`;

const bundled = await build({
  stdin: { contents: source, loader: "tsx", resolveDir: new URL("..", import.meta.url).pathname, sourcefile: "page.logic-test.tsx" },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  logLevel: "silent",
});
const runtimeModule = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), runtimeModule, runtimeModule.exports);
const {
  createInitialState,
  makeLocalSave,
  readLocalSave,
  deriveRivalEmpires,
  improvementTypeAt,
  hexDistance,
  CITY_POS,
  RIVALS,
  COLS,
  ROWS,
  territoryFromDeveloped,
  playerDevelopedTileIds,
  playerOwnedTilesForCities,
  settlementError,
  foundCity,
  skipCityGrowth,
  planUnitMovement,
  resolvePlayerMovement,
  resolvePlayerEconomyRound,
  declareWar,
  resolvePlayerAttack,
  advanceRivalMilitaryPhase,
  advanceRivalProduction,
  PRODUCTIONS,
  RIVAL_UNIT_COST,
  UNIT_MAX_HP,
  terrainAt,
  neighbors,
} = runtimeModule.exports;

const idFor = (pos) => `${pos.col}-${pos.row}`;

const posForId = (tileId) => {
  const [col, row] = tileId.split("-").map(Number);
  return { col, row };
};

const adjacentPositions = (pos) => {
  const offsets = pos.col % 2
    ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  return offsets.map(([dc, dr]) => ({ col: pos.col + dc, row: pos.row + dr }));
};

const inBounds = (pos) => pos.col >= 0 && pos.col < COLS && pos.row >= 0 && pos.row < ROWS;
const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b));
const allTileIds = () => Array.from({ length: COLS * ROWS }, (_, index) => `${index % COLS}-${Math.floor(index / COLS)}`);

const expectedTerritory = (developedTileIds) => {
  const result = new Set();
  for (const tileId of developedTileIds) {
    result.add(tileId);
    adjacentPositions(posForId(tileId))
      .filter(inBounds)
      .forEach((neighbor) => result.add(idFor(neighbor)));
  }
  return sorted(result);
};

const assertConnected = (tileIds, origin, message) => {
  const tiles = new Set(tileIds);
  const originId = idFor(origin);
  assert.ok(tiles.has(originId), `${message}: must contain its capital`);
  const reached = new Set([originId]);
  const queue = [origin];
  while (queue.length) {
    const current = queue.shift();
    for (const neighbor of adjacentPositions(current)) {
      const tileId = idFor(neighbor);
      if (tiles.has(tileId) && !reached.has(tileId)) {
        reached.add(tileId);
        queue.push(neighbor);
      }
    }
  }
  assert.equal(reached.size, tiles.size, `${message}: tiles must form one connected region`);
};

const discoverWorld = (state) => ({ ...state, discovered: new Set(allTileIds()) });

const firstLegalSettlement = (state) => {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const pos = { col, row };
      if (settlementError(state, pos, "settler-test") === null) return pos;
    }
  }
  throw new Error("expected at least one legal settlement tile");
};

const stateWithSecondCity = () => {
  const explored = discoverWorld(createInitialState());
  const pos = firstLegalSettlement(explored);
  const withSettler = {
    ...explored,
    units: [...explored.units, { id: "settler-test", type: "settler", pos, moves: 2, hp: UNIT_MAX_HP }],
    selectedUnitId: "settler-test",
    selectedTile: idFor(pos),
  };
  return { pos, before: withSettler, after: foundCity(withSettler, "settler-test") };
};

test("the enlarged world uses the planned 32 by 18 layout", () => {
  assert.equal(COLS, 32);
  assert.equal(ROWS, 18);
  assert.deepEqual(CITY_POS, { col: 4, row: 4 });

  const expectedCapitals = {
    brazil: { col: 16, row: 4 },
    inca: { col: 4, row: 13 },
    maya: { col: 16, row: 13 },
    egypt: { col: 27, row: 4 },
    han: { col: 27, row: 13 },
  };
  assert.deepEqual(Object.fromEntries(RIVALS.map((rival) => [rival.id, rival.capital])), expectedCapitals);
  const allCapitals = [CITY_POS, ...RIVALS.map((rival) => rival.capital)];
  for (let index = 0; index < allCapitals.length; index += 1) {
    for (let other = index + 1; other < allCapitals.length; other += 1) {
      assert.ok(hexDistance(allCapitals[index], allCapitals[other]) >= 9);
    }
  }
});

test("new games start with one city and round-trip through a v6 save", () => {
  const initial = createInitialState();
  const capitalId = idFor(CITY_POS);
  const developed = playerDevelopedTileIds(initial);

  assert.equal(initial.cities.length, 1);
  assert.equal(initial.cities[0].isCapital, true);
  assert.equal(initial.cities[0].population, 1);
  assert.deepEqual(initial.cities[0].ruralTiles, []);
  assert.deepEqual(sorted(developed), [capitalId]);
  assert.deepEqual(sorted(initial.ownedTiles), expectedTerritory([capitalId]));
  assert.equal(initial.ownedTiles.length, 7);
  assert.equal(improvementTypeAt(initial, capitalId), "palace");
  assert.deepEqual(sorted(territoryFromDeveloped(developed)), expectedTerritory(developed));

  const save = makeLocalSave(initial);
  assert.equal(save.version, 6);
  const restored = readLocalSave(JSON.stringify(save));
  assert.equal(restored.ok, true);
  assert.ok(restored.ok);
  assert.equal(restored.game.cities.length, 1);
  assert.equal(restored.game.cities[0].population, 1);
  assert.deepEqual(restored.game.cities[0].ruralTiles, []);
  assert.deepEqual(sorted(restored.game.ownedTiles), expectedTerritory([capitalId]));
  assert.ok(restored.game.discovered instanceof Set);
  assert.equal(improvementTypeAt(restored.game, capitalId), "palace");

  const obsolete = readLocalSave(JSON.stringify({ ...save, version: 5 }));
  assert.deepEqual(obsolete, { ok: false, reason: "version" });
});

test("territory is the union of every city's developed core plus exactly one ring", () => {
  const { after } = stateWithSecondCity();
  assert.equal(after.cities.length, 2);
  const used = new Set(after.cities.map((city) => idFor(city.pos)));
  const cities = after.cities.map((city) => {
    const rural = neighbors(city.pos).find((pos) => {
      const terrain = terrainAt(pos);
      return terrain !== "water" && terrain !== "mountain" && !used.has(idFor(pos));
    });
    assert.ok(rural, `expected a developable tile near ${city.name}`);
    used.add(idFor(rural));
    return { ...city, ruralTiles: [idFor(rural)] };
  });
  const developed = playerDevelopedTileIds({ cities });
  const owned = playerOwnedTilesForCities(cities);

  assert.equal(developed.length, 4);
  assert.deepEqual(sorted(owned), expectedTerritory(developed));
  assert.deepEqual(sorted(territoryFromDeveloped(developed)), expectedTerritory(developed));
});

test("settlers reject illegal sites, found a legal second city, and are consumed atomically", () => {
  const initial = discoverWorld(createInitialState());
  assert.match(settlementError(initial, CITY_POS, "settler-test"), /距离现有城市/);

  const { pos, before, after } = stateWithSecondCity();
  assert.equal(settlementError(before, pos, "settler-test"), null);
  assert.equal(after.cities.length, 2);
  assert.deepEqual(after.cities[1].pos, pos);
  assert.equal(after.cities[1].population, 1);
  assert.equal(after.cities[1].isCapital, false);
  assert.equal(after.nextCitySerial, before.nextCitySerial + 1);
  assert.equal(after.units.some((unit) => unit.id === "settler-test"), false);
  assert.equal(after.selectedUnitId, null);
  assert.ok(after.discovered.has(idFor(pos)));
  assert.deepEqual(sorted(after.ownedTiles), expectedTerritory(playerDevelopedTileIds(after)));

  const illegalSettler = { ...initial, units: [...initial.units, { id: "settler-test", type: "settler", pos: CITY_POS, moves: 2, hp: UNIT_MAX_HP }] };
  const rejected = foundCity(illegalSettler, "settler-test");
  assert.equal(rejected.cities.length, 1);
  assert.equal(rejected.units.some((unit) => unit.id === "settler-test"), true);
});

test("skipping growth adds population without developing land or moving borders", () => {
  const initial = createInitialState();
  const cityId = initial.cities[0].id;
  const before = {
    ...initial,
    cities: initial.cities.map((city) => city.id === cityId ? { ...city, population: 3, food: 0, growthPending: 2 } : city),
  };
  const geography = {
    ruralTiles: [...before.cities[0].ruralTiles],
    ownedTiles: [...before.ownedTiles],
    builtImprovements: { ...before.builtImprovements },
    discovered: new Set(before.discovered),
  };

  const once = skipCityGrowth(before, cityId);
  assert.equal(once.cities[0].population, 4);
  assert.equal(once.cities[0].growthPending, 1);

  const twice = skipCityGrowth(once, cityId);
  assert.equal(twice.cities[0].population, 5);
  assert.equal(twice.cities[0].growthPending, 0);
  assert.deepEqual(twice.cities[0].ruralTiles, geography.ruralTiles);
  assert.deepEqual(twice.ownedTiles, geography.ownedTiles);
  assert.deepEqual(twice.builtImprovements, geography.builtImprovements);
  assert.deepEqual(twice.discovered, geography.discovered);
  assert.match(twice.message, /跳过/);
});

test("skipped growth immediately queues chained growth from stored food", () => {
  const initial = createInitialState();
  const cityId = initial.cities[0].id;
  const ready = {
    ...initial,
    cities: initial.cities.map((city) => city.id === cityId ? { ...city, population: 3, food: 26, growthPending: 1 } : city),
  };

  const chained = skipCityGrowth(ready, cityId);
  assert.equal(chained.cities[0].population, 4);
  assert.equal(chained.cities[0].food, 0);
  assert.equal(chained.cities[0].growthPending, 1);

  const completed = skipCityGrowth(chained, cityId);
  assert.equal(completed.cities[0].population, 5);
  assert.equal(completed.cities[0].growthPending, 0);
});

test("known impassable terrain cancels movement without deselecting the unit", () => {
  const initial = discoverWorld(createInitialState());
  const unit = initial.units[0];
  const start = { col: 4, row: 4 };
  const target = { col: 6, row: 5 };
  assert.equal(terrainAt(target), "water");
  const ready = { ...initial, units: initial.units.map((candidate) => candidate.id === unit.id ? { ...candidate, pos: start, moves: 3 } : candidate), selectedUnitId: unit.id };

  const after = resolvePlayerMovement(ready, unit.id, target, new Set());
  const moved = after.units.find((candidate) => candidate.id === unit.id);
  assert.deepEqual(moved.pos, start);
  assert.equal(moved.moves, 3);
  assert.equal(after.selectedUnitId, unit.id);
  assert.equal(after.selectedTile, idFor(target));
  assert.match(after.message, /浅海无法通行/);
});

test("an unknown impassable target is approached until it becomes visible", () => {
  const initial = createInitialState();
  const unit = initial.units[0];
  const start = { col: 4, row: 4 };
  const target = { col: 6, row: 5 };
  const known = new Set([idFor(start), ...adjacentPositions(start).filter(inBounds).map(idFor)]);
  assert.equal(known.has(idFor(target)), false);
  const ready = { ...initial, discovered: known, units: initial.units.map((candidate) => candidate.id === unit.id ? { ...candidate, pos: start, moves: 3 } : candidate), selectedUnitId: unit.id };

  const after = resolvePlayerMovement(ready, unit.id, target, new Set());
  const moved = after.units.find((candidate) => candidate.id === unit.id);
  assert.deepEqual(moved.pos, { col: 5, row: 4 });
  assert.equal(moved.moves, 2);
  assert.ok(after.discovered.has(idFor(target)));
  assert.equal(after.selectedUnitId, unit.id);
  assert.match(after.message, /移动 1 格.*浅海无法通行/);
});

test("movement replans around newly revealed obstacles and advances toward distant targets", () => {
  const start = { col: 4, row: 4 };
  const target = { col: 8, row: 5 };
  const hiddenWater = { col: 6, row: 5 };
  const known = new Set([idFor(start), ...adjacentPositions(start).filter(inBounds).map(idFor)]);
  assert.equal(terrainAt(target), "forest");
  assert.equal(terrainAt(hiddenWater), "water");
  const plan = planUnitMovement(start, target, 6, new Set(), known, 1);

  assert.equal(plan.status, "arrived");
  assert.deepEqual(plan.destination, target);
  assert.ok(plan.discovered.has(idFor(hiddenWater)));
  assert.ok(plan.cost <= 6);

  const shortPlan = planUnitMovement(start, target, 2, new Set(), known, 1);
  assert.equal(shortPlan.status, "advanced");
  assert.equal(shortPlan.cost, 2);
  assert.ok(hexDistance(shortPlan.destination, target) < hexDistance(start, target));
});

test("pathing can leave the legacy unit's impassable starting tile", () => {
  const start = { col: 6, row: 5 };
  const target = { col: 7, row: 5 };
  assert.equal(terrainAt(start), "water");
  assert.equal(terrainAt(target), "desert");
  const plan = planUnitMovement(start, target, 1, new Set(), new Set(allTileIds()), 1);
  assert.equal(plan.status, "arrived");
  assert.deepEqual(plan.destination, target);
  assert.equal(plan.cost, 1);
});

test("two cities advance independent production queues and deploy their own units", () => {
  const { after } = stateWithSecondCity();
  const scout = PRODUCTIONS.find((project) => project.id === "scout");
  const settler = PRODUCTIONS.find((project) => project.id === "settler");
  assert.ok(scout && settler);
  const cities = after.cities.map((city, index) => {
    const project = index === 0 ? scout : settler;
    return {
      ...city,
      activeProduction: project.id,
      productionProgress: { ...city.productionProgress, [project.id]: project.cost - 1 },
    };
  });
  const beforeUnitIds = new Set(after.units.map((unit) => unit.id));
  const resolved = resolvePlayerEconomyRound({ ...after, cities });
  const newUnits = resolved.units.filter((unit) => !beforeUnitIds.has(unit.id));

  assert.equal(resolved.turn, after.turn + 1);
  assert.equal(resolved.cities.length, 2);
  assert.equal(resolved.cities[0].activeProduction, null);
  assert.equal(resolved.cities[1].activeProduction, null);
  assert.equal(resolved.cities[0].productionProgress.scout, 0);
  assert.equal(resolved.cities[1].productionProgress.settler, 0);
  assert.deepEqual(sorted(newUnits.map((unit) => unit.type)), ["scout", "settler"]);
  assert.equal(newUnits.every((unit) => unit.moves > 0 && unit.hp === UNIT_MAX_HP), true);
  assert.equal(newUnits.some((unit) => hexDistance(unit.pos, cities[0].pos) === 1), true);
  assert.equal(newUnits.some((unit) => hexDistance(unit.pos, cities[1].pos) === 1), true);
});

const combatSetup = (enemyHp = UNIT_MAX_HP) => {
  const initial = createInitialState();
  const attacker = initial.units[0];
  const target = neighbors(attacker.pos)[0];
  const brazilUnit = initial.rivalUnits.find((unit) => unit.rivalId === "brazil");
  assert.ok(brazilUnit);
  const rivalUnits = initial.rivalUnits
    .filter((unit) => unit.id === brazilUnit.id || idFor(unit.pos) !== idFor(target))
    .map((unit) => unit.id === brazilUnit.id ? { ...unit, pos: target, hp: enemyHp, moves: 2 } : unit);
  return { state: { ...initial, rivalUnits }, attacker, enemyId: brazilUnit.id, target };
};

test("declaring war enables damage, counter-damage, death, and advance into the defeated tile", () => {
  const live = combatSetup();
  const peacefulAttempt = resolvePlayerAttack(live.state, live.attacker.id, live.target);
  assert.equal(peacefulAttempt.rivalUnits.find((unit) => unit.id === live.enemyId).hp, UNIT_MAX_HP);
  assert.match(peacefulAttempt.message, /先在外交窗口宣战/);

  const war = declareWar(live.state, "brazil");
  assert.equal(war.wars.brazil, "war");
  assert.ok(war.rivalRelationships.brazil <= 15);
  const exchange = resolvePlayerAttack(war, live.attacker.id, live.target);
  assert.ok(exchange.rivalUnits.find((unit) => unit.id === live.enemyId).hp < UNIT_MAX_HP);
  assert.ok(exchange.units.find((unit) => unit.id === live.attacker.id).hp < UNIT_MAX_HP);
  assert.equal(exchange.units.find((unit) => unit.id === live.attacker.id).moves, 0);

  const doomed = combatSetup(1);
  const victory = resolvePlayerAttack(declareWar(doomed.state, "brazil"), doomed.attacker.id, doomed.target);
  assert.equal(victory.rivalUnits.some((unit) => unit.id === doomed.enemyId), false);
  const survivor = victory.units.find((unit) => unit.id === doomed.attacker.id);
  assert.ok(survivor);
  assert.deepEqual(survivor.pos, doomed.target);
  assert.equal(survivor.moves, 0);
});

test("a rival army attacks adjacent Argentine targets during its war phase", () => {
  const setup = combatSetup();
  const war = declareWar(setup.state, "brazil");
  const playerHpBefore = war.units.find((unit) => unit.id === setup.attacker.id).hp;
  const enemyHpBefore = war.rivalUnits.find((unit) => unit.id === setup.enemyId).hp;
  const after = advanceRivalMilitaryPhase(war, "brazil");
  const player = after.units.find((unit) => unit.id === setup.attacker.id);
  const enemy = after.rivalUnits.find((unit) => unit.id === setup.enemyId);

  assert.ok(!player || player.hp < playerHpBefore);
  assert.ok(!enemy || enemy.hp < enemyHpBefore);
  if (enemy) assert.equal(enemy.moves, 0);
  assert.match(after.message, /巴西军队/);
});

test("AI production accumulates yields and spawns a persistent warrior", () => {
  const initial = createInitialState();
  const beforeCount = initial.rivalUnits.filter((unit) => unit.rivalId === "brazil").length;
  const ready = {
    ...initial,
    rivalMilitaryProgress: { ...initial.rivalMilitaryProgress, brazil: RIVAL_UNIT_COST - 1 },
  };
  const after = advanceRivalProduction(ready, "brazil");
  const brazilUnits = after.rivalUnits.filter((unit) => unit.rivalId === "brazil");

  assert.equal(brazilUnits.length, beforeCount + 1);
  assert.ok(after.rivalMilitaryProgress.brazil < RIVAL_UNIT_COST);
  assert.equal(after.nextRivalUnitSerial, initial.nextRivalUnitSerial + 1);
  assert.equal(brazilUnits.at(-1).hp, UNIT_MAX_HP);
  assert.equal(brazilUnits.at(-1).moves, 0);
});

test("AI development pushes an exact one-tile border without overlaps", () => {
  const initial = createInitialState();
  let previous = null;

  for (let turn = 1; turn <= 70; turn += 1) {
    const empires = deriveRivalEmpires({ turn, ownedTiles: initial.ownedTiles });
    assert.deepEqual(empires, deriveRivalEmpires({ turn, ownedTiles: initial.ownedTiles }));
    const globallyClaimed = new Set(initial.ownedTiles);

    for (const rival of RIVALS) {
      const empire = empires[rival.id];
      const capitalId = idFor(rival.capital);
      const core = [capitalId, ...empire.developedTiles];

      assert.equal(new Set(empire.developedTiles).size, empire.developedTiles.length);
      assert.equal(new Set(empire.ownedTiles).size, empire.ownedTiles.length);
      assert.equal(empire.development, empire.developedTiles.length);
      assert.ok(!empire.developedTiles.includes(capitalId));
      assert.deepEqual(sorted(empire.ownedTiles), expectedTerritory(core));
      assert.deepEqual(sorted(empire.ownedTiles), sorted(territoryFromDeveloped(core)));
      assert.ok(empire.developedTiles.every((tileId) => hexDistance(posForId(tileId), rival.capital) <= 3));
      assert.ok(empire.ownedTiles.every((tileId) => hexDistance(posForId(tileId), rival.capital) <= 4));
      assertConnected(core, rival.capital, `${rival.id} developed core on turn ${turn}`);
      assertConnected(empire.ownedTiles, rival.capital, `${rival.id} territory on turn ${turn}`);

      for (const tileId of empire.ownedTiles) {
        assert.ok(!globallyClaimed.has(tileId), `${rival.id} overlaps another empire at ${tileId} on turn ${turn}`);
        globallyClaimed.add(tileId);
      }

      if (turn === 1) {
        assert.equal(empire.population, 1);
        assert.equal(empire.development, 0);
        assert.deepEqual(empire.developedTiles, []);
        assert.equal(empire.ownedTiles.length, 7);
      }

      if (previous) {
        const oldEmpire = previous[rival.id];
        const oldDeveloped = new Set(oldEmpire.developedTiles);
        const currentDeveloped = new Set(empire.developedTiles);
        assert.ok(oldEmpire.developedTiles.every((tileId) => currentDeveloped.has(tileId)));
        assert.ok(empire.developedTiles.filter((tileId) => !oldDeveloped.has(tileId)).length <= 1);
        assert.ok(oldEmpire.ownedTiles.every((tileId) => empire.ownedTiles.includes(tileId)));
        assert.ok(empire.population >= oldEmpire.population);
      }
    }
    previous = empires;
  }
});
