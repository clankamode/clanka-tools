import { describe, expect, it, vi, afterEach } from "vitest";
import { createHealthCheck } from "./healthz";

afterEach(() => {
  vi.useRealTimers();
});

describe("createHealthCheck", () => {
  it("returns ok status when no dependencies are configured", async () => {
    const startTime = new Date("2026-03-17T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:05.000Z"));

    const checkHealth = createHealthCheck({
      version: "1.2.3",
      startTime,
    });

    const result = await checkHealth();

    expect(result).toEqual({
      status: "ok",
      version: "1.2.3",
      uptime: 5,
      timestamp: "2026-03-17T00:00:05.000Z",
    });
  });

  it("propagates degraded status when any dependency is degraded", async () => {
    const checkHealth = createHealthCheck({
      version: "1.2.3",
      dependencies: {
        database: async () => ({ status: "ok", latencyMs: 12 }),
        cache: async () => ({ status: "degraded", latencyMs: 250, message: "Slow response" }),
      },
    });

    const result = await checkHealth();

    expect(result.status).toBe("degraded");
    expect(result.dependencies).toEqual({
      database: { status: "ok", latencyMs: 12 },
      cache: { status: "degraded", latencyMs: 250, message: "Slow response" },
    });
  });

  it("propagates down status when any dependency is down", async () => {
    const checkHealth = createHealthCheck({
      version: "1.2.3",
      dependencies: {
        database: async () => ({ status: "ok" }),
        queue: async () => ({ status: "down", message: "Connection refused" }),
      },
    });

    const result = await checkHealth();

    expect(result.status).toBe("down");
    expect(result.dependencies?.queue).toEqual({
      status: "down",
      message: "Connection refused",
    });
  });

  it("treats rejected dependency checks as down", async () => {
    const checkHealth = createHealthCheck({
      version: "1.2.3",
      dependencies: {
        api: async () => {
          throw new Error("Timed out");
        },
      },
    });

    const result = await checkHealth();

    expect(result.status).toBe("down");
    expect(result.dependencies?.api).toEqual({
      status: "down",
      message: "Timed out",
    });
  });

  it("increases uptime between calls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-17T00:00:00.000Z"));

    const checkHealth = createHealthCheck({
      version: "1.2.3",
    });

    const first = await checkHealth();
    vi.advanceTimersByTime(2200);
    const second = await checkHealth();

    expect(first.uptime).toBe(0);
    expect(second.uptime).toBeGreaterThan(first.uptime);
  });
});
