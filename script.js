const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 定数定義
const COLS = 15;
const GOAL_DEPTH = 500; // ゴール深さ（メートル）
const ROWS = GOAL_DEPTH + 1; // 0〜500mまでの行数（計501行）
const VISIBLE_ROWS = 20; // 画面に表示する行数
const BLOCK_SIZE = 32; // 480 / 15 = 32
const COLORS = ['#FF4757', '#2ED573', '#1E90FF', '#FF6B81', '#FFA502'];

// カラーパレットマップ (メイン色 -> { top, bottom, shadow })
const COLOR_PALETTES = {
    '#FF4757': { top: '#FF7885', main: '#FF4757', bottom: '#C02E3D' },
    '#2ED573': { top: '#55E68A', main: '#2ED573', bottom: '#1C9C52' },
    '#1E90FF': { top: '#70A1FF', main: '#1E90FF', bottom: '#0F61B5' },
    '#FF6B81': { top: '#FFA4B2', main: '#FF6B81', bottom: '#C93A50' },
    '#FFA502': { top: '#FFC048', main: '#FFA502', bottom: '#C77C00' }
};
const PLAYER_GRAVITY_INTERVAL = 10; // プレイヤー重力の更新間隔
const BLOCK_GRAVITY_INTERVAL = 16;  // ブロック重力の更新間隔
const FALL_DELAY_FRAMES = 24;        // ブロック落下の溜め（猶予時間）

// AIRシステム定数
const MAX_AIR = 100;
const AIR_DECREASE_RATE = 0.03; // 1フレームあたりの減少量
const AIR_CAPSULE_CHANCE = 0.05; // AIRカプセルの出現確率
const PENALTY_BLOCK_CHANCE = 0.08; // ペナルティブロックの出現確率

// ゲームの状態定義
const STATE_START = 'START';
const STATE_PLAYING = 'PLAYING';
const STATE_GAMEOVER = 'GAMEOVER';
const STATE_GAMECLEAR = 'GAMECLEAR';

let gameState = STATE_START;
let stateChangeCooldown = 0; // 状態遷移直後の誤操作防止用クールダウン

// サウンド管理 (Web Audio API)
let audioCtx = null;
let isMuted = false;
let bgmTimer = null;
let bgmStep = 0;

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function toggleMute() {
    isMuted = !isMuted;
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.innerText = isMuted ? '🔇' : '🔊';
        muteBtn.title = isMuted ? 'サウンドOFF' : 'サウンドON';
    }
    if (isMuted) {
        stopBGM();
    } else if (gameState === STATE_PLAYING) {
        startBGM();
    }
}

// 効果音再生ヘルパー関数
function playTone(freq, type, duration, gainValue = 0.1, freqRamp = null) {
    if (isMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        if (freqRamp) {
            osc.frequency.exponentialRampToValueAtTime(freqRamp, audioCtx.currentTime + duration);
        }
        gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error(e);
    }
}

function playDigSE() {
    if (isMuted || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {}
}

function playClearSE() {
    if (isMuted || !audioCtx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
        setTimeout(() => {
            playTone(freq, 'triangle', 0.12, 0.12);
        }, idx * 40);
    });
}

function playAirSE() {
    if (isMuted || !audioCtx) return;
    playTone(587.33, 'sine', 0.08, 0.15, 880); // D5 -> A5
    setTimeout(() => {
        playTone(1174.66, 'sine', 0.15, 0.15); // D6
    }, 80);
}

function playPenaltySE() {
    if (isMuted || !audioCtx) return;
    playTone(120, 'square', 0.1, 0.2, 50);
}

function playGameOverSE() {
    stopBGM();
    if (isMuted || !audioCtx) return;
    const notes = [400, 350, 300, 220];
    notes.forEach((freq, idx) => {
        setTimeout(() => {
            playTone(freq, 'sawtooth', 0.25, 0.15);
        }, idx * 180);
    });
}

function playGameClearSE() {
    stopBGM();
    if (isMuted || !audioCtx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 880, 1046.50];
    const times = [0, 120, 240, 360, 540, 720];
    notes.forEach((freq, idx) => {
        setTimeout(() => {
            playTone(freq, 'triangle', 0.25, 0.15);
        }, times[idx]);
    });
}

// BGM再生シークエンサー (レガシー)
const BGM_MELODY = [
    261.63, 329.63, 392.00, 523.25, 392.00, 329.63, 261.63, 329.63,
    293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 349.23,
    329.63, 392.00, 493.88, 659.25, 493.88, 392.00, 329.63, 392.00,
    349.23, 440.00, 523.25, 698.46, 659.25, 587.33, 523.25, 392.00
];

function startLegacyBGM() {
    stopLegacyBGM();
    if (isMuted) return;
    bgmStep = 0;
    bgmTimer = setInterval(() => {
        if (gameState !== STATE_PLAYING || isMuted || !audioCtx) {
            stopLegacyBGM();
            return;
        }
        const freq = BGM_MELODY[bgmStep % BGM_MELODY.length];
        playTone(freq, 'square', 0.1, 0.03);

        if (bgmStep % 4 === 0) {
            const bassFreq = freq / 2;
            playTone(bassFreq, 'triangle', 0.18, 0.04);
        }
        bgmStep++;
    }, 140);
}

function stopLegacyBGM() {
    if (bgmTimer) {
        clearInterval(bgmTimer);
        bgmTimer = null;
    }
}


// --- Retro BGM Engine ---
const USE_RETRO_BGM = true;
let retroBgmTimer = null;
let retroBgmStep = 0;
let retroMasterGain = null;

// Frequencies for D Major scale
const N = {
    'd2': 73.42, 'e2': 82.41, 'f2': 92.50, 'g2': 98.00, 'a2': 110.00, 'b2': 123.47, 'c3': 138.59, // f2 is F#2, c3 is C#3
    'd3': 146.83, 'e3': 164.81, 'f3': 185.00, 'g3': 196.00, 'a3': 220.00, 'b3': 246.94, 'c4': 277.18,
    'd4': 293.66, 'e4': 329.63, 'f4': 369.99, 'g4': 392.00, 'a4': 440.00, 'b4': 493.88, 'c5': 554.37,
    'd5': 587.33, 'e5': 659.25, 'f5': 739.99, 'g5': 783.99, 'a5': 880.00, 'b5': 987.77, 'c6': 1108.73,
    'd6': 1174.66
};

