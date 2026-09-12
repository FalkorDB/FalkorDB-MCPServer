import { config } from '../config/index.js';
import { logger } from '../services/logger.service.js';
import { isUnauthenticatedNetworkExposure } from './bind-address.js';

/**
 * Refuse to start an HTTP transport that's published beyond localhost with no
 * API key set — that combination is an unauthenticated endpoint exposed to
 * the network. Local-only binding (the default) is unaffected. Call before
 * initializing any other services, so a refusal doesn't first open a
 * FalkorDB connection it's about to abandon.
 *
 * Exits directly rather than throwing: a throw from inside startServer()'s
 * try/catch would be routed through gracefulShutdown(), which exits 0 on its
 * success path — turning a startup refusal into a reported success.
 */
export function enforceLocalBindWithoutApiKey(): void {
  if (!isUnauthenticatedNetworkExposure(config.mcp)) {
    return;
  }

  const message = `MCP_BIND_ADDRESS=${config.mcp.bindAddress} exposes the MCP server beyond localhost, but MCP_API_KEY is unset. Refusing to start an unauthenticated HTTP endpoint on the network. Set MCP_API_KEY in .env, or leave MCP_BIND_ADDRESS at 127.0.0.1.`;

  // logger.errorSync() alone isn't enough here: by default (production,
  // ENABLE_FILE_LOGGING unset) it neither writes to a log file nor has an
  // MCP client connected yet to notify, so the message would go nowhere —
  // silently, worse than the shell guard this replaces, whose `echo >&2`
  // was always visible in `docker compose logs`. console.error() writes to
  // stderr directly, which is safe here regardless of transport: the stdio
  // protocol only uses stdout, and startup hasn't reached HTTP yet either.
  console.error(message);
  logger.errorSync(message);
  process.exit(1);
}
