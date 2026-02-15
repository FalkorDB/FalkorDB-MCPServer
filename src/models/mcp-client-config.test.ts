import { 
  MCPServerConfig, 
  MCPClientConfig, 
  sampleMCPClientConfig, 
  sampleMCPServerConfig 
} from './mcp-client-config';

describe('MCP Client Configuration Models', () => {
  describe('Type Definitions', () => {
    it('should define MCPServerConfig interface correctly', () => {
      // Arrange
      const config: MCPServerConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js']
          }
        }
      };
      
      // Assert - TypeScript compilation validates the interface
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['test-server'].command).toBe('node');
      expect(config.mcpServers['test-server'].args).toEqual(['server.js']);
    });

    it('should define MCPClientConfig interface correctly', () => {
      // Arrange
      const config: MCPClientConfig = {
        defaultServer: 'test',
        servers: {
          'test': {
            url: 'http://localhost:3000',
            apiKey: 'secret'
          }
        }
      };
      
      // Assert - TypeScript compilation validates the interface
      expect(config.defaultServer).toBe('test');
      expect(config.servers).toBeDefined();
      expect(config.servers['test'].url).toBe('http://localhost:3000');
      expect(config.servers['test'].apiKey).toBe('secret');
    });

    it('should allow optional properties in MCPClientConfig', () => {
      // Arrange
      const configWithoutDefaults: MCPClientConfig = {
        servers: {
          'test': {
            url: 'http://localhost:3000'
            // apiKey is optional
          }
        }
        // defaultServer is optional
      };
      
      // Assert
      expect(configWithoutDefaults.defaultServer).toBeUndefined();
      expect(configWithoutDefaults.servers['test'].apiKey).toBeUndefined();
      expect(configWithoutDefaults.servers['test'].url).toBe('http://localhost:3000');
    });
  });

  describe('Sample Configurations', () => {
    describe('sampleMCPClientConfig', () => {
      it('should have correct structure and values', () => {
        // Assert
        expect(sampleMCPClientConfig).toBeDefined();
        expect(sampleMCPClientConfig.defaultServer).toBe('falkordb');
        expect(sampleMCPClientConfig.servers).toBeDefined();
        expect(sampleMCPClientConfig.servers.falkordb).toBeDefined();
        expect(sampleMCPClientConfig.servers.falkordb.url).toBe('http://localhost:3000/api/mcp');
        expect(sampleMCPClientConfig.servers.falkordb.apiKey).toBe('your_api_key_here');
      });

      it('should be a valid MCPClientConfig', () => {
        // Act - assign to typed variable to ensure type compliance
        const config: MCPClientConfig = sampleMCPClientConfig;
        
        // Assert
        expect(config).toBe(sampleMCPClientConfig);
      });

      it('should be immutable reference', () => {
        // Act - get multiple references
        const ref1 = sampleMCPClientConfig;
        const ref2 = sampleMCPClientConfig;
        
        // Assert
        expect(ref1).toBe(ref2);
      });
    });

    describe('sampleMCPServerConfig', () => {
      it('should have correct structure and values', () => {
        // Assert
        expect(sampleMCPServerConfig).toBeDefined();
        expect(sampleMCPServerConfig.mcpServers).toBeDefined();
        expect(sampleMCPServerConfig.mcpServers.falkordb).toBeDefined();
        expect(sampleMCPServerConfig.mcpServers.falkordb.command).toBe('docker');
        expect(sampleMCPServerConfig.mcpServers.falkordb.args).toBeInstanceOf(Array);
      });

      it('should have correct docker arguments', () => {
        // Arrange
        const expectedArgs = [
          'run',
          '-i',
          '--rm',
          '-p', '3000:3000',
          '--env-file', '.env',
          'falkordb-mcpserver',
          'falkordb://host.docker.internal:6379'
        ];
        
        // Assert
        expect(sampleMCPServerConfig.mcpServers.falkordb.args).toEqual(expectedArgs);
      });

      it('should be a valid MCPServerConfig', () => {
        // Act - assign to typed variable to ensure type compliance
        const config: MCPServerConfig = sampleMCPServerConfig;
        
        // Assert
        expect(config).toBe(sampleMCPServerConfig);
      });

      it('should include Docker container configuration', () => {
        // Arrange
        const falkordbConfig = sampleMCPServerConfig.mcpServers.falkordb;
        
        // Assert
        expect(falkordbConfig.command).toBe('docker');
        expect(falkordbConfig.args).toContain('run');
        expect(falkordbConfig.args).toContain('falkordb-mcpserver');
        expect(falkordbConfig.args).toContain('falkordb://host.docker.internal:6379');
        expect(falkordbConfig.args).toContain('-p');
        expect(falkordbConfig.args).toContain('3000:3000');
        expect(falkordbConfig.args).toContain('--env-file');
        expect(falkordbConfig.args).toContain('.env');
      });
    });
  });

  describe('Configuration Usage Examples', () => {
    it('should support multiple servers in client config', () => {
      // Arrange
      const multiServerConfig: MCPClientConfig = {
        defaultServer: 'primary',
        servers: {
          'primary': {
            url: 'http://localhost:3000/api/mcp',
            apiKey: 'primary-key'
          },
          'backup': {
            url: 'http://backup.example.com/api/mcp',
            apiKey: 'backup-key'
          },
          'dev': {
            url: 'http://dev.localhost:3001/api/mcp'
            // No API key for dev
          }
        }
      };
      
      // Assert
      expect(Object.keys(multiServerConfig.servers)).toHaveLength(3);
      expect(multiServerConfig.servers.primary.apiKey).toBeDefined();
      expect(multiServerConfig.servers.backup.apiKey).toBeDefined();
      expect(multiServerConfig.servers.dev.apiKey).toBeUndefined();
    });

    it('should support multiple server processes in server config', () => {
      // Arrange
      const multiProcessConfig: MCPServerConfig = {
        mcpServers: {
          'falkordb-main': {
            command: 'node',
            args: ['dist/index.js']
          },
          'falkordb-worker': {
            command: 'node',
            args: ['dist/worker.js', '--port', '3001']
          },
          'falkordb-docker': {
            command: 'docker',
            args: ['run', '-p', '3002:3000', 'falkordb-mcpserver']
          }
        }
      };
      
      // Assert
      expect(Object.keys(multiProcessConfig.mcpServers)).toHaveLength(3);
      expect(multiProcessConfig.mcpServers['falkordb-main'].command).toBe('node');
      expect(multiProcessConfig.mcpServers['falkordb-worker'].args).toContain('--port');
      expect(multiProcessConfig.mcpServers['falkordb-docker'].command).toBe('docker');
    });
  });
});