// Sequences (16 steps per bar)
// '.' = rest
// Note: 1 char = 1 step. We use 1-char symbols for ease.

const SYM = {
    '1': N.d3, '2': N.e3, '3': N.f3, '4': N.g3, '5': N.a3, '6': N.b3, '7': N.c4,
    'q': N.d4, 'w': N.e4, 'e': N.f4, 'r': N.g4, 't': N.a4, 'y': N.b4, 'u': N.c5,
    'i': N.d5, 'o': N.e5, 'p': N.f5, 'a': N.g5, 's': N.a5, 'd': N.b5, 'f': N.c6,
    'g': N.d6,
    // Bass notes
    'z': N.d2, 'x': N.e2, 'c': N.f2, 'v': N.g2, 'b': N.a2, 'n': N.b2, 'm': N.c3,
    // Drums
    'K': 'kick', 'S': 'snare', 'H': 'hihat', 'R': 'roll'
};

// Section lengths (in bars)
// Intro(4), Verse(8), Chorus(8), Break(4), Chorus2(8), Outro(4) = 36 bars total


const intro_arp = "qetrqetrtqtreqwqqetrqetrtqtreqwqqetrqetrtqtreqwqqetrqetrtqtreqwq"; // 64
const intro_mel = "................................................................"; // 64
const intro_bas = "................................................................"; // 64
const intro_drm = "................................................................"; // 64
const intro_cnt = "................................................................"; // 64

// Verse: 8 bars = 128 chars
const verse_mel_arr = [
    "q..q..w.e.......",
    "t......r.e..w...",
    "w..e.r..........",
    "y......t.r..e...",
    "t..i..t..y..t..r",
    "..e.w..t..u.t...",
    "o..i..u.y.......",
    "................"
];
const verse_mel = verse_mel_arr.join(""); // 128
const verse_arp = intro_arp + intro_arp; // 128
const verse_bas_arr = [
    "z.z.z.z.z.z.z.z.",
    "z.z.z.z.z.z.z.z.",
    "b.b.b.b.b.b.b.b.",
    "b.b.b.b.b.b.b.b.",
    "v.v.v.v.v.v.v.v.",
    "v.v.v.v.v.v.v.v.",
    "b.b.b.b.b.b.b.b.",
    "b.b.b.b.b.b.b.b."
];
const verse_bas = verse_bas_arr.join(""); // 128
const drum_pat1 = "K.H.S.H.K.K.S.H.K.H.S.H.K.K.S.H.K.H.S.H.K.K.S.H.K.H.S.H.K.K.S.R."; // 64
const verse_drm = drum_pat1 + drum_pat1; // 128
const verse_cnt = "................................................................................................................................"; // 128

// Chorus: 8 bars = 128 chars
const chors_mel_arr = [
    "i..t.i.p........",
    "o..i.u.y........",
    "t..e.t.i........",
    "u.y.t..r........",
    "e.t..i..t.......",
    "y..t..r..e......",
    "w..e.r..t.......",
    "y..u.i.........."
];
const c_mel = chors_mel_arr.join(""); // 128
const c_arp = "iupuiupuoiuoiuoiuytyuytytrewrewrqwewqwewrewrewretreytreytruytruy"; // 64
const chors_arp = c_arp + c_arp; // 128
const chors_bas_arr = [
    "z.z.z.z.z.z.z.z.",
    "x.x.x.x.x.x.x.x.",
    "c.c.c.c.c.c.c.c.",
    "v.v.v.v.v.v.v.v.",
    "z.z.z.z.z.z.z.z.",
    "b.b.b.b.b.b.b.b.",
    "v.v.v.v.v.v.v.v.",
    "b.b.b.b.b.b.b.b."
];
const chors_bas = chors_bas_arr.join(""); // 128
const drum_pat2 = "K.H.S.H.K.H.S.R."; // 16
const chors_drm = drum_pat2.repeat(8); // 128
const chors_cnt = verse_cnt; // 128

// Break: 4 bars = 64 chars
const break_mel_arr = [
    "................",
    "................",
    "................",
    "................"
];
const break_mel = break_mel_arr.join(""); // 64
const break_bas_arr = [
    "t.......e.......",
    "q.......w.......",
    "e.......r.......",
    "t..............."
];
const break_bas = break_bas_arr.join(""); // 64
const break_arp = intro_arp; // 64
const break_drm = "................................................................"; // 64
const break_cnt = break_mel; // 64

// Chorus 2: 8 bars = 128 chars
const chors2_mel = c_mel;
const chors2_arp = chors_arp;
const chors2_bas = chors_bas;
const chors2_drm = chors_drm;
const chors2_cnt_arr = [
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H.",
    "..H...H...H...H."
];
const chors2_cnt = chors2_cnt_arr.join(""); // 128

// Outro: 4 bars = 64 chars
const outro_mel = break_mel;
const outro_bas = "z.......z.......z.......z.......z.......z.......z.......z.......";
const outro_arp = intro_arp;
const outro_drm = drum_pat1;
const outro_cnt = break_mel;

// Combine everything
const track_mel = intro_mel + verse_mel + c_mel + break_mel + chors2_mel + outro_mel;
const track_arp = intro_arp + verse_arp + chors_arp + break_arp + chors2_arp + outro_arp;
const track_bas = intro_bas + verse_bas + chors_bas + break_bas + chors2_bas + outro_bas;
const track_drm = intro_drm + verse_drm + chors_drm + break_drm + chors2_drm + outro_drm;
const track_cnt = intro_cnt + verse_cnt + chors_cnt + break_cnt + chors2_cnt + outro_cnt;

// Sound synthesis functions
function playToneRetro(freq, type, duration, vol, time) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(retroMasterGain);

        osc.start(time);
        osc.stop(time + duration);
    } catch(e) {}
}

let noiseBuffer = null;
function getNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    if (!audioCtx) return null;
    const bufferSize = audioCtx.sampleRate * 2;
    noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
}

