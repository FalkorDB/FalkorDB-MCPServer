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
  });

  test('should have MCP configuration', () => {
    expect(config).toHaveProperty('mcp');
    expect(config.mcp).toHaveProperty('transport');
    expect(config.mcp).toHaveProperty('apiKey');
    expect(config.mcp).toHaveProperty('bindAddress');
    expect(['stdio', 'http']).toContain(config.mcp.transport);
  });

  describe('mcp.bindAddress', () => {
    const originalBindAddress = process.env.MCP_BIND_ADDRESS;

    afterEach(() => {
      if (originalBindAddress === undefined) {
        delete process.env.MCP_BIND_ADDRESS;
      } else {
        process.env.MCP_BIND_ADDRESS = originalBindAddress;
      }
      jest.resetModules();
    });

    async function loadConfig() {
      jest.resetModules();
      return (await import('./index.js')).config;
    }

    test('defaults to 127.0.0.1 when MCP_BIND_ADDRESS is unset', async () => {
      delete process.env.MCP_BIND_ADDRESS;
      expect((await loadConfig()).mcp.bindAddress).toBe('127.0.0.1');
    });

    test('defaults to 127.0.0.1 when MCP_BIND_ADDRESS is empty', async () => {
      process.env.MCP_BIND_ADDRESS = '';
      expect((await loadConfig()).mcp.bindAddress).toBe('127.0.0.1');
    });

    test('reads MCP_BIND_ADDRESS when set', async () => {
      process.env.MCP_BIND_ADDRESS = '0.0.0.0';
      expect((await loadConfig()).mcp.bindAddress).toBe('0.0.0.0');
    });
  });

  describe('mcp.apiKey', () => {
    const originalApiKey = process.env.MCP_API_KEY;

    afterEach(() => {
      if (originalApiKey === undefined) {
        delete process.env.MCP_API_KEY;
      } else {
        process.env.MCP_API_KEY = originalApiKey;
      }
      jest.resetModules();
    });

    async function loadConfig() {
      jest.resetModules();
      return (await import('./index.js')).config;
    }

    test('is empty when MCP_API_KEY is unset', async () => {
      delete process.env.MCP_API_KEY;
      expect((await loadConfig()).mcp.apiKey).toBe('');
    });

    test('trims surrounding whitespace so the Bearer check matches the bare key', async () => {
      process.env.MCP_API_KEY = '  secret \t';
      expect((await loadConfig()).mcp.apiKey).toBe('secret');
    });

    test('treats a whitespace-only MCP_API_KEY as unset', async () => {
      process.env.MCP_API_KEY = '   ';
      expect((await loadConfig()).mcp.apiKey).toBe('');
    });
  });
});
