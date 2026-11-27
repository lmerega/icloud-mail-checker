// Plays the "new mail" sound. Service workers cannot play audio, so the background asks this
// hidden page (offscreen document, reason AUDIO_PLAYBACK). The tone is synthesized: no audio files.
let ctx;
function ding() {
  ctx = ctx || new AudioContext();
  ctx.resume();
  const now = ctx.currentTime;
  [[880, 0], [1318.5, 0.14]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.35, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 1);
  });
}
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.target === 'offscreen' && msg.type === 'ding') ding();
});
