import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";

const source = `${readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")}
export { createInitialState, makeLocalSave, readLocalSave, deriveRivalEmpires, improvementTypeAt, hexDistance, CITY_POS, RIVALS, COLS, ROWS, territoryFromDeveloped, playerDevelopedTileIds };`;
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

test("new games start from one developed capital and round-trip through save v5", () => {
  const initial = createInitialState();
  const capitalId = idFor(CITY_POS);
  const developed = playerDevelopedTileIds(initial);

  assert.equal(initial.population, 1);
  assert.deepEqual(initial.ruralTiles, []);
  assert.deepEqual(sorted(developed), [capitalId]);
  assert.deepEqual(sorted(initial.ownedTiles), expectedTerritory([capitalId]));
  assert.equal(initial.ownedTiles.length, 7);
  assert.equal(improvementTypeAt(initial, capitalId), "palace");
  assert.deepEqual(sorted(territoryFromDeveloped(developed)), expectedTerritory(developed));

  const save = makeLocalSave(initial);
  assert.equal(save.version, 5);
  const restored = readLocalSave(JSON.stringify(save));
  assert.equal(restored.ok, true);
  assert.ok(restored.ok);
  assert.equal(restored.game.population, 1);
  assert.deepEqual(restored.game.ruralTiles, []);
  assert.deepEqual(sorted(restored.game.ownedTiles), expectedTerritory([capitalId]));
  assert.ok(restored.game.discovered instanceof Set);
  assert.equal(improvementTypeAt(restored.game, capitalId), "palace");

  const obsolete = readLocalSave(JSON.stringify({ ...save, version: 4 }));
  assert.deepEqual(obsolete, { ok: false, reason: "version" });
});

test("player territory is always the developed core plus one border ring", () => {
  const state = createInitialState();
  state.ruralTiles = ["5-4"];
  state.builtImprovements = { "5-4": "farm" };
  state.buildingPlacements = { monument: "4-5" };

  const developed = playerDevelopedTileIds(state);
  assert.deepEqual(sorted(developed), sorted([idFor(CITY_POS), "5-4", "4-5"]));
  assert.deepEqual(sorted(territoryFromDeveloped(developed)), expectedTerritory(developed));
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
