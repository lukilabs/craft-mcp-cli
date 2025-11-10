import { describe, expect, it } from 'vitest';
import { parseCallArguments } from '../src/cli/call-arguments.js';

describe('parseCallArguments', () => {
  it('parses legacy selector + key=value pairs', async () => {
    const args = ['linear.list_documents', 'limit=5', 'format=json'];
    const parsed = await parseCallArguments([...args]);
    expect(parsed.selector).toBe('linear.list_documents');
    expect(parsed.tool).toBeUndefined();
    expect(parsed.args.limit).toBe(5);
    expect(parsed.args.format).toBe('json');
  });

  it('consumes function-style call expressions with HTTP selectors', async () => {
    const call = 'https://example.com/mcp.getComponents(limit: 3, projectId: "123")';
    const parsed = await parseCallArguments([call]);
    expect(parsed.server).toBe('https://example.com/mcp');
    expect(parsed.tool).toBe('getComponents');
    expect(parsed.args.limit).toBe(3);
    expect(parsed.args.projectId).toBe('123');
  });

  it('merges --args JSON blobs with positional fragments', async () => {
    const parsed = await parseCallArguments([
      '--args',
      '{"query":"open issues"}',
      'linear',
      'list_documents',
      'orderBy=updatedAt',
    ]);
    expect(parsed.selector).toBe('linear');
    expect(parsed.tool).toBe('list_documents');
    expect(parsed.args.query).toBe('open issues');
    expect(parsed.args.orderBy).toBe('updatedAt');
  });

  it('throws when flags conflict with call expression content', async () => {
    await expect(parseCallArguments(['--server', 'linear', 'cursor.list_documents(limit:1)'])).rejects.toThrow(
      /Conflicting server names/
    );
  });
});
