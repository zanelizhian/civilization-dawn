"use client";

const TERRAIN = [
  "water", "plains", "forest", "hills", "grass", "mountain", "water", "plains", "forest",
  "plains", "forest", "grass", "grass", "hills", "forest", "mountain", "grass", "water",
  "water", "grass", "forest", "plains", "grass", "hills", "grass", "forest", "plains",
  "plains", "grass", "grass", "forest", "plains", "grass", "forest", "hills", "water",
  "hills", "forest", "grass", "water", "grass", "plains", "forest", "grass", "mountain",
  "water", "plains", "forest", "water", "hills", "grass", "water", "plains", "forest",
] as const;

const TERRAIN_LABELS = {
  water: ["浅海", "≈"],
  plains: ["平原", "✦"],
  forest: ["森林", "♠"],
  hills: ["丘陵", "◢"],
  grass: ["草原", "♧"],
  mountain: ["山脉", "▲"],
} as const;

export default function Home() {
  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✺</span>
          <span>文明：曙光</span>
          <span className="civ-chip">🇦🇷 阿根廷</span>
        </div>
        <div className="resource-strip" aria-label="文明资源">
          <span><b className="gold">●</b><small>金币</small><strong>120</strong><em>+8</em></span>
          <span><b className="science">◆</b><small>科技</small><strong>18</strong><em>+6</em></span>
          <span><b className="culture">✦</b><small>文化</small><strong>12</strong><em>+4</em></span>
          <span><b className="people">★</b><small>伟人</small><strong>32</strong><em>+5</em></span>
        </div>
        <div className="turn-indicator"><small>探索时代</small><strong>回合 24</strong></div>
      </header>

      <section className="game-layout">
        <aside className="left-rail">
          <section className="paper-card research-card">
            <div className="card-kicker">当前研究</div>
            <div className="card-title-row">
              <div>
                <h2>畜牧业</h2>
                <p>解锁牧场与高乔骑手</p>
              </div>
              <span className="research-icon" aria-hidden="true">♞</span>
            </div>
            <div className="progress-ring" style={{ "--progress": "68%" } as React.CSSProperties}>
              <div><strong>8</strong><span>/ 12</span></div>
            </div>
            <div className="progress-copy"><span>预计完成</span><strong>2 回合</strong></div>
          </section>

          <section className="paper-card mission-card">
            <div className="card-kicker">时代目标</div>
            <h3>南方的巴黎</h3>
            <p>让布宜诺斯艾利斯达到 4 人口</p>
            <div className="mini-progress"><span style={{ width: "75%" }} /></div>
            <small>3 / 4 人口</small>
          </section>

          <section className="paper-card legend-card">
            <div className="card-kicker">地块收益</div>
            <div><span>● 食物</span><b>2</b></div>
            <div><span>◆ 生产</span><b>1</b></div>
            <div><span>✦ 文化</span><b>1</b></div>
          </section>
        </aside>

        <section className="map-stage" aria-label="世界地图">
          <div className="map-wash map-wash-one" />
          <div className="map-wash map-wash-two" />
          <div className="hex-board">
            {TERRAIN.map((terrain, index) => {
              const col = index % 9;
              const row = Math.floor(index / 9);
              const [label, icon] = TERRAIN_LABELS[terrain];
              const owned = (col >= 2 && col <= 5 && row >= 1 && row <= 4) || (col === 6 && row === 3);
              const rival = col >= 7 && row <= 2;
              return (
                <button
                  className={`hex-tile ${terrain} ${owned ? "owned" : ""} ${rival ? "rival" : ""}`}
                  key={`${col}-${row}`}
                  style={{ left: col * 70, top: row * 82 + (col % 2) * 41 }}
                  aria-label={`${label}地块，第 ${row + 1} 行第 ${col + 1} 列`}
                >
                  <span aria-hidden="true">{icon}</span>
                </button>
              );
            })}

            <button className="map-piece capital-piece" aria-label="布宜诺斯艾利斯，阿根廷首都">
              <span className="city-model" aria-hidden="true">♜</span>
              <span className="place-label"><b>★</b> 布宜诺斯艾利斯 <em>3</em></span>
            </button>

            <button className="map-piece unit-piece gaucho-piece" aria-label="高乔侦察兵，2 点移动力">
              <span className="unit-token" aria-hidden="true">♞</span>
              <span className="unit-label">高乔侦察兵</span>
            </button>

            <button className="map-piece rival-piece" aria-label="巴西斥候">
              <span className="unit-token" aria-hidden="true">♟</span>
              <span className="unit-label">巴西斥候</span>
            </button>
          </div>

          <div className="map-caption">
            <span>潘帕斯草原</span>
            <small>拖动地图探索世界 · 选择地块查看收益</small>
          </div>
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
          </section>

          <section className="paper-card world-card">
            <div className="card-kicker">已知世界</div>
            <div className="mini-map" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
              <span className="mini-player" /><span className="mini-rival" />
            </div>
            <div className="diplomacy-row"><span><b className="avatar argentina">A</b>阿根廷</span><em>你</em></div>
            <div className="diplomacy-row"><span><b className="avatar brazil">B</b>巴西</span><em>中立</em></div>
          </section>

          <section className="paper-card great-person-card">
            <div className="card-kicker">伟人候选</div>
            <div className="great-person-heading">
              <span className="messi-medal"><b>10</b><i>⚽</i></span>
              <div><h3>莱昂内尔·梅西</h3><p>伟大运动员</p></div>
            </div>
            <p className="ability-copy">“世界冠军”：所有城市立即获得文化与幸福，首都进入黄金回合。</p>
            <div className="candidate-progress"><span style={{ width: "64%" }} /></div>
            <button className="recruit-button" disabled>招募 · 32 / 50 伟人点</button>
          </section>
        </aside>
      </section>

      <div className="action-dock" role="region" aria-label="选中单位操作">
        <div className="selected-unit">
          <span className="unit-portrait" aria-hidden="true">♞</span>
          <div><small>已选择</small><strong>高乔侦察兵</strong><span>2 / 2 移动力</span></div>
        </div>
        <div className="action-buttons">
          <button><b>⌖</b><span>移动</span></button>
          <button><b>◉</b><span>侦察</span></button>
          <button><b>⚑</b><span>驻扎</span></button>
          <button><b>↶</b><span>休整</span></button>
        </div>
      </div>

      <button className="end-turn-button"><span>结束回合</span><small>Enter</small></button>
    </main>
  );
}
