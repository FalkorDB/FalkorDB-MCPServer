import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({
  quiet: true,
});

export const config = {
  server: {
    port: parseInt(process.env.PORT || process.env.MCP_PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  falkorDB: {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379'),
    username: process.env.FALKORDB_USERNAME || '',
    password: process.env.FALKORDB_PASSWORD || '',
    defaultReadOnly: process.env.FALKORDB_DEFAULT_READONLY === 'true',
    strictReadOnly: process.env.FALKORDB_STRICT_READONLY === 'true',
  },
  mcp: {
    transport: (process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'http',
    apiKey: process.env.MCP_API_KEY || '',
  },
};