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
  let getNodeSchemaHandler: any;
  let getRelationshipSchemaHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset shared mock config so these tests don't depend on state left by
    // earlier describe blocks (prevents order-dependent flakes).
    mockConfig = {
      falkorDB: {
        defaultReadOnly: false,
        strictReadOnly: false,
      }
    };

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'get_graph_schema') getGraphSchemaHandler = handler;
        if (name === 'get_node_schema') getNodeSchemaHandler = handler;
        if (name === 'get_relationship_schema') getRelationshipSchemaHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  describe('get_graph_schema', () => {
    it('should return schema with labels, relationship types, and connections', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ label: 'Person' }, { label: 'Movie' }] })
        .mockResolvedValueOnce({ data: [{ relationshipType: 'ACTED_IN' }] })
        .mockResolvedValueOnce({ data: [{ source: ['Person'], relationship: 'ACTED_IN', target: ['Movie'] }] });

      const result = await getGraphSchemaHandler({ graphName: 'myGraph' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.nodeLabels).toEqual(['Person', 'Movie']);
      expect(parsed.relationshipTypes).toEqual(['ACTED_IN']);
      expect(parsed.connections).toHaveLength(1);
      expect(parsed.connectionSampleSize).toBe(10000);
    });

    it('should execute all queries in read-only mode (never read-write)', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ label: 'Person' }] })
        .mockResolvedValueOnce({ data: [{ relationshipType: 'ACTED_IN' }] })
        .mockResolvedValueOnce({ data: [] });

      await getGraphSchemaHandler({ graphName: 'myGraph' });

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith('myGraph', 'CALL db.labels()');
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith('myGraph', 'CALL db.relationshipTypes()');
      expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
    });

    it('should bound the connection topology scan and honor a custom connectionSampleSize', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ label: 'Person' }] })
        .mockResolvedValueOnce({ data: [{ relationshipType: 'ACTED_IN' }] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getGraphSchemaHandler({ graphName: 'myGraph', connectionSampleSize: 250 });
      const parsed = JSON.parse(result.content[0].text);

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (a)-[r]->(b) WITH a, r, b LIMIT 250 RETURN DISTINCT labels(a) AS source, type(r) AS relationship, labels(b) AS target'
      );
      expect(parsed.connectionSampleSize).toBe(250);
    });

    it('should skip the connection topology scan when includeConnections is false', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ label: 'Person' }] })
        .mockResolvedValueOnce({ data: [{ relationshipType: 'ACTED_IN' }] });

      const result = await getGraphSchemaHandler({ graphName: 'myGraph', includeConnections: false });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.connections).toEqual([]);
      expect(parsed.connectionSampleSize).toBeUndefined();
      // only the labels and relationshipTypes queries run — no topology scan
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledTimes(2);
      expect(falkorDBService.executeReadOnlyQuery).not.toHaveBeenCalledWith(
        'myGraph',
        expect.stringContaining('MATCH (a)-[r]->(b)')
      );
    });

    it('should not throw when the driver returns a result without a data field', async () => {
      // falkordb GraphReply.data is optional (undefined for empty replies)
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ metadata: [] })
        .mockResolvedValueOnce({ metadata: [] })
        .mockResolvedValueOnce({ metadata: [] });

      const result = await getGraphSchemaHandler({ graphName: 'myGraph' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.nodeLabels).toEqual([]);
      expect(parsed.relationshipTypes).toEqual([]);
      expect(parsed.connections).toEqual([]);
    });

    it('should reject empty graph name', async () => {
      await expect(getGraphSchemaHandler({ graphName: '' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });

  describe('get_node_schema', () => {
    it('should aggregate properties ranked by frequency and report the actual sampled count', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({
          data: [
            { property: 'name', frequency: 98 },
            { property: 'age', frequency: 45 },
            { property: 'nickname', frequency: 3 },
          ]
        })
        .mockResolvedValueOnce({ data: [{ sampledCount: 98 }] });

      const result = await getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person' });
      const parsed = JSON.parse(result.content[0].text);

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 100 UNWIND keys(n) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 100 RETURN count(n) AS sampledCount'
      );
      expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
      expect(parsed.label).toBe('Person');
      expect(parsed.requestedSampleSize).toBe(100);
      expect(parsed.sampledCount).toBe(98);
      expect(parsed.properties[0]).toEqual({ property: 'name', frequency: 98 });
      expect(parsed.properties[2]).toEqual({ property: 'nickname', frequency: 3 });
    });

    it('should report sampledCount below requestedSampleSize when the graph has fewer nodes', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [{ property: 'name', frequency: 4 }] })
        .mockResolvedValueOnce({ data: [{ sampledCount: 4 }] });

      const result = await getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.requestedSampleSize).toBe(100);
      expect(parsed.sampledCount).toBe(4);
    });

    it('should default sampledCount to 0 when the count query returns no rows', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.sampledCount).toBe(0);
      expect(parsed.properties).toEqual([]);
    });

    it('should not throw when the driver returns results without a data field', async () => {
      // falkordb GraphReply.data is optional (undefined for empty replies)
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ metadata: [] })
        .mockResolvedValueOnce({ metadata: [] });

      const result = await getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.properties).toEqual([]);
      expect(parsed.sampledCount).toBe(0);
    });

    it('should respect a custom sampleSize', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [{ sampledCount: 0 }] });

      await getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person', sampleSize: 500 });

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 500 UNWIND keys(n) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH (n:Person) WITH n LIMIT 500 RETURN count(n) AS sampledCount'
      );
    });

    it('should reject invalid label characters', async () => {
      await expect(getNodeSchemaHandler({ graphName: 'myGraph', label: 'Person; DROP' }))
        .rejects.toThrow();
    });

    it('should reject empty graph name', async () => {
      await expect(getNodeSchemaHandler({ graphName: '', label: 'Person' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });

  describe('get_relationship_schema', () => {
    it('should aggregate properties ranked by frequency and report the actual sampled count', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({
          data: [
            { property: 'role', frequency: 72 },
            { property: 'year', frequency: 18 },
          ]
        })
        .mockResolvedValueOnce({ data: [{ sampledCount: 72 }] });

      const result = await getRelationshipSchemaHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN' });
      const parsed = JSON.parse(result.content[0].text);

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 100 UNWIND keys(r) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 100 RETURN count(r) AS sampledCount'
      );
      expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
      expect(parsed.relationshipType).toBe('ACTED_IN');
      expect(parsed.requestedSampleSize).toBe(100);
      expect(parsed.sampledCount).toBe(72);
      expect(parsed.properties[0]).toEqual({ property: 'role', frequency: 72 });
    });

    it('should respect a custom sampleSize', async () => {
      (falkorDBService.executeReadOnlyQuery as jest.Mock)
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [{ sampledCount: 0 }] });

      await getRelationshipSchemaHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN', sampleSize: 250 });

      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 250 UNWIND keys(r) AS property RETURN property, count(*) AS frequency ORDER BY frequency DESC'
      );
      expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
        'myGraph',
        'MATCH ()-[r:ACTED_IN]->() WITH r LIMIT 250 RETURN count(r) AS sampledCount'
      );
    });

    it('should reject invalid relationship type characters', async () => {
      await expect(getRelationshipSchemaHandler({ graphName: 'myGraph', relationshipType: 'ACTED_IN; DROP' }))
        .rejects.toThrow();
    });

    it('should reject empty graph name', async () => {
      await expect(getRelationshipSchemaHandler({ graphName: '', relationshipType: 'ACTED_IN' }))
        .rejects.toThrow('Graph name is required and cannot be empty');
    });
  });
});

