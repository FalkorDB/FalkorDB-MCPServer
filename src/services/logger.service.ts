import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { userLogDir } from 'platformdirs';

interface LogContext {
  [key: string]: unknown;
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Enhanced logging service for MCP servers with both MCP client notifications and file fallback
 * Logs are sent to MCP clients when connected, and always written to files for persistence
 */
export class Logger {
  private logDir: string;
  private logFile: string;
  private mcpServer?: McpServer;

  constructor() {
    // For MCP servers, we primarily use MCP notifications for logging
    // File logging is optional and only enabled if environment allows it
    this.logDir = userLogDir('falkordb-mcp', 'mulliken-llc', '0.1.0', false, true);
    this.logFile = join(this.logDir, 'falkordb-mcp.log');
    
    // Only create log directory if we're in development or explicitly enabled
    if (process.env.ENABLE_FILE_LOGGING === 'true' || process.env.NODE_ENV === 'development') {
      try {
        if (!existsSync(this.logDir)) {
          mkdirSync(this.logDir, { recursive: true });
        }
      } catch (error) {
        // If we can't create logs directory, disable file logging
        console.warn('Failed to create log directory:', error instanceof Error ? error.message : String(error));
        this.logFile = '';
      }
    } else {
      // Disable file logging by default for MCP servers
      this.logFile = '';
    }
  }

  /**
   * Set the MCP server instance to enable client notifications
   * This should be called after the server is created but before starting
   */
  public setMcpServer(server: McpServer): void {
    this.mcpServer = server;
  }

  private formatLog(level: string, message: string, context?: LogContext): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context && { context }),
      pid: process.pid
    };
    
    return JSON.stringify(logEntry) + '\n';
  }

  private writeLog(level: LogLevel, message: string, context?: LogContext): void {
    // Guard against file logging when disabled
    if (!this.logFile) {
      return;
    }

    try {
      // Always write to file for persistence
      const logLine = this.formatLog(level, message, context);
      appendFileSync(this.logFile, logLine);
    } catch {
      // If we can't log to file, we can't do much about it without breaking MCP
      // In production, consider using a more robust logging solution
    }
  }

  private async sendMcpLog(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    if (!this.mcpServer) {
      return;
    }

    try {
      // Format log data for MCP client
      const logData = context ? `${message} | ${JSON.stringify(context)}` : message;

      // Map WARN to warning for MCP spec compliance
      const mcpLevel = level === 'WARN' ? 'warning' : level.toLowerCase();

      // Send notification to MCP client
      await this.mcpServer.server.notification({
        method: 'notifications/message',
        params: {
          level: mcpLevel,
          data: logData,
          logger: 'falkordb-mcp'
        }
      });
    } catch {
      // If MCP notification fails, just continue - file logging is our fallback
      // Don't log this error to avoid infinite loops
    }
  }

  private async log(level: LogLevel, message: string, context?: LogContext): Promise<void> {
    // Always write to file
    this.writeLog(level, message, context);
    
    // Try to send to MCP client if server is available
    await this.sendMcpLog(level, message, context);
  }

  async info(message: string, context?: LogContext): Promise<void> {
    await this.log('INFO', message, context);
  }

  async warn(message: string, context?: LogContext): Promise<void> {
    await this.log('WARN', message, context);
  }

  async error(message: string, error?: Error, context?: LogContext): Promise<void> {
    const errorContext = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any).isOperational !== undefined && { 
        isOperational: (error as any).isOperational 
      },
      ...context
    } : context;

    await this.log('ERROR', message, errorContext);
  }

  async debug(message: string, context?: LogContext): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      await this.log('DEBUG', message, context);
    }
  }

  // Synchronous versions for backward compatibility in cases where async isn't possible
  infoSync(message: string, context?: LogContext): void {
    this.writeLog('INFO', message, context);
    // Fire and forget for MCP notification
    this.sendMcpLog('INFO', message, context).catch(() => {});
  }

  warnSync(message: string, context?: LogContext): void {
    this.writeLog('WARN', message, context);
    this.sendMcpLog('WARN', message, context).catch(() => {});
  }

  errorSync(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as any).isOperational !== undefined && { 
        isOperational: (error as any).isOperational 
      },
      ...context
    } : context;

    this.writeLog('ERROR', message, errorContext);
    this.sendMcpLog('ERROR', message, errorContext).catch(() => {});
  }

  debugSync(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development') {
      this.writeLog('DEBUG', message, context);
      this.sendMcpLog('DEBUG', message, context).catch(() => {});
    }
  }
}

// Export singleton instance
export const logger = new Logger();