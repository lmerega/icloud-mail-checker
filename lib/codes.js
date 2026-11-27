// Verification-code detection: a 4-8 digit code (optionally 3+3) that follows a keyword
// closely, in the same sentence. Far-away numbers (postcodes, prices...) are ignored.
const KEY = '(?:code|codice|verification|verifica|otp|passcode|password monouso|one-time|security|sicurezza|pin)';
const RE = new RegExp(`${KEY}[^\\d.\\n]{0,40}(?<![\\d.])(\\d{3}[ -]?\\d{3}|\\d{4,8})(?![\\d.])`, 'gi');

export function findVerificationCode(text) {
  if (!text) return null;
  RE.lastIndex = 0;
  let m;
  while ((m = RE.exec(text)) !== null) {
    const digits = m[1].replace(/[ -]/g, '');
    if (digits.length < 4 || digits.length > 8) continue;
    // Skip plausible years.
    if (digits.length === 4 && /^(19|20)\d\d$/.test(digits)) continue;
    return digits;
  }
  return null;
}
