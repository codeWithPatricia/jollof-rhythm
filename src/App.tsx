import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame, { EventBus, EV } from './game/main';
import type { GamePhase } from './game/main';

interface IRefPhaserGame {
  game: Phaser.Game | null;
  scene: Phaser.Scene | null;
}

interface HudState {
  earnings: number;
  timeLeft: number;
  servedCount: number;
  missedCount: number;
}

const HIGH_SCORE_KEY = 'jollof_junction_high_score';

function fmtNaira(n: number) {
  return '₦' + n.toLocaleString('en-US');
}

// --- inline SVG icons (no icon libraries allowed) ---
const IconPause = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <rect x="5" y="4" width="5" height="16" rx="1.5" />
    <rect x="14" y="4" width="5" height="16" rx="1.5" />
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" />
  </svg>
);
const IconSoundOn = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);
const IconSoundOff = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
const IconPlate = () => (
  <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden>
    <ellipse cx="24" cy="30" rx="19" ry="8" fill="#C96F3A" />
    <ellipse cx="24" cy="28" rx="19" ry="7" fill="#9C4F24" />
    <circle cx="20" cy="22" r="8" fill="#D9481F" />
    <circle cx="29" cy="24" r="6" fill="#D9481F" />
    <circle cx="24" cy="19" r="5" fill="#F2994A" />
    <ellipse cx="34" cy="27" rx="5" ry="3" fill="#F2C94C" />
    <circle cx="14" cy="26" r="4" fill="#A96A2E" />
    <circle cx="25" cy="14" r="2.4" fill="#3A6B35" />
  </svg>
);

