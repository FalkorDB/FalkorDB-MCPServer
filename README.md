[![Tests](https://img.shields.io/github/actions/workflow/status/falkordb/FalkorDB-MCPServer/node.yml?branch=main)](https://github.com/falkordb/FalkorDB-MCPServer/actions/workflows/node.yml)
[![Coverage](https://codecov.io/gh/falkordb/FalkorDB-MCPServer/branch/main/graph/badge.svg?token=nNxm2N0Xrl)](https://codecov.io/gh/falkordb/FalkorDB-MCPServer)
[![License](https://img.shields.io/github/license/falkordb/FalkorDB-MCPServer.svg)](https://github.com/falkordb/FalkorDB-MCPServer/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1146782921294884966.svg?style=social&logo=discord)](https://discord.com/invite/99y2Ubh6tg)
[![X (formerly Twitter)](https://img.shields.io/badge/follow-%40falkordb-1DA1F2?logo=x&style=social)](https://x.com/falkordb)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)

# FalkorDB MCP Server

[![Try Free](https://img.shields.io/badge/Try%20Free-FalkorDB%20Cloud-FF8101?labelColor=FDE900&style=for-the-badge&link=https://app.falkordb.cloud)](https://app.falkordb.cloud)

A Model Context Protocol (MCP) server for FalkorDB, allowing AI models to query and interact with graph databases.
FalkorDB MCP Server enables AI assistants like Claude to interact with FalkorDB graph databases using natural language. Query your graph data, create relationships, and manage your knowledge graph - all through conversational AI.

## 🎯 What is this?

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing AI models to:
- **Query graph databases** using OpenCypher (with read-only mode support)
- **Create and manage** nodes and relationships
- **List and explore** multiple graphs
- **Delete graphs** when needed
- **Read-only queries** for replica instances or to prevent accidental writes

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- FalkorDB instance (running locally or remotely)
- Claude Desktop app (for AI integration)

### Running from npm

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "falkordb": {
      "command": "npx",
      "args": [
        "-y",
        "@falkordb/mcpserver@latest"
      ],
      "env": {
        "FALKORDB_HOST": "localhost",
        "FALKORDB_PORT": "6379",
        "FALKORDB_USERNAME": "",
        "FALKORDB_PASSWORD": ""
      }
    }
  }
}
```

### Running with npx

You can run the server directly from the command line using npx:

**Using inline environment variables:**

```bash
# Run with stdio transport (default)
FALKORDB_HOST=localhost FALKORDB_PORT=6379 npx -y @falkordb/mcpserver

# Run with HTTP transport
MCP_TRANSPORT=http MCP_PORT=3005 FALKORDB_HOST=localhost FALKORDB_PORT=6379 npx -y @falkordb/mcpserver
```

**Using a .env file:**

```bash
# Using dotenv-cli to load environment variables from .env
npx dotenv-cli -e .env -- npx @falkordb/mcpserver
```

This is useful for:
- Quick testing and development
- Running the server standalone without Claude Desktop
- Custom integrations and scripting

### Docker Compose

Run FalkorDB and the MCP server together:

```bash
cp .env.example .env   # create env file; edit to set MCP_API_KEY, FALKORDB_PASSWORD, etc.
docker compose up -d
```

> **Note:** Skipping the `.env` file leaves variables like `MCP_API_KEY` and `FALKORDB_PASSWORD` empty, which disables API key authentication and uses no database password.

This starts FalkorDB with health checks and persistent volumes, plus the MCP server pre-configured to connect to it.

The MCP server runs in **HTTP transport** mode and is exposed on `localhost:3000` by default. To connect a client, configure it to use:

- **Transport:** `http`
- **URL:** `http://localhost:3000`
- **API Key:** Set via the `MCP_API_KEY` environment variable (optional)

See `docker-compose.yml` for the exact port and configuration values.

### Installation

1. **Clone and install:**
   ```bash
   git clone https://github.com/FalkorDB/FalkorDB-MCPServer.git
   cd FalkorDB-MCPServer
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   # Environment Configuration
   NODE_ENV=development

   # FalkorDB Configuration
   FALKORDB_HOST=localhost
   FALKORDB_PORT=6379
   FALKORDB_USERNAME=    # Optional
   FALKORDB_PASSWORD=    # Optional
   FALKORDB_DEFAULT_READONLY=false  # Set to 'true' for read-only mode (useful for replicas)

   # Logging Configuration (optional)
   ENABLE_FILE_LOGGING=false
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## 🤖 Claude Desktop Integration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "falkordb": {
      "command": "node",
      "args": [
        "/absolute/path/to/falkordb-mcpserver/dist/index.js"
      ]
    }
  }
}
```

Restart Claude Desktop and you'll see the FalkorDB tools available!

## 📚 Available MCP Tools

Once connected, you can ask Claude to:

### 🔍 Query Graphs
```text
"Show me all people who know each other"
"Find the shortest path between two nodes"
"What relationships does John have?"
"Run a read-only query on the replica instance"
```

**Note:** The `query_graph` tool now supports a `readOnly` parameter to execute queries in read-only mode using `GRAPH.RO_QUERY`. This is ideal for:
- Running queries on replica instances
- Preventing accidental write operations
- Ensuring data integrity in production environments

There's also a dedicated `query_graph_readonly` tool that always executes queries in read-only mode.

### 📝 Manage Data
```text
"Create a new person named Alice who knows Bob"
"Add a 'WORKS_AT' relationship between Alice and TechCorp"
```

### 📊 Explore Structure
```text
"List all available graphs"
"Show me the structure of the user_data graph"
"Delete the old_test graph"
```

## 🛠️ Development

### Commands

```bash
# Development with hot-reload
npm run dev

# Development with TypeScript execution (faster startup)
npm run dev:ts

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Lint code
npm run lint

# Lint and auto-fix issues
npm run lint:fix

# Build for production
npm run build

# Start production server
npm start

# Inspect MCP server with debugging tools
npm run inspect

# Clean build artifacts
npm run clean

# Full CI pipeline (test, lint, build)
npm run prepublish
```

### Project Structure

```text
src/
├── index.ts                   # MCP server entry point
├── services/                  # Core business logic
│   ├── falkordb.service.ts   # FalkorDB operations
│   └── logger.service.ts     # Logging and MCP notifications
├── mcp/                      # MCP protocol implementations
│   ├── tools.ts             # MCP tool definitions
│   ├── resources.ts         # MCP resource definitions
│   └── prompts.ts           # MCP prompt definitions
├── errors/                   # Error handling framework
│   ├── AppError.ts          # Custom error classes
│   └── ErrorHandler.ts      # Global error handling
├── config/                   # Configuration management
│   └── index.ts             # Environment configuration
├── models/                   # TypeScript type definitions
│   ├── mcp.types.ts         # MCP protocol types
│   └── mcp-client-config.ts # Configuration models
└── utils/                    # Utility functions
    └── connection-parser.ts  # Connection string parsing
```

## 🔧 Advanced Configuration

### Transport Modes

The server supports two transport modes:

#### stdio (default)
Used for direct integration with AI clients like Claude Desktop. Communication happens via standard input/output.

```env
MCP_TRANSPORT=stdio
```

#### Streamable HTTP
Exposes the MCP server over HTTP for remote or networked access. Supports multiple concurrent sessions via the MCP Streamable HTTP protocol.

```env
MCP_TRANSPORT=http
MCP_PORT=3000
MCP_API_KEY=your-secret-api-key  # Optional but recommended
```

When using HTTP transport, clients connect by sending a POST request with an `initialize` message. The server returns an `Mcp-Session-Id` header that must be included in subsequent requests. API key authentication is enforced via the `Authorization: Bearer <key>` header when `MCP_API_KEY` is set.

**Testing HTTP transport:**

1. Start the server:
   ```bash
   MCP_TRANSPORT=http MCP_PORT=3000 npm start
   ```

2. Use the MCP Inspector to connect:
   ```bash
   npx @modelcontextprotocol/inspector --transport streamable-http --url http://localhost:3000
   ```

> **Note:** `npm run inspect` uses stdio transport. For HTTP, start the server and inspector separately as shown above.

**API Key Authentication:**

When `MCP_API_KEY` is set, all HTTP requests must include an `Authorization` header:

```bash
MCP_TRANSPORT=http MCP_API_KEY=my-secret-key npm start
```

Clients must then send:
```text
Authorization: Bearer my-secret-key
```

Requests without a valid key receive a `401 Unauthorized` response. Auth is only enforced in HTTP mode — stdio mode ignores `MCP_API_KEY` since only the parent process can communicate.

### Using with Docker

**Using pre-built images from Docker Hub:**

```bash
# Use the latest stable release
docker pull falkordb/mcpserver:latest
docker run -p 3000:3000 \
  -e FALKORDB_HOST=host.docker.internal \
  -e FALKORDB_PORT=6379 \
  -e MCP_API_KEY=your-secret-key \
  falkordb/mcpserver:latest

# Or use the edge version (latest main branch)
docker pull falkordb/mcpserver:edge

# Or pin to a specific version
docker pull falkordb/mcpserver:1.0.0
```

**Building locally:**

```bash
docker build -t falkordb-mcpserver .
docker run -p 3000:3000 \
  -e FALKORDB_HOST=host.docker.internal \
  -e FALKORDB_PORT=6379 \
  -e MCP_API_KEY=your-secret-key \
  falkordb-mcpserver
```

Or use with `docker-compose` alongside FalkorDB:

```yaml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"

  mcp-server:
    image: falkordb/mcpserver:latest  # or use 'build: .' to build locally
    ports:
      - "3000:3000"
    environment:
      - FALKORDB_HOST=falkordb
      - FALKORDB_PORT=6379
      - MCP_TRANSPORT=http
      - MCP_PORT=3000
      - MCP_API_KEY=your-secret-key
    depends_on:
      - falkordb
```

### Using with Remote FalkorDB

For cloud-hosted FalkorDB instances:

```env
FALKORDB_HOST=your-instance.falkordb.com
FALKORDB_PORT=6379
FALKORDB_USERNAME=your-username
FALKORDB_PASSWORD=your-secure-password
```

### Read-Only Mode for Replica Instances

If you're connecting to a FalkorDB replica instance or want to ensure no write operations are performed, you can enable read-only mode by default:

```env
FALKORDB_DEFAULT_READONLY=true
```

This will make all queries execute using `GRAPH.RO_QUERY` by default. You can still override this per-query by setting the `readOnly` parameter in the `query_graph` tool.

**Use cases:**
- **Replica instances**: Prevent writes to read replicas in replication setups
- **Production safety**: Ensure critical data isn't accidentally modified
- **Reporting/analytics**: Run queries for dashboards without risk of data changes
- **Multi-tenant environments**: Provide read-only access to certain users

### Running Multiple Instances

You can run multiple MCP servers for different FalkorDB instances:

```json
{
  "mcpServers": {
    "falkordb-dev": {
      "command": "node",
      "args": ["path/to/server/dist/index.js"],
      "env": {
        "FALKORDB_HOST": "dev.falkordb.local",
        "FALKORDB_DEFAULT_READONLY": "false"
      }
    },
    "falkordb-prod-replica": {
      "command": "node", 
      "args": ["path/to/server/dist/index.js"],
      "env": {
        "FALKORDB_HOST": "replica.falkordb.com",
        "FALKORDB_DEFAULT_READONLY": "true"
      }
    }
  }
}
```

## 📖 Example Usage

Here's what you can do once connected:

```cypher
// Claude can help you write queries like:
MATCH (p:Person)-[:KNOWS]->(friend:Person)
WHERE p.name = 'Alice'
RETURN friend.name, friend.age

// Or create complex data structures:
CREATE (alice:Person {name: 'Alice', age: 30})
CREATE (bob:Person {name: 'Bob', age: 25})
CREATE (alice)-[:KNOWS {since: 2020}]->(bob)

// And even analyze your graph:
MATCH path = shortestPath((start:Person)-[*]-(end:Person))
WHERE start.name = 'Alice' AND end.name = 'Charlie'
RETURN path
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the [Model Context Protocol SDK](https://github.com/anthropics/model-context-protocol)
- Powered by [FalkorDB](https://www.falkordb.com/)
- Inspired by the growing MCP ecosystem

## 🔗 Resources

- [FalkorDB Documentation](https://docs.falkordb.com)
- [MCP Specification](https://modelcontextprotocol.io/docs)
- [OpenCypher Query Language](https://opencypher.org/)

---

<p align="center">
  Made with ❤️ by the FalkorDB team & Katie Mulliken
</p>