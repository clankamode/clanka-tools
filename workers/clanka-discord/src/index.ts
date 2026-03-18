import {
  InteractionType,
  verifyKey,
} from 'discord-interactions';
import { createHealthCheck } from '../../../shared/healthz';
import {
  getCommandSchema,
  type CommandExecutionEnvironment,
  type DiscordInteraction,
  type DiscordResponse,
} from '../commands/registry';

const VERSION = '1.0.0';
const checkHealth = createHealthCheck({ version: VERSION });

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

export function parseAdminIds(raw: string | null | undefined): {
  ids: string[];
  diagnostic?: string;
} {
  const normalized = (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const deduped = Array.from(new Set(normalized));
  if (deduped.length === 0) {
    return {
      ids: [],
      diagnostic: "No valid admin IDs were parsed from CLANKA_ADMIN_IDS. Access denied.",
    };
  }

  const malformed = deduped.filter((id) => !/^\d+$/.test(id));
  if (malformed.length > 0) {
    return {
      ids: [],
      diagnostic: `Malformed CLANKA_ADMIN_IDS entries detected (${malformed.join(", ")}). Access denied.`,
    };
  }

  return { ids: deduped };
}

function jsonResponse<T>(obj: T, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/healthz') {
        const status = await checkHealth();
        return jsonResponse(status, status.status === 'down' ? 503 : 200);
      }

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
      const { ids: allowedIds, diagnostic } = parseAdminIds(env.CLANKA_ADMIN_IDS);
      if (diagnostic) {
        return jsonResponse({
          type: 4,
          data: {
            content: `🚫 **Access Denied.** ${diagnostic}`,
          },
        });
      }

      const userId = interaction.member?.user?.id || interaction.user?.id;
      if (!allowedIds.includes(userId)) {
        return jsonResponse({
          type: 4,
          data: { content: `🚫 **Access Denied.** Unauthorized User ID: ${userId}` },
        });
      }

      if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        const name = interaction.data?.name;
        const command = getCommandSchema(name);

        if (!command) {
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

        return jsonResponse(await command.handler(commandInteraction));
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
