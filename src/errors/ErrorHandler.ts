import { AppError } from './AppError.js';
import { logger } from '../services/logger.service.js';

/**
 * Centralized error handler following Node.js best practices for MCP servers
 * Handles logging, monitoring, and determining crash behavior
 */
export class ErrorHandler {
  public async handleError(err: Error): Promise<void> {
    await this.logError(err);
    await this.determineIfOperationalError(err);
  }

  public isTrustedError(error: Error): boolean {
    if (error instanceof AppError) {
      return error.isOperational;
    }
    return false;
  }

  private async logError(err: Error): Promise<void> {
    await logger.error('Unhandled error occurred', err, {
      timestamp: new Date().toISOString(),
      errorType: err.constructor.name
    });
  }

  private async determineIfOperationalError(err: Error): Promise<void> {
    if (this.isTrustedError(err)) {
      await logger.info('Operational error handled gracefully', { 
        errorName: err.name,
        errorMessage: err.message 
      });
    } else {
      await logger.error('Programmer error detected - may require process restart', err, {
        recommendation: 'Review code for bugs',
        severity: 'critical'
      });
    }
  }

  public crashIfUntrustedError(error: Error): void {
    if (!this.isTrustedError(error)) {
      logger.errorSync('Crashing process due to untrusted error', error);
      process.exit(1);
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();