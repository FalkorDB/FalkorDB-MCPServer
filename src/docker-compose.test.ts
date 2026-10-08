import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';

/**
 * Guards the two inline shell scripts the `falkordb` service carries in
 * `docker-compose.yml`: the entrypoint that assembles `REDIS_ARGS`, and the healthcheck
 * that probes the server.
 *
 * Three things there are easy to get wrong and invisible on review:
 *
 * - **Compose's `$$` escaping.** A single `$` is consumed by `docker compose`'s own
 *   interpolation, so it expands to the *host's* value (usually empty) instead of
 *   reaching the container's shell. The failure is silent: auth simply stops being
 *   applied.
 * - **The `REDIS_ARGS` passthrough.** Whatever the user set must survive, and the auth
 *   flags derived from `FALKORDB_USERNAME`/`FALKORDB_PASSWORD` must be appended *after*
 *   it so they win on conflict.
 * - **Who the healthcheck authenticates as.** `REDIS_ARGS` can disable the `default`
 *   user, so a probe hard-wired to `default` reports a healthy server as unhealthy and
 *   strands the MCP server behind `depends_on: service_healthy`.
 *
 * Rather than restate that logic in a mock, these tests read the real scripts out of
 * `docker-compose.yml`, undo Compose's escaping exactly as Compose does, and run them
 * under `/bin/sh`.
 */

/** Compose's escape for a literal `$`. */
const COMPOSE_ESCAPED_DOLLAR = /\$\$/g;

/** The hand-off the entrypoint must end with; the probe below replaces it. */
const EXEC_ENTRYPOINT = /^exec \/var\/lib\/falkordb\/bin\/run\.sh$/;

/** Walk up from the working directory so the test works from any Jest `rootDir`. */
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'docker-compose.yml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) {
      throw new Error(`could not find docker-compose.yml above ${process.cwd()}`);
    }
    dir = parent;
  }
}

const compose = readFileSync(join(repoRoot(), 'docker-compose.yml'), 'utf8');

function indentOf(line: string): number {
  return (/^\s*/.exec(line)?.[0] ?? '').length;
}

/**
 * The literal block (`|`) introduced under `key:`, still Compose-escaped.
 *
 * Parsed by hand rather than with a YAML library so the test adds no dependency; it
 * throws loudly if the file's shape changes, instead of silently matching nothing.
 */
function rawScriptUnder(key: string): string {
  const lines = compose.split('\n');
  const keyIndex = lines.findIndex((line) => new RegExp(`^\\s*${key}:\\s*$`).test(line));
  if (keyIndex === -1) {
    throw new Error(`docker-compose.yml has no \`${key}:\` key; has the file been restructured?`);
  }
  const keyIndent = indentOf(lines[keyIndex] ?? '');

  // Skip any plain sequence entries (the healthcheck's `- CMD-SHELL`) before the block.
  let markerIndex = -1;
  for (let i = keyIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() !== '' && indentOf(line) <= keyIndent) break;
    if (/^\s*-\s*\|\s*$/.test(line)) {
      markerIndex = i;
      break;
    }
  }
  if (markerIndex === -1) {
    throw new Error(`expected a literal block (\`- |\`) under \`${key}:\``);
  }
  const markerIndent = indentOf(lines[markerIndex] ?? '');

  const body: string[] = [];
  for (const line of lines.slice(markerIndex + 1)) {
    if (line.trim() !== '' && indentOf(line) <= markerIndent) break;
    body.push(line);
  }

  const bodyIndent = /^\s*/.exec(body[0] ?? '')?.[0] ?? '';
  if (bodyIndent === '') {
    throw new Error(`the \`${key}:\` literal block is empty`);
  }
  return body
    .map((line) => line.slice(bodyIndent.length))
    .join('\n')
    .trimEnd();
}

/** What Docker actually execs: Compose collapses each `$$` to a single `$`. */
function unescaped(key: string): string {
  return rawScriptUnder(key).replace(COMPOSE_ESCAPED_DOLLAR, '$');
}

