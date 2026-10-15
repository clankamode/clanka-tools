# clanka-reviewer worker

Heuristic HTTP reviewer for unified/git diffs. It inspects **added** lines only.

## Endpoints

- `GET /health` — process liveness (`{ ok: true, version }`). Does **not** run a review or check dependencies.
- `POST /review` — JSON body `{ "diff": string, "context"?: string }`.

## Honest scoring

- `diff` must be a recognizable unified/git diff; otherwise the handler returns HTTP 400.
- Empty `diff` strings are rejected with HTTP 400.
- Deletion-only diffs return HTTP 200 with `score: null` and a summary that the heuristic review did not run.
- `context` is accepted for compatibility but **not used**. When supplied, the summary says it was ignored.

A `score` of 100 means added lines were scanned and no heuristic rules fired. It is not returned when the tool scanned nothing.
