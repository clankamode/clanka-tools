import { analyzeDiff, riskScore } from '../../../shared/spine';
import { triageInput } from '../../../shared/shield';

export interface DiscordInteractionOption {
  name: string;
  value?: string | number | boolean;
}

export interface DiscordInteraction {
  data?: {
    name?: string;
    options?: DiscordInteractionOption[];
  };
  member?: {
    user?: {
      id?: string;
    };
  };
  user?: {
    id?: string;
  };
  env?: CommandExecutionEnvironment;
}

export interface CommandExecutionEnvironment {
  GITHUB_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface DiscordResponse {
  type: 4 | 1;
  data?: {
    content: string;
    riskSummary?: RiskSummary;
  };
}

export type DiscordCommandHandler = (
  interaction: DiscordInteraction
) => Promise<DiscordResponse>;

export interface DiscordSlashCommandOption {
  type: 3 | 4;
  name: string;
  description: string;
  required?: boolean;
}

export interface RuntimeCommandSchema<Name extends string = string> {
  name: Name;
  description: string;
  handler: DiscordCommandHandler;
  options?: ReadonlyArray<DiscordSlashCommandOption>;
}

export interface RiskSummary {
  score: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface PrUrlValidationResult {
  valid: boolean;
  error?: string;
}

export type ParsedCommandOptions =
  | {
      valid: true;
      command: 'review';
      args: { pr_url: string };
    }
  | {
      valid: true;
      command: 'scan';
      args: { repo: string };
    }
  | {
      valid: false;
      error: string;
    };

const response = (
  content: string,
  extraData?: Omit<NonNullable<DiscordResponse['data']>, 'content'>
): DiscordResponse => ({
  type: 4,
  data: { content, ...(extraData ?? {}) },
});

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const asObject = (
  value: unknown
): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const serviceUnavailable = (service: string): DiscordResponse =>
  response(
    `⚠️ **${service} service is temporarily unavailable.** Please try again shortly.`
  );

function parseGitHubPrUrl(
  url: string
): { owner: string; repo: string; pull_number: string } | undefined {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'github.com') {
    return undefined;
  }

  const [owner, repo, maybePull, pull_number] = parsedUrl.pathname
    .split('/')
    .filter(Boolean);

  if (!owner || !repo || maybePull !== 'pull' || !pull_number || !/^\d+$/.test(pull_number)) {
    return undefined;
  }

  return { owner, repo, pull_number };
}

export function validatePrUrl(url: string): PrUrlValidationResult {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: 'Missing PR URL.' };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format.' };
  }

  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'github.com') {
    return {
      valid: false,
      error: 'Only GitHub pull request URLs are supported.',
    };
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  if (segments.length >= 3 && segments[2] === 'pull' && !segments[3]) {
    return { valid: false, error: 'Missing pull request number in URL.' };
  }

  if (!parseGitHubPrUrl(url)) {
    return { valid: false, error: 'Invalid GitHub PR URL.' };
  }

  return { valid: true };
}

export function parseCommandOptions(
  commandName: string | undefined,
  options: DiscordInteractionOption[] = []
): ParsedCommandOptions {
  if (!commandName) {
    return { valid: false, error: 'Missing command name. Try `/help`.' };
  }

  const pickOption = (optionName: string): string | number | boolean | undefined =>
    options.find((option) => option.name === optionName)?.value;

  if (commandName === 'review') {
    const prUrl = pickOption('pr_url');
    if (!prUrl || typeof prUrl !== 'string') {
      return { valid: false, error: 'Missing or invalid `pr_url` argument.' };
    }
    return { valid: true, command: 'review', args: { pr_url: prUrl } };
  }

  if (commandName === 'scan') {
    const repo = pickOption('repo');
    if (!repo || typeof repo !== 'string') {
      return { valid: false, error: 'Missing or invalid `repo` argument.' };
    }
    return { valid: true, command: 'scan', args: { repo } };
  }

  return {
    valid: false,
    error: `Unknown command \`/${commandName}\`. Try \`/help\` for available commands.`,
  };
}

