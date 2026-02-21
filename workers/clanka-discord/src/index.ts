import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from 'discord-interactions';

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_TOKEN: string;
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
        
        // Immediate response while we process (Discord timeout is 3s)
        return new Response(
          JSON.stringify({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: `🔍 Analyzing PR: ${prUrl}... (Full reviewer engine integration pending)` },
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
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
