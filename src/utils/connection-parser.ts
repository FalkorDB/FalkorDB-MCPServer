/**
 * Utility to parse FalkorDB connection strings
 */

interface FalkorDBConnectionOptions {
    host: string;
    port: number;
    username?: string;
    password?: string;
  }
  
  /**
   * Parse a FalkorDB connection string
   * Format: falkordb://[username:password@]host:port
   * 
   * @param connectionString The connection string to parse
   * @returns Parsed connection options
   */
  export function parseFalkorDBConnectionString(connectionString: string): FalkorDBConnectionOptions {
    try {
      // Default values
      const defaultOptions: FalkorDBConnectionOptions = {
        host: 'localhost',
        port: 6379
      };

      // Handle empty or undefined input
      if (!connectionString) {
        return defaultOptions;
      }

      // Remove protocol prefix if present
      let cleanString = connectionString;
      if (cleanString.startsWith('falkordb://')) {
        cleanString = cleanString.substring('falkordb://'.length);
      }

      // Parse authentication if present - use lastIndexOf to handle '@' in password
      let auth = '';
      let hostPort = cleanString;

      const lastAtIndex = cleanString.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        auth = cleanString.slice(0, lastAtIndex);
        hostPort = cleanString.slice(lastAtIndex + 1);
      }

      // Parse host and port
      let host = 'localhost';
      let port = 6379;

      if (hostPort.includes(':')) {
        const parts = hostPort.split(':');
        host = parts[0] || 'localhost';
        port = parseInt(parts[1], 10) || 6379;
      } else {
        host = hostPort || 'localhost';
      }

      // Parse username and password - handle multiple ':' in password
      let username = undefined;
      let password = undefined;

      if (auth && auth.includes(':')) {
        const firstColonIndex = auth.indexOf(':');
        username = auth.slice(0, firstColonIndex) || undefined;
        password = auth.slice(firstColonIndex + 1) || undefined;
      } else if (auth) {
        password = auth;
      }

      return {
        host,
        port,
        username,
        password
      };
    } catch (error) {
      console.error('Error parsing connection string:', error);
      return {
        host: 'localhost',
        port: 6379
      };
    }
  }