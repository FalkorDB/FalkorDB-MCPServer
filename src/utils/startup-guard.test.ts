// Mock the logger service
jest.mock('../services/logger.service.js', () => ({
  logger: {
    errorSync: jest.fn(),
  }
}));

// Mock config with a mutable object so each test can vary it
let mockConfig = {
  mcp: {
    transport: 'stdio' as 'stdio' | 'http',
    apiKey: '',
    bindAddress: '',
  },
};

jest.mock('../config/index.js', () => ({
  get config() {
    return mockConfig;
  }
}));

// Import after mocks are set up
import { enforceLocalBindWithoutApiKey } from './startup-guard.js';
import { logger } from '../services/logger.service.js';

describe('Startup Guard', () => {
  let processExitSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      mcp: {
        transport: 'stdio',
        apiKey: '',
        bindAddress: '',
      },
    };
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('enforceLocalBindWithoutApiKey', () => {
    it('exits 1 for a non-local HTTP bind with no API key', () => {
      mockConfig.mcp = { transport: 'http', apiKey: '', bindAddress: '0.0.0.0' };

      expect(() => enforceLocalBindWithoutApiKey()).toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('MCP_BIND_ADDRESS=0.0.0.0'));
      expect(logger.errorSync).toHaveBeenCalledWith(expect.stringContaining('MCP_API_KEY'));
    });

    it('does not exit for a non-local HTTP bind with an API key set', () => {
      mockConfig.mcp = { transport: 'http', apiKey: 'secret', bindAddress: '0.0.0.0' };

      expect(() => enforceLocalBindWithoutApiKey()).not.toThrow();

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('does not exit for a local HTTP bind with no API key', () => {
      mockConfig.mcp = { transport: 'http', apiKey: '', bindAddress: '127.0.0.1' };

      expect(() => enforceLocalBindWithoutApiKey()).not.toThrow();

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('does not exit for stdio transport regardless of bind address or API key', () => {
      mockConfig.mcp = { transport: 'stdio', apiKey: '', bindAddress: '0.0.0.0' };

      expect(() => enforceLocalBindWithoutApiKey()).not.toThrow();

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