describe('MCP Tools - query_graph params handling', () => {
  let server: McpServer;
  let queryGraphHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { falkorDB: { defaultReadOnly: false, strictReadOnly: false } };

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'query_graph') queryGraphHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  it('should forward params to executeQuery', async () => {
    (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [{ n: 1 }] });

    await queryGraphHandler({
      graphName: 'test',
      query: 'MATCH (n:Person {name: $name}) RETURN n',
      params: { name: 'Alice' },
    });

    expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
      'test',
      'MATCH (n:Person {name: $name}) RETURN n',
      { name: 'Alice' },
      false
    );
  });

  it('should pass undefined params when not provided', async () => {
    (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [] });

    await queryGraphHandler({ graphName: 'test', query: 'MATCH (n) RETURN n' });

    expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
      'test',
      'MATCH (n) RETURN n',
      undefined,
      false
    );
  });

  it('should pass numeric and boolean params correctly', async () => {
    (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [] });

    await queryGraphHandler({
      graphName: 'test',
      query: 'MATCH (n:Person) WHERE n.age > $minAge AND n.active = $active RETURN n',
      params: { minAge: 21, active: true },
    });

    expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
      'test',
      'MATCH (n:Person) WHERE n.age > $minAge AND n.active = $active RETURN n',
      { minAge: 21, active: true },
      false
    );
  });
});

