---
summary: 'Cheatsheet for calling Craft MCP tools with various argument syntaxes.'
read_when:
  - 'Designing or debugging Craft tool invocation'
---

# Tool Calling Cheatsheet

Craft MCP CLI accepts multiple argument styles for calling tools. Every style feeds the same validation pipeline (schema-driven type coercion, required-field checks), so pick the one that's easiest to type.

## 1. Default Connection

```bash
craft collections_list
craft blocks_get id:abc123
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"Hello"}'
```

- When no connection is specified, uses the default connection.
- Arguments use `key:value` or `key=value` syntax.
- Multi-word values need normal shell quoting.

## 2. Specific Connection

```bash
craft work collections_list
craft work blocks_get id:abc123
craft personal blocks_update id:abc123 content:'{"type":"textBlock"}'
```

- Specify the connection name before the tool name.
- Same argument syntax as default connection.

## 3. With Arguments

```bash
# Using key:value syntax
craft blocks_get id:abc123

# Using key=value syntax
craft blocks_update id=abc123 content='{"type":"textBlock"}'

# JSON arguments
craft blocks_update id:abc123 content:'{"type":"textBlock","content":"Hello World"}'
```

- Both `key:value` and `key=value` formats are supported.
- JSON values should be quoted to prevent shell interpretation.

## 4. Ad-hoc URLs

```bash
craft 'https://mcp.craft.do/links/XXX/mcp' collections_list
craft 'https://mcp.craft.do/links/XXX/mcp' blocks_get id:abc123
```

- Pass a Craft MCP URL directly to test before adding to config.
- Same argument syntax applies.

## 5. JSON Arguments from File

```bash
craft blocks_update --args @data.json
echo '{"id":"abc123"}' | craft blocks_get --args -
```

- Use `--args @file.json` to read arguments from a file.
- Use `--args -` to read from stdin.

## 6. Interactive Editor Mode

```bash
craft blocks_update --edit
craft work blocks_get --edit
```

The `--edit` flag opens an interactive editor to compose tool arguments:

- **Auto-generated template**: Creates a JSON template from the tool's input schema with helpful comments for each field
- **Editor selection**: Uses `$EDITOR`, `$VISUAL`, or defaults to `nano`
- **GUI editor support**: Automatically adds `--wait` flag for VS Code (`code`), Sublime (`subl`), Atom (`atom`), and TextMate (`mate`)
- **Schema requirement**: Only works for tools that expose an input schema (throws an error if the tool doesn't have one)
- **Comment support**: You can add `//` comments in the JSON template for notes—they're automatically removed before parsing

Example:
```bash
craft blocks_update --edit
```

Opens your editor with a pre-filled template like:
```json
{
  "id": "",  // Block ID (required)
  "content": {}  // Block content object (required)
}
```

After editing and saving, the tool is called with your arguments. If the editor exits with a non-zero code or the JSON is invalid, the command fails with an error.

---

**Tips**
- Use `craft list [connection]` to see available tools and their parameters.
- Use `craft tools [connection]` to see detailed tool signatures.
- Use `craft use <name>` to set the default connection.
- OAuth authentication: `craft auth <name|url>` when needed.
- Use `--edit` for complex nested JSON arguments that are easier to edit in a full editor than on the command line.
