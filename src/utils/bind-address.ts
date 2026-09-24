/**
 * Utility to classify a Docker bind-address value as local (loopback) or not.
 */

import { isIPv4 } from 'net';

/**
 * Determine whether a bind-address value (as set via MCP_BIND_ADDRESS) refers
 * to a loopback interface — i.e. one that is not reachable from outside the
 * host it's running on.
 *
 * Accepts:
 *  - unset/empty (treated as "not opted in", so it's safe)
 *  - `127.0.0.0/8` in either bracketed or unbracketed form
 *  - `::1`, bracketed as `[::1]` or not (Docker Compose's `host_ip` accepts both)
 *  - IPv4-mapped loopback, e.g. `::ffff:127.0.0.1`
 *
 * Deliberately does NOT special-case `localhost`: Docker Compose rejects it
 * outright as an invalid `host_ip` before the container ever starts, so
 * accepting it here would just invite unverifiable hostname assumptions.
 *
 * Everything else — including `0.0.0.0`, `::`, and any LAN/public address —
 * is treated as non-local (fails closed).
 *
 * @param value The raw MCP_BIND_ADDRESS value.
 * @returns true if the value is a loopback address (or unset).
 */
export function isLocalBindAddress(value: string | undefined): boolean {
  const normalized = (value ?? '').trim();

  if (normalized === '') {
    return true;
  }

  // Compose's host_ip accepts IPv6 literals bracketed (e.g. "[::1]") or bare.
  const unbracketed = normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;

  if (unbracketed === '::1') {
    return true;
  }

  const ipv4MappedMatch = unbracketed.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const ipv4Candidate = ipv4MappedMatch ? ipv4MappedMatch[1] : unbracketed;

  // isIPv4() validates every octet (0-255, no leading zeros), unlike a shape-only
  // regex — so garbage like `127.999.999.999` or octal-looking `127.00.0.1` is
  // correctly rejected rather than classified as loopback.
  if (isIPv4(ipv4Candidate)) {
    return ipv4Candidate.startsWith('127.');
  }

  return false;
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