function playNoise(duration, vol, time, isSnare=false) {
    if (!audioCtx) return;
    try {
        const noise = audioCtx.createBufferSource();
        noise.buffer = getNoiseBuffer();

        const filter = audioCtx.createBiquadFilter();
        filter.type = isSnare ? 'bandpass' : 'highpass';
        filter.frequency.value = isSnare ? 1000 : 5000;

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(retroMasterGain);

        noise.start(time);
        noise.stop(time + duration);

        if (isSnare) {
            // Add a low triangle punch for snare
            playToneRetro(150, 'triangle', duration, vol * 1.5, time);
        }
    } catch(e) {}
}

function playDrum(type, time) {
    if (type === 'K') {
        // Kick: Sine wave sweeping down
        if (!audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

            gain.gain.setValueAtTime(0.4, time);
            gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

            osc.connect(gain);
            gain.connect(retroMasterGain);

            osc.start(time);
            osc.stop(time + 0.1);
        } catch(e){}
    } else if (type === 'S') {
        playNoise(0.15, 0.3, time, true);
    } else if (type === 'H') {
        playNoise(0.05, 0.1, time, false);
    } else if (type === 'R') {
        // Snare roll: two quick hits
        playNoise(0.05, 0.25, time, true);
        playNoise(0.05, 0.25, time + 0.05, true);
    }
}

function startRetroBGM() {
    stopRetroBGM();
    if (isMuted || !audioCtx) return;

    retroMasterGain = audioCtx.createGain();
    retroMasterGain.gain.value = 0.3; // Overall volume
    retroMasterGain.connect(audioCtx.destination);

    retroBgmStep = 0;
    const stepTime = (60 / 130) / 4; // 130 BPM, 16th notes
    let nextNoteTime = audioCtx.currentTime + 0.1;

    function schedule() {
        if (gameState !== STATE_PLAYING || isMuted) {
            stopRetroBGM();
            return;
        }

        while (nextNoteTime < audioCtx.currentTime + 0.1) {
            const i = retroBgmStep % track_mel.length;

            // Outro fade out
            const totalSteps = track_mel.length;
            if (i >= totalSteps - 64) {
                // Last 4 bars
                const fadeRatio = 1 - ((i - (totalSteps - 64)) / 64);
                retroMasterGain.gain.setValueAtTime(0.3 * fadeRatio, nextNoteTime);
            } else if (i === 0) {
                retroMasterGain.gain.setValueAtTime(0.3, nextNoteTime);
            }

            // Play Mel
            let m = track_mel[i];
            if (m && SYM[m]) playToneRetro(SYM[m], 'square', stepTime * 0.8, 0.15, nextNoteTime);

            // Play Arp
            let a = track_arp[i];
            if (a && SYM[a]) playToneRetro(SYM[a], 'square', stepTime * 0.5, 0.08, nextNoteTime);

            // Play Bass
            let b = track_bas[i];
            if (b && SYM[b]) playToneRetro(SYM[b], 'triangle', stepTime * 0.9, 0.2, nextNoteTime);

            // Play Drum
            let d = track_drm[i];
            if (d && SYM[d]) playDrum(d, nextNoteTime);

            // Play Cnt
            let c = track_cnt[i];
            if (c === 'H') playDrum('H', nextNoteTime);
            else if (c && SYM[c]) playToneRetro(SYM[c], 'triangle', stepTime * 0.8, 0.15, nextNoteTime);

            retroBgmStep++;
            nextNoteTime += stepTime;
        }

        retroBgmTimer = setTimeout(schedule, 25);
    }

    schedule();
}

function stopRetroBGM() {
    if (retroBgmTimer) {
        clearTimeout(retroBgmTimer);
        retroBgmTimer = null;
    }
    if (retroMasterGain) {
        // Smooth fade out for stop
        try {
            retroMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
            retroMasterGain.gain.setValueAtTime(retroMasterGain.gain.value, audioCtx.currentTime);
            retroMasterGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        } catch(e){}
    }
}


// Wrapper to switch between old and new
function startBGM() {
    if (USE_RETRO_BGM) {
        startRetroBGM();
    } else {
        startLegacyBGM();
    }
}

function stopBGM() {
    if (USE_RETRO_BGM) {
        stopRetroBGM();
    } else {
        stopLegacyBGM();
    }
}


// ゲームの変数
let playerFrameCount = 0;
let blockFrameCount = 0;
let grid = [];
let player = {
    x: 7, // グリッド上のX座標
    y: 0, // グリッド上のY座標
    direction: 'down', // 向き
    color: '#FFFFFF'
};
let cameraY = 0; // カメラのスクロールY座標
let needsRedraw = true;
let air = MAX_AIR;

// 初期表示とイベントリスナー設定
function init() {
    // ミュートボタン設定
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            initAudio();
            toggleMute();
        });
    }

    // キーボード入力の監視
    document.addEventListener('keydown', (e) => {
        initAudio();
        handleInput(e);
    });

    // タッチ・ボタンコントロール設定
    setupTouchControls();

    // キャンバスクリックイベント
    canvas.addEventListener('click', () => {
        initAudio();
        handleStateTransition();
    });

    // 初期化時はスタート画面にセット
    gameState = STATE_START;
    needsRedraw = true;

    // ゲームループ開始
    requestAnimationFrame(gameLoop);
}

// 新しいゲームを開始する初期化
function startNewGame() {
    initAudio();
    air = MAX_AIR;
    grid = [];
    player.x = 7;
    player.y = 0;
    player.direction = 'down';
    cameraY = 0;
    playerFrameCount = 0;
    blockFrameCount = 0;

    // グリッドを生成
    for (let y = 0; y < ROWS; y++) {
        let row = [];
        for (let x = 0; x < COLS; x++) {
            // プレイヤーの初期位置とその周辺（最上段の数マス）を空にする
            if (y === 0 && Math.abs(x - player.x) <= 1) {
                row.push(null);
            } else if (y === GOAL_DEPTH) {
                // GOAL_DEPTH (500m) はゴールライン表示用
                row.push({ type: 'goal', color: '#FFD700', state: 'normal' });
            } else {
                if (Math.random() < AIR_CAPSULE_CHANCE) {
                    row.push({ type: 'air', state: 'normal', timer: 0, fallDelay: FALL_DELAY_FRAMES, isUnsupported: false });
                } else if (Math.random() < PENALTY_BLOCK_CHANCE) {
                    row.push({ type: 'penalty', hp: 5, color: '#555555', state: 'normal', timer: 0, fallDelay: FALL_DELAY_FRAMES, isUnsupported: false, hasFallen: false });
                } else {
                    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
                    row.push({ type: 'block', color: color, state: 'normal', timer: 0, fallDelay: FALL_DELAY_FRAMES, isUnsupported: false, hasFallen: false });
                }
            }
        }
        grid.push(row);
    }

    gameState = STATE_PLAYING;
    stateChangeCooldown = 30; // 0.5秒クールダウン
    needsRedraw = true;

    startBGM();
}

