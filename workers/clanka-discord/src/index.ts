import {
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import {
  commandRegistry,
  type CommandExecutionEnvironment,
  type DiscordInteraction,
  type DiscordResponse,
} from '../commands/registry';

export interface Env {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_TOKEN: string;
  GITHUB_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CLANKA_ADMIN_IDS: string;
  CLANKA_STATE: unknown;
}

function jsonResponse(obj: DiscordResponse): Response {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });
}

function pongResponse(): DiscordResponse {
  return {
    type: 1,
    data: undefined,
  };
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
      const typedInteraction = interaction as DiscordInteraction;

      if (interaction.type === InteractionType.PING) {
        return jsonResponse(pongResponse());
      }

      // Security: Admin Lock
      const userId = interaction.member?.user?.id || interaction.user?.id;
      const allowedIds = (env.CLANKA_ADMIN_IDS || '').split(',');
      if (!allowedIds.includes(userId)) {
        return jsonResponse({
          type: 4,
          data: { content: `🚫 **Access Denied.** Unauthorized User ID: ${userId}` },
        });
      }

      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const name = interaction.data?.name;
        const handler = name ? commandRegistry[name] : undefined;

        if (!handler) {
          return new Response('Unknown command', { status: 400 });
        }

        const commandEnv: CommandExecutionEnvironment = {
          GITHUB_TOKEN: env.GITHUB_TOKEN,
          SUPABASE_URL: env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        };
        const commandInteraction: DiscordInteraction = {
          ...typedInteraction,
          env: commandEnv,
        };

        return jsonResponse(await handler(commandInteraction));
      }

      return jsonResponse({
        type: 4,
        data: { content: 'Unknown interaction' },
      });
    } catch (err: any) {
      // Fail-safe: No stack traces leaked
      return jsonResponse({
        type: 4,
        data: { content: `❌ **System Error:** Internal failure during processing.` },
      });
    }
  }
};
