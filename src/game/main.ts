import * as Phaser from 'phaser';
import {
  AUTO,
  Events,
  Game as PhaserGame,
  Scale,
  Scene,
} from 'phaser';

// ---------------------------------------------------------------------------
// JOLLOF JUNCTION — 2D time-management street-food stall sim
// Portrait 540x960, Phaser 4.2.1, Arcade Physics (no gravity — tween driven)
// ---------------------------------------------------------------------------

export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

export const COLORS = {
  SKY: '#FBF3E7',
  RED: '#D9481F',
  ORANGE: '#F2994A',
  GREEN: '#3A6B35',
  YELLOW: '#F2C94C',
  CHARCOAL: '#2B2320',
  CREAM: '#FBF3E7',
  BROWN: '#8B5A2B',
  DARKBROWN: '#5C3A1E',
} as const;

// Event name constants — single source of truth (scene + App.tsx import these)
export const EV = {
  PHASE_CHANGED: 'phase-changed',
  SCENE_READY: 'current-scene-ready',
  HUD_UPDATED: 'hud-updated',
  ORDER_SERVED: 'order-served',
  CUSTOMER_LEFT: 'customer-left-unhappy',
  START_GAME: 'start-game',
  PAUSE_TOGGLE: 'pause-toggle',
  RESTART_GAME: 'restart-game',
  SERVE_DISH: 'serve-dish',
} as const;

export type GamePhase =
  | 'BOOT'
  | 'MENU'
  | 'COUNTDOWN'
  | 'PLAYING'
  | 'PAUSED'
  | 'FINISHED';

export const EventBus = new Events.EventEmitter();

// ---------------------------------------------------------------------------
// Game balance constants
// ---------------------------------------------------------------------------
const ROUND_SECONDS = 60;
const BASE_PAY = 2500;
const TIP_PAY = 500;
const TIP_THRESHOLD = 0.6; // patience fraction above which a speed tip is earned
const MAX_QUEUE = 3;
const QUEUE_XS = [270, 150, 55]; // front at counter, then behind
const COUNTER_Y = 520;

interface Customer {
  id: number;
  container: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Container;
  barBg: Phaser.GameObjects.Image;
  barFill: Phaser.GameObjects.Image;
  patience: number; // seconds remaining
  maxPatience: number;
  state: 'walking' | 'waiting' | 'leaving-happy' | 'leaving-angry';
  slot: number;
}

