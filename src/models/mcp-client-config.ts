/**
 * MCP Client Configuration Types
 */

export interface MCPServerConfig {
    mcpServers: {
      [key: string]: {
        command: string;
        args: string[];
      };
    };
  }
  
  export interface MCPClientConfig {
    defaultServer?: string;
    servers: {
      [key: string]: {
        url: string;
        apiKey?: string;
      };
    };
  }
  
  /**
   * Sample MCP Client Configuration
   */
  export const sampleMCPClientConfig: MCPClientConfig = {
    defaultServer: "falkordb",
    servers: {
      "falkordb": {
        url: "http://localhost:8080",
        apiKey: "your_api_key_here"
      }
    }
  };
  
  /**
   * Sample MCP Server Configuration
   */
  export const sampleMCPServerConfig: MCPServerConfig = {
    mcpServers: {
      "falkordb": {
        command: "docker",
        args: [
          "run",
          "-i",
          "--rm",
          "-p", "8080:8080",
          "--env-file", ".env",
          "falkordb-mcpserver",
          "falkordb://host.docker.internal:6379"
        ]
      }
    }
  };