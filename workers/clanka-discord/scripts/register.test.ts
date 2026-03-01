import { describe, expect, it, vi } from "vitest";

type RegisterModule = {
  COMMANDS: Array<{ name: string }>;
  parseCliArgs: (argv?: string[]) => { json: boolean; help: boolean };
  registerCommands: (options?: {
    applicationId?: string;
    token?: string;
    fetchImpl?: typeof fetch;
    log?: (message: string) => void;
    errorLog?: (message: string) => void;
    argv?: string[];
  }) => Promise<{ ok: boolean; error?: string; status?: number; data?: unknown }>;
};

const loadRegisterModule = async (): Promise<RegisterModule> => {
  const mod = await import("./register.js");
  return (mod.default ?? mod) as RegisterModule;
};

describe("workers/clanka-discord/scripts/register CLI", () => {
  it("parses --json and --help flags", async () => {
    const registerModule = await loadRegisterModule();

    expect(registerModule.parseCliArgs(["--json"])).toEqual({
      json: true,
      help: false,
    });
    expect(registerModule.parseCliArgs(["--help"])).toEqual({
      json: false,
      help: true,
    });
    expect(registerModule.parseCliArgs(["-h"])).toEqual({
      json: false,
      help: true,
    });
  });

  it("returns help output for --help in plain text mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();

    const result = await registerModule.registerCommands({
      argv: ["--help"],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledWith("Usage: node scripts/register.js [--json]");
  });

  it("returns help output for --help in json mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();

    const result = await registerModule.registerCommands({
      argv: ["--help", "--json"],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(log.mock.calls[0][0]) as {
      ok: boolean;
      usage: string;
      commands: string[];
    };
    expect(payload.ok).toBe(true);
    expect(payload.usage).toBe("Usage: node scripts/register.js [--json]");
    expect(payload.commands).toContain("review");
  });

  it("returns missing-env error in plain text mode", async () => {
    const registerModule = await loadRegisterModule();
    const errorLog = vi.fn<(message: string) => void>();

    const result = await registerModule.registerCommands({
      applicationId: "",
      token: "",
      argv: [],
      log: vi.fn(),
      errorLog,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN");
    expect(errorLog).toHaveBeenCalledWith("Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN");
  });

  it("returns missing-env error in --json mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();

    const result = await registerModule.registerCommands({
      applicationId: "",
      token: "",
      argv: ["--json"],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(false);
    const payload = JSON.parse(log.mock.calls[0][0]) as { ok: boolean; error: string };
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("Missing DISCORD_APPLICATION_ID or DISCORD_TOKEN");
  });

  it("logs success payload in plain text mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ id: "1", name: "status" }]), { status: 200 })
    );

    const result = await registerModule.registerCommands({
      applicationId: "app-id",
      token: "bot-token",
      fetchImpl,
      argv: [],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(true);
    expect(log).toHaveBeenCalledWith("Successfully registered commands");
    expect(log.mock.calls[1][0]).toContain("\"status\"");
  });

  it("logs success payload in --json mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ id: "2", name: "review" }]), { status: 200 })
    );

    const result = await registerModule.registerCommands({
      applicationId: "app-id",
      token: "bot-token",
      fetchImpl,
      argv: ["--json"],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(log.mock.calls[0][0]) as {
      ok: boolean;
      commandCount: number;
      data: Array<{ name: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.commandCount).toBe(registerModule.COMMANDS.length);
    expect(payload.data[0].name).toBe("review");
  });

  it("returns non-ok response details in --json mode", async () => {
    const registerModule = await loadRegisterModule();
    const log = vi.fn<(message: string) => void>();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("discord error", { status: 400 })
    );

    const result = await registerModule.registerCommands({
      applicationId: "app-id",
      token: "bot-token",
      fetchImpl,
      argv: ["--json"],
      log,
      errorLog: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    const payload = JSON.parse(log.mock.calls[0][0]) as {
      ok: boolean;
      status: number;
      error: string;
    };
    expect(payload.ok).toBe(false);
    expect(payload.status).toBe(400);
    expect(payload.error).toContain("discord error");
  });

  it("returns network errors in plain text mode", async () => {
    const registerModule = await loadRegisterModule();
    const errorLog = vi.fn<(message: string) => void>();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new Error("Network unreachable")
    );

    const result = await registerModule.registerCommands({
      applicationId: "app-id",
      token: "bot-token",
      fetchImpl,
      argv: [],
      log: vi.fn(),
      errorLog,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network unreachable");
    expect(errorLog).toHaveBeenCalledWith("Error registering commands");
    expect(errorLog).toHaveBeenCalledWith("Network unreachable");
  });
});