// 状態遷移処理
function handleStateTransition() {
    if (stateChangeCooldown > 0) return false;

    if (gameState === STATE_START) {
        startNewGame();
        return true;
    } else if (gameState === STATE_GAMEOVER || gameState === STATE_GAMECLEAR) {
        gameState = STATE_START;
        stateChangeCooldown = 20;
        needsRedraw = true;
        return true;
    }
    return false;
}

// タッチコントロール設定
function setupTouchControls() {
    const bindButton = (id, action) => {
        const btn = document.getElementById(id);
        if (!btn) return;

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (handleStateTransition()) return;
            processInput(action);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
            if (handleStateTransition()) return;
            processInput(action);
        });
    };

    bindButton('btn-up', 'up');
    bindButton('btn-down', 'down');
    bindButton('btn-left', 'left');
    bindButton('btn-right', 'right');
    bindButton('btn-dig', 'dig');
}

// キーボード入力処理
function handleInput(e) {
    if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        if (handleStateTransition()) {
            e.preventDefault();
            return;
        }
    }

    if (gameState !== STATE_PLAYING) return;

    switch(e.key) {
        case 'ArrowUp':
            processInput('up');
            e.preventDefault();
            break;
        case 'ArrowDown':
            processInput('down');
            e.preventDefault();
            break;
        case 'ArrowLeft':
            processInput('left');
            e.preventDefault();
            break;
        case 'ArrowRight':
            processInput('right');
            e.preventDefault();
            break;
        case ' ':
        case 'Enter':
            processInput('dig');
            e.preventDefault();
            break;
    }
}

// 入力処理共通化
function processInput(action) {
    if (gameState !== STATE_PLAYING) return;

    let nextX = player.x;
    let nextY = player.y;
    let moved = false;

    if (action === 'dig') {
        dig();
        return;
    }

    switch(action) {
        case 'up':
            player.direction = 'up';
            nextY--;
            moved = true;
            break;
        case 'down':
            player.direction = 'down';
            nextY++;
            moved = true;
            break;
        case 'left':
            player.direction = 'left';
            nextX--;
            moved = true;
            break;
        case 'right':
            player.direction = 'right';
            nextX++;
            moved = true;
            break;
    }

    if (moved) {
        needsRedraw = true;
        if (nextX >= 0 && nextX < COLS && nextY >= 0 && nextY < ROWS) {
            const targetBlock = grid[nextY][nextX];

            // ゴール判定 (500m到達)
            if (nextY >= GOAL_DEPTH) {
                player.x = nextX;
                player.y = nextY;
                gameState = STATE_GAMECLEAR;
                stateChangeCooldown = 40;
                playGameClearSE();
                return;
            }

            // 移動先が空(null)またはAIRカプセルの場合移動可能
            if (!targetBlock || targetBlock.type === 'air') {
                if (targetBlock && targetBlock.type === 'air') {
                    grid[nextY][nextX] = null;
                    air = Math.min(air + 20, MAX_AIR);
                    playAirSE();
                }

                player.x = nextX;
                player.y = nextY;
            }
        }
    }
}

// ブロックを掘る
function dig() {
    let targetX = player.x;
    let targetY = player.y;

    switch(player.direction) {
        case 'up': targetY--; break;
        case 'down': targetY++; break;
        case 'left': targetX--; break;
        case 'right': targetX++; break;
    }

    if (targetX >= 0 && targetX < COLS && targetY >= 0 && targetY < ROWS) {
        const targetBlock = grid[targetY][targetX];
        if (targetBlock) {
            if (targetBlock.type === 'air') {
                grid[targetY][targetX] = null;
                playAirSE();
            } else if (targetBlock.type === 'penalty') {
                targetBlock.hp--;
                playPenaltySE();
                if (targetBlock.hp <= 0) {
                    grid[targetY][targetX] = null;
                    playClearSE();
                    air = Math.max(0, air - 20);
                    if (air <= 0) {
                        gameState = STATE_GAMEOVER;
                        stateChangeCooldown = 30;
                        playGameOverSE();
                    }
                }
            } else if (targetBlock.type === 'block') {
                playDigSE();
                const color = targetBlock.color;
                const stack = [{x: targetX, y: targetY}];
                const visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
                visited[targetY][targetX] = true;

                let blocksToClear = [];
                while (stack.length > 0) {
                    const curr = stack.pop();
                    blocksToClear.push(curr);

                    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                    for (let d of dirs) {
                        let nx = curr.x + d[0];
                        let ny = curr.y + d[1];
                        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                            if (!visited[ny][nx]) {
                                const b = grid[ny][nx];
                                if (b && b.type === 'block' && b.color === color && b.state !== 'clearing') {
                                    visited[ny][nx] = true;
                                    stack.push({x: nx, y: ny});
                                }
                            }
                        }
                    }
                }

                for (let b of blocksToClear) {
                    grid[b.y][b.x] = null;
                }
            }
            needsRedraw = true;
        }
    }
}

// 同種・結合ブロック判定補助関数
function isSameBlock(b1, b2) {
    if (!b1 || !b2 || b1.state === 'clearing' || b2.state === 'clearing') return false;
    if (b1.type === 'block' && b2.type === 'block') return b1.color === b2.color;
    if (b1.type === 'penalty' && b2.type === 'penalty') return true;
    return false;
}

