export const SHIELD_PATTERNS = [
  /ignore all previous/i,
  /system prompt/i,
  /reveal your instructions/i,
  /forget your rules/i,
  /new persona/i,
  /dan mode/i,
  /jailbreak/i,
  /<script/i,
  /javascript:/i,
  /data:text\/html/i
];

/**
 * Multi-Pass Input Triage
 * Protects Massa's infrastructure and Clanka's internal state.
 */
export function triageInput(input: string): { safe: boolean; reason?: string } {
  // Pass 1: Pattern Matching
  for (const pattern of SHIELD_PATTERNS) {
    if (pattern.test(input)) {
      return { safe: false, reason: 'Security invariant violation: restricted pattern detected.' };
    }
  }

  // Pass 2: Volume/DoS Guard
  if (input.length > 2000) {
    return { safe: false, reason: 'Resource invariant violation: input volume exceeds threshold.' };
  }

  // Pass 3: Character Encoding Probes
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(input)) {
    return { safe: false, reason: 'Protocol violation: non-printable control characters detected.' };
  }

  return { safe: true };
}
