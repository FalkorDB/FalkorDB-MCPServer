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

    it('should sanitize connection strings without credentials to hide network topology', () => {
      // Arrange
      const error = new Error('Could not connect to redis://internal-cache-server:6379/0');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('redis://<host>');
      expect(result.content[0].text).not.toContain('internal-cache-server');
    });

    it('should sanitize falkordb connection strings without credentials', () => {
      // Arrange
      const error = new Error('Failed to connect to falkordb://prod-db.internal:6379');

      // Act
      const result = handler.toMcpErrorResult(error);

      // Assert
      expect(result.content[0].text).toContain('falkordb://<host>');
      expect(result.content[0].text).not.toContain('prod-db.internal');
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

    it('should sanitize raw driver details that the service layer wraps in an AppError', () => {
      const appError = new AppError(
        CommonErrors.CONNECTION_FAILED,
        'Failed to connect to FalkorDB after 5 attempts: connect ECONNREFUSED 10.0.4.17:6379',
        true
      );

      const text = handler.toMcpErrorResult(appError).content[0].text;

      expect(text).toBe('Error: Failed to connect to FalkorDB after 5 attempts: connect ECONNREFUSED <host>');
    });

    it('should sanitize credentials inside an AppError message', () => {
      const appError = new AppError(
        CommonErrors.OPERATION_FAILED,
        "Failed to execute query on graph 'g': AUTH failed for falkordb://admin:hunter2@db.internal:6379",
        true
      );

      const text = handler.toMcpErrorResult(appError).content[0].text;

      expect(text).toBe("Error: Failed to execute query on graph 'g': AUTH failed for falkordb://<credentials>@<host>");
    });

    it.each([
      ['rediss://admin:secret@cache.internal:6380', 'rediss://<credentials>@<host>'],
      ['falkordbs://admin:secret@db.internal:6379', 'falkordbs://<credentials>@<host>'],
      ['postgres://admin:secret@pg.internal:5432/app', 'postgres://<credentials>@<host>'],
      ['mongodb+srv://admin:secret@cluster0.internal/app', 'mongodb+srv://<credentials>@<host>'],
      ['https://admin:secret@api.internal/v1', 'https://<credentials>@<host>'],
    ])('should sanitize credentials in %s', (url, expected) => {
      const text = handler.toMcpErrorResult(new Error(`Connection failed to ${url}`)).content[0].text;

      expect(text).toBe(`Error: Connection failed to ${expected}`);
      expect(text).not.toContain('secret');
    });

    it.each([
      ['rediss://cache.internal:6380', 'rediss://<host>'],
      ['falkordbs://db.internal:6379', 'falkordbs://<host>'],
      ['postgresql://pg.internal:5432/app', 'postgresql://<host>'],
      ['mongodb://mongo.internal:27017', 'mongodb://<host>'],
    ])('should hide the host of %s', (url, expected) => {
      const text = handler.toMcpErrorResult(new Error(`Could not reach ${url}`)).content[0].text;

      expect(text).toBe(`Error: Could not reach ${expected}`);
    });

    it.each([
      ['connect ECONNREFUSED ::1:6379', 'connect ECONNREFUSED <host>'],
      ['getaddrinfo ENOTFOUND falkordb.prod.internal', 'getaddrinfo ENOTFOUND <host>'],
      ['getaddrinfo EAI_AGAIN falkordb.prod.internal', 'getaddrinfo EAI_AGAIN <host>'],
      ['connect ETIMEDOUT 10.0.4.17:6379', 'connect ETIMEDOUT <host>'],
      ['read ECONNRESET 10.0.4.17:6379, retrying', 'read ECONNRESET <host>, retrying'],
    ])('should hide the address in the network error "%s"', (message, expected) => {
      expect(handler.toMcpErrorResult(new Error(message)).content[0].text).toBe(`Error: ${expected}`);
    });

    it('should sanitize IP addresses without a port', () => {
      const text = handler.toMcpErrorResult(new Error('Host 10.0.4.17 is unreachable')).content[0].text;

      expect(text).toBe('Error: Host <host> is unreachable');
    });

    it.each([
      ['{"password":"hunter2"}', '{password=<redacted>}'],
      ["password: 'hunter 2'", 'password=<redacted>'],
      ['password = hunter2, user=bob', 'password=<redacted>, user=bob'],
      ['{"token": "abc.def"}', '{token=<redacted>}'],
      ['apiKey: sk-live-123', 'apikey=<redacted>'],
    ])('should redact the secret value in %s', (message, expected) => {
      const text = handler.toMcpErrorResult(new Error(message)).content[0].text;

      expect(text).toBe(`Error: ${expected}`);
    });

    it('should not redact words that merely contain "token"', () => {
      const text = handler.toMcpErrorResult(new Error('Invalid input: unexpected tokenizer=state')).content[0].text;

      expect(text).toBe('Error: Invalid input: unexpected tokenizer=state');
    });

    it.each([
      ['Failed to load file:///etc/falkordb/tls/ca.pem', 'Failed to load <path>'],
      ['Cannot open ~/.config/falkordb/creds.json', 'Cannot open <path>'],
      ['Cannot open (/var/lib/falkordb/dump.rdb)', 'Cannot open (<path>)'],
      ['config=/etc/falkordb/falkordb.conf', 'config=<path>'],
      ['Cannot open C:\\Users\\admin\\falkordb\\creds.json', 'Cannot open <path>'],
    ])('should sanitize the path in "%s"', (message, expected) => {
      expect(handler.toMcpErrorResult(new Error(message)).content[0].text).toBe(`Error: ${expected}`);
    });

    it.each([
      'Type mismatch: expected Integer/Float but was String',
      'Use AND/OR to combine predicates',
      'Division by zero: 10 / 0',
      'See https://docs.falkordb.com/cypher/functions.html for details',
      "Invalid input 'X': expected MATCH, CREATE or RETURN line: 1, column: 1, offset: 0",
      "Failed to execute query on graph 'social/2024': Unknown function 'foo'",
    ])('should leave the harmless message "%s" unchanged', (message) => {
      expect(handler.toMcpErrorResult(new Error(message)).content[0].text).toBe(`Error: ${message}`);
    });

    it('should fall back to a generic message when only a stack trace remains', () => {
      const error = new Error('\n    at Object.<anonymous> (/app/src/index.ts:1:1)');

      expect(handler.toMcpErrorResult(error).content[0].text).toBe('Error: An error occurred');
    });

    it('should treat thrown strings as unexpected errors without echoing them', () => {
      const result = handler.toMcpErrorResult('redis://admin:secret@10.0.4.17:6379');

      expect(result.content[0].text).toBe('Error: An unexpected error occurred');
    });

    it('should hide a database URL whose credentials are too long to match as userinfo', () => {
      const secret = 's'.repeat(300);
      const text = handler.toMcpErrorResult(new Error(`Could not reach redis://admin:${secret}@cache.internal:6379`)).content[0].text;

      expect(text).toBe('Error: Could not reach redis://<host>');
    });

    // Error messages can echo user query text, so a crafted message must not
    // trigger catastrophic regex backtracking (each case took 5-30 s before the
    // scheme and userinfo lengths were bounded)
    it.each([
      ['repeated dotted words', 'a.'.repeat(100000)],
      ['repeated schemes', 'redis://'.repeat(25000)],
      ['repeated URLs without credentials', 'x://a'.repeat(25000)],
      ['repeated file URLs', 'file://'.repeat(25000)],
    ])('should sanitize %s in linear time', (_name, message) => {
      const start = Date.now();
      handler.toMcpErrorResult(new Error(message));

      expect(Date.now() - start).toBeLessThan(1000);
    });

    it('should be idempotent', () => {
      const once = handler.toMcpErrorResult(
        new Error('Connect to redis://admin:secret@10.0.4.17:6379 from /app/src/db.ts failed: ECONNREFUSED 10.0.4.17:6379')
      ).content[0].text.replace(/^Error: /, '');
      const twice = handler.toMcpErrorResult(new Error(once)).content[0].text.replace(/^Error: /, '');

      expect(twice).toBe(once);
    });
  });
});