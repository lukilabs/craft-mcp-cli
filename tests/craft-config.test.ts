import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addConnection,
  getConnection,
  getDefaultConnection,
  listConnections,
  loadCraftConfig,
  removeConnection,
  resolveConnection,
  saveCraftConfig,
  useConnection,
} from '../src/craft-config.js';

// Mock createRuntime to avoid real network calls
const mocks = vi.hoisted(() => {
  const mockListTools = vi.fn();
  const mockClose = vi.fn();
  return {
    mockListTools,
    mockClose,
  };
});

vi.mock('../src/runtime.js', () => ({
  createRuntime: vi.fn().mockResolvedValue({
    listTools: mocks.mockListTools,
    close: mocks.mockClose,
  }),
}));

describe('craft config', () => {
  let fakeHomeDir: string | undefined;
  let homedirSpy: { mockRestore(): void } | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: test spy
  let consoleLogSpy: any;
  // biome-ignore lint/suspicious/noExplicitAny: test spy
  let consoleWarnSpy: any;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-config-test-'));
    homedirSpy = vi.spyOn(os, 'homedir').mockReturnValue(fakeHomeDir);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.mockListTools.mockClear();
    mocks.mockClose.mockClear();
    // Clear any existing config file in the fake home directory
    const configPath = path.join(fakeHomeDir, '.craft', 'config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  afterEach(() => {
    homedirSpy?.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    if (fakeHomeDir) {
      fs.rmSync(fakeHomeDir, { recursive: true, force: true });
      fakeHomeDir = undefined;
    }
    vi.clearAllMocks();
  });

  describe('loadCraftConfig', () => {
    it('returns empty config when file does not exist', async () => {
      const config = await loadCraftConfig();
      expect(config).toEqual({ connections: [] });
    });

    it('loads existing config from file', async () => {
      if (!fakeHomeDir) {
        throw new Error('fakeHomeDir not set');
      }
      const configDir = path.join(fakeHomeDir, '.craft');
      const configPath = path.join(configDir, 'config.json');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(
        configPath,
        JSON.stringify({
          connections: [{ name: 'test', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
          defaultConnection: 'test',
        }),
        'utf-8'
      );

      const config = await loadCraftConfig();
      expect(config.connections).toHaveLength(1);
      expect(config.connections[0]?.name).toBe('test');
      expect(config.defaultConnection).toBe('test');
    });

    it('throws error for malformed JSON', async () => {
      if (!fakeHomeDir) {
        throw new Error('fakeHomeDir not set');
      }
      const configDir = path.join(fakeHomeDir, '.craft');
      const configPath = path.join(configDir, 'config.json');
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, 'invalid json', 'utf-8');

      await expect(loadCraftConfig()).rejects.toThrow();
    });
  });

  describe('saveCraftConfig', () => {
    it('creates directory and saves config', async () => {
      const config = {
        connections: [{ name: 'test', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'test',
      };

      await saveCraftConfig(config);

      if (!fakeHomeDir) {
        throw new Error('fakeHomeDir not set');
      }
      const configPath = path.join(fakeHomeDir, '.craft', 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf-8');
      const saved = JSON.parse(content);
      expect(saved).toEqual(config);
    });

    it('creates nested directories if needed', async () => {
      const config = { connections: [] };
      await saveCraftConfig(config);

      if (!fakeHomeDir) {
        throw new Error('fakeHomeDir not set');
      }
      const configDir = path.join(fakeHomeDir, '.craft');
      expect(fs.existsSync(configDir)).toBe(true);
    });
  });

  describe('addConnection', () => {
    it('adds connection and sets as default if first', async () => {
      mocks.mockListTools.mockResolvedValue([
        { name: 'test_tool', description: 'Test' },
      ]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET/mcp', 'Work docs');

      const config = await loadCraftConfig();
      expect(config.connections).toHaveLength(1);
      expect(config.connections[0]?.name).toBe('work');
      expect(config.connections[0]?.url).toBe('https://mcp.craft.do/links/SECRET/mcp');
      expect(config.connections[0]?.description).toBe('Work docs');
      expect(config.defaultConnection).toBe('work');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Added connection'));
    });

    it('validates URL before adding', async () => {
      await expect(addConnection('bad', 'http://example.com/mcp')).rejects.toThrow(/craft\.do/);
    });

    it('prevents duplicate connection names', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET1/mcp');
      await expect(addConnection('work', 'https://mcp.craft.do/links/SECRET2/mcp')).rejects.toThrow(/already exists/);
    });

    it('auto-discovers type as doc when connection_time_get is not present', async () => {
      mocks.mockListTools.mockResolvedValue([
        { name: 'collections_list', description: 'List collections' },
      ]);

      await addConnection('doc', 'https://mcp.craft.do/links/SECRET/mcp');

      const config = await loadCraftConfig();
      expect(config.connections[0]?.type).toBe('doc');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Detected type: doc'));
    });

    it('auto-discovers type as daily-notes when connection_time_get is present', async () => {
      mocks.mockListTools.mockResolvedValue([
        { name: 'connection_time_get', description: 'Get connection time' },
        { name: 'other_tool', description: 'Other' },
      ]);

      await addConnection('daily', 'https://mcp.craft.do/links/SECRET/mcp');

      const config = await loadCraftConfig();
      expect(config.connections[0]?.type).toBe('daily-notes');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Detected type: daily-notes'));
    });

    it('handles type discovery failure gracefully', async () => {
      mocks.mockListTools.mockRejectedValue(new Error('Connection failed'));

      await addConnection('unknown', 'https://mcp.craft.do/links/SECRET/mcp');

      const config = await loadCraftConfig();
      expect(config.connections[0]?.type).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not auto-discover'));
    });

    it('does not set as default if not first connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('first', 'https://mcp.craft.do/links/SECRET1/mcp');
      await addConnection('second', 'https://mcp.craft.do/links/SECRET2/mcp');

      const config = await loadCraftConfig();
      expect(config.defaultConnection).toBe('first');
    });
  });

  describe('removeConnection', () => {
    it('removes connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET1/mcp');
      await addConnection('home', 'https://mcp.craft.do/links/SECRET2/mcp');

      await removeConnection('work');

      const config = await loadCraftConfig();
      expect(config.connections).toHaveLength(1);
      expect(config.connections[0]?.name).toBe('home');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Removed connection'));
    });

    it('updates default when removing default connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('first', 'https://mcp.craft.do/links/SECRET1/mcp');
      await addConnection('second', 'https://mcp.craft.do/links/SECRET2/mcp');

      await removeConnection('first');

      const config = await loadCraftConfig();
      expect(config.defaultConnection).toBe('second');
    });

    it('clears default when removing last connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('only', 'https://mcp.craft.do/links/SECRET/mcp');
      await removeConnection('only');

      const config = await loadCraftConfig();
      expect(config.connections).toHaveLength(0);
      expect(config.defaultConnection).toBeUndefined();
    });

    it('throws error when connection does not exist', async () => {
      await expect(removeConnection('nonexistent')).rejects.toThrow(/not found/);
    });
  });

  describe('listConnections', () => {
    it('shows empty state when no connections', async () => {
      await listConnections();

      expect(consoleLogSpy).toHaveBeenCalledWith('No connections configured.');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('craft add'));
    });

    it('lists all connections with formatting', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET1/mcp', 'Work docs');
      await addConnection('home', 'https://mcp.craft.do/links/SECRET2/mcp');

      consoleLogSpy.mockClear();
      await listConnections();

      const output = consoleLogSpy.mock.calls.map((call: unknown[]) => call[0]).join('\n');
      expect(output).toContain('Craft MCP Connections');
      expect(output).toContain('→ work');
      expect(output).toContain('https://mcp.craft.do/links/SECRET1/mcp');
      expect(output).toContain('Work docs');
      expect(output).toContain('home');
      expect(output).toContain('Default: work');
    });
  });

  describe('useConnection', () => {
    it('sets default connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET1/mcp');
      await addConnection('home', 'https://mcp.craft.do/links/SECRET2/mcp');

      await useConnection('home');

      const config = await loadCraftConfig();
      expect(config.defaultConnection).toBe('home');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Set 'home' as default"));
    });

    it('throws error when connection does not exist', async () => {
      await expect(useConnection('nonexistent')).rejects.toThrow(/not found/);
    });
  });

  describe('getDefaultConnection', () => {
    it('returns default connection', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET/mcp');

      const conn = await getDefaultConnection();
      expect(conn?.name).toBe('work');
    });

    it('returns null when no default set', async () => {
      const conn = await getDefaultConnection();
      expect(conn).toBeNull();
    });
  });

  describe('getConnection', () => {
    it('returns connection by name', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET/mcp', 'Work docs');

      const conn = await getConnection('work');
      expect(conn.name).toBe('work');
      expect(conn.url).toBe('https://mcp.craft.do/links/SECRET/mcp');
      expect(conn.description).toBe('Work docs');
    });

    it('throws error when connection does not exist', async () => {
      await expect(getConnection('nonexistent')).rejects.toThrow(/not found/);
    });
  });

  describe('resolveConnection', () => {
    it('resolves connection by name', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET/mcp');

      const conn = await resolveConnection('work');
      expect(conn.name).toBe('work');
    });

    it('uses default connection when name not provided', async () => {
      mocks.mockListTools.mockResolvedValue([]);

      await addConnection('work', 'https://mcp.craft.do/links/SECRET/mcp');

      const conn = await resolveConnection();
      expect(conn.name).toBe('work');
    });

    it('throws error when no default and no name provided', async () => {
      await expect(resolveConnection()).rejects.toThrow(/No default connection/);
    });
  });
});