// ---------------------------------------------------------------------------
// Texture factory — all procedural vector sprites generated once in create()
// ---------------------------------------------------------------------------
function makeTextures(scene: Scene) {
  const g = scene.add.graphics();

  // --- Jollof plate: earthenware bowl + rice mound + dodo + chicken + pepper
  g.clear();
  // bowl
  g.fillStyle(0xc96f3a, 1);
  g.fillEllipse(48, 52, 84, 30);
  g.fillStyle(0x9c4f24, 1);
  g.fillEllipse(48, 56, 84, 24);
  // rice mound (orange-red)
  g.fillStyle(0xd9481f, 1);
  g.fillCircle(40, 38, 20);
  g.fillCircle(56, 40, 17);
  g.fillCircle(48, 32, 15);
  g.fillStyle(0xf2994a, 1);
  g.fillCircle(42, 34, 9);
  g.fillCircle(54, 38, 7);
  // fried plantain slices (dodo)
  g.fillStyle(0xf2c94c, 1);
  g.fillEllipse(70, 46, 16, 9);
  g.fillEllipse(74, 38, 14, 8);
  g.lineStyle(1, 0x8b5a2b, 1);
  g.strokeEllipse(70, 46, 16, 9);
  // grilled chicken drumstick
  g.fillStyle(0xa96a2e, 1);
  g.fillCircle(24, 42, 9);
  g.fillStyle(0xf5e6c8, 1);
  g.fillRect(14, 40, 8, 4);
  // green pepper garnish
  g.fillStyle(0x3a6b35, 1);
  g.fillCircle(48, 24, 4);
  g.fillCircle(56, 26, 3);
  g.generateTexture('jollof_plate', 96, 72);

  // --- Customer avatars (5 variants: skin tones + gele headwraps / caps)
  const skins = [0x8d5524, 0xa9714b, 0x6b4226, 0xc68642, 0x7f4f24];
  const wraps = [0xd9481f, 0x3a6b35, 0xf2c94c, 0x2d7d9a, 0x9b2d5e];
  const shirts = [0xf2994a, 0x3a6b35, 0x2d7d9a, 0x9b2d5e, 0xf2c94c];
  for (let i = 0; i < 5; i++) {
    g.clear();
    // body / shirt
    g.fillStyle(shirts[i], 1);
    g.fillRoundedRect(14, 46, 44, 42, 10);
    // pattern stripes on shirt
    g.fillStyle(0xffffff, 0.25);
    g.fillRect(14, 56, 44, 4);
    g.fillRect(14, 70, 44, 4);
    // head
    g.fillStyle(skins[i], 1);
    g.fillCircle(36, 30, 17);
    // headwrap or cap (alternate)
    if (i % 2 === 0) {
      g.fillStyle(wraps[i], 1);
      g.fillRoundedRect(18, 10, 36, 16, 8);
      g.fillCircle(50, 14, 8); // gele knot
    } else {
      g.fillStyle(wraps[i], 1);
      g.fillRoundedRect(19, 12, 34, 12, 6); // kufi cap
    }
    // eyes
    g.fillStyle(0xffffff, 1);
    g.fillCircle(30, 30, 4);
    g.fillCircle(43, 30, 4);
    g.fillStyle(0x2b2320, 1);
    g.fillCircle(31, 31, 2);
    g.fillCircle(44, 31, 2);
    // smile
    g.lineStyle(2, 0x2b2320, 1);
    g.beginPath();
    g.arc(36, 36, 8, 0.2, Math.PI - 0.2, false);
    g.strokePath();
    g.generateTexture('customer_' + i, 72, 90);
  }

  // --- Order speech bubble
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.lineStyle(3, 0x2b2320, 1);
  g.fillRoundedRect(4, 4, 84, 64, 14);
  g.strokeRoundedRect(4, 4, 84, 64, 14);
  // tail
  g.fillStyle(0xffffff, 1);
  g.fillTriangle(40, 66, 52, 66, 46, 80);
  g.lineStyle(3, 0x2b2320, 1);
  g.beginPath();
  g.moveTo(40, 67);
  g.lineTo(46, 80);
  g.lineTo(52, 67);
  g.strokePath();
  g.generateTexture('order_bubble', 92, 84);

  // --- Patience bar bg + fill (white fills we tint at runtime)
  g.clear();
  g.fillStyle(0x2b2320, 1);
  g.fillRoundedRect(0, 0, 80, 12, 6);
  g.generateTexture('patience_bar_bg', 80, 12);
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, 76, 8, 4);
  g.generateTexture('patience_bar_fill', 76, 8);

  // --- Naira coin
  g.clear();
  g.fillStyle(0xd9a520, 1);
  g.fillCircle(16, 16, 15);
  g.fillStyle(0xf2c94c, 1);
  g.fillCircle(16, 16, 12);
  g.lineStyle(2, 0x8b5a2b, 1);
  g.strokeCircle(16, 16, 12);
  g.generateTexture('naira_coin', 32, 32);

  // --- Serve button background
  g.clear();
  g.fillStyle(0x2b2320, 1);
  g.fillRoundedRect(0, 0, 260, 120, 20);
  g.fillStyle(0xd9481f, 1);
  g.fillRoundedRect(5, 5, 250, 108, 16);
  g.fillStyle(0xf2994a, 1);
  g.fillRoundedRect(12, 12, 236, 50, 12);
  g.generateTexture('serve_button_bg', 260, 120);

  // --- Stall canopy (striped awning, scalloped bottom)
  g.clear();
  for (let x = 0; x < 320; x += 40) {
    g.fillStyle(x % 80 === 0 ? 0xd9481f : 0xf2c94c, 1);
    g.fillRect(x, 0, 40, 46);
    g.fillStyle(x % 80 === 0 ? 0xd9481f : 0xf2c94c, 1);
    g.fillCircle(x + 20, 46, 20);
  }
  g.lineStyle(4, 0x2b2320, 1);
  g.strokeRect(0, 0, 320, 46);
  g.generateTexture('stall_canopy', 320, 68);

  // --- Stall counter (wood + geometric border)
  g.clear();
  g.fillStyle(0x8b5a2b, 1);
  g.fillRect(0, 0, 420, 90);
  g.fillStyle(0x5c3a1e, 1);
  g.fillRect(0, 0, 420, 10);
  // west-african geometric triangle border
  g.fillStyle(0xf2c94c, 1);
  for (let x = 10; x < 410; x += 40) {
    g.fillTriangle(x, 70, x + 15, 45, x + 30, 70);
  }
  g.fillStyle(0x3a6b35, 1);
  for (let x = 25; x < 410; x += 40) {
    g.fillTriangle(x, 45, x + 15, 70, x + 30, 45);
  }
  g.lineStyle(4, 0x2b2320, 1);
  g.strokeRect(0, 0, 420, 90);
  g.generateTexture('stall_counter', 420, 90);

  // --- Steam puff / heart / angry cloud small textures
  g.clear();
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(8, 8, 6);
  g.fillCircle(14, 6, 5);
  g.fillCircle(11, 11, 5);
  g.generateTexture('steam_puff', 22, 20);

  g.clear();
  g.fillStyle(0xe0335b, 1);
  g.fillCircle(7, 6, 5);
  g.fillCircle(13, 6, 5);
  g.fillTriangle(3, 8, 17, 8, 10, 17);
  g.generateTexture('heart', 20, 18);

  g.clear();
  g.fillStyle(0x555a66, 1);
  g.fillCircle(10, 12, 8);
  g.fillCircle(20, 10, 9);
  g.fillCircle(28, 13, 7);
  g.generateTexture('storm_cloud', 40, 24);

  g.destroy();
}

