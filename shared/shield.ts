export const SHIELD_PATTERNS = [
  { pattern: /ignore all previous/i, reason: "Prompt override attempt." },
  { pattern: /system prompt/i, reason: "System prompt probing." },
  { pattern: /reveal your instructions/i, reason: "Instruction exfiltration request." },
  { pattern: /forget your rules/i, reason: "Rule bypass attempt." },
  { pattern: /new persona/i, reason: "Persona takeover attempt." },
  { pattern: /dan mode/i, reason: "Known jailbreak marker." },
  { pattern: /jailbreak/i, reason: "Jailbreak attempt." },
  { pattern: /<script/i, reason: "Script injection marker." },
  { pattern: /javascript:/i, reason: "Script URI scheme." },
  { pattern: /data:text\/html/i, reason: "Inline HTML payload marker." },
  { pattern: /\batob\s*\(/i, reason: "Base64-decoding payload helper." },
  { pattern: /\[[^\]]+]\(\s*javascript:[^)]+\)/i, reason: "Markdown javascript link." },
  { pattern: /\\x00/i, reason: "Encoded null-byte marker." },
  { pattern: /%00/i, reason: "Percent-encoded null byte." },
  { pattern: /file:\/\//i, reason: "Local file URI marker." },
  { pattern: /\blocalhost\b/i, reason: "Localhost SSRF target." },
  { pattern: /\b127\.0\.0\.1\b/i, reason: "Loopback SSRF target." },
  { pattern: /\b169\.254\./i, reason: "Link-local metadata range." },
  { pattern: /metadata\.google\.internal/i, reason: "GCP metadata endpoint." },
  { pattern: /metadata\.azure\.com/i, reason: "Azure metadata endpoint." },
  { pattern: /\/latest\/meta-data\b/i, reason: "AWS metadata endpoint." }
];

/**
 * Multi-Pass Input Triage
 * Protects Massa's infrastructure and Clanka's internal state.
 */
export function triageInput(input: string): { safe: boolean; reason?: string } {
  // Pass 1: Pattern Matching
  for (const entry of SHIELD_PATTERNS) {
    if (entry.pattern.test(input)) {
      return { safe: false, reason: `Security invariant violation: ${entry.reason}` };
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
