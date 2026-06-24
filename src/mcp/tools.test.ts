import { AppError, CommonErrors } from '../errors/AppError.js';

// Mock the logger service
jest.mock('../services/logger.service.js', () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn().mockResolvedValue(undefined),
  }
}));

// Mock the FalkorDB service
jest.mock('../services/falkordb.service.js', () => ({
  falkorDBService: {
    executeQuery: jest.fn(),
    executeReadOnlyQuery: jest.fn(),
    listGraphs: jest.fn(),
    deleteGraph: jest.fn(),
  }
}));

// Mock config with different scenarios
let mockConfig = {
  falkorDB: {
    defaultReadOnly: false,
    strictReadOnly: false,
  }
};

jest.mock('../config/index.js', () => ({
  get config() {
    return mockConfig;
  }
}));

// Import after mocks are set up
import registerAllTools from './tools.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { falkorDBService } from '../services/falkordb.service.js';

describe('MCP Tools - Strict Read-Only Mode', () => {
  let server: McpServer;
  let queryGraphHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock config
    mockConfig = {
      falkorDB: {
        defaultReadOnly: false,
        strictReadOnly: false,
      }
    };

    // Create a minimal mock server that captures tool handlers
    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'query_graph') queryGraphHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  describe('query_graph tool with strictReadOnly=false', () => {
    beforeEach(() => {
      mockConfig.falkorDB.strictReadOnly = false;
      mockConfig.falkorDB.defaultReadOnly = false;
    });

    it('should allow readOnly=false when strictReadOnly is disabled', async () => {
      const mockResult = { records: [] };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockResult);

      await queryGraphHandler({
        graphName: 'test',
        query: 'CREATE (n:Test) RETURN n',
        readOnly: false,
      });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'test',
        'CREATE (n:Test) RETURN n',
        undefined,
        false
      );
    });

    it('should allow readOnly=true when strictReadOnly is disabled', async () => {
      const mockResult = { records: [] };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockResult);

      await queryGraphHandler({
        graphName: 'test',
        query: 'MATCH (n) RETURN n',
        readOnly: true,
      });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'test',
        'MATCH (n) RETURN n',
        undefined,
        true
      );
    });

    it('should use default when readOnly is not specified', async () => {
      const mockResult = { records: [] };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockResult);

      await queryGraphHandler({
        graphName: 'test',
        query: 'MATCH (n) RETURN n',
      });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'test',
        'MATCH (n) RETURN n',
        undefined,
        false
      );
    });
  });

  describe('query_graph tool with strictReadOnly=true', () => {
    beforeEach(() => {
      mockConfig.falkorDB.strictReadOnly = true;
      mockConfig.falkorDB.defaultReadOnly = true;
    });

    it('should reject readOnly=false when strictReadOnly is enabled', async () => {
      await expect(
        queryGraphHandler({
          graphName: 'test',
          query: 'CREATE (n:Test) RETURN n',
          readOnly: false,
        })
      ).rejects.toThrow(AppError);

      await expect(
        queryGraphHandler({
          graphName: 'test',
          query: 'CREATE (n:Test) RETURN n',
          readOnly: false,
        })
      ).rejects.toThrow('strict read-only mode');

      expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
    });

    it('should allow readOnly=true when strictReadOnly is enabled', async () => {
      const mockResult = { records: [] };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockResult);

      await queryGraphHandler({
        graphName: 'test',
        query: 'MATCH (n) RETURN n',
        readOnly: true,
      });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'test',
        'MATCH (n) RETURN n',
        undefined,
        true
      );
    });

    it('should use defaultReadOnly when readOnly is not specified in strict mode', async () => {
      const mockResult = { records: [] };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockResult);

      await queryGraphHandler({
        graphName: 'test',
        query: 'MATCH (n) RETURN n',
      });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'test',
        'MATCH (n) RETURN n',
        undefined,
        true
      );
    });

    it('should include proper error information when rejecting write queries', async () => {
      try {
        await queryGraphHandler({
          graphName: 'test',
          query: 'CREATE (n:Test) RETURN n',
          readOnly: false,
        });
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.INVALID_INPUT);
        expect((error as AppError).message).toContain('FALKORDB_STRICT_READONLY=true');
      }
    });

    it('should reject write queries when strictReadOnly is enabled and defaultReadOnly=false and readOnly is not specified', async () => {
      // Override defaultReadOnly for this specific test case
      mockConfig.falkorDB.defaultReadOnly = false;

      await expect(
        queryGraphHandler({
          graphName: 'test',
          query: 'CREATE (n:Test) RETURN n',
        })
      ).rejects.toThrow(AppError);

      await expect(
        queryGraphHandler({
          graphName: 'test',
          query: 'CREATE (n:Test) RETURN n',
        })
      ).rejects.toThrow('strict read-only mode');

      expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
    });
  });

  describe('query_graph tool input validation', () => {
    it('should reject empty graph name', async () => {
      await expect(
        queryGraphHandler({
          graphName: '',
          query: 'MATCH (n) RETURN n',
        })
      ).rejects.toThrow('Graph name is required and cannot be empty');
    });

    it('should reject empty query', async () => {
      await expect(
        queryGraphHandler({
          graphName: 'test',
          query: '',
        })
      ).rejects.toThrow('Query is required and cannot be empty');
    });
  });
});