// カメラ位置の更新
function updateCamera() {
    // プレイヤーが画面の上部から数えて8行目付近になるようにスクロールターゲットを計算
    let targetRow = player.y - 8;
    targetRow = Math.max(0, Math.min(ROWS - VISIBLE_ROWS, targetRow));
    const targetY = targetRow * BLOCK_SIZE;

    // スムーズスクロール
    const diff = targetY - cameraY;
    if (Math.abs(diff) > 0.5) {
        cameraY += diff * 0.2;
        needsRedraw = true;
    } else if (cameraY !== targetY) {
        cameraY = targetY;
        needsRedraw = true;
    }
}

// 角丸矩形描画ヘルパー関数
function drawRoundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

// ポップな背景の描画（深さに応じてグラデーション＆地層模様が変化）
function drawBackground() {
    const playWidth = COLS * BLOCK_SIZE; // 480px
    const currentMeters = Math.floor(cameraY / BLOCK_SIZE);

    // 深さに基づく背景テーマ
    let topColor = '#1e1b4b';
    let bottomColor = '#311b92';
    let patternColor = 'rgba(255, 255, 255, 0.05)';

    if (currentMeters < 100) {
        topColor = '#0d1b2a'; bottomColor = '#1b263b';
    } else if (currentMeters < 250) {
        topColor = '#2b0938'; bottomColor = '#421052';
    } else if (currentMeters < 400) {
        topColor = '#3a0007'; bottomColor = '#5c000e';
    } else {
        topColor = '#1a0033'; bottomColor = '#000022';
    }

    const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGrad.addColorStop(0, topColor);
    bgGrad.addColorStop(1, bottomColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, playWidth, canvas.height);

    // 地層風ドット/ストライプパターンの装飾
    ctx.fillStyle = patternColor;
    for (let i = 0; i < canvas.height; i += 40) {
        const offset = (Math.sin((i + cameraY) * 0.02) * 15);
        ctx.fillRect(0, i + (cameraY % 40) * -0.5, playWidth, 6);
    }
}

// ポップなブロックの描画（丸み・ツヤ・グラデーション）
function drawPopBlock(block, drawX, drawY, drawSize) {
    const radius = 6;
    const palette = COLOR_PALETTES[block.color] || { top: block.color, main: block.color, bottom: block.color };

    // ブロックグラデーション（ぷっくり感）
    const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
    grad.addColorStop(0, palette.top);
    grad.addColorStop(0.5, palette.main);
    grad.addColorStop(1, palette.bottom);

    ctx.fillStyle = grad;
    drawRoundRect(drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, radius);
    ctx.fill();

    // 内側のハイライト（ポップなツヤ感）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    drawRoundRect(drawX + 3, drawY + 3, drawSize - 6, (drawSize - 6) / 3, 3);
    ctx.fill();

    // 接続輪郭線（ポップな線画）
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 2;
    drawRoundRect(drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, radius);
    ctx.stroke();
}

// AIRカプセルを描画（ポップなデザイン）
function drawAirCapsule(drawX, drawY, drawSize) {
    const radius = 10;
    // カプセル本体（ホワイト＆スカイブルー）
    const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
    grad.addColorStop(0, '#E0F7FA');
    grad.addColorStop(0.5, '#00E5FF');
    grad.addColorStop(1, '#00B0FF');

    ctx.fillStyle = grad;
    drawRoundRect(drawX + 2, drawY + 2, drawSize - 4, drawSize - 4, radius);
    ctx.fill();

    // 外枠
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    drawRoundRect(drawX + 2, drawY + 2, drawSize - 4, drawSize - 4, radius);
    ctx.stroke();

    // アイコン / 文字「AIR」
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 12px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00838F';
    ctx.shadowBlur = 4;
    ctx.fillText('AIR', drawX + drawSize / 2, drawY + drawSize / 2);
    ctx.shadowBlur = 0;
}

// ペナルティブロックを描画（ハードなXデザイン）
function drawPenaltyBlock(block, drawX, drawY, drawSize) {
    const radius = 4;
    const grad = ctx.createLinearGradient(drawX, drawY, drawX, drawY + drawSize);
    grad.addColorStop(0, '#616161');
    grad.addColorStop(1, '#212121');

    ctx.fillStyle = grad;
    drawRoundRect(drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, radius);
    ctx.fill();

    // 枠線
    ctx.strokeStyle = '#9E9E9E';
    ctx.lineWidth = 1.5;
    drawRoundRect(drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, radius);
    ctx.stroke();

    // 赤い「X」印とHP
    ctx.fillStyle = '#FF5252';
    ctx.font = '900 13px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 3;
    ctx.fillText(`✕ ${block.hp}`, drawX + drawSize / 2, drawY + drawSize / 2);
    ctx.shadowBlur = 0;
}

