# Project Guidelines

## Overview
FalkorDB-MCPServer is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that enables AI models to interact with [FalkorDB](https://github.com/FalkorDB/FalkorDB) graph databases through natural language. It exposes graph operations as MCP tools over either of two transports, selected by `MCP_TRANSPORT`: **stdio** (the default) or **Streamable HTTP**.

## Build & Install
```bash
npm install          # install dependencies
npm run build        # compile TypeScript to JavaScript in dist/
```

## Development
```bash
npm run dev          # start dev server with hot-reloading (nodemon)
npm start            # run the built application from dist/index.js
```

## Testing
Tests require a running FalkorDB instance on `localhost:6379`:
```bash
docker run -p 6379:6379 -d falkordb/falkordb:edge
```
Run all tests:
```bash
npm test
```
Run with coverage:
```bash
npm run test:coverage
```
- **Framework**: Jest with ts-jest preset
- **Test files**: Located alongside source files with `.test.ts` extension

## Pre-commit Checks
Always run these checks before every commit:
```bash
npm run lint         # ESLint on TypeScript files
npm run build        # ensure TypeScript compiles without errors
npm test             # ensure all tests pass
```

## Code Style
- **Linter**: ESLint (configured in `eslint.config.js`)
- **Language**: TypeScript (ES modules, `"type": "module"` in package.json)
- **Node.js**: requires a recent LTS version
- **Imports**: use `.js` specifiers in TypeScript source (ESM convention)

## Project Structure
```
src/
├── index.ts                    # MCP server entry point — tool/resource registration, transport startup
├── services/
│   ├── falkordb.service.ts     # FalkorDB connection and graph operations (singleton)
│   └── logger.service.ts       # Logging and MCP notifications
├── config/
│   └── index.ts                # Centralized configuration using dotenv
├── models/
│   ├── mcp.types.ts            # MCP protocol interfaces
│   └── mcp-client-config.ts    # Configuration models
└── utils/
    ├── connection-parser.ts    # Utility functions
    ├── bind-address.ts         # Loopback classification for MCP_BIND_ADDRESS
    └── startup-guard.ts        # Refuses unauthenticated non-loopback HTTP startup
```

## Architecture Patterns

### MCP Tools Registered
| Tool | Description |
|------|-------------|
| `query_graph` | Execute OpenCypher queries on a specific graph (with optional read-only mode) |
| `query_graph_readonly` | Execute read-only OpenCypher queries |
| `list_graphs` | List all available graphs in the database |
| `delete_graph` | Delete a specific graph |
| `get_graph_schema` | Get node labels, relationship types, and (optional, bounded) connection topology for a graph |
| `get_node_schema` | Sample nodes of a label and rank their property keys by frequency (reveals the de-facto schema) |
| `get_relationship_schema` | Sample relationships of a type and rank their property keys by frequency |

Schema-discovery tools (`get_graph_schema`, `get_node_schema`, `get_relationship_schema`) always execute via `executeReadOnlyQuery` (`GRAPH.RO_QUERY`), since discovery is inherently read-only and must work on replica/read-only deployments.

### MCP Resources
- `graph_list` — provides a markdown-formatted listing of all graphs

### Service Pattern
- Services are exported as singleton instances
- **FalkorDB Service** (`src/services/falkordb.service.ts`): manages connections, retries, and pooling; exposes `executeQuery()`, `executeReadOnlyQuery()`, `listGraphs()`, `deleteGraph()`

### Transports
- **stdio** (default): Build output in `dist/` is executed directly by MCP clients.
- **HTTP** (`MCP_TRANSPORT=http`, `src/index.ts`'s `startHTTPServer()`): Streamable HTTP via `StreamableHTTPServerTransport`, one `McpServer` instance per session. Requests are Bearer-authenticated against `MCP_API_KEY` when it's set — unset, auth is disabled. Before listening, `enforceLocalBindWithoutApiKey()` (`src/utils/startup-guard.ts`) refuses to start whenever `MCP_BIND_ADDRESS` declares a non-loopback address with no `MCP_API_KEY` set — this runs unconditionally in every HTTP deployment, not only under Docker Compose (see the `MCP_BIND_ADDRESS` row below for what the variable actually controls).

### Error Handling
- MCP tool handlers use `errorHandler.toMcpErrorResult()` to sanitize errors before returning to clients (never throw from a tool handler)

### TypeScript / Zod Schemas
- Extract Zod schemas as standalone `const` variables with `as const` to prevent TypeScript deep-recursion errors (TS2589) in MCP SDK registration functions
- Cast `inputSchema`/`argsSchema` to `any` where needed, and validate args inside handlers using `z.object().parse()`

## Configuration
Environment variables (copy `.env.example` to `.env`):
| Variable | Default | Description |
|----------|---------|-------------|
| `FALKORDB_HOST` | `localhost` | FalkorDB hostname |
| `FALKORDB_PORT` | `6379` | FalkorDB port |
| `FALKORDB_USERNAME` | — | Optional authentication |
| `FALKORDB_PASSWORD` | — | Optional authentication |
| `FALKORDB_DEFAULT_READONLY` | `false` | Set to 'true' for read-only mode (useful for replicas) |
| `MCP_TRANSPORT` | `stdio` | `stdio` or `http` — selects which transport `src/index.ts` starts |
| `MCP_API_KEY` | — | Bearer token required on HTTP requests when set; HTTP auth is disabled when unset. Ignored in stdio mode |
| `MCP_BIND_ADDRESS` | `127.0.0.1` | Docker Compose only: host interface the MCP server's published port binds to. Does not change what the server listens on inside the container (always every interface) and has no effect outside Compose. Non-loopback values require `MCP_API_KEY` to be set, or the server refuses to start in HTTP mode |
| `FALKORDB_WEB_BIND_ADDRESS` | `127.0.0.1` | Docker Compose only: interface the bundled FalkorDB web UI's published port binds to. The web UI has no auth of its own, so this is a manual, unguarded opt-in with no equivalent startup check |

## MCP Client Integration

### Claude Desktop
Add to `claude_desktop_config.json`:
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

## CI/CD
- Tests run against a `falkordb/falkordb:edge` Docker service
- Build and lint checks validate TypeScript compilation and code style
- Docker images are automatically published to `falkordb/mcpserver`:
  - `edge` tag: published on every push to `main`
  - `x.y.z` and `latest` tags: published when a version tag is pushed or release is published
  - Multi-platform builds: `linux/amd64`, `linux/arm64`

## Before Finishing a Task
After completing any task, review whether your changes require updates to:
- **`README.md`** — if public API, usage examples, or installation instructions changed
- **`AGENTS.md`** — if project structure, build commands, architecture patterns, or conventions changed
