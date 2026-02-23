import { falkorDBService } from './falkordb.service';
import { AppError, CommonErrors } from '../errors/AppError.js';

// Mock the logger service
jest.mock('./logger.service.js', () => ({
  logger: {
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    debug: jest.fn().mockResolvedValue(undefined),
  }
}));

// Mock the config
jest.mock('../config/index.js', () => ({
  config: {
    falkorDB: {
      host: 'localhost',
      port: 6379,
      username: 'testuser',
      password: 'testpass',
      defaultReadOnly: false
    }
  }
}));

// Mock the FalkorDB library
jest.mock('falkordb', () => {
  const mockSelectGraph = jest.fn();
  const mockQuery = jest.fn();
  const mockRoQuery = jest.fn();
  const mockList = jest.fn();
  const mockClose = jest.fn();
  const mockPing = jest.fn();
  const mockDelete = jest.fn();
  
  return {
    FalkorDB: {
      connect: jest.fn().mockResolvedValue({
        connection: Promise.resolve({
          ping: mockPing
        }),
        selectGraph: mockSelectGraph.mockReturnValue({
          query: mockQuery,
          roQuery: mockRoQuery,
          delete: mockDelete
        }),
        list: mockList,
        close: mockClose
      })
    },
    mockSelectGraph,
    mockQuery,
    mockRoQuery,
    mockList,
    mockClose,
    mockPing,
    mockDelete
  };
});