/**
 * The entrypoint with its final `exec` swapped for a probe that prints the value handed
 * to the image's `run.sh`. The swap is asserted, so a changed hand-off fails here rather
 * than being quietly skipped.
 */
function entrypointProbe(): string {
  const lines = unescaped('command').split('\n');
  const last = lines.pop()?.trim() ?? '';
  if (!EXEC_ENTRYPOINT.test(last)) {
    throw new Error(
      `expected the script to end by exec'ing the image entrypoint, found: ${JSON.stringify(last)}`,
    );
  }
  return [...lines, 'printf %s "$REDIS_ARGS"'].join('\n');
}

// No `...process.env`: a REDIS_ARGS exported by the developer's shell would otherwise
// leak in and make the "unset" cases pass for the wrong reason.
function shell(script: string, env: Record<string, string>, path?: string) {
  return spawnSync('/bin/sh', ['-c', script], {
    encoding: 'utf8',
    env: { PATH: path ?? process.env.PATH ?? '/usr/bin:/bin', ...env },
  });
}

/** Runs the entrypoint and returns the resulting REDIS_ARGS. */
function redisArgsFor(env: Record<string, string>): string {
  return shell(entrypointProbe(), env).stdout;
}

const PASSWORD = 's3cr3t';

// The scripts are POSIX sh; there is no /bin/sh to run them with on Windows.
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('docker-compose.yml falkordb scripts', () => {
  test.each([
    ['entrypoint', 'command'],
    ['healthcheck', 'test'],
  ])('escape every `$` in the %s, leaving none for Compose to interpolate', (_name, key) => {
    expect(rawScriptUnder(key).replace(COMPOSE_ESCAPED_DOLLAR, '')).not.toContain('$');
  });

  test('pass REDIS_ARGS into the container', () => {
    // Without this the entrypoint would always build on an empty value, and every
    // passthrough assertion below would pass for the wrong reason.
    expect(compose).toContain('REDIS_ARGS=${REDIS_ARGS:-}');
  });

  test('hand off to the image entrypoint with REDIS_ARGS exported', () => {
    const lines = unescaped('command')
      .split('\n')
      .map((line) => line.trim());
    expect(lines.at(-1)).toBe('exec /var/lib/falkordb/bin/run.sh');
    // Exported unconditionally: with no password the script never reassigns it, and
    // an export inside the `if` would drop a passthrough-only value.
    expect(lines.at(-2)).toBe('export REDIS_ARGS');
  });
});

describePosix('docker-compose.yml falkordb entrypoint (executed)', () => {
  test('is a no-op when neither REDIS_ARGS nor a password is set', () => {
    expect(redisArgsFor({})).toBe('');
  });

  test('passes REDIS_ARGS through untouched when no password is set', () => {
    expect(redisArgsFor({ REDIS_ARGS: '--appendonly yes' })).toBe('--appendonly yes');
  });

  test('adds the auth flag when only a password is set', () => {
    expect(redisArgsFor({ FALKORDB_PASSWORD: PASSWORD })).toBe(`--requirepass ${PASSWORD}`);
  });

  test('appends the auth flag after REDIS_ARGS, separated by one space', () => {
    expect(redisArgsFor({ REDIS_ARGS: '--appendonly yes', FALKORDB_PASSWORD: PASSWORD })).toBe(
      `--appendonly yes --requirepass ${PASSWORD}`,
    );
  });

  test('appends the auth flags last, so they win over a user-supplied --requirepass', () => {
    // redis-server takes the last occurrence of a repeated flag, so ordering is what
    // makes FALKORDB_PASSWORD authoritative.
    const args = redisArgsFor({ REDIS_ARGS: '--requirepass wrong', FALKORDB_PASSWORD: PASSWORD });
    expect(args).toBe(`--requirepass wrong --requirepass ${PASSWORD}`);
    expect(args.lastIndexOf('--requirepass')).toBe(args.indexOf(`--requirepass ${PASSWORD}`));
  });

  test('creates an ACL user when a username is set', () => {
    expect(
      redisArgsFor({
        REDIS_ARGS: '--appendonly yes',
        FALKORDB_USERNAME: 'alice',
        FALKORDB_PASSWORD: PASSWORD,
      }),
    ).toBe(`--appendonly yes --requirepass ${PASSWORD} --user alice on >${PASSWORD} ~* &* +@all`);
  });

  test('does not create an ACL user for the built-in `default` user', () => {
    // --requirepass already sets the password on `default`; adding an ACL line for it
    // would be redundant at best.
    expect(redisArgsFor({ FALKORDB_USERNAME: 'default', FALKORDB_PASSWORD: PASSWORD })).toBe(
      `--requirepass ${PASSWORD}`,
    );
  });

  test('ignores a username when no password is set', () => {
    // An ACL user with no password would be created with no way to authenticate.
    expect(redisArgsFor({ FALKORDB_USERNAME: 'alice' })).toBe('');
  });
});

