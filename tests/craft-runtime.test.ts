import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CraftConnection } from '../src/craft-config.js';
import { craftCallOnce, createCraftClient, createCraftRuntime } from '../src/craft-runtime.js';
import type { Runtime } from '../src/runtime.js';

// Mock dependencies
const mocks = vi.hoisted(() => {
  const mockGetConnection = vi.fn();
  const mockGetDefaultConnection = vi.fn();
  const mockResolveConnection = vi.fn();
  const mockValidateCraftUrl = vi.fn();
  const mockCallTool = vi.fn();
  const mockListTools = vi.fn();
  const mockClose = vi.fn();
  const mockGetDefinition = vi.fn();
  return {
    mockGetConnection,
    mockGetDefaultConnection,
    mockResolveConnection,
    mockValidateCraftUrl,
    mockCallTool,
    mockListTools,
    mockClose,
    mockGetDefinition,
  };
});

vi.mock('../src/craft-config.js', () => ({
  getConnection: (...args: unknown[]) => mocks.mockGetConnection(...args),
  getDefaultConnection: (...args: unknown[]) => mocks.mockGetDefaultConnection(...args),
  resolveConnection: (...args: unknown[]) => mocks.mockResolveConnection(...args),
}));

vi.mock('../src/craft-validation.js', () => ({
  validateCraftUrl: (...args: unknown[]) => mocks.mockValidateCraftUrl(...args),
}));

vi.mock('../src/runtime.js', () => ({
  createRuntime: vi.fn().mockResolvedValue({
    callTool: mocks.mockCallTool,
    listTools: mocks.mockListTools,
    close: mocks.mockClose,
    getDefinition: mocks.mockGetDefinition,
  } as unknown as Runtime),
}));

