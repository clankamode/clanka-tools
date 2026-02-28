# Clanka Discord Worker Architecture

`workers/clanka-discord` is a Cloudflare Worker that receives Discord interactions, validates request signatures, performs admin gating, then routes slash commands through a typed command registry.

## Dataflow

```
+----------------+
| Discord Client |
+----------------+
        |
        v
+------------------------------+
| Worker.fetch (index.ts)      |
| - verifyKey                  |
| - PING -> PONG               |
| - Admin lock (CLANKA_ADMIN_IDS)|
+------------------------------+
        |
        v
+------------------------------+
| Command Registry             |
| workers/clanka-discord/...    |
| - status                    |
| - review                    |
| - feedback                  |
| - help                      |
+------------------------------+
        |
        |--------+-------------------------+
        |        |                         |
        |        v                         v
+--------------------+          +----------------------+
| shared/shield.ts    |          | shared/spine.ts        |
| triageInput()       |          | analyzeDiff()          |
| PR URL safety gate   |          | diff metrics summary    |
+--------------------+          +----------------------+
        |                             |
        +-------------+---------------+
                      |
                      v
           +----------------------+
           | Discord Interaction   |
           | Response (JSON)       |
           +----------------------+
```

- `shared/shield.ts` protects user-supplied PR URLs before any network calls.
- `shared/spine.ts` analyzes raw PR diff text and contributes the final logic summary.
- The registry returns typed `DiscordResponse` objects that are JSON-serialized by the worker.
