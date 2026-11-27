// Plays the "new mail" sounds. Service workers cannot play audio, so the background asks this
// hidden page (offscreen document, reason AUDIO_PLAYBACK). Tones are synthesized: no audio files.
let ctx;

function tone(freq, at, dur, { type = 'sine', peak = 0.35, attack = 0.02, bend } = {}) {
  const now = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (bend) osc.frequency.exponentialRampToValueAtTime(bend, now + dur);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

const SOUNDS = {
  ding: () => { tone(880, 0, 0.9); tone(1318.5, 0.14, 0.9); },
  chime: () => { tone(523.25, 0, 0.7, { peak: 0.28 }); tone(659.25, 0.12, 0.7, { peak: 0.28 }); tone(783.99, 0.24, 1.0, { peak: 0.28 }); },
  bell: () => { tone(660, 0, 1.8, { peak: 0.3 }); tone(1320, 0, 1.2, { peak: 0.14 }); tone(1980, 0, 0.8, { peak: 0.08 }); },
  pop: () => { tone(900, 0, 0.12, { peak: 0.45, attack: 0.005, bend: 300 }); },
  marimba: () => { tone(392, 0, 0.45, { type: 'triangle', peak: 0.5, attack: 0.005 }); tone(587.33, 0.16, 0.5, { type: 'triangle', peak: 0.5, attack: 0.005 }); },
  alert: () => { tone(740, 0, 0.18, { type: 'square', peak: 0.12 }); tone(740, 0.26, 0.18, { type: 'square', peak: 0.12 }); tone(988, 0.52, 0.3, { type: 'square', peak: 0.12 }); }
};

function play(id) {
  ctx = ctx || new AudioContext();
  ctx.resume();
  (SOUNDS[id] || SOUNDS.ding)();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.target === 'offscreen' && msg.type === 'ding') play(msg.sound);
});