// ---------------------------------------------------------------------------
// THE GAME SCENE
// ---------------------------------------------------------------------------
export class Game extends Scene {
  private phase: GamePhase = 'MENU';
  private customers: Customer[] = [];
  private nextId = 0;
  private earnings = 0;
  private servedCount = 0;
  private missedCount = 0;
  private timeLeft = ROUND_SECONDS;
  private lastEmittedSecond = ROUND_SECONDS;
  private spawnTimer = 0;
  private hudAccum = 0;
  private countdownValue = 3;
  private countdownText!: Phaser.GameObjects.Text;
  private countdownEvent?: Phaser.Time.TimerEvent;
  private worldLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private serveButton!: Phaser.GameObjects.Container;
  private bgm?: Phaser.Sound.BaseSound;

  constructor() {
    super('Game');
  }

  // -------------------------------------------------- lifecycle
  preload() {
    this.load.image('fx_spark', 'assets/fx/spark.png');
    this.load.image('fx_star', 'assets/fx/star.png');
    this.load.audio('sfx_collect', 'assets/audio/sfx_collect.mp3');
    this.load.audio('sfx_hit', 'assets/audio/sfx_hit.mp3');
    this.load.audio('sfx_win', 'assets/audio/sfx_win.mp3');
    this.load.audio('sfx_powerup', 'assets/audio/sfx_powerup.mp3');
    this.load.audio('sfx_button', 'assets/audio/sfx_button.mp3');
    this.load.audio('bgm_action', 'assets/audio/bgm_action.mp3');
  }

