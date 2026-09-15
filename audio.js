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