describe('FalkorDB Service', () => {
  let mockFalkorDB: any;
  
  beforeAll(async () => {
    // Access the mocks
    mockFalkorDB = await import('falkordb');
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset service state
    (falkorDBService as any).client = null;
    (falkorDBService as any).retryCount = 0;
    (falkorDBService as any).initializingPromise = null;
  });

  describe('initialize', () => {
    it('should successfully initialize and connect to FalkorDB', async () => {
      // Arrange
      mockFalkorDB.FalkorDB.connect.mockResolvedValue({
        connection: Promise.resolve({
          ping: mockFalkorDB.mockPing.mockResolvedValue('PONG')
        }),
        selectGraph: mockFalkorDB.mockSelectGraph,
        list: mockFalkorDB.mockList,
        close: mockFalkorDB.mockClose
      });

      // Act
      await falkorDBService.initialize();

      // Assert
      expect(mockFalkorDB.FalkorDB.connect).toHaveBeenCalledWith({
        socket: {
          host: 'localhost',
          port: 6379,
        },
        password: 'testpass',
        username: 'testuser',
      });
      expect(mockFalkorDB.mockPing).toHaveBeenCalled();
      expect((falkorDBService as any).client).not.toBeNull();
      expect((falkorDBService as any).retryCount).toBe(0);
      expect((falkorDBService as any).initializingPromise).toBeNull();
    });

    it('should await ongoing initialization if already initializing', async () => {
      // Arrange
      mockFalkorDB.FalkorDB.connect.mockResolvedValue({
        connection: Promise.resolve({
          ping: mockFalkorDB.mockPing.mockResolvedValue('PONG')
        }),
        selectGraph: mockFalkorDB.mockSelectGraph,
        list: mockFalkorDB.mockList,
        close: mockFalkorDB.mockClose
      });

      // Act - start two initializations concurrently
      const init1 = falkorDBService.initialize();
      const init2 = falkorDBService.initialize();

      await Promise.all([init1, init2]);

      // Assert - connect should only be called once
      expect(mockFalkorDB.FalkorDB.connect).toHaveBeenCalledTimes(1);
      expect((falkorDBService as any).client).not.toBeNull();
    });

    it('should retry connection on failure and eventually succeed', async () => {
      // Arrange
      const connectError = new Error('Connection failed');
      mockFalkorDB.FalkorDB.connect
        .mockRejectedValueOnce(connectError)
        .mockRejectedValueOnce(connectError)
        .mockResolvedValueOnce({
          connection: Promise.resolve({
            ping: mockFalkorDB.mockPing.mockResolvedValue('PONG')
          }),
          selectGraph: mockFalkorDB.mockSelectGraph,
          list: mockFalkorDB.mockList,
          close: mockFalkorDB.mockClose
        });

      // Mock setTimeout to avoid actual delays
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        setImmediate(callback);
        return {} as any;
      });

      // Act
      await falkorDBService.initialize();

      // Assert
      expect(mockFalkorDB.FalkorDB.connect).toHaveBeenCalledTimes(3);
      expect((falkorDBService as any).client).not.toBeNull();
      expect((falkorDBService as any).retryCount).toBe(0);

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    it('should throw AppError after max retries exceeded', async () => {
      // Arrange
      const connectError = new Error('Connection failed');
      mockFalkorDB.FalkorDB.connect.mockRejectedValue(connectError);

      // Mock setTimeout to avoid actual delays
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        setImmediate(callback);
        return {} as any;
      });

      // Act & Assert
      try {
        await falkorDBService.initialize();
        fail('Expected initialize to throw AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.CONNECTION_FAILED);
      }
      
      expect(mockFalkorDB.FalkorDB.connect).toHaveBeenCalledTimes(6); // 1 initial + 5 retries

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    it('should handle ping failure during connection test', async () => {
      // Arrange
      const pingError = new Error('Ping failed');
      mockFalkorDB.FalkorDB.connect.mockResolvedValue({
        connection: Promise.resolve({
          ping: mockFalkorDB.mockPing.mockRejectedValue(pingError)
        }),
        selectGraph: mockFalkorDB.mockSelectGraph,
        list: mockFalkorDB.mockList,
        close: mockFalkorDB.mockClose
      });

      // Mock setTimeout to avoid actual delays
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((callback: any) => {
        setImmediate(callback);
        return {} as any;
      });

      // Act & Assert
      await expect(falkorDBService.initialize()).rejects.toThrow(AppError);

      // Cleanup
      setTimeoutSpy.mockRestore();
    });
  });
  
  describe('executeQuery', () => {
    it('should execute a query on the specified graph', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const params = { param1: 'value1' };
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockQuery.mockResolvedValue(expectedResult);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeQuery(graphName, query, params);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockQuery).toHaveBeenCalledWith(query, params);
      expect(mockFalkorDB.mockRoQuery).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should execute a query without params', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockQuery.mockResolvedValue(expectedResult);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeQuery(graphName, query);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockQuery).toHaveBeenCalledWith(query, undefined);
      expect(result).toEqual(expectedResult);
    });

    it('should execute a read-only query when readOnly flag is true', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const params = { param1: 'value1' };
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockRoQuery.mockResolvedValue(expectedResult);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeQuery(graphName, query, params, true);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockRoQuery).toHaveBeenCalledWith(query, params);
      expect(mockFalkorDB.mockQuery).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should execute a read-only query without params', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockRoQuery.mockResolvedValue(expectedResult);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeQuery(graphName, query, undefined, true);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockRoQuery).toHaveBeenCalledWith(query, undefined);
      expect(mockFalkorDB.mockQuery).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });
    
    it('should throw AppError if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.executeQuery('graph', 'query'))
        .rejects
        .toThrow(AppError);
      await expect(falkorDBService.executeQuery('graph', 'query'))
        .rejects
        .toThrow('FalkorDB client not initialized');
    });

    it('should throw AppError when query execution fails', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'INVALID QUERY';
      const queryError = new Error('Query syntax error');
      
      mockFalkorDB.mockQuery.mockRejectedValue(queryError);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act & Assert
      try {
        await falkorDBService.executeQuery(graphName, query);
        fail('Expected executeQuery to throw AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.OPERATION_FAILED);
      }
    });

    it('should throw AppError when read-only query execution fails', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'CREATE (n) RETURN n';
      const queryError = new Error('Write operations not allowed in read-only mode');
      
      mockFalkorDB.mockRoQuery.mockRejectedValue(queryError);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act & Assert
      try {
        await falkorDBService.executeQuery(graphName, query, undefined, true);
        fail('Expected executeQuery to throw AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.OPERATION_FAILED);
        expect((error as AppError).message).toContain('read-only');
      }
    });
  });

  describe('executeReadOnlyQuery', () => {
    it('should execute a read-only query using ro_query', async () => {
      // Arrange
      const graphName = 'testGraph';
      const query = 'MATCH (n) RETURN n';
      const params = { param1: 'value1' };
      const expectedResult = { records: [{ id: 1 }] };
      
      mockFalkorDB.mockRoQuery.mockResolvedValue(expectedResult);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      const result = await falkorDBService.executeReadOnlyQuery(graphName, query, params);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockRoQuery).toHaveBeenCalledWith(query, params);
      expect(mockFalkorDB.mockQuery).not.toHaveBeenCalled();
      expect(result).toEqual(expectedResult);
    });

    it('should throw AppError if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.executeReadOnlyQuery('graph', 'query'))
        .rejects
        .toThrow(AppError);
      await expect(falkorDBService.executeReadOnlyQuery('graph', 'query'))
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

    it('should return empty array when no graphs exist', async () => {
      // Arrange
      const expectedGraphs: string[] = [];
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
    
    it('should throw AppError if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.listGraphs())
        .rejects
        .toThrow(AppError);
      await expect(falkorDBService.listGraphs())
        .rejects
        .toThrow('FalkorDB client not initialized');
    });

    it('should throw AppError when listing graphs fails', async () => {
      // Arrange
      const listError = new Error('Database connection lost');
      mockFalkorDB.mockList.mockRejectedValue(listError);
      
      // Force client to be available
      (falkorDBService as any).client = {
        list: mockFalkorDB.mockList
      };
      
      // Act & Assert
      try {
        await falkorDBService.listGraphs();
        fail('Expected listGraphs to throw AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.OPERATION_FAILED);
      }
    });
  });

  describe('deleteGraph', () => {
    it('should delete a graph successfully', async () => {
      // Arrange
      const graphName = 'testGraph';
      mockFalkorDB.mockDelete.mockResolvedValue(undefined);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act
      await falkorDBService.deleteGraph(graphName);
      
      // Assert
      expect(mockFalkorDB.mockSelectGraph).toHaveBeenCalledWith(graphName);
      expect(mockFalkorDB.mockDelete).toHaveBeenCalled();
    });

    it('should throw AppError if client is not initialized', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.deleteGraph('testGraph'))
        .rejects
        .toThrow(AppError);
      await expect(falkorDBService.deleteGraph('testGraph'))
        .rejects
        .toThrow('FalkorDB client not initialized');
    });

    it('should throw AppError when delete operation fails', async () => {
      // Arrange
      const graphName = 'testGraph';
      const deleteError = new Error('Graph not found');
      mockFalkorDB.mockDelete.mockRejectedValue(deleteError);
      
      // Force client to be available
      (falkorDBService as any).client = {
        selectGraph: mockFalkorDB.mockSelectGraph
      };
      
      // Act & Assert
      try {
        await falkorDBService.deleteGraph(graphName);
        fail('Expected deleteGraph to throw AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).name).toBe(CommonErrors.OPERATION_FAILED);
      }
    });
  });
  
  describe('close', () => {
    it('should close the client connection successfully', async () => {
      // Arrange
      mockFalkorDB.mockClose.mockResolvedValue(undefined);
      (falkorDBService as any).client = {
        close: mockFalkorDB.mockClose
      };
      (falkorDBService as any).retryCount = 3;
      
      // Act
      await falkorDBService.close();
      
      // Assert
      expect(mockFalkorDB.mockClose).toHaveBeenCalled();
      expect((falkorDBService as any).client).toBeNull();
      expect((falkorDBService as any).retryCount).toBe(0);
    });

    it('should handle close error gracefully', async () => {
      // Arrange
      const closeError = new Error('Close failed');
      mockFalkorDB.mockClose.mockRejectedValue(closeError);
      (falkorDBService as any).client = {
        close: mockFalkorDB.mockClose
      };
      (falkorDBService as any).retryCount = 2;
      
      // Act
      await falkorDBService.close();
      
      // Assert
      expect(mockFalkorDB.mockClose).toHaveBeenCalled();
      expect((falkorDBService as any).client).toBeNull();
      expect((falkorDBService as any).retryCount).toBe(0);
    });
    
    it('should not throw if client is already null', async () => {
      // Arrange
      (falkorDBService as any).client = null;
      
      // Act & Assert
      await expect(falkorDBService.close()).resolves.not.toThrow();
      expect(mockFalkorDB.mockClose).not.toHaveBeenCalled();
    });
  });
});