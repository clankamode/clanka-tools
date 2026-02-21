/**
 * Spine Logic Extraction Utility
 * Focuses on kernel invariants and structural changes.
 * Part of the "Industrial Minimalism" Reviewer Engine.
 */

export function analyzeDiff(diffText: string): {
  modifiedFiles: string[];
  newExports: number;
  logicSummary: string;
} {
  const modifiedFilesSet = new Set<string>();
  let newExports = 0;

  const lines = diffText.split(/\r?\n/);

  for (const line of lines) {
    // Standard git diff headers
    const diffHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffHeader) {
      modifiedFilesSet.add(diffHeader[2]);
      continue;
    }

    // Direct file markers
    const plusFile = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusFile) {
      modifiedFilesSet.add(plusFile[1]);
      continue;
    }

    // New export detection (TS/JS specific)
    if (/^\+\s*export\b/.test(line) && !line.startsWith('+++')) {
      newExports += 1;
    }
  }

  const modifiedFiles = [...modifiedFilesSet];

  // Industrial Minimalism Rubric Summary
  const logicSummary =
    `Industrial Minimalism | ` +
    `startup-gloss: rejected | ` +
    `spine-logic: modified-files=${modifiedFiles.length}; new-exports=${newExports} | ` +
    `kernel-invariants: explicit-export-delta; diff-header-bounded-file-set; additive-export-count-only`;

  return { modifiedFiles, newExports, logicSummary };
}
