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
});