describe('MCP Schema Tools', () => {
  let server: McpServer;
  let getGraphSchemaHandler: any;
  let getNodePropertiesHandler: any;
  let getRelationshipPropertiesHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'get_graph_schema') getGraphSchemaHandler = handler;
        if (name === 'get_node_schema') getNodePropertiesHandler = handler;
        if (name === 'get_relationship_schema') getRelationshipPropertiesHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  describe('get_graph_schema', () => {
    it('should return schema with labels, relationship types, and connections', async () => {
      (falkorDBService.executeQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ label: 'Person' }, { label: 'Movie' }] })
        .mockResolvedValueOnce({ data: [{ relationshipType: 'ACTED_IN' }] })
        .mockResolvedValueOnce({ data: [{ source: ['Person'], relationship: 'ACTED_IN', target: ['Movie'] }] });

      const result = await getGraphSchemaHandler({ graphName: 'myGraph' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.nodeLabels).toEqual(['Person', 'Movie']);
      expect(parsed.relationshipTypes).toEqual(['ACTED_IN']);
      expect(parsed.connections).toHaveLength(1);
    });

    it('should reject empty graph name', async () => {
      await expect(getGraphSchemaHandler({ graphName: '' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });

  describe('get_node_properties', () => {
    it('should aggregate properties across sampled nodes ranked by frequency', async () => {
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({
        data: [
          { property: 'name', frequency: 98 },
          { property: 'age', frequency: 45 },
          { property: 'nickname', frequency: 3 },
        ]
      });

      const result = await getNodePropertiesHandler({ graphName: 'myGraph', label: 'Person' });
      const parsed = JSON.parse(result.content[0].text);

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 100 UNWIND keys(n) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(parsed.label).toBe('Person');
      expect(parsed.sampleSize).toBe(100);
      expect(parsed.properties[0]).toEqual({ property: 'name', frequency: 98 });
      expect(parsed.properties[2]).toEqual({ property: 'nickname', frequency: 3 });
    });

    it('should respect a custom sampleSize', async () => {
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [] });

      await getNodePropertiesHandler({ graphName: 'myGraph', label: 'Person', sampleSize: 500 });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 500 UNWIND keys(n) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
    });

    it('should reject invalid label characters', async () => {
      await expect(getNodePropertiesHandler({ graphName: 'myGraph', label: 'Person; DROP' }))
        .rejects.toThrow();
    });

    it('should reject empty graph name', async () => {
      await expect(getNodePropertiesHandler({ graphName: '', label: 'Person' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });

  describe('get_relationship_properties', () => {
    it('should aggregate properties across sampled relationships ranked by frequency', async () => {
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({
        data: [
          { property: 'role', frequency: 72 },
          { property: 'year', frequency: 18 },
        ]
      });

      const result = await getRelationshipPropertiesHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN' });
      const parsed = JSON.parse(result.content[0].text);

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 100 UNWIND keys(r) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(parsed.relationshipType).toBe('ACTED_IN');
      expect(parsed.sampleSize).toBe(100);
      expect(parsed.properties[0]).toEqual({ property: 'role', frequency: 72 });
    });

    it('should respect a custom sampleSize', async () => {
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [] });

      await getRelationshipPropertiesHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN', sampleSize: 250 });

      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 250 UNWIND keys(r) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
    });

    it('should reject invalid relationship type characters', async () => {
      await expect(getRelationshipPropertiesHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN; DROP' }))
        .rejects.toThrow();
    });

    it('should reject empty graph name', async () => {
      await expect(getRelationshipPropertiesHandler({ graphName: '', relationshipType: 'ACTED_IN' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });
});