export function buildRiskSummary(score: number): RiskSummary {
  if (score <= 33) {
    return {
      score,
      level: 'low',
      reasons: [
        'Smaller change footprint.',
        'Lower expected regression surface.',
      ],
    };
  }

  if (score <= 66) {
    return {
      score,
      level: 'medium',
      reasons: [
        'Moderate code churn.',
        'Requires focused regression checks.',
      ],
    };
  }

  return {
    score,
    level: 'high',
    reasons: [
      'High change volume or complexity.',
      'Elevated likelihood of cross-file regressions.',
    ],
  };
}

const findOption = (
  interaction: DiscordInteraction,
  name: string
): string | number | boolean | undefined => {
  return interaction.data?.options?.find((option) => option.name === name)?.value;
};

const commandStatus: DiscordCommandHandler = async () => {
  return response('⚡ **CLANKA: Operational.** Systems verified. Shield active.');
};

const commandReview: DiscordCommandHandler = async (interaction) => {
  try {
    const parsedReviewOptions = parseCommandOptions(
      interaction.data?.name,
      interaction.data?.options ?? []
    );
    if (!parsedReviewOptions.valid) {
      return response(`❌ ${parsedReviewOptions.error}`);
    }
    const prUrl = parsedReviewOptions.args.pr_url;

    const triage = triageInput(prUrl);
    if (!triage.safe) {
      return response(`⚠️ **Shield Alert:** ${triage.reason}`);
    }

    const validation = validatePrUrl(prUrl);
    if (!validation.valid) {
      return response(`❌ ${validation.error}`);
    }

    const parsedPrUrl = parseGitHubPrUrl(prUrl);
    if (!parsedPrUrl) {
      return response('❌ Invalid GitHub PR URL.');
    }
    const { owner, repo, pull_number } = parsedPrUrl;
    const authHeaders = {
      Authorization: `Bearer ${interaction.env?.GITHUB_TOKEN}`,
      'User-Agent': 'Clanka-Discord',
      Accept: 'application/vnd.github.v3+json',
    };

    let prRes: Response;
    let diffRes: Response;
    try {
      [prRes, diffRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
          headers: authHeaders,
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
          headers: {
            Authorization: `Bearer ${interaction.env?.GITHUB_TOKEN}`,
            'User-Agent': 'Clanka-Discord',
            Accept: 'application/vnd.github.v3.diff',
          },
        }),
      ]);
    } catch {
      return serviceUnavailable('PR Review');
    }

    if (!prRes.ok) {
      return serviceUnavailable('PR Review');
    }

    let prData: Record<string, unknown>;
    try {
      const rawPrData = (await prRes.json()) as Record<string, unknown>;
      prData = asObject(rawPrData) ?? {};
    } catch {
      return serviceUnavailable('PR Review');
    }

    let diffText = '';
    if (diffRes.ok) {
      try {
        diffText = await diffRes.text();
      } catch {
        return serviceUnavailable('PR Review');
      }
    }
    const analysis = analyzeDiff(diffText);

    const user = asObject(prData.user) ?? {};
    const author = asString(user.login);
    const title = asString(prData.title, 'Untitled');
    const additions = Number(prData.additions) || 0;
    const deletions = Number(prData.deletions) || 0;
    const score = riskScore(diffText);
    const riskSummary = buildRiskSummary(score);

    return response(
      `🔍 **PR Review: #${pull_number} in ${owner}/${repo}**\n` +
        `**Title:** ${title}\n` +
        `**Author:** ${author}\n` +
        `**Diff:** +${additions} / -${deletions}\n` +
        `**Risk:** ${riskSummary.level.toUpperCase()} (${riskSummary.score}/100)\n` +
        `**Risk Signals:** ${riskSummary.reasons.join(' ')}\n\n` +
        `**${analysis.logicSummary}**`,
      { riskSummary }
    );
  } catch {
    return serviceUnavailable('PR Review');
  }
};

