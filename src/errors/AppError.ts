/**
 * Custom application error class that extends the built-in Error
 * Follows Node.js best practices for error handling in MCP servers
 */
export class AppError extends Error {
  public readonly name: string;
  public readonly isOperational: boolean;

  constructor(
    name: string,
    description: string,
    isOperational: boolean = true
  ) {
    super(description);

    // Restore prototype chain for proper instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    this.name = name;
    this.isOperational = isOperational;

    // Capture stack trace, excluding constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error types for the MCP application
 */
export const CommonErrors = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  OPERATION_FAILED: 'OPERATION_FAILED',
  INITIALIZATION_FAILED: 'INITIALIZATION_FAILED'
} as const;