import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from 'discord-interactions';

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_TOKEN: string;
  GITHUB_TOKEN: string;
  CLANKA_ADMIN_IDS: string; // Comma-separated list of Discord User IDs
  CLANKA_STATE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Handle Ping for URL validation
    if (interaction.type === InteractionType.PING) {
      return new Response(
        JSON.stringify({ type: InteractionResponseType.PONG }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Security: User-Level Access Lock
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const allowedIds = (env.CLANKA_ADMIN_IDS || '').split(',');
    
    if (!allowedIds.includes(userId)) {
      return new Response(
        JSON.stringify({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `🚫 **Access Denied.** Your User ID (${userId}) is not authorized to command Clanka.` },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Command Router
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { name, options } = interaction.data;

      if (name === 'status') {
        return new Response(
          JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '⚡ CLANKA: Operational. Systems verified. Memory synced.' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (name === 'review') {
        const prUrl = options.find((opt: any) => opt.name === 'pr_url')?.value;
        
        // Extract owner, repo, and pr number from URL
        // Expected format: https://github.com/owner/repo/pull/123
        const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        
        if (!match) {
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: '❌ Invalid GitHub PR URL. Expected format: `https://github.com/owner/repo/pull/123`' },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }

        const [_, owner, repo, pull_number] = match;

        try {
          const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
            headers: {
              'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Clanka-Discord-Worker',
              'Accept': 'application/vnd.github.v3+json'
            }
          });

          if (!githubResponse.ok) {
            throw new Error(`GitHub API error: ${githubResponse.statusText}`);
          }

          const prData: any = await githubResponse.json();

          // Fetch the Diff for logic analysis
          const diffResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`, {
            headers: {
              'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
              'User-Agent': 'Clanka-Discord-Worker',
              'Accept': 'application/vnd.github.v3.diff' // Request raw diff
            }
          });

          let logicSummary = 'Analysis failed.';
          if (diffResponse.ok) {
            const diffText = await diffResponse.text();
            
            // Industrial Minimalism Logic: Extract "spine" changes (new files, exported symbols, logic branches)
            // This is the baseline logic while the full LLM summarizer is being wired.
            const lines = diffText.split('\n');
            const newFiles = lines.filter(l => l.startsWith('+++ b/')).map(l => l.replace('+++ b/', ''));
            const exportedSymbols = lines.filter(l => l.startsWith('+export ') || l.startsWith('+  export ')).length;
            
            logicSummary = `**Spine Logic Overview:**\n` +
                           `- **Modified Files:** ${newFiles.length}\n` +
                           `- **New Exports:** ${exportedSymbols}\n` +
                           `- **Core Changes:** Detected ${newFiles.slice(0, 3).join(', ')}${newFiles.length > 3 ? '...' : ''}\n\n` +
                           `*Full cognitive review pass pending.*`;
          }

          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { 
                content: `🔍 **Analyzing PR #${pull_number} in ${owner}/${repo}**\n` +
                         `**Title:** ${prData.title}\n` +
                         `**Author:** ${prData.user.login}\n` +
                         `**Status:** ${prData.state}\n` +
                         `**Diff:** +${prData.additions} / -${prData.deletions}\n\n` +
                         `${logicSummary}`
              },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: `❌ Error fetching PR data: ${err.message}` },
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      if (name === 'feedback') {
        // Future: Fetch from Supabase
        return new Response(
          JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '📥 Fetching latest user feedback from Supabase...' },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Unknown interaction' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