// ポップなキャラクター（プレイヤー）の描画
function drawPlayer() {
    const px = player.x * BLOCK_SIZE;
    const py = player.y * BLOCK_SIZE - cameraY;
    const centerX = px + BLOCK_SIZE / 2;
    const centerY = py + BLOCK_SIZE / 2;

    ctx.save();
    ctx.translate(centerX, centerY);

    // キャラクター本体（丸っこいポップボディ）
    ctx.fillStyle = '#FF9F43'; // 明るいオレンジ
    ctx.beginPath();
    ctx.arc(0, 1, 13, 0, Math.PI * 2);
    ctx.fill();

    // ヘルメット（イエローキャップ）
    ctx.fillStyle = '#FFD32A';
    ctx.beginPath();
    ctx.arc(0, -3, 13, Math.PI, 0);
    ctx.fill();

    // ヘルメットのバイザー/つば
    ctx.fillStyle = '#FFA801';
    ctx.fillRect(-12, -4, 24, 3);

    // ドリル（向きに応じた取り付け）
    ctx.fillStyle = '#D1CCC0';
    ctx.strokeStyle = '#84817A';
    ctx.lineWidth = 1.5;

    let drillX = 0, drillY = 0, angle = 0;
    switch (player.direction) {
        case 'up': drillY = -16; angle = -Math.PI / 2; break;
        case 'down': drillY = 16; angle = Math.PI / 2; break;
        case 'left': drillX = -16; angle = Math.PI; break;
        case 'right': drillX = 16; angle = 0; break;
    }

    ctx.save();
    ctx.translate(drillX, drillY);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-4, -6);
    ctx.lineTo(-4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // つぶらな大きい瞳
    ctx.fillStyle = '#FFFFFF';
    let eyeOffsetX = 0, eyeOffsetY = 3;
    if (player.direction === 'left') eyeOffsetX = -3;
    if (player.direction === 'right') eyeOffsetX = 3;
    if (player.direction === 'up') eyeOffsetY = 0;
    if (player.direction === 'down') eyeOffsetY = 5;

    // 左目
    ctx.beginPath();
    ctx.arc(-4 + eyeOffsetX, eyeOffsetY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // 右目
    ctx.beginPath();
    ctx.arc(4 + eyeOffsetX, eyeOffsetY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // 黒目
    ctx.fillStyle = '#1E272C';
    ctx.beginPath();
    ctx.arc(-4 + eyeOffsetX, eyeOffsetY, 2, 0, Math.PI * 2);
    ctx.arc(4 + eyeOffsetX, eyeOffsetY, 2, 0, Math.PI * 2);
    ctx.fill();

    // ハイライト（キラキラ）
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-5 + eyeOffsetX, eyeOffsetY - 1, 1, 0, Math.PI * 2);
    ctx.arc(3 + eyeOffsetX, eyeOffsetY - 1, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

// スタート画面描画
function drawStartScreen() {
    // 背景
    const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGrad.addColorStop(0, '#1e1b4b');
    bgGrad.addColorStop(1, '#312e81');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ポップなフレーム
    ctx.strokeStyle = '#FF79C6';
    ctx.lineWidth = 6;
    drawRoundRect(15, 15, canvas.width - 30, canvas.height - 30, 16);
    ctx.stroke();

    // タイトルロゴ
    ctx.fillStyle = '#FFD166';
    ctx.font = '900 46px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#FF4757';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillText('MR. DRILLER', canvas.width / 2, 120);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // サブタイトル / 目標
    ctx.fillStyle = '#00E5FF';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('✨ 地下 500m を目指せ！ ✨', canvas.width / 2, 170);

    // ルール・操作説明パネル
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    drawRoundRect(50, 200, canvas.width - 100, 310, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 2;
    drawRoundRect(50, 200, canvas.width - 100, 310, 16);
    ctx.stroke();

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'left';
    const startX = 75;
    let textY = 235;

    ctx.fillStyle = '#FF79C6';
    ctx.fillText('【 操作方法 】', startX, textY); textY += 28;
    ctx.fillStyle = '#FFF';
    ctx.fillText('・ 矢印キー / D-PAD : プレイヤー移動', startX + 10, textY); textY += 24;
    ctx.fillText('・ スペースキー / DIGボタン : ブロック消去', startX + 10, textY); textY += 34;

    ctx.fillStyle = '#FFD166';
    ctx.fillText('【 ルール 】', startX, textY); textY += 28;
    ctx.fillStyle = '#FFF';
    ctx.fillText('・ 同じ色のブロックを掘ると一括消去！', startX + 10, textY); textY += 24;
    ctx.fillText('・ 4つ以上結合したブロックは落下着地で消滅！', startX + 10, textY); textY += 24;
    ctx.fillText('・ AIRカプセルを取って酸素を補給！', startX + 10, textY); textY += 24;
    ctx.fillText('・ ペナルティ(✕)は5回掘ると破壊(AIR-20%)！', startX + 10, textY); textY += 24;
    ctx.fillText('・ 地下500mのゴールに到達すればクリア！', startX + 10, textY); textY += 35;

    // スタート案内（点滅）
    ctx.textAlign = 'center';
    if (Math.floor(Date.now() / 400) % 2 === 0) {
        ctx.fillStyle = '#FF4757';
        ctx.font = '900 22px "Arial Black", sans-serif';
        ctx.fillText('PRESS SPACE OR DIG TO START', canvas.width / 2, 570);
    }
}

// ゲーム画面描画
function drawGame() {
    // 背景描画
    drawBackground();

    // 描画範囲の決定
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 1);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 1);

    // ブロックの描画
    for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block) {
                let drawSize = BLOCK_SIZE;
                let drawX = x * BLOCK_SIZE;
                let drawY = y * BLOCK_SIZE - cameraY;

                if (block.type === 'goal') {
                    // ゴールブロック描画
                    ctx.fillStyle = '#FFD700';
                    drawRoundRect(drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, 4);
                    ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('GOAL', drawX + drawSize / 2, drawY + drawSize / 2);
                    continue;
                }

                // 消去アニメーション
                if (block.state === 'clearing') {
                    const ratio = block.timer / 15;
                    drawSize = BLOCK_SIZE * ratio;
                    const offset = (BLOCK_SIZE - drawSize) / 2;
                    drawX += offset;
                    drawY += offset;

                    if (block.timer % 4 < 2) {
                        ctx.globalAlpha = 0.5;
                    }
                }

                // 溜め（猶予時間）中の微振動エフェクト
                if (block.state !== 'clearing' && block.isUnsupported && block.fallDelay > 0) {
                    drawX += (Math.random() - 0.5) * 3;
                }

                if (block.type === 'air') {
                    drawAirCapsule(drawX, drawY, drawSize);
                } else if (block.type === 'penalty') {
                    drawPenaltyBlock(block, drawX, drawY, drawSize);
                } else {
                    drawPopBlock(block, drawX, drawY, drawSize);
                }

                ctx.globalAlpha = 1.0;
            }
        }
    }

    // プレイヤーの描画
    drawPlayer();

    // --- UI描画 (右側エリア) ---
    const uiX = 480;
    const uiWidth = 100;

    // UI背景（半透明ポップグラデーション）
    const uiGrad = ctx.createLinearGradient(uiX, 0, uiX + uiWidth, canvas.height);
    uiGrad.addColorStop(0, '#0f0f1b');
    uiGrad.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = uiGrad;
    ctx.fillRect(uiX, 0, uiWidth, canvas.height);

    ctx.strokeStyle = '#FF79C6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(uiX, 0);
    ctx.lineTo(uiX, canvas.height);
    ctx.stroke();

    // AIRゲージ枠
    const gaugeX = uiX + 30;
    const gaugeY = 50;
    const gaugeW = 24;
    const gaugeH = 260;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    drawRoundRect(gaugeX, gaugeY, gaugeW, gaugeH, 12);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    drawRoundRect(gaugeX, gaugeY, gaugeW, gaugeH, 12);
    ctx.stroke();

    // AIRラベル
    ctx.fillStyle = '#00E5FF';
    ctx.font = '900 16px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AIR', gaugeX + gaugeW / 2, gaugeY - 12);

    // AIR残量バー
    const airHeight = Math.max(0, (air / MAX_AIR) * (gaugeH - 6));
    const airY = gaugeY + gaugeH - 3 - airHeight;

    let airColor1 = '#00E5FF', airColor2 = '#1E90FF';
    if (air <= 20) {
        if (Math.floor(Date.now() / 200) % 2 === 0) {
            airColor1 = '#FF4757'; airColor2 = '#FF6B81';
        } else {
            airColor1 = '#C02E3D'; airColor2 = '#880000';
        }
    }

    const airGrad = ctx.createLinearGradient(gaugeX, airY, gaugeX, airY + airHeight);
    airGrad.addColorStop(0, airColor1);
    airGrad.addColorStop(1, airColor2);
    ctx.fillStyle = airGrad;
    if (airHeight > 0) {
        drawRoundRect(gaugeX + 3, airY, gaugeW - 6, airHeight, 8);
        ctx.fill();
    }

    // AIR数値表示
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 15px Arial';
    ctx.fillText(Math.floor(air) + '%', gaugeX + gaugeW / 2, gaugeY + gaugeH + 24);

    // 深さ(DEPTH)表示
    const depthY = gaugeY + gaugeH + 75;
    ctx.fillStyle = '#FFD166';
    ctx.font = '900 14px "Arial Black", sans-serif';
    ctx.fillText('DEPTH', uiX + uiWidth / 2, depthY);

    ctx.fillStyle = '#FFF';
    ctx.font = '900 22px Arial';
    ctx.fillText(`${player.y}m`, uiX + uiWidth / 2, depthY + 30);

    ctx.fillStyle = '#888';
    ctx.font = '12px Arial';
    ctx.fillText(`/ ${GOAL_DEPTH}m`, uiX + uiWidth / 2, depthY + 52);

    // オーバーレイ表示（ゲームオーバー / ゲームクリア）
    if (gameState === STATE_GAMEOVER) {
        ctx.fillStyle = 'rgba(15, 15, 27, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FF4757';
        ctx.font = '900 44px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 10;
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`到達深さ: ${player.y} m`, canvas.width / 2, canvas.height / 2 + 20);

        if (stateChangeCooldown <= 0 && Math.floor(Date.now() / 400) % 2 === 0) {
            ctx.fillStyle = '#FFD166';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('PRESS ANY KEY TO RETURN', canvas.width / 2, canvas.height / 2 + 80);
        }
    } else if (gameState === STATE_GAMECLEAR) {
        ctx.fillStyle = 'rgba(15, 15, 27, 0.85)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#FFD166';
        ctx.font = '900 44px "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#FF4757';
        ctx.shadowBlur = 10;
        ctx.fillText('STAGE CLEAR!', canvas.width / 2, canvas.height / 2 - 40);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('🎉 地下 500m 到達おめでとう！ 🎉', canvas.width / 2, canvas.height / 2 + 10);

        ctx.fillStyle = '#FFF';
        ctx.font = '18px Arial';
        ctx.fillText(`残りAIR: ${Math.floor(air)}%`, canvas.width / 2, canvas.height / 2 + 50);

        if (stateChangeCooldown <= 0 && Math.floor(Date.now() / 400) % 2 === 0) {
            ctx.fillStyle = '#FFD166';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('PRESS ANY KEY TO RETURN', canvas.width / 2, canvas.height / 2 + 110);
        }
    }
}

