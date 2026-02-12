import { Request, Response } from 'express';
import { falkorDBService } from '../services/falkordb.service';
import { mcpController } from './mcp.controller';

// Mock the falkorDBService
jest.mock('../services/falkordb.service', () => ({
  falkorDBService: {
    executeQuery: jest.fn(),
    listGraphs: jest.fn()
  }
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid')
}));

describe('MCP Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up response mock
    mockJson = jest.fn().mockReturnValue({});
    mockStatus = jest.fn().mockReturnThis();
    mockResponse = {
      json: mockJson,
      status: mockStatus,
      header: jest.fn().mockReturnThis()
    };
  });

  describe('processContextRequest', () => {
    test('should return 400 if query is missing', async () => {
      // Arrange
      mockRequest = {
        body: {
          graphName: 'testGraph'
        }
      };

      // Act
      await mcpController.processContextRequest(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Query is required' });
    });

    test('should return 400 if graphName is missing', async () => {
      // Arrange
      mockRequest = {
        body: {
          query: 'MATCH (n) RETURN n'
        }
      };

      // Act
      await mcpController.processContextRequest(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'Graph name is required' });
    });

    test('should execute query and return results', async () => {
      // Arrange
      const mockQueryResult = { data: [{ id: 1, name: 'test' }], metadata: {} };
      (falkorDBService.executeQuery as jest.Mock).mockResolvedValue(mockQueryResult);
      
      mockRequest = {
        body: {
          graphName: 'testGraph',
          query: 'MATCH (n) RETURN n',
          params: { param1: 'value1' }
        }
      };

      // Act
      await mcpController.processContextRequest(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(falkorDBService.executeQuery).toHaveBeenCalledWith(
        'testGraph',
        'MATCH (n) RETURN n',
        { param1: 'value1' }
      );
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        data: mockQueryResult,
        metadata: expect.any(Object)
      }));
    });
  });

  describe('listGraphs', () => {
    test('should return list of graphs', async () => {
      // Arrange
      const mockGraphs = ['graph1', 'graph2'];
      (falkorDBService.listGraphs as jest.Mock).mockResolvedValue(mockGraphs);
      
      mockRequest = {};

      // Act
      await mcpController.listGraphs(
        mockRequest as Request,
        mockResponse as Response
      );

      // Assert
      expect(falkorDBService.listGraphs).toHaveBeenCalled();
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'graph1' }),
          expect.objectContaining({ name: 'graph2' })
        ]),
        metadata: expect.objectContaining({
          count: 2
        })
      }));
    });
  });

  describe('initialize', () => {
    test('should return 400 if jsonrpc version is invalid', async () => {
      mockRequest = {
        body: {
          jsonrpc: '1.0',
          id: 1,
          method: 'initialize'
        }
      };

      await mcpController.initialize(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: -32600
        })
      }));
    });

    test('should initialize session successfully', async () => {
      mockRequest = {
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize'
        }
      };

      await mcpController.initialize(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.header).toHaveBeenCalledWith('Mcp-Session-Id', expect.any(String));
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({
          serverInfo: expect.objectContaining({
            name: 'FalkorDB MCP Server'
          })
        })
      }));
    });
  });

  describe('processMetadataRequest', () => {
    test('should return metadata', async () => {
      await mcpController.processMetadataRequest(mockRequest as Request, mockResponse as Response);

      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        provider: 'FalkorDB MCP Server',
        capabilities: expect.any(Array)
      }));
    });
  });

  describe('handleRpcRequest', () => {
    test('should delegate initialize', async () => {
      mockRequest = { body: { method: 'initialize', jsonrpc: '2.0', id: 1 } };
      const spy = jest.spyOn(mcpController, 'initialize');
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(spy).toHaveBeenCalled();
    });

    test('should handle notifications/initialized', async () => {
      mockRequest = { body: { method: 'notifications/initialized', jsonrpc: '2.0' } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ result: true }));
    });

    test('should handle ping', async () => {
      mockRequest = { body: { method: 'ping', jsonrpc: '2.0', id: 1 } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ result: {} }));
    });

    test('should handle tools/list', async () => {
      mockRequest = { body: { method: 'tools/list', jsonrpc: '2.0', id: 1 } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        result: expect.objectContaining({ tools: expect.any(Array) })
      }));
    });

    test('should handle resources/list', async () => {
      mockRequest = { body: { method: 'resources/list', jsonrpc: '2.0', id: 1 } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    test('should handle prompts/list', async () => {
      mockRequest = { body: { method: 'prompts/list', jsonrpc: '2.0', id: 1 } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200);
    });

    test('should return error for unknown method', async () => {
      mockRequest = { body: { method: 'unknown', jsonrpc: '2.0', id: 1 } };
      await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
      expect(mockStatus).toHaveBeenCalledWith(200); // It returns 200 with error body
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ code: -32601 })
      }));
    });

    describe('tools/call', () => {
      test('should return error if tool not found', async () => {
        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'unknown_tool', arguments: {} }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          error: expect.objectContaining({ code: -32601 })
        }));
      });

      test('graph_query success', async () => {
        (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [{ id: 1 }] });
        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'graph_query', arguments: { graphName: 'g', query: 'match n return n' } }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(falkorDBService.executeQuery).toHaveBeenCalledWith('g', 'match n return n', {});
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          result: expect.objectContaining({ content: expect.any(Array) })
        }));
      });

      test('list_graphs success', async () => {
        (falkorDBService.listGraphs as jest.Mock).mockResolvedValue(['g1']);
        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'list_graphs', arguments: {} }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(falkorDBService.listGraphs).toHaveBeenCalled();
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          result: expect.objectContaining({ content: expect.any(Array) })
        }));
      });

      test('get_graph_schema success', async () => {
        (falkorDBService.executeQuery as jest.Mock).mockImplementation((graph, query) => {
          if (query.includes('labels')) return Promise.resolve({ data: [{ label: 'Person' }] });
          if (query.includes('relationshipTypes')) return Promise.resolve({ data: [{ relationshipType: 'KNOWS' }] });
          if (query.includes('MATCH')) return Promise.resolve({ data: [] });
          return Promise.resolve({ data: [] });
        });

        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'get_graph_schema', arguments: { graphName: 'g' } }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          result: expect.objectContaining({ content: expect.any(Array) })
        }));
      });

      test('get_node_properties success', async () => {
        (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [{ props: {} }] });
        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'get_node_properties', arguments: { graphName: 'g', label: 'L' } }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          result: expect.objectContaining({ content: expect.any(Array) })
        }));
      });

      test('get_relationship_properties success', async () => {
        (falkorDBService.executeQuery as jest.Mock).mockResolvedValue({ data: [{ props: {} }] });
        mockRequest = {
          body: {
            method: 'tools/call',
            jsonrpc: '2.0',
            id: 1,
            params: { name: 'get_relationship_properties', arguments: { graphName: 'g', relationshipType: 'R' } }
          }
        };
        await mcpController.handleRpcRequest(mockRequest as Request, mockResponse as Response);
        expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
          result: expect.objectContaining({ content: expect.any(Array) })
        }));
      });
    });
  });
});