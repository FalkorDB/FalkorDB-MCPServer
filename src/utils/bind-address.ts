/**
 * Utility to classify a Docker bind-address value as local (loopback) or not.
 */

import { BlockList, isIP } from 'net';

// Every loopback address: 127.0.0.0/8 and ::1. BlockList also matches the
// IPv4-mapped forms of 127.0.0.0/8 (`::ffff:127.0.0.1`, `::ffff:7f00:1`) and
// any spelling of ::1 (`0:0:0:0:0:0:0:1`), so no string matching is needed.
const LOOPBACK = new BlockList();
LOOPBACK.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK.addAddress('::1', 'ipv6');

/**
 * Determine whether a bind-address value (as set via MCP_BIND_ADDRESS) refers
 * to a loopback interface — i.e. one that is not reachable from outside the
 * host it's running on.
 *
 * Accepts:
 *  - unset/empty (treated as "not opted in", so it's safe)
 *  - `127.0.0.0/8`
 *  - `::1` in any spelling, bracketed as `[::1]` or not (Docker Compose's
 *    `host_ip` accepts both)
 *  - IPv4-mapped loopback, e.g. `::ffff:127.0.0.1` or `::ffff:7f00:1`
 *
 * Deliberately does NOT special-case `localhost`: Docker Compose rejects it
 * outright as an invalid `host_ip` before the container ever starts, so
 * accepting it here would just invite unverifiable hostname assumptions.
 *
 * Everything else — including `0.0.0.0`, `::`, any LAN/public address, a
 * whitespace-only value and anything that isn't a valid IP literal — is
 * treated as non-local (fails closed).
 *
 * @param value The raw MCP_BIND_ADDRESS value.
 * @returns true if the value is a loopback address (or unset).
 */
export function isLocalBindAddress(value: string | undefined): boolean {
  if (value === undefined || value === '') {
    return true;
  }

  const normalized = value.trim();

  // Compose's host_ip accepts IPv6 literals bracketed (e.g. "[::1]") or bare.
  const candidate = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;

  // isIP() validates every octet (0-255, no leading zeros), so garbage like
  // `127.999.999.999` or octal-looking `127.00.0.1` is rejected rather than
  // classified as loopback.
  const family = isIP(candidate);
  if (family === 0) {
    return false;
  }

  return LOOPBACK.check(candidate, family === 4 ? 'ipv4' : 'ipv6');
}

interface McpHttpAuthConfig {
  transport: string;
  bindAddress: string | undefined;
  apiKey: string | undefined;
}

/**
 * Determine whether MCP's HTTP transport would be published on a non-local
 * address with no API key protecting it — an unauthenticated endpoint
 * exposed to the network. Used to decide whether server startup should be
 * refused; kept separate from that side effect so the decision itself is
 * unit-testable.
 *
 * @param mcpConfig The relevant slice of `config.mcp`.
 * @returns true if the server would be exposed with no auth.
 */
export function isUnauthenticatedNetworkExposure(mcpConfig: McpHttpAuthConfig): boolean {
  return (
    mcpConfig.transport === 'http' &&
    !isLocalBindAddress(mcpConfig.bindAddress) &&
    !(mcpConfig.apiKey ?? '').trim()
  );
}