// 全体描画関数
function draw() {
    if (gameState === STATE_START) {
        drawStartScreen();
    } else {
        drawGame();
    }
}

// 落下猶予（溜め）タイマーの更新
function updateFallDelays() {
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 2);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 2);

    for (let x = 0; x < COLS; x++) {
        for (let y = startRow; y < endRow; y++) {
            const block = grid[y][x];
            if (block && block.type === 'air') {
                const isSupported = (y === ROWS - 1) || (grid[y + 1][x] !== null);
                block.isUnsupported = !isSupported;
                if (isSupported) {
                    block.fallDelay = FALL_DELAY_FRAMES;
                } else if (block.fallDelay > 0) {
                    block.fallDelay--;
                }
            }
        }
    }

    let clusters = getClusters(startRow, endRow);
    for (let cluster of clusters) {
        let clusterSet = new Set(cluster.map(p => `${p.x},${p.y}`));
        let isSupported = false;

        for (let p of cluster) {
            let belowY = p.y + 1;
            if (belowY >= ROWS) {
                isSupported = true;
                break;
            }
            let belowBlock = grid[belowY][p.x];
            if (belowBlock && !clusterSet.has(`${p.x},${belowY}`)) {
                isSupported = true;
                break;
            }
        }

        for (let p of cluster) {
            const block = grid[p.y][p.x];
            if (block) {
                block.isUnsupported = !isSupported;
                if (isSupported) {
                    block.fallDelay = FALL_DELAY_FRAMES;
                } else if (block.fallDelay > 0) {
                    block.fallDelay--;
                }
            }
        }
    }
}

// 更新処理
function update() {
    if (stateChangeCooldown > 0) {
        stateChangeCooldown--;
    }

    if (gameState === STATE_START) {
        needsRedraw = true; // スタート画面の点滅テキストアニメーションのため
        return;
    }

    if (gameState !== STATE_PLAYING) {
        needsRedraw = true;
        return;
    }

    // カメラ位置更新
    updateCamera();

    // AIR減少
    if (air > 0) {
        air -= AIR_DECREASE_RATE;
        if (air <= 0) {
            air = 0;
            gameState = STATE_GAMEOVER;
            stateChangeCooldown = 30;
            needsRedraw = true;
        } else {
            needsRedraw = true;
        }
    }

    checkAirUnderPlayer();
    updateClearingBlocks();
    updateFallDelays();

    playerFrameCount++;
    if (playerFrameCount >= PLAYER_GRAVITY_INTERVAL) {
        const playerMoved = updatePlayerGravity();
        if (playerMoved) {
            needsRedraw = true;
        }
        playerFrameCount = 0;
    }

    blockFrameCount++;
    if (blockFrameCount >= BLOCK_GRAVITY_INTERVAL) {
        const blocksMoved = updateBlockGravity();
        if (blocksMoved) {
            needsRedraw = true;
        }
        blockFrameCount = 0;
    }
}

