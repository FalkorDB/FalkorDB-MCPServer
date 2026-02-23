import { ErrorHandler, errorHandler } from './ErrorHandler';
import { AppError, CommonErrors } from './AppError';

// Mock the logger service
jest.mock('../services/logger.service.js', () => ({
  logger: {
    error: jest.fn().mockResolvedValue(undefined),
    info: jest.fn().mockResolvedValue(undefined),
    errorSync: jest.fn(),
  }
}));

// Get mock logger from the mocked module
let mockLogger: any;

describe('ErrorHandler', () => {
  let handler: ErrorHandler;

  beforeEach(async () => {
    handler = new ErrorHandler();
    jest.clearAllMocks();
    // Import the mock logger
    const loggerModule = await import('../services/logger.service.js');
    mockLogger = loggerModule.logger;
  });

  describe('handleError', () => {
    it('should handle operational errors gracefully', async () => {
      // Arrange
      const operationalError = new AppError(
        CommonErrors.OPERATION_FAILED,
        'Test operational error',
        true
      );

      // Act
      await handler.handleError(operationalError);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled error occurred',
        operationalError,
        expect.objectContaining({
          timestamp: expect.any(String),
          errorType: 'AppError'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Operational error handled gracefully',
        {
          errorName: operationalError.name,
          errorMessage: operationalError.message
        }
      );
    });

    it('should handle programmer errors with critical logging', async () => {
      // Arrange
      const programmerError = new AppError(
        CommonErrors.INVALID_INPUT,
        'Test programmer error',
        false // not operational
      );

      // Act
      await handler.handleError(programmerError);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled error occurred',
        programmerError,
        expect.objectContaining({
          timestamp: expect.any(String),
          errorType: 'AppError'
        })
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Programmer error detected - may require process restart',
        programmerError,
        {
          recommendation: 'Review code for bugs',
          severity: 'critical'
        }
      );
    });

    it('should handle generic errors as programmer errors', async () => {
      // Arrange
      const genericError = new Error('Generic error message');

      // Act
      await handler.handleError(genericError);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled error occurred',
        genericError,
        expect.objectContaining({
          timestamp: expect.any(String),
          errorType: 'Error'
        })
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Programmer error detected - may require process restart',
        genericError,
        {
          recommendation: 'Review code for bugs',
          severity: 'critical'
        }
      );
    });
  });

  describe('isTrustedError', () => {
    it('should return true for operational AppError', () => {
      // Arrange
      const operationalError = new AppError(
        CommonErrors.OPERATION_FAILED,
        'Test operational error',
        true
      );

      // Act
      const result = handler.isTrustedError(operationalError);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-operational AppError', () => {
      // Arrange
      const nonOperationalError = new AppError(
        CommonErrors.INVALID_INPUT,
        'Test programmer error',
        false
      );

      // Act
      const result = handler.isTrustedError(nonOperationalError);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for generic Error', () => {
      // Arrange
      const genericError = new Error('Generic error');

      // Act
      const result = handler.isTrustedError(genericError);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      // Arrange
      const nonError = { message: 'Not an error' } as Error;

      // Act
      const result = handler.isTrustedError(nonError);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('crashIfUntrustedError', () => {
    let processExitSpy: jest.SpyInstance;

    beforeEach(() => {
      processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      processExitSpy.mockRestore();
    });

    it('should not crash for trusted operational errors', () => {
      // Arrange
      const operationalError = new AppError(
        CommonErrors.OPERATION_FAILED,
        'Test operational error',
        true
      );

      // Act & Assert
      expect(() => handler.crashIfUntrustedError(operationalError)).not.toThrow();
      expect(processExitSpy).not.toHaveBeenCalled();
      expect(mockLogger.errorSync).not.toHaveBeenCalled();
    });

    it('should crash for untrusted programmer errors', () => {
      // Arrange
      const programmerError = new AppError(
        CommonErrors.INVALID_INPUT,
        'Test programmer error',
        false
      );

      // Act & Assert
      expect(() => handler.crashIfUntrustedError(programmerError)).toThrow('process.exit called');
      expect(mockLogger.errorSync).toHaveBeenCalledWith(
        'Crashing process due to untrusted error',
        programmerError
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should crash for generic errors', () => {
      // Arrange
      const genericError = new Error('Generic error');

      // Act & Assert
      expect(() => handler.crashIfUntrustedError(genericError)).toThrow('process.exit called');
      expect(mockLogger.errorSync).toHaveBeenCalledWith(
        'Crashing process due to untrusted error',
        genericError
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      // Assert
      expect(errorHandler).toBeInstanceOf(ErrorHandler);
      expect(errorHandler).toBe(errorHandler); // Same instance
    });
  });

  describe('toMcpErrorResult', () => {
    it('should return sanitized error result for AppError', () => {
      // Arrange
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        'Query failed on graph test',
        true
      );

      // Act
      const result = handler.toMcpErrorResult(appError);

      // Assert
      expect(result).toEqual({
        content: [{
          type: "text",
          text: "Error: Query failed on graph test"
        }],
        isError: true
      });
    });

    it('should sanitize stack traces from generic errors', () => {
      // Arrange
      const error = new Error('Database error\n    at Connection.query (/app/src/db.js:123:45)\n    at async Handler.execute (/app/src/handler.js:67:89)');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toBe('Error: Database error');
      expect(result.content[0].text).not.toContain('at Connection.query');
      expect(result.content[0].text).not.toContain('/app/src/db.js');
    });

    it('should sanitize file paths from error messages', () => {
      // Arrange
      const error = new Error('Failed to read /home/user/config/database.yml');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('<path>');
      expect(result.content[0].text).not.toContain('/home/user/config/database.yml');
    });

    it('should sanitize Redis connection strings with credentials', () => {
      // Arrange
      const error = new Error('Connection failed to redis://admin:secret123@localhost:6379');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('redis://<credentials>@<host>');
      expect(result.content[0].text).not.toContain('admin');
      expect(result.content[0].text).not.toContain('secret123');
    });

    it('should sanitize MongoDB connection strings with credentials', () => {
      // Arrange
      const error = new Error('Connection failed to mongodb://user:pass@example.com:27017/db');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('mongodb://<credentials>@<host>');
      expect(result.content[0].text).not.toContain('user:pass');
    });

    it('should sanitize falkordb connection strings with credentials', () => {
      // Arrange
      const error = new Error('Connection failed to falkordb://admin:secret@localhost:6379');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('falkordb://<credentials>@<host>');
      expect(result.content[0].text).not.toContain('admin:secret');
    });

    it('should sanitize IP addresses and ports', () => {
      // Arrange
      const error = new Error('Connection refused to 192.168.1.100:6379');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('<host>:<port>');
      expect(result.content[0].text).not.toContain('192.168.1.100:6379');
    });

    it('should sanitize localhost with port', () => {
      // Arrange
      const error = new Error('Failed to connect to localhost:3000');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('localhost:<port>');
      expect(result.content[0].text).not.toContain('localhost:3000');
    });

    it('should sanitize password fields', () => {
      // Arrange
      const error = new Error('Authentication failed with password=mySecretPassword123');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('password=<redacted>');
      expect(result.content[0].text).not.toContain('mySecretPassword123');
    });

    it('should sanitize token fields', () => {
      // Arrange
      const error = new Error('Invalid token=abc123xyz456');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('token=<redacted>');
      expect(result.content[0].text).not.toContain('abc123xyz456');
    });

    it('should sanitize API key fields', () => {
      // Arrange
      const error = new Error('Request failed with api_key=sk-1234567890abcdef');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('apikey=<redacted>');
      expect(result.content[0].text).not.toContain('sk-1234567890abcdef');
    });

    it('should handle non-Error objects', () => {
      // Arrange
      const nonError = { message: 'Something went wrong' };

      // Act
      const result = handler.toMcpErrorResult(nonError);

      // Assert
      expect(result).toEqual({
        content: [{
          type: "text",
          text: "Error: An unexpected error occurred"
        }],
        isError: true
      });
    });

    it('should handle errors with empty messages', () => {
      // Arrange
      const error = new Error('');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result).toEqual({
        content: [{
          type: "text",
          text: "Error: An error occurred"
        }],
        isError: true
      });
    });

    it('should handle null and undefined', () => {
      // Act
      const nullResult = handler.toMcpErrorResult(null);
      const undefinedResult = handler.toMcpErrorResult(undefined);

      // Assert
      expect(nullResult).toEqual({
        content: [{
          type: "text",
          text: "Error: An unexpected error occurred"
        }],
        isError: true
      });
      expect(undefinedResult).toEqual({
        content: [{
          type: "text",
          text: "Error: An unexpected error occurred"
        }],
        isError: true
      });
    });

    it('should handle complex error messages with multiple sensitive patterns', () => {
      // Arrange
      const error = new Error(
        'Connection to redis://admin:secret@192.168.1.100:6379 failed\n' +
        '    at /home/app/src/db.ts:45\n' +
        '    at async connect (/home/app/index.js:12)\n' +
        'Using password=myPass and api-key=sk-123'
      );

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      const text = result.content[0].text;
      expect(text).toContain('redis://<credentials>@<host>');
      expect(text).toContain('password=<redacted>');
      expect(text).toContain('apikey=<redacted>');
      expect(text).not.toContain('admin:secret');
      expect(text).not.toContain('192.168.1.100');
      expect(text).not.toContain('/home/app');
      expect(text).not.toContain('at /home');
      expect(text).not.toContain('myPass');
      expect(text).not.toContain('sk-123');
    });
  });
});