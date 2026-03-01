# clanka-discord worker

Discord interaction worker for Clanka slash commands.

## Required production environment

Set these in Cloudflare for the `clanka-discord` worker:

1. `DISCORD_PUBLIC_KEY` (secret)  
   Discord app public key used by `verifyKey()` to validate interaction signatures.
2. `DISCORD_APPLICATION_ID` (secret or var)  
   Discord application id used for slash command registration.
3. `DISCORD_TOKEN` (secret)  
   Discord bot token used by `scripts/register.js`.
4. `CLANKA_ADMIN_IDS` (var)  
   Comma-separated Discord user IDs allowed to run commands.
5. `GITHUB_TOKEN` (secret)  
   GitHub token used by `/review` when reading PR metadata and diffs.
6. `SUPABASE_URL` (secret or var)  
   Base project URL used by `/feedback`.
7. `SUPABASE_SERVICE_ROLE_KEY` (secret)  
   Service role key used by `/feedback` for Supabase REST access.

`wrangler.toml` also requires a bound KV namespace for `CLANKA_STATE`.

## Configure production secrets/vars

From `workers/clanka-discord`:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put CLANKA_ADMIN_IDS
```

If you prefer non-secret vars for non-sensitive values, set them in `wrangler.toml` under `[vars]` or with `npx wrangler deploy --var KEY:VALUE`.

## Build, register, deploy

```bash
npm install
npm run build
npm run register
npm run deploy
```

`npm run register` sends command definitions to Discord using `DISCORD_APPLICATION_ID` and `DISCORD_TOKEN`.

## Local development

Use `.dev.vars` (or your shell env) before `npx wrangler dev`:

```bash
DISCORD_PUBLIC_KEY=...
DISCORD_APPLICATION_ID=...
DISCORD_TOKEN=...
CLANKA_ADMIN_IDS=1234567890,9999999999
GITHUB_TOKEN=...
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```
