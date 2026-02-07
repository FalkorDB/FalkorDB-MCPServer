# FalkorDB MCP Server

A Model Context Protocol (MCP) server for FalkorDB, allowing AI models to query and interact with graph databases.

## Overview

This project implements a server that follows the Model Context Protocol (MCP) specification to connect AI models with FalkorDB graph databases. The server translates and routes MCP requests to FalkorDB and formats the responses according to the MCP standard.

## Prerequisites

* Node.js (v16 or later)
* npm or yarn
* FalkorDB instance (can be run locally or remotely)

## Installation

1. Clone this repository:

   ```bash
   git clone https://github.com/falkordb/falkordb-mcpserver.git
   cd falkordb-mcpserver
   ```
2. Install dependencies:

   ```bash
   npm install
   ```
3. Copy the example environment file and configure it:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration details.

## Configuration

Configuration is managed through environment variables in the `.env` file:

* `PORT`: Server port (default: 3000)
* `NODE_ENV`: Environment (development, production)
* `FALKORDB_HOST`: FalkorDB host (default: localhost)
* `FALKORDB_PORT`: FalkorDB port (default: 6379)
* `FALKORDB_USERNAME`: Username for FalkorDB authentication (if required)
* `FALKORDB_PASSWORD`: Password for FalkorDB authentication (if required)
* `MCP_API_KEY`: API key for authenticating MCP requests

## Usage

### Development

Start the development server with hot-reloading:

```bash
npm run dev
```

### Production

Build and start the server:

```bash
npm run build
npm start
```

## API Endpoints

### REST API Endpoints

* `GET /api/mcp/metadata`: Get metadata about the FalkorDB instance and available capabilities
* `POST /api/mcp/context`: Execute queries against FalkorDB
* `GET /api/mcp/health`: Check server health
* `GET /api/mcp/graphs`: Returns the list of Graphs

### MCP Protocol Endpoints (SSE Transport)

* `GET /api/sse`: Server-Sent Events endpoint for MCP protocol connections. This endpoint establishes a persistent SSE connection and returns the message endpoint URL with a unique session ID.
* `POST /api/messages?sessionId={sessionId}`: Message endpoint for MCP protocol communication. The `sessionId` query parameter is required and must match an active SSE session. Clients should use the message URL provided by the SSE handshake rather than constructing this URL manually.

## MCP Configuration

### Using SSE Transport (Recommended for Remote Servers)

For MCP clients that support HTTP/SSE transport (like Cline), configure as follows:

```json
{
  "mcpServers": {
    "falkordb": {
      "disabled": false,
      "autoApprove": [],
      "timeout": 60,
      "url": "http://localhost:3000/api/sse",
      "transportType": "http"
    }
  }
}
```

### Using Docker with stdio Transport

To use this server with MCP clients via stdio:

```json
{
  "mcpServers": {
    "falkordb": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-p", "3000:3000",
        "--env-file", ".env",
        "falkordb-mcpserver",
        "falkordb://host.docker.internal:6379"
      ]
    }
  }
}
```

### REST API Configuration

For client-side REST API configuration:

```json
{
  "defaultServer": "falkordb",
  "servers": {
    "falkordb": {
      "url": "http://localhost:3000/api/mcp",
      "apiKey": "your_api_key_here"
    }
  }
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