  create() {
    makeTextures(this);
    this.buildBackground();
    this.buildStall();
    this.buildServeButton();

    this.fxLayer = this.add.container(0, 0).setDepth(50);

    // --- input: keyboard parity
    this.input.keyboard!.addCapture('SPACE,ENTER,DIGIT1,ESC,KEY_P');
    this.input.keyboard!.on('keydown-SPACE', () => this.onServeKey());
    this.input.keyboard!.on('keydown-ENTER', () => this.onServeKey());
    this.input.keyboard!.on('keydown-DIGIT1', () => this.onServeKey());
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard!.on('keydown-P', () => this.togglePause());

    // --- EventBus commands from React
    EventBus.on(EV.START_GAME, this.startGame, this);
    EventBus.on(EV.RESTART_GAME, this.startGame, this);
    EventBus.on(EV.PAUSE_TOGGLE, this.togglePause, this);
    EventBus.on(EV.SERVE_DISH, this.serveDish, this);

    this.events.once('shutdown', () => {
      EventBus.off(EV.START_GAME, this.startGame, this);
      EventBus.off(EV.RESTART_GAME, this.startGame, this);
      EventBus.off(EV.PAUSE_TOGGLE, this.togglePause, this);
      EventBus.off(EV.SERVE_DISH, this.serveDish, this);
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.input.keyboard?.removeAllListeners();
      this.sound.stopAll();
    });

    this.setPhase('MENU');
    EventBus.emit(EV.SCENE_READY, this);
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    if (this.phase === 'PLAYING') {
      // round clock
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endRound();
        return;
      }

      // spawn logic
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.customers.length < MAX_QUEUE) {
        this.spawnCustomer();
        this.spawnTimer = 1.6 + Math.random() * 1.4;
      }

      // patience drain
      for (const c of this.customers) {
        if (c.state !== 'waiting') continue;
        c.patience -= dt;
        const frac = Math.max(0, c.patience / c.maxPatience);
        c.barFill.setScale(frac, 1);
        const col = frac > 0.5 ? 0x3a6b35 : frac > 0.25 ? 0xf2c94c : 0xd9481f;
        c.barFill.setTint(col);
        if (frac <= 0.25) {
          c.barFill.setAlpha(0.6 + 0.4 * Math.sin(this.time.now / 90));
        } else {
          c.barFill.setAlpha(1);
        }
        if (c.patience <= 0) {
          this.customerWalkout(c);
        }
      }

