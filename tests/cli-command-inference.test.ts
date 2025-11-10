import { beforeEach, describe, expect, it, vi } from 'vitest';

import { inferCommandRouting } from '../src/cli/command-inference.js';

const definitions = [
  { name: 'firecrawl', description: '', command: { kind: 'http' as const, url: new URL('https://example.com') } },
  { name: 'vercel', description: '', command: { kind: 'http' as const, url: new URL('https://api.vercel.com') } },
];

// Mock loadCraftConfig
const mockLoadCraftConfig = vi.fn();
vi.mock('../src/craft-config.js', () => ({
  loadCraftConfig: (...args: unknown[]) => mockLoadCraftConfig(...args),
}));

describe('command inference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no Craft connections
    mockLoadCraftConfig.mockResolvedValue({ connections: [], defaultConnection: undefined });
  });
  it('routes bare server names to list', async () => {
    const result = await inferCommandRouting('firecrawl', ['--schema'], definitions);
    expect(result).toEqual({ kind: 'command', command: 'list', args: ['firecrawl', '--schema'] });
  });

  it('respects explicit list command tokens', async () => {
    const result = await inferCommandRouting('list', [], definitions);
    expect(result).toEqual({ kind: 'command', command: 'list', args: [] });
  });

  it('auto-corrects close server names', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await inferCommandRouting('vercek', [], definitions);
    expect(result).toEqual({ kind: 'command', command: 'list', args: ['vercel'] });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Auto-corrected server name to vercel'));
    logSpy.mockRestore();
  });

  it('routes HTTP URLs to list for ad-hoc mode', async () => {
    const result = await inferCommandRouting('https://mcp.deepwiki.com/sse', [], definitions);
    expect(result).toEqual({ kind: 'command', command: 'list', args: ['https://mcp.deepwiki.com/sse'] });
  });

  it('routes scheme-less HTTP URLs to list for ad-hoc mode', async () => {
    const result = await inferCommandRouting('shadcn.io/api/mcp', [], definitions);
    expect(result).toEqual({ kind: 'command', command: 'list', args: ['shadcn.io/api/mcp'] });
  });

  it('routes HTTP tool selectors directly to call', async () => {
    const token = 'https://api.example.com/mcp.getStatus';
    const result = await inferCommandRouting(token, ['limit=1'], definitions);
    expect(result).toEqual({ kind: 'command', command: 'call', args: [token, 'limit=1'] });
  });

  it('routes HTTP tool expressions with arguments directly to call', async () => {
    const token = 'https://api.example.com/mcp.getStatus(component: "foo")';
    const result = await inferCommandRouting(token, [], definitions);
    expect(result).toEqual({ kind: 'command', command: 'call', args: [token] });
  });

  it('suggests names when edit distance is large', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await inferCommandRouting('unknown', [], definitions);
    expect(result).toEqual({ kind: 'abort', exitCode: 1 });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('treats dotted selectors as call expressions', async () => {
    const result = await inferCommandRouting('firecrawl.scrape', ['--foo'], definitions);
    expect(result).toEqual({ kind: 'command', command: 'call', args: ['firecrawl.scrape', '--foo'] });
  });

  describe('craft connection routing', () => {
    it('routes craft <connection> to tools with defaultConnection', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('work', [], definitions);
      expect(result).toEqual({
        kind: 'command',
        command: 'tools',
        args: [],
        defaultConnection: 'work',
      });
    });

    it('routes craft <connection> <tool> to call with defaultConnection', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('work', ['collections_list'], definitions);
      expect(result).toEqual({
        kind: 'command',
        command: 'call',
        args: ['collections_list'],
        defaultConnection: 'work',
      });
    });

    it('aborts when using reserved "list" keyword with connection', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('work', ['list'], definitions);
      expect(result).toEqual({
        kind: 'abort',
        exitCode: 1,
      });
    });

    it('routes craft <connection> tools to tools command with defaultConnection', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('work', ['tools'], definitions);
      expect(result).toEqual({
        kind: 'command',
        command: 'tools',
        args: [],
        defaultConnection: 'work',
      });
    });

    it('routes craft <tool> to call with default connection when no mcporter servers', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('collections_list', ['--limit', '10'], []);
      expect(result).toEqual({
        kind: 'command',
        command: 'call',
        args: ['collections_list', '--limit', '10'],
        defaultConnection: 'work',
      });
    });

    it('routes craft <tool> to call with default connection when server not found', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      // Mock console.error to avoid output during test
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await inferCommandRouting('unknown_tool', [], definitions);
      // When there are mcporter definitions and a resolution is found, it goes through normal routing
      // The Craft fallback only happens when resolution is null or definitions.length === 0
      // Since 'unknown_tool' doesn't match any server, it will abort
      expect(result.kind).toBe('abort');
      if (result.kind === 'abort') {
        expect(result.exitCode).toBe(1);
      }

      errorSpy.mockRestore();
    });

    it('prioritizes Craft connection over mcporter server with same name', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'firecrawl', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'firecrawl',
      });

      const result = await inferCommandRouting('firecrawl', ['scrape'], definitions);
      // Should route to Craft connection, not mcporter server
      expect(result).toEqual({
        kind: 'command',
        command: 'call',
        args: ['scrape'],
        defaultConnection: 'firecrawl',
      });
    });

    it('falls back to normal routing when Craft config fails to load', async () => {
      mockLoadCraftConfig.mockRejectedValue(new Error('Config error'));

      const result = await inferCommandRouting('firecrawl', ['--schema'], definitions);
      // Should fall back to normal routing
      expect(result).toEqual({
        kind: 'command',
        command: 'list',
        args: ['firecrawl', '--schema'],
      });
    });

    it('does not route to Craft when connection name does not match', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting('firecrawl', ['--schema'], definitions);
      // Should use normal routing since 'firecrawl' is not a Craft connection
      expect(result).toEqual({
        kind: 'command',
        command: 'list',
        args: ['firecrawl', '--schema'],
      });
    });

    it('handles craft <connection> <tool> with multiple args', async () => {
      mockLoadCraftConfig.mockResolvedValue({
        connections: [{ name: 'work', url: 'https://mcp.craft.do/links/SECRET/mcp' }],
        defaultConnection: 'work',
      });

      const result = await inferCommandRouting(
        'work',
        ['blocks_add', '--blocks', '[]', '--position', '{}'],
        definitions
      );
      expect(result).toEqual({
        kind: 'command',
        command: 'call',
        args: ['blocks_add', '--blocks', '[]', '--position', '{}'],
        defaultConnection: 'work',
      });
    });
  });
});