// プレイヤーの真下にあるAIRを自動取得する関数
function checkAirUnderPlayer() {
    if (gameState !== STATE_PLAYING) return;
    const belowY = player.y + 1;
    if (belowY < ROWS && grid[belowY] && grid[belowY][player.x]) {
        const block = grid[belowY][player.x];
        if (block && block.type === 'air') {
            grid[belowY][player.x] = null;
            air = Math.min(air + 20, MAX_AIR);
            playAirSE();
            needsRedraw = true;
        }
    }
}

// プレイヤーの重力処理
function updatePlayerGravity() {
    if (player.y < ROWS - 1) {
        if (!grid[player.y + 1][player.x]) {
            player.y++;
            if (player.y >= GOAL_DEPTH) {
                gameState = STATE_GAMECLEAR;
                stateChangeCooldown = 40;
                playGameClearSE();
            }
            return true;
        }
    }
    return false;
}

// 結合ブロックのクラスター（連結成分）抽出関数
function getClusters(minY = 0, maxY = ROWS) {
    minY = Math.max(0, minY);
    maxY = Math.min(ROWS, maxY);

    let visited = Array(ROWS).fill(null).map(() => Array(COLS).fill(false));
    let clusters = [];

    for (let y = minY; y < maxY; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (!block || visited[y][x] || block.state === 'clearing' || block.type === 'air' || block.type === 'goal') continue;

            let cluster = [];
            let stack = [{x, y}];
            visited[y][x] = true;

            while (stack.length > 0) {
                let current = stack.pop();
                cluster.push(current);
                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

                for (let d of dirs) {
                    let nx = current.x + d[0];
                    let ny = current.y + d[1];

                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
                        const nextBlock = grid[ny][nx];
                        if (!visited[ny][nx] && nextBlock && isSameBlock(block, nextBlock)) {
                            visited[ny][nx] = true;
                            stack.push({x: nx, y: ny});
                        }
                    }
                }
            }
            clusters.push(cluster);
        }
    }

    return clusters;
}

// ブロックの重力処理
function updateBlockGravity() {
    let moved = false;

    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 4);
    const endRow = Math.min(ROWS - 1, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 4);

    // 1. AIRカプセルの重力処理
    for (let x = 0; x < COLS; x++) {
        for (let y = endRow; y >= startRow; y--) {
            const block = grid[y][x];
            if (block && block.type === 'air' && block.state !== 'clearing') {
                if (y + 1 < ROWS && !grid[y + 1][x] && (block.fallDelay === undefined || block.fallDelay <= 0)) {
                    if (player.x === x && player.y === y + 1) {
                        air = Math.min(air + 20, MAX_AIR);
                        grid[y][x] = null;
                        playAirSE();
                        moved = true;
                    } else {
                        grid[y + 1][x] = block;
                        grid[y][x] = null;
                        moved = true;
                    }
                }
            }
        }
    }

    // 2. 通常ブロックのクラスタ単位の重力処理
    let clusters = getClusters(startRow, endRow);

    clusters.sort((a, b) => {
        let maxA = Math.max(...a.map(p => p.y));
        let maxB = Math.max(...b.map(p => p.y));
        return maxB - maxA;
    });

    for (let cluster of clusters) {
        let clusterSet = new Set(cluster.map(p => `${p.x},${p.y}`));

        let isSupported = false;
        let minFallDelay = Infinity;

        for (let p of cluster) {
            let block = grid[p.y][p.x];
            if (block && block.fallDelay !== undefined) {
                if (block.fallDelay < minFallDelay) minFallDelay = block.fallDelay;
            }

            let belowY = p.y + 1;
            if (belowY >= ROWS) {
                isSupported = true;
                break;
            }
            let belowBlock = grid[belowY][p.x];
            if (belowBlock && !clusterSet.has(`${p.x},${belowY}`)) {
                isSupported = true;
                break;
            }
        }

        if (!isSupported && minFallDelay <= 0) {
            let blocksToMove = cluster.map(p => ({
                x: p.x,
                y: p.y,
                block: grid[p.y][p.x]
            }));

            for (let item of blocksToMove) {
                grid[item.y][item.x] = null;
            }

            for (let item of blocksToMove) {
                let newY = item.y + 1;
                item.block.hasFallen = true;
                if (player.x === item.x && player.y === newY) {
                    gameState = STATE_GAMEOVER;
                    stateChangeCooldown = 30;
                    playGameOverSE();
                }
                grid[newY][item.x] = item.block;
            }

            moved = true;
        } else if (isSupported) {
            let hasFallen = cluster.some(p => grid[p.y][p.x] && grid[p.y][p.x].hasFallen);
            if (hasFallen && cluster.length >= 4) {
                let clearedAny = false;
                for (let p of cluster) {
                    let b = grid[p.y][p.x];
                    if (b && b.state !== 'clearing') {
                        b.state = 'clearing';
                        b.timer = 15;
                        clearedAny = true;
                    }
                }
                if (clearedAny) {
                    playClearSE();
                }
            }
        }
    }

    return moved;
}

// 消去アニメーションの更新
function updateClearingBlocks() {
    let animating = false;
    const startRow = Math.max(0, Math.floor(cameraY / BLOCK_SIZE) - 2);
    const endRow = Math.min(ROWS, Math.ceil((cameraY + canvas.height) / BLOCK_SIZE) + 2);

    for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < COLS; x++) {
            const block = grid[y][x];
            if (block && block.state === 'clearing') {
                animating = true;
                block.timer--;
                if (block.timer <= 0) {
                    grid[y][x] = null;
                    needsRedraw = true;
                }
            }
        }
    }
    if (animating) {
        needsRedraw = true;
    }
}

// ゲームループ
function gameLoop() {
    update();
    if (needsRedraw) {
        draw();
        needsRedraw = false;
    }
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
init();
