// Verification-code detection (4-8 digit codes, optionally grouped).
const KEYWORDS = /(code|codice|verification|verifica|otp|passcode|password monouso|one-time|security|sicurezza|pin)/i;

export function findVerificationCode(text) {
  if (!text || !KEYWORDS.test(text)) return null;
  const re = /(?<![\d.])(\d{3}[ -]?\d{3}|\d{4,8})(?![\d.])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const digits = m[1].replace(/[ -]/g, '');
    if (digits.length < 4 || digits.length > 8) continue;
    // Skip plausible years.
    if (digits.length === 4 && /^(19|20)\d\d$/.test(digits)) continue;
    return digits;
  }
  return null;
}
