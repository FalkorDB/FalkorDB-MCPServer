[![Tests](https://img.shields.io/github/actions/workflow/status/falkordb/FalkorDB-MCPServer/node.yml?branch=main)](https://github.com/falkordb/FalkorDB-MCPServer/actions/workflows/node.yml)
[![Coverage](https://codecov.io/gh/falkordb/FalkorDB-MCPServer/branch/main/graph/badge.svg?token=nNxm2N0Xrl)](https://codecov.io/gh/falkordb/FalkorDB-MCPServer)
[![License](https://img.shields.io/github/license/falkordb/FalkorDB-MCPServer.svg)](https://github.com/falkordb/FalkorDB-MCPServer/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/1146782921294884966.svg?style=social&logo=discord)](https://discord.com/invite/99y2Ubh6tg)
[![Twitter](https://img.shields.io/twitter/follow/falkordb?style=social)](https://twitter.com/falkordb)

# FalkorDB MCP Server

[![Try Free](https://img.shields.io/badge/Try%20Free-FalkorDB%20Cloud-FF8101?labelColor=FDE900&style=for-the-badge&link=https://app.falkordb.cloud)](https://app.falkordb.cloud)

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

* `GET /api/mcp/metadata`: Get metadata about the FalkorDB instance and available capabilities
* `POST /api/mcp/context`: Execute queries against FalkorDB
* `GET /api/mcp/health`: Check server health
* `GET /api/mcp/graphs`: Returns the list of Graphs
* 

## MCP Configuration

To use this server with MCP clients, you can add it to your MCP configuration:

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

For client-side configuration:

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
