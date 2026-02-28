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
  const { modifiedFilesSet, lines } = parseDiffMetrics(diffText);
  let newExports = 0;

  for (const line of lines) {
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

export function riskScore(diffText: string): number {
  if (!diffText.trim()) {
    return 0;
  }

  const { modifiedFilesSet, changedLines } = parseDiffMetrics(diffText);
  const files = [...modifiedFilesSet];

  const srcFiles = files.filter(isSrcFile).length;
  const testFiles = files.filter(isTestFile).length;
  const configFiles = files.filter(isConfigFile).length;
  const filesTouched = files.length;

  const lineComponent = Math.min(40, changedLines * 0.4);
  const fileComponent = Math.min(25, filesTouched * 4);
  const testPenalty =
    srcFiles === 0 ? 0 : 20 * (1 - Math.min(1, testFiles / srcFiles));

  let locationComponent = 2;
  if (srcFiles > 0 && configFiles > 0) {
    locationComponent = 15;
  } else if (srcFiles > 0) {
    locationComponent = 12;
  } else if (configFiles > 0) {
    locationComponent = 5;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(lineComponent + fileComponent + testPenalty + locationComponent)
    )
  );
}

function parseDiffMetrics(diffText: string): {
  modifiedFilesSet: Set<string>;
  lines: string[];
  changedLines: number;
} {
  const modifiedFilesSet = new Set<string>();
  const lines = diffText.split(/\r?\n/);
  let changedLines = 0;

  for (const line of lines) {
    const diffHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffHeader) {
      modifiedFilesSet.add(diffHeader[2]);
      continue;
    }

    const plusFile = line.match(/^\+\+\+ b\/(.+)$/);
    if (plusFile) {
      modifiedFilesSet.add(plusFile[1]);
      continue;
    }

    if (
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---'))
    ) {
      changedLines += 1;
    }
  }

  return { modifiedFilesSet, lines, changedLines };
}

function isSrcFile(file: string): boolean {
  return file.startsWith('src/') || file.includes('/src/');
}

function isTestFile(file: string): boolean {
  return (
    /\.test\.[cm]?[jt]sx?$/.test(file) ||
    /\.spec\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)(__tests__|test|tests)\//.test(file)
  );
}

function isConfigFile(file: string): boolean {
  return (
    /(^|\/)\.github\/workflows\//.test(file) ||
    /(^|\/)(package-lock|npm-shrinkwrap)\.json$/.test(file) ||
    /(^|\/)(package|tsconfig|jsconfig|vitest\.config|wrangler)\.(json|jsonc|js|cjs|mjs|ts|toml)$/.test(file) ||
    /\.(ya?ml|toml|ini|cfg|conf)$/.test(file)
  );
}
