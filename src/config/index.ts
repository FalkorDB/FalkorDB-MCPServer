import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({
  quiet: true,
});

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  server: {
    port: parsePort(process.env.PORT || process.env.MCP_PORT, 8080),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  falkorDB: {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parsePort(process.env.FALKORDB_PORT, 6379),
    username: process.env.FALKORDB_USERNAME || '',
    password: process.env.FALKORDB_PASSWORD || '',
    defaultReadOnly: process.env.FALKORDB_DEFAULT_READONLY === 'true',
    strictReadOnly: process.env.FALKORDB_STRICT_READONLY === 'true',
  },
  mcp: {
    transport: (process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'http',
    apiKey: process.env.MCP_API_KEY || '',
    bindAddress: process.env.MCP_BIND_ADDRESS || '127.0.0.1',
  },
};