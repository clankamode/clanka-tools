export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  timestamp: string;
  dependencies?: Record<string, DependencyStatus>;
}

export interface DependencyStatus {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  message?: string;
}

type DependencyChecks = Record<string, () => Promise<DependencyStatus>>;

export function createHealthCheck(opts: {
  version: string;
  startTime?: Date;
  dependencies?: DependencyChecks;
}): () => Promise<HealthStatus> {
  const startTime = opts.startTime ?? new Date();
  const dependencyChecks = opts.dependencies ?? {};

  return async () => {
    const entries = Object.entries(dependencyChecks);
    const dependencies =
      entries.length === 0 ? undefined : await collectDependencyStatuses(entries);

    return {
      status: getOverallStatus(dependencies),
      version: opts.version,
      uptime: Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000)),
      timestamp: new Date().toISOString(),
      dependencies,
    };
  };
}

async function collectDependencyStatuses(
  entries: [string, () => Promise<DependencyStatus>][]
): Promise<Record<string, DependencyStatus>> {
  const settled = await Promise.allSettled(entries.map(([, check]) => check()));

  return settled.reduce<Record<string, DependencyStatus>>((dependencies, result, index) => {
    const [name] = entries[index];
    dependencies[name] =
      result.status === "fulfilled" ? result.value : dependencyFailureStatus(result.reason);
    return dependencies;
  }, {});
}

function dependencyFailureStatus(reason: unknown): DependencyStatus {
  return {
    status: "down",
    message: reason instanceof Error ? reason.message : "Dependency check failed.",
  };
}

function getOverallStatus(
  dependencies?: Record<string, DependencyStatus>
): HealthStatus["status"] {
  if (!dependencies) {
    return "ok";
  }

  const statuses = Object.values(dependencies).map((dependency) => dependency.status);

  if (statuses.includes("down")) {
    return "down";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  return "ok";
}
