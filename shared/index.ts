export { SHIELD_PATTERNS, triageInput } from './shield.js';
export {
  analyzeDiff,
  classifyDiff,
  riskScore,
} from './spine.js';
export type { DiffInfo, DiffParseStatus } from './spine.js';
export { createHealthCheck } from './healthz.js';
export type { DependencyStatus, HealthStatus } from './healthz.js';

