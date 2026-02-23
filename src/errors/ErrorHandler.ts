import { AppError } from './AppError.js';
import { logger } from '../services/logger.service.js';

/**
 * MCP tool result format for errors
 */
export interface McpErrorResult {
  [x: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError: true;
}

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

  /**
   * Converts an error into a sanitized MCP tool result
   * Removes sensitive information like stack traces, connection details, and internal paths
   * @param error - The error to convert
   * @returns A sanitized MCP error result
   */
  public toMcpErrorResult(error: unknown): McpErrorResult {
    let errorMessage: string;

    if (error instanceof AppError) {
      // Use the AppError message which should already be user-safe
      errorMessage = error.message;
    } else if (error instanceof Error) {
      // Sanitize generic error messages
      errorMessage = this.sanitizeErrorMessage(error.message);
    } else {
      // Handle non-Error objects
      errorMessage = 'An unexpected error occurred';
    }

    return {
      content: [{
        type: "text",
        text: `Error: ${errorMessage}`
      }],
      isError: true
    };
  }

  /**
   * Sanitizes error messages by removing sensitive information
   * @param message - The error message to sanitize
   * @returns A sanitized error message
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message) {
      return 'An error occurred';
    }

    // Remove stack traces (lines starting with "at ")
    const lines = message.split('\n');
    const sanitizedLines = lines.filter(line => !line.trim().startsWith('at '));
    let sanitized = sanitizedLines.join('\n').trim();

    // Remove connection strings with credentials (must be done before path removal)
    sanitized = sanitized.replace(/redis:\/\/[^@\s]+@[^\s]+/gi, 'redis://<credentials>@<host>');
    sanitized = sanitized.replace(/mongodb:\/\/[^@\s]+@[^\s]+/gi, 'mongodb://<credentials>@<host>');
    sanitized = sanitized.replace(/postgresql:\/\/[^@\s]+@[^\s]+/gi, 'postgresql://<credentials>@<host>');
    sanitized = sanitized.replace(/falkordb:\/\/[^@\s]+@[^\s]+/gi, 'falkordb://<credentials>@<host>');

    // Remove connection strings without credentials (prevents leaking internal network topology)
    sanitized = sanitized.replace(/redis:\/\/(?![^@\s]+@)[^\s]+/gi, 'redis://<host>');
    sanitized = sanitized.replace(/mongodb:\/\/(?![^@\s]+@)[^\s]+/gi, 'mongodb://<host>');
    sanitized = sanitized.replace(/postgresql:\/\/(?![^@\s]+@)[^\s]+/gi, 'postgresql://<host>');
    sanitized = sanitized.replace(/falkordb:\/\/(?![^@\s]+@)[^\s]+/gi, 'falkordb://<host>');

    // Remove potential password/token patterns (more specific to capture full values)
    sanitized = sanitized.replace(/password[=:]\s*(\S+)/gi, 'password=<redacted>');
    sanitized = sanitized.replace(/\btoken[=:]\s*(\S+)/gi, 'token=<redacted>');
    sanitized = sanitized.replace(/api[_-]?key[=:]\s*(\S+)/gi, 'apikey=<redacted>');

    // Remove IP addresses and ports
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+\b/g, '<host>:<port>');
    sanitized = sanitized.replace(/\blocalhost:\d+\b/g, 'localhost:<port>');

    // Remove file paths (absolute paths) - use negative lookbehind to avoid matching :// URLs
    sanitized = sanitized.replace(/(?<!:)\/[\w./-]+/g, '<path>');
    sanitized = sanitized.replace(/\b[A-Z]:\\[\w\-\\]+/g, '<path>');

    return sanitized || 'An error occurred';
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();