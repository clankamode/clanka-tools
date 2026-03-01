import { analyzeDiff } from '../../../shared/spine';
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
  };
}

export type DiscordCommandHandler = (
  interaction: DiscordInteraction
) => Promise<DiscordResponse>;

const response = (content: string): DiscordResponse => ({
  type: 4,
  data: { content },
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
    const prUrl = findOption(interaction, 'pr_url');
    if (!prUrl || typeof prUrl !== 'string') {
      return response('❌ Missing or invalid `pr_url` argument.');
    }

    const triage = triageInput(prUrl);
    if (!triage.safe) {
      return response(`⚠️ **Shield Alert:** ${triage.reason}`);
    }

    const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) {
      return response('❌ Invalid GitHub PR URL.');
    }

    const [, owner, repo, pull_number] = match;
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

    return response(
      `🔍 **PR Review: #${pull_number} in ${owner}/${repo}**\n` +
        `**Title:** ${title}\n` +
        `**Author:** ${author}\n` +
        `**Diff:** +${additions} / -${deletions}\n\n` +
        `**${analysis.logicSummary}**`
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

export const commandRegistry: Record<string, DiscordCommandHandler> = {
  status: commandStatus,
  review: commandReview,
  feedback: commandFeedback,
  help: commandHelp,
};
