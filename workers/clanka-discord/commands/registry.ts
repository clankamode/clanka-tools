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

  const [prRes, diffRes] = await Promise.all([
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

  if (!prRes.ok) {
    throw new Error(`GitHub API error: ${prRes.statusText}`);
  }

  const prData = (await prRes.json()) as {
    title: string;
    user: { login: string };
    additions: number;
    deletions: number;
  };
  const diffText = diffRes.ok ? await diffRes.text() : '';
  const analysis = analyzeDiff(diffText);

  return response(
    `🔍 **PR Review: #${pull_number} in ${owner}/${repo}**\n` +
      `**Title:** ${prData.title}\n` +
      `**Author:** ${prData.user.login}\n` +
      `**Diff:** +${prData.additions} / -${prData.deletions}\n\n` +
      `**${analysis.logicSummary}**`
  );
};

const commandFeedback: DiscordCommandHandler = async (interaction) => {
  const requestedLimit =
    findOption(interaction, 'limit') ?? 5;
  const parsedLimit = Number(requestedLimit);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : 5;

  const responsePayload = await fetch(
    `${interaction.env?.SUPABASE_URL}/rest/v1/UserFeedback?select=*&order=created_at.desc&limit=${limit}`,
    {
      headers: {
        apikey: interaction.env?.SUPABASE_SERVICE_ROLE_KEY ?? '',
        Authorization: `Bearer ${interaction.env?.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!responsePayload.ok) {
    throw new Error(`Supabase error: ${responsePayload.statusText}`);
  }

  const feedbackData = (await responsePayload.json()) as Array<{
    category: string;
    message: string;
    status: string;
    page_path?: string;
  }>;

  if (feedbackData.length === 0) {
    return response('📥 **Feedback Engine:** No recent user feedback found.');
  }

  const feedbackList = feedbackData
    .map(
      (feedback) =>
        `• **[${feedback.category}]** ${feedback.message.substring(
          0,
          100
        )}${feedback.message.length > 100 ? '...' : ''}\n  *Status: ${feedback.status} | Page: ${
          feedback.page_path || 'unknown'
        }*`
    )
    .join('\n\n');

  return response(
    `📥 **Latest User Feedback (Last ${feedbackData.length}):**\n\n${feedbackList}`
  );
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
