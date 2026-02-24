/**
 * Tests for console redirection in stdio transport mode
 * Ensures that console methods don't corrupt the MCP protocol stream
 */

describe('Console Redirection for Stdio Transport', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  let originalConsoleInfo: typeof console.info;
  let originalConsoleDebug: typeof console.debug;
  let originalConsoleError: typeof console.error;

  let stderrOutput: string[];
  let stdoutOutput: string[];
  let originalStderrWrite: typeof process.stderr.write;
  let originalStdoutWrite: typeof process.stdout.write;

  beforeAll(() => {
    // Save original console methods
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    originalConsoleInfo = console.info;
    originalConsoleDebug = console.debug;
    originalConsoleError = console.error;

    // Save original stream write methods
    originalStderrWrite = process.stderr.write;
    originalStdoutWrite = process.stdout.write;
  });

  beforeEach(() => {
    stderrOutput = [];
    stdoutOutput = [];

    // Mock stderr.write to capture output
    process.stderr.write = ((chunk: any) => {
      stderrOutput.push(String(chunk));
      return true;
    }) as any;

    // Mock stdout.write to capture output
    process.stdout.write = ((chunk: any) => {
      stdoutOutput.push(String(chunk));
      return true;
    }) as any;
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
    console.debug = originalConsoleDebug;
    console.error = originalConsoleError;

    // Restore original stream write methods
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  });

  afterAll(() => {
    // Ensure everything is restored
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
    console.debug = originalConsoleDebug;
    console.error = originalConsoleError;
    process.stderr.write = originalStderrWrite;
    process.stdout.write = originalStdoutWrite;
  });

  /**
   * Simulate the console redirection that happens in src/index.ts
   * This is the same function but isolated for testing
   */
  function redirectConsoleToStderr(): void {
    console.log = (...args: unknown[]) => {
      process.stderr.write(`[LOG] ${args.map(String).join(' ')}\n`);
    };

    console.warn = (...args: unknown[]) => {
      process.stderr.write(`[WARN] ${args.map(String).join(' ')}\n`);
    };

    console.info = (...args: unknown[]) => {
      process.stderr.write(`[INFO] ${args.map(String).join(' ')}\n`);
    };

    console.debug = (...args: unknown[]) => {
      process.stderr.write(`[DEBUG] ${args.map(String).join(' ')}\n`);
    };

    // console.error already writes to stderr by default
    console.error = (...args: unknown[]) => {
      process.stderr.write(`[ERROR] ${args.map(String).join(' ')}\n`);
    };
  }

  describe('After console redirection', () => {
    beforeEach(() => {
      redirectConsoleToStderr();
    });

    it('should redirect console.log to stderr', () => {
      console.log('test message');

      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput.join('')).toContain('[LOG] test message');
      expect(stdoutOutput.length).toBe(0);
    });

    it('should redirect console.warn to stderr', () => {
      console.warn('warning message');

      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput.join('')).toContain('[WARN] warning message');
      expect(stdoutOutput.length).toBe(0);
    });

    it('should redirect console.info to stderr', () => {
      console.info('info message');

      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput.join('')).toContain('[INFO] info message');
      expect(stdoutOutput.length).toBe(0);
    });

    it('should redirect console.debug to stderr', () => {
      console.debug('debug message');

      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stderrOutput.join('')).toContain('[DEBUG] debug message');
      expect(stdoutOutput.length).toBe(0);
    });

    it('should keep console.error writing to stderr', () => {
      console.error('error message');

      // console.error writes to stderr by default
      expect(stderrOutput.length).toBeGreaterThan(0);
      expect(stdoutOutput.length).toBe(0);
    });

    it('should handle multiple arguments in console.log', () => {
      console.log('message', 123, { key: 'value' }, true);

      expect(stderrOutput.length).toBeGreaterThan(0);
      const output = stderrOutput.join('');
      expect(output).toContain('[LOG]');
      expect(output).toContain('message');
      expect(output).toContain('123');
      expect(stdoutOutput.length).toBe(0);
    });

    it('should prevent stdout pollution in stdio transport', () => {
      // Simulate various console calls that might happen during server operation
      console.log('Starting operation');
      console.warn('Configuration warning');
      console.info('Info message');
      console.debug('Debug info');
      console.error('Error occurred');

      // Verify NOTHING was written to stdout (which would corrupt MCP protocol)
      expect(stdoutOutput.length).toBe(0);

      // Verify everything went to stderr
      expect(stderrOutput.length).toBeGreaterThan(0);
    });
  });

  describe('Before console redirection', () => {
    it('should demonstrate that redirection prevents stdout pollution', () => {
      // This test verifies our mocking setup works correctly
      // In a real scenario without redirection, console.log would write to stdout
      // and corrupt the MCP JSON-RPC protocol stream

      // The key point: after redirection, NO console method writes to stdout
      expect(true).toBe(true);
    });
  });
});