describe('MCP Tools - query_graph_readonly', () => {
  let server: McpServer;
  let queryGraphReadonlyHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { falkorDB: { defaultReadOnly: false, strictReadOnly: false } };

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'query_graph_readonly') queryGraphReadonlyHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  it('should call executeReadOnlyQuery with graphName and query', async () => {
    const mockResult = { data: [{ n: { name: 'Alice' } }], metadata: [] };
    (falkorDBService.executeReadOnlyQuery as jest.Mock).mockResolvedValue(mockResult);

    const result = await queryGraphReadonlyHandler({
      graphName: 'myGraph',
      query: 'MATCH (n:Person) RETURN n',
    });

    expect(falkorDBService.executeReadOnlyQuery).toHaveBeenCalledWith(
      'myGraph',
      'MATCH (n:Person) RETURN n'
    );
    expect(falkorDBService.executeQuery).not.toHaveBeenCalled();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data[0].n.name).toBe('Alice');
  });

  it('should reject empty graph name', async () => {
    await expect(queryGraphReadonlyHandler({ graphName: '', query: 'MATCH (n) RETURN n' }))
      .rejects.toThrow('Graph name is required and cannot be empty');
  });

  it('should reject empty query', async () => {
    await expect(queryGraphReadonlyHandler({ graphName: 'myGraph', query: '' }))
      .rejects.toThrow('Query is required and cannot be empty');
  });

  it('should reject whitespace-only graph name', async () => {
    await expect(queryGraphReadonlyHandler({ graphName: '   ', query: 'MATCH (n) RETURN n' }))
      .rejects.toThrow('Graph name is required and cannot be empty');
  });

  it('should propagate service errors', async () => {
    (falkorDBService.executeReadOnlyQuery as jest.Mock).mockRejectedValue(
      new Error('Connection lost')
    );

    await expect(queryGraphReadonlyHandler({ graphName: 'myGraph', query: 'MATCH (n) RETURN n' }))
      .rejects.toThrow('Connection lost');
  });
});

describe('MCP Tools - list_graphs', () => {
  let server: McpServer;
  let listGraphsHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { falkorDB: { defaultReadOnly: false, strictReadOnly: false } };

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'list_graphs') listGraphsHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  it('should return newline-separated graph names', async () => {
    (falkorDBService.listGraphs as jest.Mock).mockResolvedValue(['graphA', 'graphB', 'graphC']);

    const result = await listGraphsHandler({});

    expect(falkorDBService.listGraphs).toHaveBeenCalled();
    expect(result.content[0].text).toBe('graphA\ngraphB\ngraphC');
  });

  it('should return empty string when no graphs exist', async () => {
    (falkorDBService.listGraphs as jest.Mock).mockResolvedValue([]);

    const result = await listGraphsHandler({});

    expect(result.content[0].text).toBe('');
  });

  it('should propagate service errors', async () => {
    (falkorDBService.listGraphs as jest.Mock).mockRejectedValue(new Error('DB unavailable'));

    await expect(listGraphsHandler({})).rejects.toThrow('DB unavailable');
  });
});

describe('MCP Tools - delete_graph', () => {
  let server: McpServer;
  let deleteGraphHandler: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = { falkorDB: { defaultReadOnly: false, strictReadOnly: false } };

    server = {
      registerTool: jest.fn((name, _schema, handler) => {
        if (name === 'delete_graph') deleteGraphHandler = handler;
      }),
    } as any;

    registerAllTools(server);
  });

  it('should delete the graph and return confirmation', async () => {
    (falkorDBService.deleteGraph as jest.Mock).mockResolvedValue(undefined);

    const result = await deleteGraphHandler({ graphName: 'myGraph', confirmDelete: true });

    expect(falkorDBService.deleteGraph).toHaveBeenCalledWith('myGraph');
    expect(result.content[0].text).toContain('myGraph');
  });

  it('should reject empty graph name', async () => {
    await expect(deleteGraphHandler({ graphName: '', confirmDelete: true }))
      .rejects.toThrow('Graph name is required and cannot be empty');

    expect(falkorDBService.deleteGraph).not.toHaveBeenCalled();
  });

  it('should reject whitespace-only graph name', async () => {
    await expect(deleteGraphHandler({ graphName: '   ', confirmDelete: true }))
      .rejects.toThrow('Graph name is required and cannot be empty');
  });

  it('should reject deletion in strict read-only mode', async () => {
    mockConfig.falkorDB.strictReadOnly = true;

    await expect(deleteGraphHandler({ graphName: 'myGraph', confirmDelete: true }))
      .rejects.toThrow('strict read-only mode');

    expect(falkorDBService.deleteGraph).not.toHaveBeenCalled();
  });

  it('should propagate service errors', async () => {
    (falkorDBService.deleteGraph as jest.Mock).mockRejectedValue(new Error('Graph not found'));

    await expect(deleteGraphHandler({ graphName: 'missing', confirmDelete: true }))
      .rejects.toThrow('Graph not found');
  });
});
