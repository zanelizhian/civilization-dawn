"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

type Terrain = "water" | "desert" | "forest" | "hills" | "grass" | "mountain";
type Position = { col: number; row: number };
type TechId = "husbandry" | "riding" | "federalism" | "broadcast";

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
  unitPos: Position;
  unitMoves: number;
  brazilPos: Position;
  brazilInfluence: number;
  discovered: Set<string>;
  selectedUnit: boolean;
  selectedTile: string | null;
  messiRecruited: boolean;
  messiAbilityUsed: boolean;
  footballTurns: number;
  message: string;
  log: string[];
  result: "win" | "lose" | null;
};

const COLS = 9;
const ROWS = 6;
const CITY_POS = { col: 4, row: 2 };

const TERRAIN: Terrain[] = [
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

const TECHS: Array<{ id: TechId; name: string; cost: number; icon: string; effect: string }> = [
  { id: "husbandry", name: "畜牧业", cost: 12, icon: "♞", effect: "潘帕斯地块食物 +1" },
  { id: "riding", name: "骑术传统", cost: 16, icon: "⚑", effect: "高乔侦骑移动力 +1" },
  { id: "federalism", name: "联邦制度", cost: 20, icon: "◈", effect: "首都每回合科研 +2" },
  { id: "broadcast", name: "大众广播", cost: 24, icon: "◉", effect: "每回合伟人点 +2" },
];

const idFor = ({ col, row }: Position) => `${col}-${row}`;
const terrainAt = ({ col, row }: Position) => TERRAIN[row * COLS + col];
const inBounds = ({ col, row }: Position) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

function neighbors(pos: Position) {
  const offsets = pos.col % 2
    ? [[0, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    : [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 0], [-1, -1]];
  return offsets.map(([dc, dr]) => ({ col: pos.col + dc, row: pos.row + dr })).filter(inBounds);
}

function areAdjacent(a: Position, b: Position) {
  return neighbors(a).some((pos) => pos.col === b.col && pos.row === b.row);
}

function isArgentineTerritory({ col, row }: Position) {
  return (col >= 2 && col <= 5 && row >= 1 && row <= 4) || (col === 6 && row === 3);
}

function isBrazilianTerritory({ col, row }: Position) {
  return col >= 7 && row <= 2;
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
  set.add("7-1");
  return set;
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
    unitPos: { col: 6, row: 3 },
    unitMoves: 2,
    brazilPos: { col: 7, row: 1 },
    brazilInfluence: 18,
    discovered: initialDiscovered(),
    selectedUnit: true,
    selectedTile: idFor({ col: 6, row: 3 }),
    messiRecruited: false,
    messiAbilityUsed: false,
    footballTurns: 0,
    message: "阿根廷的曙光从潘帕斯升起。选择相邻地块开始探索。",
    log: ["高乔侦骑在布宜诺斯艾利斯整装待发。"],
    result: null,
  };
}

function nextBrazilPosition(state: GameState) {
  const candidates = neighbors(state.brazilPos).filter((pos) => {
    const terrain = terrainAt(pos);
    return pos.col >= 6 && terrain !== "water" && terrain !== "mountain" && idFor(pos) !== idFor(state.unitPos);
  });
  return candidates.length ? candidates[state.turn % candidates.length] : state.brazilPos;
}

export default function Home() {
  const [game, setGame] = useState<GameState>(createInitialState);
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showYields, setShowYields] = useState(false);
  const aiLockRef = useRef(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTech = TECHS.find((tech) => tech.id === game.activeTech) ?? null;
  const selectedPos = game.selectedTile
    ? { col: Number(game.selectedTile.split("-")[0]), row: Number(game.selectedTile.split("-")[1]) }
    : game.unitPos;
  const selectedTerrain = terrainAt(selectedPos);
  const yieldsFor = (pos: Position) => {
    const terrain = terrainAt(pos);
    const base = TERRAIN_INFO[terrain];
    const owned = isArgentineTerritory(pos);
    const footballBonus = game.footballTurns > 0 && owned ? 1 : 0;
    const husbandryBonus = owned && terrain === "grass" && game.completedTechs.includes("husbandry") ? 1 : 0;
    const argentinaCulture = owned && terrain === "grass" ? 1 : 0;
    return {
      ...base,
      food: base.food + footballBonus + husbandryBonus,
      science: base.science + footballBonus,
      culture: base.culture + argentinaCulture,
    };
  };
  const selectedYield = yieldsFor(selectedPos);
  const maxMoves = 2 + (game.completedTechs.includes("riding") ? 1 : 0) + (game.footballTurns > 0 ? 1 : 0);
  const revealedCount = game.discovered.size;
  const objectives = [
    { label: "首都达到 5 人口", value: game.population, target: 5, done: game.population >= 5 },
    { label: "完成 2 项科技", value: game.completedTechs.length, target: 2, done: game.completedTechs.length >= 2 },
    { label: "探索 26 个地块", value: revealedCount, target: 26, done: revealedCount >= 26 },
    { label: "招募梅西", value: game.messiRecruited ? 1 : 0, target: 1, done: game.messiRecruited },
  ];

  const addLog = (log: string[], entry: string) => [entry, ...log].slice(0, 4);

  const handleTileClick = (pos: Position) => {
    if (aiThinking || game.result) return;
    setGame((prev) => {
      const tileId = idFor(pos);
      const terrain = terrainAt(pos);
      const blocked = terrain === "water" || terrain === "mountain" || tileId === idFor(prev.brazilPos);
      if (prev.selectedUnit && prev.unitMoves > 0 && areAdjacent(prev.unitPos, pos) && !blocked) {
        const discovered = reveal(prev.discovered, pos, 1);
        const found = discovered.size - prev.discovered.size;
        const points = Math.min(2, found);
        const entry = found > 0
          ? `高乔侦骑发现了 ${found} 个新地块，获得 ${points} 伟人点。`
          : `高乔侦骑移动到${TERRAIN_INFO[terrain].label}。`;
        return {
          ...prev,
          unitPos: pos,
          unitMoves: prev.unitMoves - 1,
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
        message: blocked ? `${TERRAIN_INFO[terrain].label}目前无法通行。` : `已查看${TERRAIN_INFO[terrain].label}地块。`,
      };
    });
  };

  const handleExplore = () => {
    if (!game.selectedUnit || game.unitMoves <= 0 || aiThinking || game.result) return;
    setGame((prev) => {
      const discovered = reveal(prev.discovered, prev.unitPos, 2);
      const found = discovered.size - prev.discovered.size;
      const points = Math.min(3, found);
      const message = found > 0 ? `远眺发现 ${found} 个地块，伟人点 +${points}。` : "附近已经探索完毕。";
      return { ...prev, discovered, greatPoints: prev.greatPoints + points, unitMoves: prev.unitMoves - 1, message, log: addLog(prev.log, message) };
    });
  };

  const handleWait = () => {
    if (!game.selectedUnit || game.unitMoves <= 0 || aiThinking || game.result) return;
    setGame((prev) => ({
      ...prev,
      unitMoves: 0,
      culture: prev.culture + 1,
      message: "高乔侦骑驻扎，为当地带来 1 点文化。",
      log: addLog(prev.log, "高乔侦骑在潘帕斯驻扎。"),
    }));
  };

  const chooseTech = (techId: TechId) => {
    setGame((prev) => ({
      ...prev,
      activeTech: techId,
      message: `开始研究${TECHS.find((tech) => tech.id === techId)?.name}。`,
    }));
    setTechPickerOpen(false);
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
      unitMoves: Math.min(maxMoves + 1, prev.unitMoves + 1),
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
        const scienceGain = 4 + prev.population + (prev.completedTechs.includes("federalism") ? 2 : 0) + (prev.footballTurns > 0 ? 2 : 0);
        const cultureGain = 3 + (prev.messiRecruited ? 2 : 0) + (prev.footballTurns > 0 ? 2 : 0);
        const goldGain = 7 + (prev.footballTurns > 0 ? 3 : 0);
        const foodGain = 4 + prev.population + (prev.completedTechs.includes("husbandry") ? 1 : 0) + (prev.footballTurns > 0 ? 2 : 0);
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

        const footballTurns = Math.max(0, prev.footballTurns - 1);
        const greatPointGain = 3 + Math.floor(population / 2) + (completedTechs.includes("broadcast") ? 2 : 0);
        const brazilInfluence = prev.brazilInfluence + 4 + (grew ? 1 : 0);
        const nextTurn = prev.turn + 1;
        const nextMoves = 2 + (completedTechs.includes("riding") ? 1 : 0) + (footballTurns > 0 ? 1 : 0);
        const recruited = prev.messiRecruited;
        const won = population >= 5 && completedTechs.length >= 2 && prev.discovered.size >= 26 && recruited;
        const lost = brazilInfluence >= 100;
        const summary = completedName
          ? `完成科技：${completedName}。请选择下一项研究。`
          : grew
            ? `布宜诺斯艾利斯增长到 ${population} 人口！`
            : `第 ${nextTurn} 回合开始，高乔侦骑恢复行动。`;

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
          unitMoves: nextMoves,
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Enter" && !["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) endTurn();
      if (event.key === "Escape") setTechPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [endTurn]);

  useEffect(() => () => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
  }, []);

  const techPercent = activeTech ? Math.min(100, (game.techProgress / activeTech.cost) * 100) : 0;
  const cityGrowthTarget = 10 + game.population * 4;
  const cityStyle = { left: CITY_POS.col * 70 - 32, top: CITY_POS.row * 82 + (CITY_POS.col % 2) * 41 + 20 };
  const unitStyle = { left: game.unitPos.col * 70 + 22, top: game.unitPos.row * 82 + (game.unitPos.col % 2) * 41 + 15 };
  const brazilStyle = { left: game.brazilPos.col * 70 + 22, top: game.brazilPos.row * 82 + (game.brazilPos.col % 2) * 41 + 15 };

  const tiles = useMemo(() => TERRAIN.map((terrain, index) => ({ terrain, col: index % COLS, row: Math.floor(index / COLS) })), []);

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
          <span><b className="science">◆</b><small>科技</small><strong>{game.science}</strong><em>+{4 + game.population}</em></span>
          <span><b className="culture">✦</b><small>文化</small><strong>{game.culture}</strong><em>+{3 + (game.messiRecruited ? 2 : 0)}</em></span>
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
            <button className="tech-change" onClick={() => setTechPickerOpen(true)} data-testid="open-tech-picker">{activeTech ? "更换研究" : "选择下一项研究"}</button>
          </section>

          <section className="paper-card mission-card">
            <div className="card-kicker">胜利目标 · 阿根廷曙光</div>
            {objectives.map((objective) => (
              <div className={`objective-row ${objective.done ? "done" : ""}`} key={objective.label}>
                <span>{objective.done ? "✓" : "○"}</span><p>{objective.label}</p><b>{objective.value}/{objective.target}</b>
              </div>
            ))}
          </section>

          <section className="paper-card legend-card">
            <div className="card-kicker">{selectedYield.label}收益</div>
            <div><span><i className="yield-dot food">粮</i>食物</span><b>{selectedYield.food}</b></div>
            <div><span><i className="yield-dot production">锤</i>生产</span><b>{selectedYield.production}</b></div>
            <div><span><i className="yield-dot science">科</i>科技</span><b>{selectedYield.science}</b></div>
            <div><span><i className="yield-dot culture">文</i>文化</span><b>{selectedYield.culture}</b></div>
          </section>
        </aside>

        <section className="map-stage" aria-label="世界地图">
          <div className="map-wash map-wash-one" />
          <div className="map-wash map-wash-two" />
          <div className="yield-controls" aria-label="地块收益图例">
            {showYields && <div className="yield-legend" aria-hidden="true"><span className="food">粮</span><span className="production">锤</span><span className="science">科</span><span className="culture">文</span></div>}
            <button className={showYields ? "active" : ""} aria-pressed={showYields} onClick={() => setShowYields((value) => !value)} data-testid="yield-toggle">
              {showYields ? "隐藏收益" : "显示收益"}
            </button>
          </div>
          <div className="hex-board" role="grid" aria-label="潘帕斯六角格地图">
            {tiles.map(({ terrain, col, row }) => {
              const pos = { col, row };
              const tileId = idFor(pos);
              const info = TERRAIN_INFO[terrain];
              const discovered = game.discovered.has(tileId);
              const reachable = game.selectedUnit && game.unitMoves > 0 && areAdjacent(game.unitPos, pos) && terrain !== "water" && terrain !== "mountain" && tileId !== idFor(game.brazilPos);
              const selected = game.selectedTile === tileId;
              const owned = isArgentineTerritory(pos);
              const rival = isBrazilianTerritory(pos);
              const tileYield = yieldsFor(pos);
              const containsUnit = tileId === idFor(game.unitPos) ? "，高乔侦骑在此" : tileId === idFor(game.brazilPos) ? "，巴西斥候在此" : "";
              const yieldLabel = discovered ? `，粮食 ${tileYield.food}，生产 ${tileYield.production}，科技 ${tileYield.science}，文化 ${tileYield.culture}` : "";
              return (
                <button
                  className={`hex-tile ${terrain} ${owned ? "owned" : ""} ${rival ? "rival" : ""} ${discovered ? "" : "fog"} ${reachable ? "reachable" : ""} ${selected ? "selected" : ""} ${game.footballTurns > 0 && owned ? "football-benefit" : ""}`}
                  key={tileId}
                  style={{ left: col * 70, top: row * 82 + (col % 2) * 41 }}
                  aria-label={`${discovered ? info.label : "未知"}地块，第 ${row + 1} 行第 ${col + 1} 列${yieldLabel}${containsUnit}${reachable ? "，可以移动" : ""}`}
                  aria-selected={selected}
                  role="gridcell"
                  data-testid={`tile-${tileId}`}
                  onClick={() => handleTileClick(pos)}
                  disabled={aiThinking || Boolean(game.result)}
                >
                  {discovered ? (
                    <span className={`terrain-art art-${terrain}`} aria-hidden="true"><i /><i /><i /><i /></span>
                  ) : (
                    <span className="fog-mark" aria-hidden="true">?</span>
                  )}
                  {discovered && (
                    <span className={`tile-yields ${showYields ? "visible" : ""}`} aria-hidden="true">
                      {tileYield.food > 0 && <i className="food">粮<b>{tileYield.food}</b></i>}
                      {tileYield.production > 0 && <i className="production">锤<b>{tileYield.production}</b></i>}
                      {tileYield.science > 0 && <i className="science">科<b>{tileYield.science}</b></i>}
                      {tileYield.culture > 0 && <i className="culture">文<b>{tileYield.culture}</b></i>}
                    </span>
                  )}
                </button>
              );
            })}

            <button className="map-piece capital-piece" style={cityStyle} aria-label={`布宜诺斯艾利斯，阿根廷首都，${game.population} 人口`} onClick={() => setGame((prev) => ({ ...prev, selectedTile: idFor(CITY_POS), selectedUnit: false, message: "已选择布宜诺斯艾利斯。" }))}>
              <span className="city-model" aria-hidden="true">♜</span>
              <span className="place-label"><b>★</b> 布宜诺斯艾利斯 <em>{game.population}</em></span>
            </button>

            <button className={`map-piece unit-piece gaucho-piece ${game.selectedUnit ? "piece-selected" : ""}`} style={unitStyle} aria-label={`高乔侦骑，${game.unitMoves} 点移动力`} data-testid="gaucho-unit" onClick={() => setGame((prev) => ({ ...prev, selectedUnit: true, selectedTile: idFor(prev.unitPos), message: "高乔侦骑已选择；绿色虚线地块可以移动。" }))}>
              <span className="unit-token" aria-hidden="true">♞</span>
              <span className="unit-label">高乔侦骑</span>
            </button>

            <button className="map-piece rival-piece" style={brazilStyle} aria-label="巴西斥候" onClick={() => setGame((prev) => ({ ...prev, selectedUnit: false, selectedTile: idFor(prev.brazilPos), message: "巴西斥候：目前保持中立。" }))}>
              <span className="unit-token" aria-hidden="true">♟</span>
              <span className="unit-label">巴西斥候</span>
            </button>

            {game.messiRecruited && (
              <button className="map-piece messi-piece" style={{ left: cityStyle.left + 115, top: cityStyle.top + 22 }} aria-label="伟人莱昂内尔·梅西位于布宜诺斯艾利斯" onClick={activateMessi}>
                <span className="messi-map-token"><b>10</b><i>⚽</i></span>
              </button>
            )}
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
          </section>

          <section className="paper-card world-card">
            <div className="card-kicker">已知世界 · 巴西影响力 {game.brazilInfluence}/100</div>
            <div className="mini-map" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
              <span className="mini-player" /><span className="mini-rival" />
            </div>
            <div className="diplomacy-row"><span><b className="avatar argentina">A</b>阿根廷</span><em>你</em></div>
            <div className="diplomacy-row"><span><b className="avatar brazil">B</b>巴西</span><em>{aiThinking ? "行动中" : "中立"}</em></div>
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

      <div className="action-dock" role="region" aria-label="选中单位操作">
        <div className="selected-unit">
          <span className="unit-portrait" aria-hidden="true">{game.selectedUnit ? "♞" : "⌖"}</span>
          <div><small>{game.selectedUnit ? "已选择" : "等待命令"}</small><strong>{game.selectedUnit ? "高乔侦骑" : "选择一个单位"}</strong><span>{game.selectedUnit ? `${game.unitMoves} / ${maxMoves} 移动力` : "点击地图上的单位"}</span></div>
        </div>
        <div className="action-buttons">
          <button disabled={!game.selectedUnit || game.unitMoves <= 0 || aiThinking} onClick={() => setGame((prev) => ({ ...prev, message: "请选择绿色虚线标出的相邻地块。" }))}><b>⌖</b><span>移动</span></button>
          <button disabled={!game.selectedUnit || game.unitMoves <= 0 || aiThinking} onClick={handleExplore} data-testid="explore-action"><b>◉</b><span>侦察</span></button>
          <button disabled={!game.selectedUnit || game.unitMoves <= 0 || aiThinking} onClick={handleWait}><b>⚑</b><span>驻扎</span></button>
          <button disabled={!game.selectedUnit || game.unitMoves <= 0 || aiThinking} onClick={handleWait}><b>↶</b><span>休整</span></button>
        </div>
      </div>

      <button className="end-turn-button" onClick={endTurn} disabled={aiThinking || Boolean(game.result)} data-testid="end-turn"><span>{aiThinking ? "巴西行动中" : "结束回合"}</span><small>Enter</small></button>

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

      {game.result && (
        <div className="modal-backdrop result-backdrop">
          <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">
            <span className="result-emblem">{game.result === "win" ? "✺" : "◒"}</span>
            <div className="card-kicker">{game.result === "win" ? "历史性胜利" : "时代落幕"}</div>
            <h2 id="result-title">{game.result === "win" ? "阿根廷迎来文明曙光" : "巴西赢得地区影响力"}</h2>
            <p>{game.result === "win" ? "布宜诺斯艾利斯繁荣昌盛，科技、探索与梅西凝聚了整个文明。" : "重新规划探索与科技节奏，再次带领阿根廷出发。"}</p>
            <button onClick={() => { setGame(createInitialState()); aiLockRef.current = false; setAiThinking(false); }}>重新开始</button>
          </section>
        </div>
      )}
    </main>
  );
}