describe('craft runtime', () => {
  const testConnection: CraftConnection = {
    name: 'work',
    url: 'https://mcp.craft.do/links/SECRET/mcp',
    type: 'doc',
    description: 'Work docs',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCallTool.mockResolvedValue({ result: 'success' });
    mocks.mockListTools.mockResolvedValue([]);
    mocks.mockClose.mockResolvedValue(undefined);
    // Reset validateCraftUrl to not throw by default
    mocks.mockValidateCraftUrl.mockImplementation(() => {
      // Do nothing - validation passes
    });
  });

  describe('createCraftRuntime', () => {
    it('creates runtime with specified connection', async () => {
      mocks.mockGetConnection.mockResolvedValue(testConnection);
      const { createRuntime } = await import('../src/runtime.js');

      const runtime = await createCraftRuntime('work');

      expect(mocks.mockGetConnection).toHaveBeenCalledWith('work');
      expect(mocks.mockValidateCraftUrl).toHaveBeenCalledWith(testConnection.url);
      expect(createRuntime).toHaveBeenCalled();
    });

    it('creates runtime with default connection when no name provided', async () => {
      mocks.mockGetDefaultConnection.mockResolvedValue(testConnection);

      const runtime = await createCraftRuntime();

      expect(mocks.mockGetDefaultConnection).toHaveBeenCalled();
      expect(mocks.mockValidateCraftUrl).toHaveBeenCalledWith(testConnection.url);
      expect(runtime).toBeDefined();
    });

    it('validates URL before creating runtime', async () => {
      mocks.mockGetConnection.mockResolvedValue(testConnection);
      mocks.mockValidateCraftUrl.mockImplementation(() => {
        throw new Error('Invalid URL');
      });

      await expect(createCraftRuntime('work')).rejects.toThrow('Invalid URL');
      expect(mocks.mockGetConnection).toHaveBeenCalled();
    });

    it('throws error when connection not found', async () => {
      mocks.mockGetConnection.mockRejectedValue(new Error('Connection not found'));

      await expect(createCraftRuntime('nonexistent')).rejects.toThrow('Connection not found');
    });

    it('throws error when no default connection', async () => {
      mocks.mockGetDefaultConnection.mockResolvedValue(null);

      await expect(createCraftRuntime()).rejects.toThrow('No default connection');
    });

    it('passes runtime options to createRuntime', async () => {
      mocks.mockGetConnection.mockResolvedValue(testConnection);
      const { createRuntime } = await import('../src/runtime.js');

      await createCraftRuntime('work', { logger: console });

      expect(createRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          servers: expect.arrayContaining([
            expect.objectContaining({
              name: 'work',
              command: expect.objectContaining({
                kind: 'http',
                url: new URL(testConnection.url),
              }),
            }),
          ]),
          logger: console,
        })
      );
    });
  });

  describe('craftCallOnce', () => {
    it('calls tool and closes connection', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const result = await craftCallOnce({
        connection: 'work',
        tool: 'collections_list',
        args: { limit: 10 },
      });

      expect(mocks.mockResolveConnection).toHaveBeenCalledWith('work');
      expect(mocks.mockValidateCraftUrl).toHaveBeenCalledWith(testConnection.url);
      expect(mocks.mockCallTool).toHaveBeenCalledWith('work', 'collections_list', {
        args: { limit: 10 },
      });
      expect(mocks.mockClose).toHaveBeenCalledWith('work');
      expect(result).toEqual({ result: 'success' });
    });

    it('calls tool without args', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      await craftCallOnce({
        connection: 'work',
        tool: 'collections_list',
      });

      expect(mocks.mockCallTool).toHaveBeenCalledWith('work', 'collections_list', {
        args: undefined,
      });
    });

    it('validates URL before calling', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);
      mocks.mockValidateCraftUrl.mockImplementation(() => {
        throw new Error('Invalid URL');
      });

      await expect(
        craftCallOnce({
          connection: 'work',
          tool: 'collections_list',
        })
      ).rejects.toThrow('Invalid URL');
    });

    it('closes connection even on error', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);
      mocks.mockCallTool.mockRejectedValue(new Error('Tool error'));

      await expect(
        craftCallOnce({
          connection: 'work',
          tool: 'collections_list',
        })
      ).rejects.toThrow('Tool error');

      expect(mocks.mockClose).toHaveBeenCalledWith('work');
    });
  });

  describe('createCraftClient', () => {
    it('creates client with all methods', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const client = await createCraftClient('work');

      expect(mocks.mockResolveConnection).toHaveBeenCalledWith('work');
      expect(mocks.mockValidateCraftUrl).toHaveBeenCalledWith(testConnection.url);
      expect(client).toHaveProperty('callTool');
      expect(client).toHaveProperty('listTools');
      expect(client).toHaveProperty('close');
      expect(client).toHaveProperty('getRuntime');
      expect(client).toHaveProperty('getConnection');
    });

    it('client.callTool calls runtime with correct parameters', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const client = await createCraftClient('work');
      await client.callTool('collections_list', { limit: 10 });

      expect(mocks.mockCallTool).toHaveBeenCalledWith('work', 'collections_list', {
        args: { limit: 10 },
      });
    });

    it('client.listTools calls runtime with connection name', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);
      mocks.mockListTools.mockResolvedValue([{ name: 'tool1' }, { name: 'tool2' }]);

      const client = await createCraftClient('work');
      const tools = await client.listTools();

      expect(mocks.mockListTools).toHaveBeenCalledWith('work');
      expect(tools).toEqual([{ name: 'tool1' }, { name: 'tool2' }]);
    });

    it('client.close closes runtime', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const client = await createCraftClient('work');
      await client.close();

      expect(mocks.mockClose).toHaveBeenCalledWith('work');
    });

    it('client.getRuntime returns underlying runtime', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const client = await createCraftClient('work');
      const runtime = client.getRuntime();

      expect(runtime).toBeDefined();
    });

    it('client.getConnection returns connection metadata', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);

      const client = await createCraftClient('work');
      const conn = client.getConnection();

      expect(conn).toEqual(testConnection);
    });

    it('validates URL before creating client', async () => {
      mocks.mockResolveConnection.mockResolvedValue(testConnection);
      mocks.mockValidateCraftUrl.mockImplementation(() => {
        throw new Error('Invalid URL');
      });

      await expect(createCraftClient('work')).rejects.toThrow('Invalid URL');
    });

    it('throws error when connection not found', async () => {
      mocks.mockResolveConnection.mockRejectedValue(new Error('Connection not found'));

      await expect(createCraftClient('nonexistent')).rejects.toThrow('Connection not found');
    });
  });
});
