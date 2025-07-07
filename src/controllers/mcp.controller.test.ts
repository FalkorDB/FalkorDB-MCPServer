import { Request, Response } from 'express';
import { mcpController } from './mcp.controller';
import { falkorDBService } from '../services/falkordb.service';

// Mock the falkorDBService
jest.mock('../services/falkordb.service', () => ({
  falkorDBService: {
    executeQuery: jest.fn(),
    listGraphs: jest.fn()
  }
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
      status: mockStatus
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
      const mockQueryResult = { records: [{ id: 1, name: 'test' }] };
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
        { param1: 'value1' },
        undefined
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
      expect(falkorDBService.listGraphs).toHaveBeenCalledWith(undefined);
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
});