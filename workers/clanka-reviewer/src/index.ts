const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const VERSION = '1.0.0';

type Severity = 'critical' | 'warning' | 'info';

interface ReviewRequestBody {
  diff: string;
  context?: string;
}

interface ReviewIssue {
  severity: Severity;
  description: string;
  suggestion: string;
}

interface ReviewResponseBody {
  summary: string;
  issues: ReviewIssue[];
  score: number;
}

interface HealthResponseBody {
  ok: true;
  version: string;
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return jsonResponse<HealthResponseBody>({ ok: true, version: VERSION });
    }

    if (request.method === 'POST' && url.pathname === '/review') {
      return handleReview(request);
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};

async function handleReview(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsedBody = parseReviewRequestBody(body);
  if (!parsedBody.ok) {
    return jsonResponse({ error: parsedBody.error }, 400);
  }

  const review = runHeuristicReview(parsedBody.value.diff, parsedBody.value.context);
  return jsonResponse<ReviewResponseBody>(review);
}

function parseReviewRequestBody(
  value: unknown,
): { ok: true; value: ReviewRequestBody } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.diff !== 'string' || candidate.diff.trim() === '') {
    return { ok: false, error: 'Body.diff must be a non-empty string' };
  }

  if (candidate.context !== undefined && typeof candidate.context !== 'string') {
    return { ok: false, error: 'Body.context must be a string when provided' };
  }

  return {
    ok: true,
    value: {
      diff: candidate.diff,
      context: candidate.context as string | undefined,
    },
  };
}

function runHeuristicReview(diff: string, context?: string): ReviewResponseBody {
  const issues: ReviewIssue[] = [];
  const diffLines = diff.split(/\r?\n/);
  const addedLines = extractAddedLines(diffLines);

  addTodoFixmeIssues(addedLines, issues);
  addConsoleLogIssues(addedLines, issues);
  addAnyUnknownTypeIssues(addedLines, issues);
  addSecretExposureIssues(addedLines, issues);
  addMissingAwaitErrorHandlingIssues(addedLines, issues);
  addLongFunctionIssues(addedLines, issues);

  const score = scoreFromIssues(issues);
  const summary = buildSummary(issues, score, Boolean(context && context.trim()));

  return { summary, issues, score };
}

function extractAddedLines(diffLines: string[]): string[] {
  const added: string[] = [];

  for (const line of diffLines) {
    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }

    added.push(line.slice(1));
  }

  return added;
}

function addTodoFixmeIssues(lines: string[], issues: ReviewIssue[]): void {
  const pattern = /\b(TODO|FIXME)\b/i;

  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      issues.push({
        severity: 'info',
        description: `Found ${pattern.exec(lines[i])?.[1]?.toUpperCase() ?? 'TODO/FIXME'} marker in added code (line ${i + 1}).`,
        suggestion: 'Resolve the task now or track it in an issue before merging.',
      });
    }
  }
}

function addConsoleLogIssues(lines: string[], issues: ReviewIssue[]): void {
  const pattern = /\bconsole\.log\s*\(/;

  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      issues.push({
        severity: 'warning',
        description: `Found console.log in added code (line ${i + 1}).`,
        suggestion: 'Remove debug logging or replace with a structured logger guarded by environment.',
      });
    }
  }
}

function addAnyUnknownTypeIssues(lines: string[], issues: ReviewIssue[]): void {
  const patterns = [
    /:\s*(any|unknown)\b/,
    /<\s*(any|unknown)\s*>/,
    /\bas\s+(any|unknown)\b/,
  ];

  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some((pattern) => pattern.test(lines[i]))) {
      issues.push({
        severity: 'warning',
        description: `Found broad TypeScript type (any/unknown) in added code (line ${i + 1}).`,
        suggestion: 'Use a specific interface/type or narrow unknown with runtime checks.',
      });
    }
  }
}

