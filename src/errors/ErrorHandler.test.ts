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
});