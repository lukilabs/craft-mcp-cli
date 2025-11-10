import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTemplateFromSchema, openEditorForArgs, parseJsonValue } from '../src/cli/json-input.js';
import type { ServerToolInfo } from '../src/runtime.js';

vi.mock('node:child_process');

describe('json input parsing', () => {
  describe('parseJsonValue', () => {
    it('returns undefined for empty string', async () => {
      const result = await parseJsonValue('');
      expect(result).toBeUndefined();
    });

    it('returns undefined for undefined', async () => {
      const result = await parseJsonValue(undefined);
      expect(result).toBeUndefined();
    });

    it('parses inline JSON', async () => {
      const result = await parseJsonValue('{"key": "value", "number": 42}');
      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('parses JSON from file', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-json-test-'));
      const filePath = path.join(tempDir, 'test.json');
      await fs.writeFile(filePath, '{"from": "file"}', 'utf-8');

      try {
        const result = await parseJsonValue(`@${filePath}`);
        expect(result).toEqual({ from: 'file' });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('trims whitespace from file content', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-json-test-'));
      const filePath = path.join(tempDir, 'test.json');
      await fs.writeFile(filePath, '  {"trimmed": true}  \n', 'utf-8');

      try {
        const result = await parseJsonValue(`@${filePath}`);
        expect(result).toEqual({ trimmed: true });
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('parses JSON from stdin', async () => {
      const mockChunks: Buffer[] = [Buffer.from('{"from": "stdin"}')];
      const mockStdin = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      };

      // Replace process.stdin temporarily
      const originalStdin = process.stdin;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      try {
        const result = await parseJsonValue('-');
        expect(result).toEqual({ from: 'stdin' });
      } finally {
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          writable: true,
          configurable: true,
        });
      }
    });

    it('trims whitespace from stdin', async () => {
      const _mockChunks: Buffer[] = [Buffer.from('  {"trimmed": true}  \n')];
      const mockChunks2: Buffer[] = [Buffer.from('  {"trimmed": true}  \n')];
      const mockStdin = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks2) {
            yield chunk;
          }
        },
      };

      const originalStdin = process.stdin;
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      try {
        const result = await parseJsonValue('-');
        expect(result).toEqual({ trimmed: true });
      } finally {
        Object.defineProperty(process, 'stdin', {
          value: originalStdin,
          writable: true,
          configurable: true,
        });
      }
    });

    it('throws descriptive error for invalid JSON', async () => {
      await expect(parseJsonValue('not json')).rejects.toThrow(/Invalid JSON/);
      await expect(parseJsonValue('not json')).rejects.toThrow(/Supported formats/);
    });

    it('throws error when file does not exist', async () => {
      await expect(parseJsonValue('@/nonexistent/file.json')).rejects.toThrow();
    });
  });

  describe('generateTemplateFromSchema', () => {
    it('returns empty object for invalid schema', () => {
      expect(generateTemplateFromSchema(null)).toBe('{}');
      expect(generateTemplateFromSchema(undefined)).toBe('{}');
      expect(generateTemplateFromSchema('not an object')).toBe('{}');
    });

    it('generates template with required and optional fields', () => {
      const schema = {
        type: 'object',
        properties: {
          requiredField: {
            type: 'string',
            description: 'A required field',
          },
          optionalField: {
            type: 'number',
            description: 'An optional field',
          },
        },
        required: ['requiredField'],
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('"requiredField"');
      expect(template).toContain('"optionalField"');
      expect(template).toContain('""'); // empty string for requiredField
      expect(template).toContain('0'); // zero for optionalField
    });

    it('generates template with default values', () => {
      const schema = {
        type: 'object',
        properties: {
          withDefault: {
            type: 'string',
            default: 'default-value',
          },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('"default-value"');
    });

    it('generates template with enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          enumField: {
            type: 'string',
            enum: ['option1', 'option2', 'option3'],
          },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('"option1"');
    });

    it('generates template with nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              inner: {
                type: 'string',
              },
            },
          },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('"nested"');
      expect(template).toContain('"inner"');
    });

    it('generates template with arrays', () => {
      const schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('"items"');
      // When items are defined, it generates an example item, not an empty array
      expect(template).toContain('[');
      expect(template).toContain(']');
    });

    it('generates correct example values by type', () => {
      const schema = {
        type: 'object',
        properties: {
          stringField: { type: 'string' },
          numberField: { type: 'number' },
          integerField: { type: 'integer' },
          booleanField: { type: 'boolean' },
          nullField: { type: 'null' },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).toContain('""'); // string
      expect(template).toContain('0'); // number/integer
      expect(template).toContain('false'); // boolean
      expect(template).toContain('null'); // null
    });

    it('includes $schema reference when schema file is provided', () => {
      const schema = {
        type: 'object',
        properties: {
          field: {
            type: 'string',
          },
        },
      };

      const schemaFilePath = '/tmp/test-schema.json';
      const template = generateTemplateFromSchema(schema, schemaFilePath);
      expect(template).toContain(`"$schema": "file://${schemaFilePath}"`);
    });

    it('does not include $schema when schema file is not provided', () => {
      const schema = {
        type: 'object',
        properties: {
          field: {
            type: 'string',
          },
        },
      };

      const template = generateTemplateFromSchema(schema);
      expect(template).not.toContain('$schema');
    });
  });

  describe('openEditorForArgs', () => {
    let tempDir: string;
    let originalEditor: string | undefined;
    let originalVisual: string | undefined;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'craft-editor-test-'));
      originalEditor = process.env.EDITOR;
      originalVisual = process.env.VISUAL;
      delete process.env.EDITOR;
      delete process.env.VISUAL;
    });

    afterEach(async () => {
      if (originalEditor !== undefined) {
        process.env.EDITOR = originalEditor;
      } else {
        delete process.env.EDITOR;
      }
      if (originalVisual !== undefined) {
        process.env.VISUAL = originalVisual;
      } else {
        delete process.env.VISUAL;
      }
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      vi.clearAllMocks();
    });

    it('opens editor and reads result', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: {
              type: 'string',
              description: 'First argument',
            },
          },
          required: ['arg1'],
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            // Simulate successful editor exit
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Mock fs operations
      const mockReadFile = vi.spyOn(fs, 'readFile');
      const mockWriteFile = vi.spyOn(fs, 'writeFile');
      const mockUnlink = vi.spyOn(fs, 'unlink');

      // Simulate file content
      const fileContent = `{
  "arg1": "test-value"
}`;

      mockReadFile.mockResolvedValue(fileContent);

      const result = await openEditorForArgs(toolSchema);

      expect(spawn).toHaveBeenCalledWith(
        'nano',
        expect.arrayContaining([expect.any(String)]),
        expect.objectContaining({
          stdio: 'inherit',
        })
      );
      // Should write both the JSON template and the schema file
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
      expect(mockReadFile).toHaveBeenCalled();
      // Should clean up both the JSON file and the schema file
      expect(mockUnlink).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ arg1: 'test-value' });
    });

    it('parses clean JSON from file', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
          },
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      const mockReadFile = vi.spyOn(fs, 'readFile');
      const fileContent = `{
  "arg1": "value"
}`;

      mockReadFile.mockResolvedValue(fileContent);

      const result = await openEditorForArgs(toolSchema);

      expect(result).toEqual({ arg1: 'value' });
    });

    it('uses EDITOR environment variable', async () => {
      process.env.EDITOR = 'vim';

      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
      vi.spyOn(fs, 'readFile').mockResolvedValue('{}');

      await openEditorForArgs(toolSchema);

      expect(spawn).toHaveBeenCalledWith('vim', expect.any(Array), expect.any(Object));
    });

    it('uses VISUAL environment variable when EDITOR is not set', async () => {
      delete process.env.EDITOR;
      process.env.VISUAL = 'code';

      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
      vi.spyOn(fs, 'readFile').mockResolvedValue('{}');

      await openEditorForArgs(toolSchema);

      expect(spawn).toHaveBeenCalledWith('code', expect.any(Array), expect.any(Object));
    });

    it('rejects when editor exits with non-zero code', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(1), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(openEditorForArgs(toolSchema)).rejects.toThrow(/Editor exited with code 1/);
    });

    it('rejects when editor spawn fails', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (error: Error) => void) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Spawn failed')), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(openEditorForArgs(toolSchema)).rejects.toThrow('Spawn failed');
    });

    it('rejects when file contains invalid JSON', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
      vi.spyOn(fs, 'readFile').mockResolvedValue('invalid json');

      await expect(openEditorForArgs(toolSchema)).rejects.toThrow();
    });

    it('removes $schema property from result', async () => {
      const toolSchema: ServerToolInfo = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
          },
        },
      };

      const mockChild = {
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      // Simulate user leaving the $schema property in the file
      const fileContent = `{
  "$schema": "file:///tmp/schema.json",
  "arg1": "value"
}`;

      vi.spyOn(fs, 'readFile').mockResolvedValue(fileContent);

      const result = await openEditorForArgs(toolSchema);

      // $schema should be removed from the result
      expect(result).toEqual({ arg1: 'value' });
      expect(result).not.toHaveProperty('$schema');
    });
  });
});
