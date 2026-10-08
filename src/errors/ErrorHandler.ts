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
    // AppError messages are sanitized too: the service layer embeds raw driver
    // messages in them (e.g. "Failed to connect to FalkorDB after 5 attempts: ...")
    const errorMessage = error instanceof Error
      ? this.sanitizeErrorMessage(error.message)
      : 'An unexpected error occurred';

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

    // Remove credentials from URLs of any scheme (must be done before host and path removal)
    sanitized = sanitized.replace(/\b([a-z][a-z0-9+.-]{0,31}):\/\/[^@\s]{1,256}@\S+/gi, '$1://<credentials>@<host>');

    // Remove database connection strings without credentials (prevents leaking internal network topology)
    sanitized = sanitized.replace(
      /\b(rediss?|falkordbs?|mongodb(?:\+srv)?|postgres(?:ql)?):\/\/(?![^@\s]{1,256}@)\S+/gi,
      '$1://<host>'
    );

    // Remove file URLs
    sanitized = sanitized.replace(/\bfile:\/\/\S+/gi, '<path>');

    // Remove potential password/token patterns, including quoted JSON-style values
    sanitized = sanitized.replace(/["']?password["']?\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, 'password=<redacted>');
    sanitized = sanitized.replace(/["']?\btoken["']?\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, 'token=<redacted>');
    sanitized = sanitized.replace(/["']?api[_-]?key["']?\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;}]+)/gi, 'apikey=<redacted>');

    // Remove the address from Node.js network errors (covers hostnames and IPv6, e.g. "ECONNREFUSED ::1:6379")
    sanitized = sanitized.replace(
      /\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|EAI_AGAIN)\s+[^\s,;]+/g,
      '$1 <host>'
    );

    // Remove IP addresses and ports
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+\b/g, '<host>:<port>');
    sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<host>');
    sanitized = sanitized.replace(/\blocalhost:\d+\b/g, 'localhost:<port>');

    // Remove absolute file paths. A path must start a token and have at least two
    // segments, so "Integer/Float" or "and/or" in database messages is left alone
    // and the "//" of a URL never matches.
    sanitized = sanitized.replace(/(?<=^|[\s'"`(\[=:,])~?(?:\/[\w.-]+){2,}\/?/g, '<path>');
    sanitized = sanitized.replace(/\b[A-Z]:\\[\w.\\-]+/gi, '<path>');

    return sanitized || 'An error occurred';
  }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();