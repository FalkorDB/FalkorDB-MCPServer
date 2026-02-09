import { parseFalkorDBConnectionString } from './connection-parser';

describe('Connection Parser Utility', () => {
  // Mock console.error to avoid noise in test output
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('parseFalkorDBConnectionString', () => {
    it('should return default options for empty string', () => {
      // Act
      const result = parseFalkorDBConnectionString('');
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 6379
      });
    });

    it('should return default options for undefined input', () => {
      // Act
      const result = parseFalkorDBConnectionString(undefined as any);
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 6379
      });
    });

    it('should return default options for null input', () => {
      // Act
      const result = parseFalkorDBConnectionString(null as any);
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 6379
      });
    });

    it('should parse simple host', () => {
      // Act
      const result = parseFalkorDBConnectionString('redis.example.com');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 6379
      });
    });

    it('should parse host with port', () => {
      // Act
      const result = parseFalkorDBConnectionString('redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234
      });
    });

    it('should parse host with invalid port (use default)', () => {
      // Act
      const result = parseFalkorDBConnectionString('redis.example.com:invalid');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 6379
      });
    });

    it('should parse connection string with protocol prefix', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234
      });
    });

    it('should parse connection string with username and password', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user:pass@redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234,
        username: 'user',
        password: 'pass'
      });
    });

    it('should parse connection string with only password', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://mypassword@redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234,
        password: 'mypassword'
      });
    });

    it('should parse connection string with empty username', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://:password@redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234,
        password: 'password'
      });
    });

    it('should parse connection string with empty password', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://username:@redis.example.com:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 1234,
        username: 'username'
      });
    });

    it('should handle missing host part with default', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 1234
      });
    });

    it('should handle missing port part with default', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://redis.example.com:');
      
      // Assert
      expect(result).toEqual({
        host: 'redis.example.com',
        port: 6379
      });
    });

    it('should handle auth with missing host part', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user:pass@:1234');
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 1234,
        username: 'user',
        password: 'pass'
      });
    });

    it('should handle complex real-world connection string', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://admin:secret123@prod-redis.company.com:16379');
      
      // Assert
      expect(result).toEqual({
        host: 'prod-redis.company.com',
        port: 16379,
        username: 'admin',
        password: 'secret123'
      });
    });

    it('should handle localhost with auth', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user:pass@localhost:6379');
      
      // Assert
      expect(result).toEqual({
        host: 'localhost',
        port: 6379,
        username: 'user',
        password: 'pass'
      });
    });

    it('should handle IPv4 address', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://192.168.1.100:6379');
      
      // Assert
      expect(result).toEqual({
        host: '192.168.1.100',
        port: 6379
      });
    });

    it('should handle IPv4 address with auth', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user:pass@192.168.1.100:6379');
      
      // Assert
      expect(result).toEqual({
        host: '192.168.1.100',
        port: 6379,
        username: 'user',
        password: 'pass'
      });
    });

    it('should return defaults on parsing error and log error', () => {
      // Arrange - create a scenario that might cause parsing issues
      // We'll simulate this by mocking parseInt to throw
      const originalParseInt = global.parseInt;
      global.parseInt = jest.fn(() => {
        throw new Error('Parsing error');
      });

      try {
        // Act
        const result = parseFalkorDBConnectionString('falkordb://host:port');
        
        // Assert
        expect(result).toEqual({
          host: 'localhost',
          port: 6379
        });
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error parsing connection string:', expect.any(Error));
      } finally {
        // Cleanup
        global.parseInt = originalParseInt;
      }
    });

    it('should handle edge case with multiple @ symbols', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user@domain:pass@host:1234');

      // Assert - after fixing parser to use lastIndexOf('@')
      expect(result).toEqual({
        host: 'host',
        port: 1234,
        username: 'user@domain',
        password: 'pass'
      });
    });

    it('should handle edge case with multiple : in auth', () => {
      // Act
      const result = parseFalkorDBConnectionString('falkordb://user:pass:extra@host:1234');

      // Assert - after fixing parser to properly rejoin password with multiple ':'
      expect(result).toEqual({
        host: 'host',
        port: 1234,
        username: 'user',
        password: 'pass:extra'
      });
    });
  });
});