function addSecretExposureIssues(lines: string[], issues: ReviewIssue[]): void {
  const patterns = [
    /\b(API_KEY|TOKEN|PASSWORD|SECRET)\b\s*[:=]\s*['"][^'"]+['"]/i,
    /['"](api[_-]?key|token|password|secret)['"]\s*:\s*['"][^'"]+['"]/i,
    /\b(token|password|secret)\b\s*=\s*['"][^'"]+['"]/i,
  ];

  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some((pattern) => pattern.test(lines[i]))) {
      issues.push({
        severity: 'critical',
        description: `Potential hard-coded secret detected in added code (line ${i + 1}).`,
        suggestion: 'Move credentials to secrets management or environment bindings.',
      });
    }
  }
}

function addMissingAwaitErrorHandlingIssues(lines: string[], issues: ReviewIssue[]): void {
  const awaitPattern = /\bawait\s+[^;]+/;
  const tryPattern = /\btry\b/;
  const catchPattern = /\bcatch\b/;
  const commentPattern = /^\s*\/\//;

  const stateByLine = computeTryBlockState(lines);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!awaitPattern.test(line) || commentPattern.test(line)) {
      continue;
    }

    const withinTry = stateByLine[i] > 0;
    const inlineHandled = tryPattern.test(line) || catchPattern.test(line);

    if (!withinTry && !inlineHandled) {
      issues.push({
        severity: 'warning',
        description: `Await call appears without explicit error handling (line ${i + 1}).`,
        suggestion: 'Wrap awaited calls in try/catch or handle rejections explicitly.',
      });
    }
  }
}

function computeTryBlockState(lines: string[]): number[] {
  const depthByLine: number[] = [];
  let tryDepth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/\btry\b/.test(line)) {
      tryDepth += 1;
    }

    depthByLine.push(tryDepth);

    if (/\bcatch\b/.test(line)) {
      tryDepth = Math.max(0, tryDepth - 1);
      continue;
    }

    const closeBraces = (line.match(/}/g) ?? []).length;
    if (closeBraces > 0 && tryDepth > 0) {
      tryDepth = Math.max(0, tryDepth - closeBraces);
    }
  }

  return depthByLine;
}

function addLongFunctionIssues(lines: string[], issues: ReviewIssue[]): void {
  const functionStartPattern = /\bfunction\b|=>\s*\{|\)\s*\{/;

  let braceDepth = 0;
  let currentFunctionStart: number | null = null;
  let functionBraceDepth = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const openBraces = (line.match(/\{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;

    if (currentFunctionStart === null && functionStartPattern.test(line) && openBraces > 0) {
      currentFunctionStart = i;
      functionBraceDepth = braceDepth + openBraces;
    }

    braceDepth = Math.max(0, braceDepth + openBraces - closeBraces);

    if (currentFunctionStart !== null && braceDepth < functionBraceDepth) {
      const length = i - currentFunctionStart + 1;
      if (length > 100) {
        issues.push({
          severity: 'info',
          description: `Function added with ${length} lines (starts at added line ${currentFunctionStart + 1}).`,
          suggestion: 'Split the function into smaller, focused helpers to improve maintainability.',
        });
      }
      currentFunctionStart = null;
      functionBraceDepth = 0;
    }
  }
}

function scoreFromIssues(issues: ReviewIssue[]): number {
  const severityPenalty: Record<Severity, number> = {
    critical: 25,
    warning: 10,
    info: 3,
  };

  const totalPenalty = issues.reduce((sum, issue) => sum + severityPenalty[issue.severity], 0);
  return Math.max(0, 100 - totalPenalty);
}

function buildSummary(issues: ReviewIssue[], score: number, hasContext: boolean): string {
  if (issues.length === 0) {
    return hasContext
      ? `No heuristic issues found in diff. Context provided. Score: ${score}/100.`
      : `No heuristic issues found in diff. Score: ${score}/100.`;
  }

  const counts = issues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 } as Record<Severity, number>,
  );

  const contextLabel = hasContext ? ' Context considered.' : '';
  return `Found ${issues.length} issue(s): ${counts.critical} critical, ${counts.warning} warning, ${counts.info} info. Score: ${score}/100.${contextLabel}`;
}

function jsonResponse<T>(payload: T, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}
