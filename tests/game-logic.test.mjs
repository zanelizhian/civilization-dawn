import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";

const source = `${readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")}
export { createInitialState, makeLocalSave, readLocalSave, deriveRivalEmpires, improvementTypeAt, hexDistance, CITY_POS, RIVALS };`;
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
const { createInitialState, makeLocalSave, readLocalSave, deriveRivalEmpires, improvementTypeAt, hexDistance, CITY_POS, RIVALS } = runtimeModule.exports;

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

test("new games start in one ring and round-trip through save v4", () => {
  const initial = createInitialState();
  assert.equal(initial.ownedTiles.length, 7);
  assert.ok(initial.ownedTiles.every((tileId) => hexDistance(posForId(tileId), CITY_POS) <= 1));
  assert.deepEqual(initial.ruralTiles, ["3-1", "5-1", "5-2"]);
  assert.equal(initial.builtImprovements["5-1"], "lumbermill");

  const restored = readLocalSave(JSON.stringify(makeLocalSave(initial)));
  assert.equal(restored.ok, true);
  assert.equal(restored.ok && improvementTypeAt(restored.game, "5-1"), "lumbermill");
});

test("old v4 farms and buildings keep their original tiles", () => {
  const legacy = createInitialState();
  legacy.ownedTiles = [...legacy.ownedTiles, "2-3"];
  legacy.ruralTiles = ["3-1", "2-3", "5-2"];
  legacy.builtImprovements = {};
  legacy.buildingPlacements = { granary: "5-1" };
  legacy.completedBuildings = ["granary"];
  legacy.productionProgress.granary = 21;
  legacy.activeProduction = null;

  const restored = readLocalSave(JSON.stringify(makeLocalSave(legacy)));
  assert.equal(restored.ok, true);
  assert.equal(restored.ok && improvementTypeAt(restored.game, "2-3"), "farm");
  assert.equal(restored.ok && restored.game.buildingPlacements.granary, "5-1");
  assert.equal(restored.ok && restored.game.ruralTiles.includes("5-1"), false);

  const secondRoundTrip = restored.ok ? readLocalSave(JSON.stringify(makeLocalSave(restored.game))) : restored;
  assert.equal(secondRoundTrip.ok, true);
});

test("AI borders stay deterministic, connected, separate, and gradual", () => {
  const initial = createInitialState();
  let previous = null;

  for (let turn = 1; turn <= 70; turn += 1) {
    const empires = deriveRivalEmpires({ turn, ownedTiles: initial.ownedTiles });
    assert.deepEqual(empires, deriveRivalEmpires({ turn, ownedTiles: initial.ownedTiles }));
    const claimed = new Set(initial.ownedTiles);

    for (const rival of RIVALS) {
      const empire = empires[rival.id];
      if (turn === 1) assert.equal(empire.ownedTiles.length, 7);
      assert.ok(empire.ownedTiles.every((tileId) => !claimed.has(tileId)));
      empire.ownedTiles.forEach((tileId) => claimed.add(tileId));
      assert.ok(empire.ownedTiles.every((tileId) => hexDistance(posForId(tileId), rival.capital) <= 3));
      assert.ok(empire.developedTiles.every((tileId) => empire.ownedTiles.includes(tileId)));

      const owned = new Set(empire.ownedTiles);
      const capitalId = `${rival.capital.col}-${rival.capital.row}`;
      const reached = new Set([capitalId]);
      const queue = [rival.capital];
      while (queue.length) {
        const current = queue.shift();
        for (const neighbor of adjacentPositions(current)) {
          const tileId = `${neighbor.col}-${neighbor.row}`;
          if (owned.has(tileId) && !reached.has(tileId)) {
            reached.add(tileId);
            queue.push(neighbor);
          }
        }
      }
      assert.equal(reached.size, owned.size);

      if (previous) {
        const previousTiles = previous[rival.id].ownedTiles;
        assert.ok(previousTiles.every((tileId) => owned.has(tileId)));
        assert.ok(empire.ownedTiles.filter((tileId) => !previousTiles.includes(tileId)).length <= 1);
      }
    }
    previous = empires;
  }
});