describePosix('docker-compose.yml falkordb healthcheck (executed)', () => {
  let stubDir: string;
  let callLog: string;

  /** A `redis-cli` on PATH that records how it was invoked and replies as told. */
  beforeAll(() => {
    stubDir = mkdtempSync(join(tmpdir(), 'redis-cli-stub-'));
    callLog = join(stubDir, 'calls');
    const stub = join(stubDir, 'redis-cli');
    writeFileSync(
      stub,
      [
        '#!/bin/sh',
        'printf \'args=%s auth=%s\\n\' "$*" "${REDISCLI_AUTH-<unset>}" >> "$CALL_LOG"',
        'printf \'%s\\n\' "${STUB_REPLY:-PONG}"',
        '',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);
  });

  afterAll(() => rmSync(stubDir, { recursive: true, force: true }));

  function probe(env: Record<string, string>) {
    writeFileSync(callLog, '');
    const result = shell(
      unescaped('test'),
      { ...env, CALL_LOG: callLog },
      `${stubDir}:${process.env.PATH ?? ''}`,
    );
    return { status: result.status, call: readFileSync(callLog, 'utf8').trim() };
  }

  test('pings without credentials when no password is set', () => {
    expect(probe({})).toEqual({ status: 0, call: 'args=ping auth=<unset>' });
  });

  test('authenticates as `default` when only a password is set', () => {
    // No --user: --requirepass sets the password on the built-in `default` user.
    expect(probe({ FALKORDB_PASSWORD: PASSWORD })).toEqual({
      status: 0,
      call: `args=ping auth=${PASSWORD}`,
    });
  });

  test('authenticates as the configured ACL user', () => {
    // The regression this guards: REDIS_ARGS can carry `--user default off`, and
    // --requirepass sets that user's password without re-enabling it. Probing as
    // `default` would then fail against a server `alice` can use perfectly well,
    // leaving falkordb-mcpserver stuck behind `depends_on: service_healthy`.
    expect(probe({ FALKORDB_PASSWORD: PASSWORD, FALKORDB_USERNAME: 'alice' })).toEqual({
      status: 0,
      call: `args=--user alice ping auth=${PASSWORD}`,
    });
  });

  test('does not pass --user for the built-in `default` user', () => {
    expect(probe({ FALKORDB_PASSWORD: PASSWORD, FALKORDB_USERNAME: 'default' })).toEqual({
      status: 0,
      call: `args=ping auth=${PASSWORD}`,
    });
  });

  test('ignores a username when no password is set', () => {
    // The entrypoint only creates the ACL user when there is a password, so probing
    // as that user would authenticate against a user that does not exist.
    expect(probe({ FALKORDB_USERNAME: 'alice' })).toEqual({
      status: 0,
      call: 'args=ping auth=<unset>',
    });
  });

  test('fails when the server does not reply PONG', () => {
    // The whole point of capturing the reply rather than trusting redis-cli's exit
    // code: a NOAUTH or WRONGPASS error must mark the container unhealthy.
    expect(probe({ STUB_REPLY: 'NOAUTH Authentication required.' }).status).not.toBe(0);
  });
});

/**
 * The MCP server's published port and the `MCP_BIND_ADDRESS` the startup guard reads
 * inside the container come from two separate `${...}` expressions. If their defaults
 * drift apart, the guard judges an address Compose isn't actually publishing on.
 */
describe('docker-compose.yml bind addresses', () => {
  const MCP_BIND = '${MCP_BIND_ADDRESS:-127.0.0.1}';
  const WEB_BIND = '${FALKORDB_WEB_BIND_ADDRESS:-127.0.0.1}';

  test('publishes the MCP port on MCP_BIND_ADDRESS, defaulting to loopback', () => {
    expect(compose).toContain(`- "${MCP_BIND}:\${MCP_PORT:-8080}:8080"`);
  });

  test('hands the same MCP_BIND_ADDRESS expression to the startup guard', () => {
    expect(compose).toContain(`- MCP_BIND_ADDRESS=${MCP_BIND}`);
  });

  test('publishes the web UI port on FALKORDB_WEB_BIND_ADDRESS, defaulting to loopback', () => {
    expect(compose).toContain(`- "${WEB_BIND}:\${FALKORDB_WEB_PORT:-3000}:3000"`);
  });
});

const composeAvailable =
  spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;

// `docker compose config` only parses and interpolates the file; it needs the CLI
// plugin but no running daemon.
(composeAvailable ? describe : describe.skip)('docker-compose.yml bind addresses (docker compose config)', () => {
  interface PortMapping { host_ip?: string; published?: string; target?: number }
  interface ComposeConfig {
    services: Record<string, { ports?: PortMapping[]; environment?: Record<string, string> }>;
  }

  function resolved(env: Record<string, string>): ComposeConfig {
    const result = spawnSync(
      'docker',
      ['compose', '-f', join(repoRoot(), 'docker-compose.yml'), '--env-file', '/dev/null', 'config', '--format', 'json'],
      // Only PATH and HOME from the developer's shell, so their own bind settings can't leak in.
      { encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env } },
    );
    if (result.status !== 0) {
      throw new Error(`docker compose config failed: ${result.stderr}`);
    }
    return JSON.parse(result.stdout) as ComposeConfig;
  }

  function hostIp(config: ComposeConfig, service: string, target: number): string | undefined {
    return config.services[service]?.ports?.find((port) => port.target === target)?.host_ip;
  }

  test('binds both published ports to 127.0.0.1 by default', () => {
    const config = resolved({});
    expect(hostIp(config, 'falkordb-mcpserver', 8080)).toBe('127.0.0.1');
    expect(hostIp(config, 'falkordb', 3000)).toBe('127.0.0.1');
    expect(config.services['falkordb-mcpserver']?.environment?.MCP_BIND_ADDRESS).toBe('127.0.0.1');
  });

  // The short `ports:` syntax splits on `:`, so this guards against an unbracketed
  // IPv6 host IP being mis-parsed as part of the port mapping.
  test.each(['::1', '[::1]'])('parses IPv6 loopback %s as the host IP of both ports', (address) => {
    const config = resolved({ MCP_BIND_ADDRESS: address, FALKORDB_WEB_BIND_ADDRESS: address });
    expect(hostIp(config, 'falkordb-mcpserver', 8080)).toBe('::1');
    expect(hostIp(config, 'falkordb', 3000)).toBe('::1');
  });

  test('passes MCP_BIND_ADDRESS through to the container unchanged', () => {
    const config = resolved({ MCP_BIND_ADDRESS: '0.0.0.0' });
    expect(hostIp(config, 'falkordb-mcpserver', 8080)).toBe('0.0.0.0');
    expect(config.services['falkordb-mcpserver']?.environment?.MCP_BIND_ADDRESS).toBe('0.0.0.0');
  });
});
