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
  });

  test('should have MCP configuration', () => {
    expect(config).toHaveProperty('mcp');
    expect(config.mcp).toHaveProperty('transport');
    expect(config.mcp).toHaveProperty('apiKey');
    expect(['stdio', 'http']).toContain(config.mcp.transport);
  });
});