const commandFeedback: DiscordCommandHandler = async (interaction) => {
  try {
    const requestedLimit =
      findOption(interaction, 'limit') ?? 5;
    const parsedLimit = Number(requestedLimit);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.floor(parsedLimit)
        : 5;

    let responsePayload: Response;
    try {
      responsePayload = await fetch(
        `${interaction.env?.SUPABASE_URL}/rest/v1/UserFeedback?select=*&order=created_at.desc&limit=${limit}`,
        {
          headers: {
            apikey: interaction.env?.SUPABASE_SERVICE_ROLE_KEY ?? '',
            Authorization: `Bearer ${interaction.env?.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch {
      return serviceUnavailable('Feedback');
    }

    if (!responsePayload.ok) {
      return serviceUnavailable('Feedback');
    }

    let feedbackData: Array<Record<string, unknown>>;
    try {
      const payload = (await responsePayload.json()) as unknown;
      feedbackData = Array.isArray(payload) ? (payload as Array<Record<string, unknown>>) : [];
    } catch {
      return serviceUnavailable('Feedback');
    }

    if (feedbackData.length === 0) {
      return response('📥 **Feedback Engine:** No recent user feedback found.');
    }

    const feedbackList = feedbackData
      .map(
        (feedback) =>
          `• **[${asString(feedback.category, 'Uncategorized')}]** ${asString(
            feedback.message,
            'No message content'
          ).substring(0, 100)}${
            asString(feedback.message, 'No message content').length > 100 ? '...' : ''
          }\n  *Status: ${asString(feedback.status, 'unknown')} | Page: ${
            asString(feedback.page_path, 'unknown')
          }*`
      )
      .join('\n\n');

    return response(
      `📥 **Latest User Feedback (Last ${feedbackData.length}):**\n\n${feedbackList}`
    );
  } catch {
    return serviceUnavailable('Feedback');
  }
};

const commandHelp: DiscordCommandHandler = async () => {
  return response(
    `📘 **Clanka Commands**\n\n` +
      `• \`/status\` - Check if Clanka is operational\n` +
      `• \`/review pr_url\` - Run a heuristic code review on a GitHub PR\n` +
      `• \`/feedback [limit]\` - Show recent user feedback from Supabase\n` +
      `• \`/help\` - Show this help message`
  );
};

const runtimeCommandRegistry = [
  {
    name: 'status',
    description: 'Check Clanka system status',
    handler: commandStatus,
  },
  {
    name: 'review',
    description: 'Get a summary of a GitHub PR',
    handler: commandReview,
    options: [
      {
        type: 3,
        name: 'pr_url',
        description: 'The URL of the GitHub PR',
        required: true,
      },
    ],
  },
  {
    name: 'feedback',
    description: 'Check latest user feedback entries',
    handler: commandFeedback,
    options: [
      {
        type: 4,
        name: 'limit',
        description: 'Number of entries to fetch (default 5)',
        required: false,
      },
    ],
  },
  {
    name: 'help',
    description: 'Show available commands',
    handler: commandHelp,
  },
] as const;

export type RuntimeCommandName = (typeof runtimeCommandRegistry)[number]['name'];

export const commandRegistry: ReadonlyArray<RuntimeCommandSchema<RuntimeCommandName>> =
  runtimeCommandRegistry;

const commandRegistryByName: Map<RuntimeCommandName, RuntimeCommandSchema<RuntimeCommandName>> =
  new Map(commandRegistry.map((command) => [command.name, command]));

export function getCommandSchema(
  commandName: string | undefined
): RuntimeCommandSchema<RuntimeCommandName> | undefined {
  if (!commandName) {
    return undefined;
  }
  return commandRegistryByName.get(commandName as RuntimeCommandName);
}

export function getCommandHandler(
  commandName: string | undefined
): DiscordCommandHandler | undefined {
  return getCommandSchema(commandName)?.handler;
}
