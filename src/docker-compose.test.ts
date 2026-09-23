import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

/**
 * Guards the `falkordb` service's inline entrypoint script in `docker-compose.yml`.
 *
 * Two things there are easy to get wrong and invisible on review:
 *
 * - **Compose's `$$` escaping.** A single `$` is consumed by `docker compose`'s own
 *   interpolation, so it expands to the *host's* value (usually empty) instead of
 *   reaching the container's shell. The failure is silent: auth simply stops being
 *   applied.
 * - **The `REDIS_ARGS` passthrough.** Whatever the user set must survive, and the auth
 *   flags derived from `FALKORDB_USERNAME`/`FALKORDB_PASSWORD` must be appended *after*
 *   it so they win on conflict.
 *
 * Rather than restate the logic in a mock, these tests read the real script out of
 * `docker-compose.yml`, undo Compose's escaping exactly as Compose does, and run it
 * under `/bin/sh`.
 */

/** Compose's escape for a literal `$`. */
const COMPOSE_ESCAPED_DOLLAR = /\$\$/g;

/** The hand-off the script must end with; the probe below replaces it. */
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

/**
 * The body of the single `command:` literal block, still Compose-escaped.
 *
 * Parsed by hand rather than with a YAML library so the test adds no dependency; it
 * throws loudly if the file's shape changes, instead of silently matching nothing.
 */
function rawEntrypointScript(): string {
  const lines = compose.split('\n');
  const keyIndex = lines.findIndex((line) => /^\s*command:\s*$/.test(line));
  if (keyIndex === -1) {
    throw new Error('docker-compose.yml has no `command:` key; has the file been restructured?');
  }

  const marker = lines[keyIndex + 1] ?? '';
  const markerIndent = /^(\s*)-\s*\|\s*$/.exec(marker)?.[1];
  if (markerIndent === undefined) {
    throw new Error(
      `expected a literal block (\`- |\`) under \`command:\`, found: ${JSON.stringify(marker)}`,
    );
  }

  const body: string[] = [];
  for (const line of lines.slice(keyIndex + 2)) {
    const indent = /^\s*/.exec(line)?.[0] ?? '';
    if (line.trim() !== '' && indent.length <= markerIndent.length) break;
    body.push(line);
  }

  const bodyIndent = /^\s*/.exec(body[0] ?? '')?.[0] ?? '';
  if (bodyIndent === '') {
    throw new Error('the `command:` literal block is empty');
  }
  return body.map((line) => line.slice(bodyIndent.length)).join('\n').trimEnd();
}

/** What Docker actually execs: Compose collapses each `$$` to a single `$`. */
function entrypointScript(): string {
  return rawEntrypointScript().replace(COMPOSE_ESCAPED_DOLLAR, '$');
}

/**
 * The script with its final `exec` swapped for a probe that prints the value handed to
 * the image's `run.sh`. The swap is asserted, so a changed hand-off fails here rather
 * than being quietly skipped.
 */
function probeScript(): string {
  const lines = entrypointScript().split('\n');
  const last = lines.pop()?.trim() ?? '';
  if (!EXEC_ENTRYPOINT.test(last)) {
    throw new Error(
      `expected the script to end by exec'ing the image entrypoint, found: ${JSON.stringify(last)}`,
    );
  }
  return [...lines, 'printf %s "$REDIS_ARGS"'].join('\n');
}

/** Runs the entrypoint with a clean environment and returns the resulting REDIS_ARGS. */
function redisArgsFor(env: Record<string, string>): string {
  return execFileSync('/bin/sh', ['-c', probeScript()], {
    encoding: 'utf8',
    // No `...process.env`: a REDIS_ARGS exported by the developer's shell would
    // otherwise leak in and make the "unset" cases pass for the wrong reason.
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
  });
}

const PASSWORD = 's3cr3t';

// The script is POSIX sh; there is no /bin/sh to run it with on Windows.
const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('docker-compose.yml falkordb entrypoint', () => {
  test('escapes every `$` so the container shell, not Compose, expands it', () => {
    // Compose interpolates any `$` it is left with. Removing the `$$` pairs must
    // therefore leave none behind.
    const unescaped = rawEntrypointScript().replace(COMPOSE_ESCAPED_DOLLAR, '');
    expect(unescaped).not.toContain('$');
  });

  test('passes REDIS_ARGS into the container', () => {
    // Without this the script would always build on an empty value, and every
    // passthrough assertion below would pass for the wrong reason.
    expect(compose).toContain('REDIS_ARGS=${REDIS_ARGS:-}');
  });

  test('hands off to the image entrypoint with REDIS_ARGS exported', () => {
    const lines = entrypointScript().split('\n').map((line) => line.trim());
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