      // HUD push (throttled) — floor so each integer second (incl. 1s) is
      // displayed for a full second; emit only on integer-second transitions
      this.hudAccum += dt;
      if (this.hudAccum >= 0.1) {
        this.hudAccum = 0;
        const displayTime = Math.floor(this.timeLeft);
        if (displayTime !== this.lastEmittedSecond) {
          this.lastEmittedSecond = displayTime;
          EventBus.emit(EV.HUD_UPDATED, {
            earnings: this.earnings,
            timeLeft: displayTime,
            servedCount: this.servedCount,
            missedCount: this.missedCount,
          });
        }
      }
    }
  }

  // -------------------------------------------------- background
  private buildBackground() {
    this.worldLayer = this.add.container(0, 0).setDepth(0);

    // sky gradient via stacked rects (manual lerp, no Phaser.Color)
    const sky = this.add.graphics();
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const r = Math.round(251 + (242 - 251) * t);
      const gg = Math.round(243 + (201 - 243) * t);
      const b = Math.round(231 + (156 - 231) * t);
      sky.fillStyle((r << 16) | (gg << 8) | b, 1);
      sky.fillRect(0, i * 90, GAME_WIDTH, 92);
    }
    this.worldLayer.add(sky);

    // distant market stalls (organic silhouettes)
    const far = this.add.graphics();
    const stallCols = [0xd9481f, 0x3a6b35, 0xf2c94c, 0x2d7d9a, 0x9b2d5e];
    for (let i = 0; i < 5; i++) {
      const x = 20 + i * 105;
      far.fillStyle(0x000000, 0.08);
      far.fillRect(x, 300, 90, 120);
      // striped mini roof
      for (let s = 0; s < 90; s += 18) {
        far.fillStyle(s % 36 === 0 ? 0xd9481f : 0xf2c94c, 0.6);
        far.fillRect(x + s, 292, 18, 14);
      }
    }
    this.worldLayer.add(far);

    // ground
    const ground = this.add.graphics();
    ground.fillStyle(0xd9b98c, 1);
    ground.fillRect(0, 420, GAME_WIDTH, GAME_HEIGHT - 420);
    ground.fillStyle(0xc9a877, 1);
    for (let i = 0; i < 12; i++) {
      ground.fillEllipse(30 + i * 45, 640 + (i % 3) * 90, 60, 18);
    }
    this.worldLayer.add(ground);

    // bunting flags across the top (two-segment string + triangles)
    const bunt = this.add.graphics();
    bunt.lineStyle(2, 0x2b2320, 1);
    bunt.beginPath();
    bunt.moveTo(0, 60);
    bunt.lineTo(GAME_WIDTH / 2, 110);
    bunt.lineTo(GAME_WIDTH, 60);
    bunt.strokePath();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const bx = t * GAME_WIDTH;
      const by = t < 0.5 ? 60 + t * 100 : 160 - t * 100;
      bunt.fillStyle(stallCols[i % stallCols.length], 1);
      bunt.fillTriangle(bx - 9, by, bx + 9, by, bx, by + 22);
    }
    this.worldLayer.add(bunt);

    // palm fronds in corners (layered triangles — organic, no prison bars)
    const palm = this.add.graphics();
    palm.fillStyle(0x3a6b35, 0.9);
    palm.fillTriangle(0, 130, 90, 60, 150, 95);
    palm.fillTriangle(0, 130, 150, 95, 70, 150);
    palm.fillTriangle(0, 170, 110, 140, 60, 210);
    palm.fillStyle(0x2f5a2b, 0.9);
    palm.fillTriangle(540, 130, 450, 60, 390, 95);
    palm.fillTriangle(540, 130, 390, 95, 470, 150);
    this.worldLayer.add(palm);
  }

  // -------------------------------------------------- stall
  private buildStall() {
    // canopy
    const canopy = this.add.image(GAME_WIDTH / 2, 300, 'stall_canopy');
    this.worldLayer.add(canopy);
    // posts
    const posts = this.add.graphics();
    posts.fillStyle(0x5c3a1e, 1);
    posts.fillRect(68, 330, 10, 190);
    posts.fillRect(462, 330, 10, 190);
    this.worldLayer.add(posts);
    // counter
    const counter = this.add.image(GAME_WIDTH / 2, 545, 'stall_counter');
    this.worldLayer.add(counter);

    // hot pot on counter with steam emitter
    const pot = this.add.graphics();
    pot.fillStyle(0x333842, 1);
    pot.fillRoundedRect(398, 480, 46, 26, 6);
    pot.fillStyle(0xd9481f, 1);
    pot.fillEllipse(421, 481, 42, 10);
    this.worldLayer.add(pot);

    const steam = this.add.particles(421, 470, 'steam_puff', {
      speedY: { min: -40, max: -20 },
      speedX: { min: -8, max: 8 },
      alpha: { start: 0.7, end: 0 },
      scale: { start: 0.6, end: 1.4 },
      lifespan: 1400,
      frequency: 260,
      quantity: 1,
    });
    steam.setDepth(5);
    this.worldLayer.add(steam);

    // bowls of rice on counter
    const bowl = this.add.graphics();
    bowl.fillStyle(0xc96f3a, 1);
    bowl.fillEllipse(110, 505, 44, 16);
    bowl.fillStyle(0xd9481f, 1);
    bowl.fillEllipse(110, 500, 38, 12);
    bowl.fillStyle(0xc96f3a, 1);
    bowl.fillEllipse(180, 505, 44, 16);
    bowl.fillStyle(0xd9481f, 1);
    bowl.fillEllipse(180, 500, 38, 12);
    this.worldLayer.add(bowl);
  }

  // -------------------------------------------------- serve button (in-scene)
  private buildServeButton() {
    this.serveButton = this.add
  .container(GAME_WIDTH / 2, 800)
  .setDepth(40);
this.serveButton.setSize(260, 90);
this.serveButton.setInteractive(
  new Phaser.Geom.Rectangle(-130, -45, 260, 90),
  Phaser.Geom.Rectangle.Contains
);

    const bg = this.add.image(0, 0, 'serve_button_bg');
    const plate = this.add.image(0, -14, 'jollof_plate').setScale(0.9);
    const label = this.add
      .text(0, 34, 'SERVE JOLLOF', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '22px',
        color: COLORS.CREAM,
        stroke: COLORS.CHARCOAL,
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    const badge = this.add
      .text(0, 52, '[ SPACE ]', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.CHARCOAL,
        backgroundColor: COLORS.YELLOW,
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5);

    this.serveButton.add([bg, plate, label, badge]);
    this.serveButton.on('pointerdown', () => this.serveDish());
  }

  // -------------------------------------------------- phase machine
  private setPhase(p: GamePhase) {
    this.phase = p;
    EventBus.emit(EV.PHASE_CHANGED, p);
  }

  private onServeKey() {
    if (this.phase === 'PLAYING') {
      this.serveDish();
    }
  }

  private startGame() {
    // reset state
    for (const c of this.customers) c.container.destroy();
    this.customers = [];
    this.earnings = 0;
    this.servedCount = 0;
    this.missedCount = 0;
    this.timeLeft = ROUND_SECONDS;
    this.lastEmittedSecond = ROUND_SECONDS;
    this.spawnTimer = 0;
    this.hudAccum = 0;
    EventBus.emit(EV.HUD_UPDATED, {
      earnings: 0,
      timeLeft: ROUND_SECONDS,
      servedCount: 0,
      missedCount: 0,
    });

    this.setPhase('COUNTDOWN');
    this.runCountdown();
  }

  private runCountdown() {
    if (this.countdownEvent) this.countdownEvent.remove();
    this.countdownValue = 3;
    if (this.countdownText) this.countdownText.destroy();
    this.countdownText = this.add
      .text(GAME_WIDTH / 2, 400, 'Ready? Cook!', {
        fontFamily: 'Arial Black, Arial',
        fontSize: '40px',
        color: COLORS.RED,
        stroke: COLORS.CHARCOAL,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(60);

    const tick = () => {
      if (this.countdownValue > 0) {
        this.countdownText.setText(String(this.countdownValue));
        this.countdownText.setScale(1.6);
        this.tweens.add({ targets: this.countdownText, scale: 1, duration: 300 });
        this.safePlay('sfx_button');
        this.countdownValue--;
      } else {
        this.countdownText.setText('GO!');
        this.countdownText.setColor(COLORS.GREEN);
        this.tweens.add({
          targets: this.countdownText,
          alpha: 0,
          y: 340,
          duration: 500,
          onComplete: () => this.countdownText.destroy(),
        });
        this.setPhase('PLAYING');
      }
    };
    tick(); // shows "3" immediately
    this.countdownEvent = this.time.addEvent({
      delay: 1000,
      callback: tick,
      repeat: 2, // fires at 1s ("2"), 2s ("1"), 3s ("GO!" + PLAYING)
      callbackScope: this,
    });
  }

  private togglePause() {
    if (this.phase === 'PLAYING') {
      this.setPhase('PAUSED');
      this.physics.world.pause();
      this.tweens.pauseAll();
      this.sound.pauseAll();
    } else if (this.phase === 'PAUSED') {
      this.setPhase('PLAYING');
      this.physics.world.resume();
      this.tweens.resumeAll();
      this.sound.resumeAll();
    }
  }

  private endRound() {
    // Freeze the clock at exactly 0 and emit the final tick BEFORE the
    // phase transition so the HUD renders '0s' cleanly under the overlay
    this.timeLeft = 0;
    this.lastEmittedSecond = 0;
    EventBus.emit(EV.HUD_UPDATED, {
      earnings: this.earnings,
      timeLeft: 0,
      servedCount: this.servedCount,
      missedCount: this.missedCount,
    });
    this.setPhase('FINISHED');
    this.safePlay('sfx_win');
    if (this.bgm) this.bgm.stop();
    // persist best earnings
    const best = Number(localStorage.getItem('jollof_junction_high_score') || 0);
    if (this.earnings > best) {
      localStorage.setItem('jollof_junction_high_score', String(this.earnings));
    }
  }

  // -------------------------------------------------- customers
  private spawnCustomer() {
    const slot = this.customers.length;
    if (slot >= MAX_QUEUE) return;
    const variant = Math.floor(Math.random() * 5);
    const container = this.add.container(-80, COUNTER_Y).setDepth(20);

    const sprite = this.add.image(0, 0, 'customer_' + variant);
    container.add(sprite);

    // bubble + plate + patience bar
    const bubble = this.add.container(0, -86);
    const bImg = this.add.image(0, 0, 'order_bubble');
    const plate = this.add.image(0, -6, 'jollof_plate').setScale(0.62);
    const barBg = this.add.image(0, -46, 'patience_bar_bg');
    const barFill = this.add
      .image(-2, -46, 'patience_bar_fill')
      .setOrigin(0, 0.5);
    bubble.add([bImg, plate, barBg, barFill]);
    bubble.setScale(0);
    container.add(bubble);

    const maxPatience = 7 + Math.random() * 3;
    const c: Customer = {
      id: this.nextId++,
      container,
      sprite,
      bubble,
      barBg,
      barFill,
      patience: maxPatience,
      maxPatience,
      state: 'walking',
      slot,
    };
    this.customers.push(c);

    // walk-in tween to its slot
    const targetX = QUEUE_XS[slot];
    this.tweens.add({
      targets: container,
      x: targetX,
      duration: 700,
      ease: 'Sine.easeOut',
      onComplete: () => {
        c.state = 'waiting';
        this.tweens.add({
          targets: bubble,
          scale: 1,
          duration: 260,
          ease: 'Back.easeOut',
        });
      },
    });
    // gentle bob while walking
    this.tweens.add({
      targets: sprite,
      y: -6,
      duration: 200,
      yoyo: true,
      repeat: 3,
    });
  }

  private serveDish() {
    if (this.phase !== 'PLAYING') return;
    const front = this.customers.find((c) => c.state === 'waiting');
    if (!front) return;

    const frac = front.patience / front.maxPatience;
    const tip = frac > TIP_THRESHOLD ? TIP_PAY : 0;
    const pay = BASE_PAY + tip;
    this.earnings += pay;
    this.servedCount++;
    front.state = 'leaving-happy';

    this.safePlay('sfx_powerup');
    this.safePlay('sfx_collect');

    // floating currency text + coin burst at the customer
    const cx = front.container.x;
    const cy = front.container.y - 110;
    const t = this.add
      .text(cx, cy, `+₦${pay.toLocaleString()}`, {
        fontFamily: 'Arial Black, Arial',
        fontSize: '26px',
        color: tip ? COLORS.GREEN : COLORS.CHARCOAL,
        stroke: COLORS.CREAM,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({
      targets: t,
      y: cy - 70,
      alpha: 0,
      duration: 1000,
      onComplete: () => t.destroy(),
    });
    this.coinBurst(cx, cy);
    // heart burst
    for (let i = 0; i < 3; i++) {
      const h = this.add.image(cx, front.container.y - 40, 'heart').setDepth(70);
      this.tweens.add({
        targets: h,
        y: h.y - 50 - i * 12,
        x: h.x + (i - 1) * 22,
        alpha: 0,
        duration: 800,
        onComplete: () => h.destroy(),
      });
    }

    EventBus.emit(EV.ORDER_SERVED, {
      earnings: this.earnings,
      tip,
      customerId: String(front.id),
    });
    EventBus.emit(EV.HUD_UPDATED, {
      earnings: this.earnings,
      timeLeft: Math.floor(this.timeLeft),
      servedCount: this.servedCount,
      missedCount: this.missedCount,
    });

    // happy walk-out to the right
    this.tweens.add({
      targets: front.container,
      x: GAME_WIDTH + 90,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeIn',
      onComplete: () => this.removeCustomer(front),
    });
    this.advanceQueue();
  }

  private customerWalkout(c: Customer) {
    c.state = 'leaving-angry';
    this.missedCount++;
    this.safePlay('sfx_hit');

    // storm cloud above head
    const cloud = this.add
      .image(c.container.x, c.container.y - 110, 'storm_cloud')
      .setDepth(70);
    this.tweens.add({
      targets: cloud,
      y: cloud.y - 30,
      alpha: 0,
      duration: 900,
      onComplete: () => cloud.destroy(),
    });

    EventBus.emit(EV.CUSTOMER_LEFT, { customerId: String(c.id) });
    EventBus.emit(EV.HUD_UPDATED, {
      earnings: this.earnings,
      timeLeft: Math.floor(this.timeLeft),
      servedCount: this.servedCount,
      missedCount: this.missedCount,
    });

    this.tweens.add({
      targets: c.container,
      x: -90,
      angle: -8,
      duration: 600,
      ease: 'Sine.easeIn',
      onComplete: () => this.removeCustomer(c),
    });
    this.advanceQueue();
  }

  private removeCustomer(c: Customer) {
    c.container.destroy();
    this.customers = this.customers.filter((x) => x !== c);
    this.advanceQueue();
  }

  private advanceQueue() {
    let slot = 0;
    for (const c of this.customers) {
      if (c.state === 'walking' || c.state === 'waiting') {
        c.slot = slot;
        this.tweens.add({
          targets: c.container,
          x: QUEUE_XS[Math.min(slot, MAX_QUEUE - 1)],
          duration: 350,
          ease: 'Sine.easeOut',
        });
        slot++;
      }
    }
  }

  // -------------------------------------------------- fx helpers
  private coinBurst(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const coin = this.add.image(x, y, 'naira_coin').setDepth(70);
      const ang = (Math.PI * 2 * i) / 6;
      this.tweens.add({
        targets: coin,
        x: x + Math.cos(ang) * 50,
        y: y + Math.sin(ang) * 50 - 20,
        alpha: 0,
        scale: 0.4,
        rotation: 360,
        duration: 700,
        onComplete: () => coin.destroy(),
      });
    }
    // sparkle burst using pre-packaged spark
    if (this.textures.exists('fx_spark')) {
      const burst = this.add.particles(x, y, 'fx_spark', {
        speed: { min: 80, max: 180 },
        scale: { start: 0.8, end: 0 },
        lifespan: 500,
        emitting: false,
      });
      burst.setDepth(71);
      burst.explode(12);
      this.time.delayedCall(600, () => burst.destroy());
    }
  }

  private safePlay(key: string) {
    if (this.cache.audio.exists(key)) {
      this.sound.play(key, { volume: 0.7 });
    }
  }

  // public: called by React menu Start button
  public playBgm() {
    if (this.bgm) return;
    if (this.cache.audio.exists('bgm_action')) {
      this.bgm = this.sound.add('bgm_action', { loop: true, volume: 0.4 });
      this.bgm.play();
    }
  }
}

// ---------------------------------------------------------------------------
// Phaser bootstrap factory
// ---------------------------------------------------------------------------
const StartGame = (parent: string) => {
  const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent,
    backgroundColor: COLORS.SKY,
    scale: {
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 } },
    },
    scene: [Game],
  };

  const game = new PhaserGame(config);
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
    (window as unknown as Record<string, unknown>).__PHASER_EVENT_BUS__ = EventBus;
  }
  return game;
};

export default StartGame;