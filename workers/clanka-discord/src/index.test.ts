import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index";
import { verifyKey } from "discord-interactions";

vi.mock("discord-interactions", () => ({
  InteractionType: {
    PING: 1,
    APPLICATION_COMMAND: 2,
  },
  verifyKey: vi.fn(),
}));

type WorkerEnv = {
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_TOKEN: string;
  GITHUB_TOKEN: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CLANKA_ADMIN_IDS: string;
};

const env: WorkerEnv = {
  DISCORD_PUBLIC_KEY: "public-key",
  DISCORD_APPLICATION_ID: "app-id",
  DISCORD_TOKEN: "bot-token",
  GITHUB_TOKEN: "github-token",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "supabase-key",
  CLANKA_ADMIN_IDS: "authorized-user",
};

const makeInteractionRequest = (payload: object, options: { method?: string } = {}) => {
  return new Request("https://discord.local/api/interactions", {
    method: options.method ?? "POST",
    headers: {
      "x-signature-ed25519": "valid-sig",
      "x-signature-timestamp": "1234567890",
    },
    body: JSON.stringify(payload),
  });
};

describe("workers/clanka-discord index request handling", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch");
    vi.mocked(verifyKey).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 405 for non-POST methods", async () => {
    const response = await worker.fetch(
      new Request("https://discord.local/api/interactions", {
        method: "GET",
      }),
      env as never
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method not allowed");
  });

  it("returns 401 for invalid signatures", async () => {
    vi.mocked(verifyKey).mockReturnValue(false);

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 1,
      }),
      env as never
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Bad request signature");
  });

  it("returns access denied JSON for unauthorized user", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: { name: "status" },
        member: { user: { id: "unauthorized-user" } },
      }),
      env as never
    );
    const payload = (await response.json()) as { data: { content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.content).toContain("Unauthorized User ID: unauthorized-user");
  });

  it("returns 400 for unknown command dispatch", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: { name: "nonexistent" },
        member: { user: { id: "authorized-user" } },
      }),
      env as never
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Unknown command");
  });

  it("returns a stable error response when /review fetches fail", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network down"));

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: {
          name: "review",
          options: [{ name: "pr_url", value: "https://github.com/example/repo/pull/123" }],
        },
        member: { user: { id: "authorized-user" } },
      }),
      env as never
    );
    const payload = (await response.json()) as { data: { content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.content).toContain("PR Review service is temporarily unavailable");
  });

  it("returns a stable error response when /feedback fetch fails", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("Network down"));

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: {
          name: "feedback",
          options: [{ name: "limit", value: 5 }],
        },
        member: { user: { id: "authorized-user" } },
      }),
      env as never
    );
    const payload = (await response.json()) as { data: { content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.content).toContain("Feedback service is temporarily unavailable");
  });

  it("returns a stable error response when /review receives malformed JSON", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("not-json", { status: 200 }))
      .mockResolvedValueOnce(new Response("diff", { status: 200 }));

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: {
          name: "review",
          options: [{ name: "pr_url", value: "https://github.com/example/repo/pull/123" }],
        },
        member: { user: { id: "authorized-user" } },
      }),
      env as never
    );
    const payload = (await response.json()) as { data: { content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.content).toContain("PR Review service is temporarily unavailable");
  });

  it("returns a stable error response when /feedback returns malformed JSON", async () => {
    vi.mocked(verifyKey).mockReturnValue(true);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("not-json", { status: 200 })
    );

    const response = await worker.fetch(
      makeInteractionRequest({
        type: 2,
        data: {
          name: "feedback",
          options: [{ name: "limit", value: 5 }],
        },
        member: { user: { id: "authorized-user" } },
      }),
      env as never
    );
    const payload = (await response.json()) as { data: { content: string } };

    expect(response.status).toBe(200);
    expect(payload.data.content).toContain("Feedback service is temporarily unavailable");
  });
});
