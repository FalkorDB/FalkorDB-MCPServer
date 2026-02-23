# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Dev server**: `npm run dev` - Starts development server with hot-reloading using nodemon
- **Production start**: `npm start` - Runs the built application from `dist/index.js`
- **Lint**: `npm run lint` - Runs ESLint on TypeScript files
- **Test**: `npm test` - Runs Jest test suite
- **Test with coverage**: `npm run test:coverage` - Runs tests with coverage report

## Project Architecture

This is a Model Context Protocol (MCP) server that enables AI models to interact with FalkorDB graph databases through natural language. The server communicates via stdio transport and provides tools for graph operations.

### MCP Server Implementation
- **Entry point**: `src/index.ts` - Creates MCP server using `@modelcontextprotocol/sdk`
- **Communication**: Uses stdio transport for MCP protocol (not HTTP)
- **MCP Tools registered**:
  - `query_graph` - Execute OpenCypher queries on specific graphs
  - `query_graph_readonly` - Execute read-only OpenCypher queries
  - `list_graphs` - List all available graphs in the database
  - `delete_graph` - Delete specific graphs
- **MCP Resources**: `graph_list` resource provides markdown-formatted graph listings

### Core Services
- **FalkorDB Service** (`src/services/falkordb.service.ts`):
  - Singleton service managing FalkorDB connections
  - Uses `falkordb` npm package
  - Handles connection retries and pooling
  - Main operations: `executeQuery()`, `executeReadOnlyQuery()`, `listGraphs()`, `deleteGraph()`

### Configuration
- **Config system** (`src/config/index.ts`): Centralized configuration using dotenv
- **Environment variables**: Defined in `.env` file (copy from `.env.example`)
- **Key variables**: `FALKORDB_HOST`, `FALKORDB_PORT`, `FALKORDB_USERNAME`, `FALKORDB_PASSWORD`

### Current Project Structure
```
src/
├── index.ts                    # MCP server entry point with tool/resource registration
├── services/
│   ├── falkordb.service.ts     # FalkorDB connection and graph operations
│   └── logger.service.ts       # Logging and MCP notifications
├── config/
│   └── index.ts                # Centralized configuration using dotenv
├── models/                     # TypeScript type definitions
│   ├── mcp.types.ts           # MCP protocol interfaces
│   └── mcp-client-config.ts   # Configuration models
└── utils/
    └── connection-parser.ts    # Utility functions
```

## Testing
- **Framework**: Jest with ts-jest preset
- **Test files**: Located alongside source files with `.test.ts` extension
- **Coverage**: Configured to exclude test files and type definitions
- **Test environment**: Node.js environment

## Key Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `falkordb` - FalkorDB Node.js client
- `zod` - Schema validation for MCP tools

## MCP Integration Setup

### Claude Desktop Configuration
To use this server with Claude Desktop, add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "falkordb": {
      "command": "node",
      "args": ["/absolute/path/to/falkordb-mcpserver/dist/index.js"]
    }
  }
}
```

### Environment Configuration
Required environment variables in `.env`:
- `FALKORDB_HOST` - FalkorDB hostname (default: localhost)
- `FALKORDB_PORT` - FalkorDB port (default: 6379)
- `FALKORDB_USERNAME` - Optional authentication
- `FALKORDB_PASSWORD` - Optional authentication
- `FALKORDB_DEFAULT_READONLY` - Set to 'true' for read-only mode (default: false)

## Development Notes
- Uses ES modules (`"type": "module"` in package.json)
- TypeScript configuration in `tsconfig.json`
- Nodemon watches `src/**/*.ts` for development hot-reload
- **Important**: This is an MCP server, not a web server - it communicates via stdio transport
- Build output in `dist/` directory is executed by MCP clients
- The server automatically closes FalkorDB connections on exit