function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [phase, setPhase] = useState<GamePhase>('BOOT');
  const [hud, setHud] = useState<HudState>({
    earnings: 0,
    timeLeft: 60,
    servedCount: 0,
    missedCount: 0,
  });
  const [tipFlash, setTipFlash] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState<number>(() =>
    Number(localStorage.getItem(HIGH_SCORE_KEY) || 0),
  );

  // Mount the Phaser game into #game-container exactly once.
  useLayoutEffect(() => {
    if (phaserRef.current === null) {
      const game = StartGame('game-container');
      phaserRef.current = { game, scene: null };
    }
    const handler = (scene: Phaser.Scene) => {
      if (phaserRef.current) phaserRef.current.scene = scene;
    };
    EventBus.on(EV.SCENE_READY, handler);
    return () => {
      EventBus.removeListener(EV.SCENE_READY, handler);
      if (phaserRef.current) {
        phaserRef.current.game?.destroy(true);
        phaserRef.current = null;
      }
    };
  }, []);

  // EventBus subscriptions for HUD + phase.
  useEffect(() => {
    const onPhase = (p: GamePhase) => {
      setPhase(p);
      if (p === 'FINISHED') {
        setBest(Number(localStorage.getItem(HIGH_SCORE_KEY) || 0));
      }
    };
    const onHud = (h: HudState) => setHud(h);
    const onServed = (d: { earnings: number; tip: number }) => {
      if (d.tip > 0) {
        setTipFlash(d.tip);
        window.setTimeout(() => setTipFlash(null), 1200);
      }
    };
    EventBus.on(EV.PHASE_CHANGED, onPhase);
    EventBus.on(EV.HUD_UPDATED, onHud);
    EventBus.on(EV.ORDER_SERVED, onServed);
    return () => {
      EventBus.removeListener(EV.PHASE_CHANGED, onPhase);
      EventBus.removeListener(EV.HUD_UPDATED, onHud);
      EventBus.removeListener(EV.ORDER_SERVED, onServed);
    };
  }, []);

  const startGame = () => {
    const scene = phaserRef.current?.scene as
      | { playBgm: () => void }
      | null;
    scene?.playBgm();
    EventBus.emit(EV.START_GAME);
  };
  const restart = () => {
    const scene = phaserRef.current?.scene as
      | { playBgm: () => void }
      | null;
    scene?.playBgm();
    EventBus.emit(EV.RESTART_GAME);
  };
  const togglePause = () => EventBus.emit(EV.PAUSE_TOGGLE);
  const serveDish = () => EventBus.emit(EV.SERVE_DISH);
  const toggleMute = () => {
    const game = phaserRef.current?.game;
    if (game) {
      game.sound.mute = !game.sound.mute;
      setMuted(game.sound.mute);
    }
  };

  const playing = phase === 'PLAYING' || phase === 'PAUSED' || phase === 'COUNTDOWN';
  const timeLow = hud.timeLeft <= 10 && phase === 'PLAYING';

  return (
    <div id="app">
      <div id="game-container"></div>

      <div id="hud">
        {/* ---------- TOP BAR ---------- */}
        {playing && (
          <div className="topbar">
            <div className="pill pill-money">
              <span className="pill-label">EARNINGS</span>
              <span className="pill-value">{fmtNaira(hud.earnings)}</span>
            </div>
            <div className={`pill pill-time ${timeLow ? 'time-low' : ''}`}>
              <span className="pill-label">TIME</span>
              <span className="pill-value">{Math.max(0, hud.timeLeft)}s</span>
            </div>
            <div className="topbar-right">
              <button className="icon-btn" onClick={toggleMute} aria-label="Toggle sound">
                {muted ? <IconSoundOff /> : <IconSoundOn />}
              </button>
              <button
                className="icon-btn"
                onClick={togglePause}
                aria-label="Pause"
                disabled={phase === 'COUNTDOWN'}
              >
                {phase === 'PAUSED' ? <IconPlay /> : <IconPause />}
              </button>
            </div>
          </div>
        )}

        {/* ---------- SERVE BUTTON (bottom, always during play) ---------- */}
        {phase === 'PLAYING' && (
          <div className="tray">
            <button className="serve-btn" onClick={serveDish}>
              <IconPlate />
              <span className="serve-label">SERVE JOLLOF</span>
              <span className="serve-key">SPACE</span>
            </button>
          </div>
        )}

        {tipFlash !== null && (
          <div className="tip-toast">SPEED TIP +{fmtNaira(tipFlash)}</div>
        )}

        {/* ---------- MENU ---------- */}
        {phase === 'MENU' && (
          <div className="overlay">
            <div className="panel">
              <div className="title-wrap">
                <h1 className="game-title">JOLLOF JUNCTION</h1>
                <p className="game-sub">Street-food stall sim</p>
              </div>
              <ul className="rules">
                <li>Customers queue at your counter with one order each — a Jollof Plate.</li>
                <li>Tap SERVE JOLLOF (or press SPACE) to fill the order of the customer at the front.</li>
                <li>Serve before their patience bar runs out — fast service earns a speed tip.</li>
                <li>Run the junction for 60 seconds and stack up your earnings!</li>
              </ul>
              <button className="cta" onClick={startGame}>
                START COOKING
              </button>
              {best > 0 && (
                <p className="best-line">Best today: {fmtNaira(best)}</p>
              )}
            </div>
          </div>
        )}

        {/* ---------- PAUSE ---------- */}
        {phase === 'PAUSED' && (
          <div className="overlay">
            <div className="panel">
              <h2 className="panel-title">PAUSED</h2>
              <p className="panel-sub">The queue is waiting…</p>
              <button className="cta" onClick={togglePause}>
                RESUME
              </button>
              <button className="cta cta-ghost" onClick={restart}>
                RESTART ROUND
              </button>
            </div>
          </div>
        )}

        {/* ---------- GAME OVER ---------- */}
        {phase === 'FINISHED' && (
          <div className="overlay">
            <div className="panel">
              <h2 className="panel-title">MARKET CLOSED!</h2>
              <div className="result-big">{fmtNaira(hud.earnings)}</div>
              <p className="panel-sub">earned at the junction</p>
              <div className="result-row">
                <div className="result-cell good">
                  <span className="result-num">{hud.servedCount}</span>
                  <span className="result-lbl">served</span>
                </div>
                <div className="result-cell bad">
                  <span className="result-num">{hud.missedCount}</span>
                  <span className="result-lbl">walked out</span>
                </div>
                <div className="result-cell">
                  <span className="result-num">{fmtNaira(best)}</span>
                  <span className="result-lbl">best</span>
                </div>
              </div>
              <button className="cta" onClick={restart}>
                COOK AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;