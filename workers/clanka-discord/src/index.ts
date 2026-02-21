import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from 'discord-interactions';
import { triageInput } from '../../shared/shield';
import { analyzeDiff } from '../../shared/spine';

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_TOKEN: string;
  GITHUB_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CLANKA_ADMIN_IDS: string;
  CLANKA_STATE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
      }

      const signature = request.headers.get('x-signature-ed25519');
      const timestamp = request.headers.get('x-signature-timestamp');
      const body = await request.text();

      const isValidRequest =
        signature &&
        timestamp &&
        verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);

      if (!isValidRequest) {
        return new Response('Bad request signature', { status: 401 });
      }

      const interaction = JSON.parse(body);

      if (interaction.type === InteractionType.PING) {
        return new Response(
          JSON.stringify({ type: InteractionResponseType.PONG }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Security: Admin Lock
      const userId = interaction.member?.user?.id || interaction.user?.id;
      const allowedIds = (env.CLANKA_ADMIN_IDS || '').split(',');
      if (!allowedIds.includes(userId)) {
        return this.jsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🚫 **Access Denied.** Unauthorized User ID: ${userId}` },
        });
      }

      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const { name, options } = interaction.data;

        // Command: /status
        if (name === 'status') {
          return this.jsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '⚡ **CLANKA: Operational.** Systems verified. Shield active.' },
          });
        }

        // Command: /review
        if (name === 'review') {
          const prUrl = options.find((opt: any) => opt.name === 'pr_url')?.value;
          
          // Triage Input
          const triage = triageInput(prUrl);
          if (!triage.safe) {
            return this.jsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: `⚠️ **Shield Alert:** ${triage.reason}` },
            });
          }

          const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
          if (!match) {
            return this.jsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: '❌ Invalid GitHub PR URL.' },
            });
          }

          const [_, owner, repo, pull_number] = match;

          // Fetch Metadata & Diff
          const [prRes, diffRes] = await Promise.all([
            fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
              headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Clanka-Discord', 'Accept': 'application/vnd.github.v3+json' }
            }),
            fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
              headers: { 'Authorization': `Bearer ${env.GITHUB_TOKEN}`, 'User-Agent': 'Clanka-Discord', 'Accept': 'application/vnd.github.v3.diff' }
            })
          ]);

          if (!prRes.ok) throw new Error(`GitHub API error: ${prRes.statusText}`);
          
          const prData: any = await prRes.json();
          const diffText = diffRes.ok ? await diffRes.text() : '';
          const analysis = analyzeDiff(diffText);

          return this.jsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { 
              content: `🔍 **PR Review: #${pull_number} in ${owner}/${repo}**\n` +
                       `**Title:** ${prData.title}\n` +
                       `**Author:** ${prData.user.login}\n` +
                       `**Diff:** +${prData.additions} / -${prData.deletions}\n\n` +
                       `**${analysis.logicSummary}**`
            },
          });
        }

        // Command: /feedback
        if (name === 'feedback') {
          const limit = options?.find((opt: any) => opt.name === 'limit')?.value || 5;

          const response = await fetch(`${env.SUPABASE_URL}/rest/v1/UserFeedback?select=*&order=created_at.desc&limit=${limit}`, {
            headers: {
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`Supabase error: ${response.statusText}`);
          }

          const feedbackData: any[] = await response.json();

          if (feedbackData.length === 0) {
            return this.jsonResponse({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: '📥 **Feedback Engine:** No recent user feedback found.' },
            });
          }

          const feedbackList = feedbackData.map((f: any) => 
            `• **[${f.category}]** ${f.message.substring(0, 100)}${f.message.length > 100 ? '...' : ''}\n  *Status: ${f.status} | Page: ${f.page_path || 'unknown'}*`
          ).join('\n\n');

          return this.jsonResponse({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { 
              content: `📥 **Latest User Feedback (Last ${feedbackData.length}):**\n\n${feedbackList}`
            },
          });
        }
      }

      return new Response('Unknown interaction', { status: 400 });
    } catch (err: any) {
      // Fail-safe: No stack traces leaked
      return this.jsonResponse({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `❌ **System Error:** Internal failure during processing.` },
      });
    }
  },

  jsonResponse(obj: any): Response {
    return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
  }
};
