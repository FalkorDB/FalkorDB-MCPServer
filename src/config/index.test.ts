// config/index.ts loads a local .env at import time; stub it out so the tests
// below see only process.env, not whatever a developer has configured.
jest.mock('dotenv', () => ({ __esModule: true, default: { config: jest.fn() } }));

import { config } from '../config';

describe('Config', () => {
  test('should have server configuration', () => {
    expect(config).toHaveProperty('server');
    expect(config.server).toHaveProperty('port');
    expect(config.server).toHaveProperty('nodeEnv');
  });

  test('should have FalkorDB configuration', () => {
    expect(config).toHaveProperty('falkorDB');
    expect(config.falkorDB).toHaveProperty('host');
    expect(config.falkorDB).toHaveProperty('port');
    expect(config.falkorDB).toHaveProperty('username');
    expect(config.falkorDB).toHaveProperty('password');
    expect(config.falkorDB).toHaveProperty('defaultReadOnly');
    expect(typeof config.falkorDB.defaultReadOnly).toBe('boolean');
    expect(config.falkorDB).toHaveProperty('strictReadOnly');
    expect(typeof config.falkorDB.strictReadOnly).toBe('boolean');
    expect(config.falkorDB).toHaveProperty('tls');
    expect(typeof config.falkorDB.tls).toBe('boolean');
  });

  test('should have MCP configuration', () => {
    expect(config).toHaveProperty('mcp');
    expect(config.mcp).toHaveProperty('transport');
    expect(config.mcp).toHaveProperty('apiKey');
    expect(['stdio', 'http']).toContain(config.mcp.transport);
  });

  describe('falkorDB.tls', () => {
    const originalTls = process.env.FALKORDB_TLS;

    afterEach(() => {
      if (originalTls === undefined) {
        delete process.env.FALKORDB_TLS;
      } else {
        process.env.FALKORDB_TLS = originalTls;
      }
      jest.resetModules();
    });

    async function loadConfig() {
      jest.resetModules();
      return (await import('./index.js')).config;
    }

    test('is false when FALKORDB_TLS is unset', async () => {
      delete process.env.FALKORDB_TLS;
      expect((await loadConfig()).falkorDB.tls).toBe(false);
    });

    test("is true only for the exact string 'true'", async () => {
      process.env.FALKORDB_TLS = 'true';
      expect((await loadConfig()).falkorDB.tls).toBe(true);
    });

    // Strict parsing, like FALKORDB_DEFAULT_READONLY: anything else keeps plaintext.
    test.each(['false', 'TRUE', 'True', '1', 'yes', ' true', ''])(
      'is false for FALKORDB_TLS=%p',
      async (value) => {
        process.env.FALKORDB_TLS = value;
        expect((await loadConfig()).falkorDB.tls).toBe(false);
      }
    );
  });
});
