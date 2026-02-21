export const SHIELD_PATTERS = [
  /ignore all previous/i,
  /system prompt/i,
  /reveal your instructions/i,
  /forget your rules/i,
  /new persona/i
];

/**
 * Basic Triage Pass to protect against common prompt injection patterns.
 * Focuses on protecting Massa's sensitive info and Clanka's internal invariants.
 */
export function triageInput(input: string): { safe: boolean; reason?: string } {
  for (const pattern of SHIELD_PATTERS) {
    if (pattern.test(input)) {
      return { safe: false, reason: 'Potential prompt injection detected.' };
    }
  }

  // Length guard for basic DoS protection on worker
  if (input.length > 2000) {
    return { safe: false, reason: 'Input exceeds safety threshold.' };
  }

  return { safe: true };
}
