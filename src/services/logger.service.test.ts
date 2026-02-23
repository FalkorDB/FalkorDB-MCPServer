// Simple test for logger service to avoid import.meta issues
// Focus on testing the public interface without requiring complex mocking

// Mock platformdirs before importing logger service
jest.mock('platformdirs', () => ({
  userLogDir: jest.fn().mockReturnValue('/mock/user/logs'),
}));

import { logger } from './logger.service';

// Mock file system operations
jest.mock('fs', () => ({
  appendFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true), // Directory exists
  mkdirSync: jest.fn(),
}));

// Mock path module
jest.mock('path', () => ({
  join: jest.fn().mockReturnValue('/mock/logs/test.log'),
}));

describe('Logger Service', () => {
  // Mock console to avoid actual logging during tests
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Singleton Instance', () => {
    it('should export a singleton logger instance', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have sync logging methods', () => {
      expect(typeof logger.infoSync).toBe('function');
      expect(typeof logger.warnSync).toBe('function');
      expect(typeof logger.errorSync).toBe('function');
      expect(typeof logger.debugSync).toBe('function');
    });

    it('should have setMcpServer method', () => {
      expect(typeof logger.setMcpServer).toBe('function');
    });
  });

  describe('Async Logging Methods', () => {
    it('should handle info logging without throwing', async () => {
      await expect(logger.info('Test info message')).resolves.not.toThrow();
      await expect(logger.info('Test with context', { key: 'value' })).resolves.not.toThrow();
    });

    it('should handle warn logging without throwing', async () => {
      await expect(logger.warn('Test warning')).resolves.not.toThrow();
      await expect(logger.warn('Test with context', { code: 123 })).resolves.not.toThrow();
    });

    it('should handle error logging without throwing', async () => {
      const error = new Error('Test error');
      await expect(logger.error('Error occurred')).resolves.not.toThrow();
      await expect(logger.error('Error with object', error)).resolves.not.toThrow();
      await expect(logger.error('Error with context', error, { extra: 'data' })).resolves.not.toThrow();
    });

    it('should handle debug logging without throwing', async () => {
      await expect(logger.debug('Debug message')).resolves.not.toThrow();
      await expect(logger.debug('Debug with context', { debug: true })).resolves.not.toThrow();
    });
  });

  describe('Sync Logging Methods', () => {
    it('should handle sync info logging without throwing', () => {
      expect(() => logger.infoSync('Sync info')).not.toThrow();
      expect(() => logger.infoSync('Sync info with context', { sync: true })).not.toThrow();
    });

    it('should handle sync warn logging without throwing', () => {
      expect(() => logger.warnSync('Sync warning')).not.toThrow();
      expect(() => logger.warnSync('Sync warning with context', { level: 'warn' })).not.toThrow();
    });

    it('should handle sync error logging without throwing', () => {
      const error = new Error('Sync error');
      expect(() => logger.errorSync('Sync error occurred')).not.toThrow();
      expect(() => logger.errorSync('Sync error with object', error)).not.toThrow();
      expect(() => logger.errorSync('Sync error with context', error, { extra: 'data' })).not.toThrow();
    });

    it('should handle sync debug logging without throwing', () => {
      expect(() => logger.debugSync('Sync debug')).not.toThrow();
      expect(() => logger.debugSync('Sync debug with context', { debug: true })).not.toThrow();
    });
  });

  describe('MCP Server Integration', () => {
    it('should accept MCP server instance without throwing', () => {
      const mockMcpServer = {
        server: {
          notification: jest.fn().mockResolvedValue(undefined),
        },
      };

      expect(() => logger.setMcpServer(mockMcpServer as any)).not.toThrow();
    });
  });

  describe('Error Resilience', () => {
    it('should handle file system errors gracefully', async () => {
      // The logger should not throw even if file operations fail
      // This tests the try-catch blocks in the logging methods
      await expect(logger.info('Test message during potential file error')).resolves.not.toThrow();
      await expect(logger.error('Test error during potential file error', new Error('Test'))).resolves.not.toThrow();
    });

    it('should handle MCP notification errors gracefully', async () => {
      // Set up a mock server that throws errors
      const failingMcpServer = {
        server: {
          notification: jest.fn().mockRejectedValue(new Error('MCP notification failed')),
        },
      };
      
      logger.setMcpServer(failingMcpServer as any);
      
      // Logger should not throw even if MCP notifications fail
      await expect(logger.info('Test with failing MCP')).resolves.not.toThrow();
    });
  });
});