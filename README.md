# FalkorDB MCP Server

> 🚀 **Connect AI models to FalkorDB graph databases through the Model Context Protocol**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)

FalkorDB MCP Server enables AI assistants like Claude to interact with FalkorDB graph databases using natural language. Query your graph data, create relationships, and manage your knowledge graph - all through conversational AI.

## 🎯 What is this?

This server implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing AI models to:
- **Query graph databases** using OpenCypher (with read-only mode support)
- **Create and manage** nodes and relationships
- **Store and retrieve** key-value data
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
        "falkordb-mcpserver@latest"
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

### Installation

1. **Clone and install:**
   ```bash
   git clone https://github.com/SecKatie/falkordb-mcpserver.git
   cd falkordb-mcpserver
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
   
   # Redis Configuration (for key-value operations)
   REDIS_URL=redis://localhost:6379
   REDIS_USERNAME=       # Optional
   REDIS_PASSWORD=       # Optional
   
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
```
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
```
"Create a new person named Alice who knows Bob"
"Add a 'WORKS_AT' relationship between Alice and TechCorp"
"Store my API key in the database"
```

### 📊 Explore Structure
```
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

```
src/
├── index.ts                   # MCP server entry point
├── services/                  # Core business logic
│   ├── falkordb.service.ts   # FalkorDB operations
│   ├── redis.service.ts      # Key-value operations
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