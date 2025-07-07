import { falkorDBService } from './falkordb.service';

// Mock the FalkorDB library
jest.mock('falkordb', () => {
  const mockSelectGraph = jest.fn();
  const mockQuery = jest.fn();
  const mockList = jest.fn();
  const mockClose = jest.fn();
  const mockPing = jest.fn();
  
  return {
    FalkorDB: {
      connect: jest.fn().mockResolvedValue({
        connection: Promise.resolve({
          ping: mockPing
        }),
        selectGraph: mockSelectGraph.mockReturnValue({
          query: mockQuery
        }),
        list: mockList,
        close: mockClose
      })
    },
    mockSelectGraph,
    mockQuery,
    mockList,
    mockClose,
    mockPing
  };
});

describe('FalkorDB Service', () => {
  let mockFalkorDB: any;
  
  beforeAll(() => {
    // Access the mocks
    mockFalkorDB = require('falkordb');
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('executeQuery', () => {
    it('should execute a query on the specified graph', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const params = { param1: 'value1' };
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockQuery.mockResolvedValue(expectedResult);
      
      // Ensure service is initialized (private method, so we need to call a method first)
      await falkorDBService.executeQuery(graphName, query, params).catch(() => {});
      
      // Reset mocks after initialization
      jest.clearAllMocks();
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeQuery(graphName, query, params);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      // With the parameter substitution workaround, parameters are substituted into the query
      expect(mockFalkorDB.mockQuery).toHaveBeenCalledWith('MATCH (n) RETURN n');
      expect(result).toEqual(expectedResult);
    });
    
    it('should throw an error if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.executeQuery('graph', 'query'))
        .rejects
        .toThrow('FalkorDB client not initialized');
    });
  });
  
  describe('listGraphs', () => {
    it('should return a list of graphs', async () => {
      // Arrange
      const expectedGraphs = ['graph1', 'graph2'];
      mockFalkorDB.mockList.mockResolvedValue(expectedGraphs);
      
      // Force client to be available
      (falkorDBService as any).client = {
        list: mockFalkorDB.mockList
      };
      
      // Act
      const result = await falkorDBService.listGraphs();
      
      // Assert
      expect(mockFalkorDB.mockList).toHaveBeenCalled();
      expect(result).toEqual(expectedGraphs);
    });
    
    it('should throw an error if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.listGraphs())
        .rejects
        .toThrow('FalkorDB client not initialized');
    });
  });
  
  describe('close', () => {
    it('should close the client connection', async () => {
      // Arrange
      (falkorDBService as any).client = {
        close: mockFalkorDB.mockClose
      };
      
      // Act
      await falkorDBService.close();
      
      // Assert
      expect(mockFalkorDB.mockClose).toHaveBeenCalled();
      expect((falkorDBService as any).client).toBeNull();
    });
    
    it('should not throw if client is already null', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.close()).resolves.not.toThrow();
    });
  });
});