import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadCraftConfig } from '../craft-config.js';
import { logError } from './logger-context.js';

export type ShellType = 'bash' | 'zsh' | 'fish' | 'unknown';

/**
 * Detect the current shell from environment variables
 */
export function detectShell(): ShellType {
  const shell = process.env.SHELL || '';
  const shellName = path.basename(shell).toLowerCase();

  if (shellName.includes('zsh')) {
    return 'zsh';
  }
  if (shellName.includes('bash')) {
    return 'bash';
  }
  if (shellName.includes('fish')) {
    return 'fish';
  }

  // Fallback: check for shell-specific environment variables
  if (process.env.ZSH_VERSION) {
    return 'zsh';
  }
  if (process.env.BASH_VERSION) {
    return 'bash';
  }
  if (process.env.FISH_VERSION) {
    return 'fish';
  }

  return 'unknown';
}

/**
 * Get the installation path for a shell's completion script
 */
export function getCompletionPath(shell: ShellType): string | null {
  const home = os.homedir();

  switch (shell) {
    case 'zsh': {
      // Prefer Oh My Zsh cache completions directory (automatically in fpath)
      const ohMyZshCacheCompletions = path.join(home, '.oh-my-zsh', 'cache', 'completions', '_craft');
      const _ohMyZshCacheDir = path.join(home, '.oh-my-zsh', 'cache', 'completions');
      if (existsSync(path.join(home, '.oh-my-zsh'))) {
        // Oh My Zsh exists, use cache/completions (automatically in fpath)
        return ohMyZshCacheCompletions;
      }
      // Try function-based directory (modern zsh, needs fpath setup)
      const zshFuncDir = path.join(home, '.zsh', 'functions');
      // Fallback to completions directory
      const _zshCompletionsDir = path.join(home, '.zsh', 'completions');
      // Return the functions directory (more common)
      return path.join(zshFuncDir, '_craft');
    }
    case 'bash':
      // Try .bash_completion.d first, fallback to .bash_completion
      return path.join(home, '.bash_completion.d', 'craft');
    case 'fish':
      return path.join(home, '.config', 'fish', 'completions', 'craft.fish');
    default:
      return null;
  }
}

/**
 * Generate bash completion script
 */
function generateBashCompletion(): string {
  return `# Bash completion for craft
_craft_completion() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  words=("\${COMP_WORDS[@]}")

  # Commands
  local commands="add remove use connections tools list call auth generate-cli inspect-cli emit-ts config completions"
  
  # Global flags
  local global_flags="--config --root --log-level --oauth-timeout"
  
  # Command-specific flags
  local list_flags="--json --schema --all-parameters --timeout"
  local call_flags="--json --timeout --tail-log --edit"
  local config_flags="--json"
  
  # If completing command name
  if [ $COMP_CWORD -eq 1 ]; then
    COMPREPLY=($(compgen -W "$commands" -- "$cur"))
    return 0
  fi
  
  # If completing flag
  if [[ "$cur" == -* ]]; then
    local cmd="\${words[1]}"
    case "$cmd" in
      list)
        COMPREPLY=($(compgen -W "$list_flags $global_flags" -- "$cur"))
        ;;
      call)
        COMPREPLY=($(compgen -W "$call_flags $global_flags" -- "$cur"))
        ;;
      config)
        COMPREPLY=($(compgen -W "$config_flags $global_flags" -- "$cur"))
        ;;
      *)
        COMPREPLY=($(compgen -W "$global_flags" -- "$cur"))
        ;;
    esac
    return 0
  fi
  
  # Dynamic completions for connection names
  local cmd="\${words[1]}"
  case "$cmd" in
    use|remove|tools|auth)
      if [ $COMP_CWORD -eq 2 ] && [[ "$cur" != -* ]]; then
        local connections
        connections=$(craft _completion connections 2>/dev/null || echo "")
        if [ -n "$connections" ]; then
          COMPREPLY=($(compgen -W "$connections" -- "$cur"))
        fi
      fi
      ;;
    call|list)
      if [ $COMP_CWORD -eq 2 ] && [[ "$cur" != -* ]]; then
        local connections
        connections=$(craft _completion connections 2>/dev/null || echo "")
        if [ -n "$connections" ]; then
          COMPREPLY=($(compgen -W "$connections" -- "$cur"))
        fi
      fi
      ;;
  esac
}

complete -F _craft_completion craft
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
  return `#compdef craft

# Zsh completion for craft
_craft() {
  local -a commands
  commands=(
    'add:Add a Craft MCP connection'
    'remove:Remove a Craft MCP connection'
    'use:Set default Craft connection'
    'connections:List all Craft connections'
    'tools:List tools for default or specified connection'
    'list:List Craft connections'
    'call:Call a tool on a connection'
    'auth:Complete OAuth for a connection'
    'generate-cli:Emit a standalone CLI'
    'inspect-cli:Show metadata for a generated CLI'
    'emit-ts:Generate TypeScript client/types for a server'
    'config:Inspect or edit config files'
    'completions:Install shell completions'
  )

  local -a global_flags
  global_flags=(
    '--config[Path to craft.json]'
    '--root[Working directory for stdio servers]'
    '--log-level[Adjust CLI logging]'
    '--oauth-timeout[OAuth timeout in milliseconds]'
  )

  local -a list_flags
  list_flags=(
    '--json[Emit JSON output]'
    '--schema[Show tool schemas]'
    '--all-parameters[Include optional parameters]'
    '--timeout[Override timeout]'
  )

  local -a call_flags
  call_flags=(
    '--json[Emit JSON output]'
    '--timeout[Override timeout]'
    '--tail-log[Tail server logs]'
    '--edit[Edit arguments interactively]'
  )

  _arguments -C \\
    "1: :->command" \\
    "*::arg:->args"

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      case $words[1] in
        add)
          _arguments \\
            '1:connection name:' \\
            '2:connection URL:' \\
            '--description[Connection description]' \\
            $global_flags
          ;;
        remove|use|tools|auth)
          local connections
          connections=$(craft _completion connections 2>/dev/null || echo "")
          if [ -n "$connections" ]; then
            _arguments \\
              "1:connection:(($connections))" \\
              $global_flags
          else
            _arguments $global_flags
          fi
          ;;
        list)
          local connections
          connections=$(craft _completion connections 2>/dev/null || echo "")
          if [ -n "$connections" ]; then
            _arguments \\
              "1:connection:(($connections))" \\
              $list_flags \\
              $global_flags
          else
            _arguments $list_flags $global_flags
          fi
          ;;
        call)
          local connections
          connections=$(craft _completion connections 2>/dev/null || echo "")
          if [ -n "$connections" ]; then
            _arguments \\
              "1:connection:(($connections))" \\
              $call_flags \\
              $global_flags
          else
            _arguments $call_flags $global_flags
          fi
          ;;
        config)
          _arguments \\
            "1:subcommand:(list get add remove import login logout doctor)" \\
            $global_flags
          ;;
        *)
          _arguments $global_flags
          ;;
      esac
      ;;
  esac
}

_craft "$@"
`;
}

/**
 * Generate fish completion script
 */
function generateFishCompletion(): string {
  return `# Fish completion for craft

# Commands
complete -c craft -f -n '__fish_use_subcommand' -a 'add' -d 'Add a Craft MCP connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'remove' -d 'Remove a Craft MCP connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'use' -d 'Set default Craft connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'connections' -d 'List all Craft connections'
complete -c craft -f -n '__fish_use_subcommand' -a 'tools' -d 'List tools for default or specified connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'list' -d 'List Craft connections'
complete -c craft -f -n '__fish_use_subcommand' -a 'call' -d 'Call a tool on a connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'auth' -d 'Complete OAuth for a connection'
complete -c craft -f -n '__fish_use_subcommand' -a 'generate-cli' -d 'Emit a standalone CLI'
complete -c craft -f -n '__fish_use_subcommand' -a 'inspect-cli' -d 'Show metadata for a generated CLI'
complete -c craft -f -n '__fish_use_subcommand' -a 'emit-ts' -d 'Generate TypeScript client/types for a server'
complete -c craft -f -n '__fish_use_subcommand' -a 'config' -d 'Inspect or edit config files'
complete -c craft -f -n '__fish_use_subcommand' -a 'completions' -d 'Install shell completions'

# Global flags
complete -c craft -s c -l config -d 'Path to craft.json'
complete -c craft -l root -d 'Working directory for stdio servers'
complete -c craft -l log-level -d 'Adjust CLI logging' -xa 'debug info warn error'
complete -c craft -l oauth-timeout -d 'OAuth timeout in milliseconds'

# Command-specific flags
complete -c craft -n '__fish_seen_subcommand_from list' -l json -d 'Emit JSON output'
complete -c craft -n '__fish_seen_subcommand_from list' -l schema -d 'Show tool schemas'
complete -c craft -n '__fish_seen_subcommand_from list' -l all-parameters -d 'Include optional parameters'
complete -c craft -n '__fish_seen_subcommand_from list' -l timeout -d 'Override timeout'

complete -c craft -n '__fish_seen_subcommand_from call' -l json -d 'Emit JSON output'
complete -c craft -n '__fish_seen_subcommand_from call' -l timeout -d 'Override timeout'
complete -c craft -n '__fish_seen_subcommand_from call' -l tail-log -d 'Tail server logs'
complete -c craft -n '__fish_seen_subcommand_from call' -l edit -d 'Edit arguments interactively'

# Dynamic connection completions
function __fish_craft_connections
  craft _completion connections 2>/dev/null | tr ' ' '\\n'
end

complete -c craft -n '__fish_seen_subcommand_from use remove tools auth' -a '(__fish_craft_connections)'
complete -c craft -n '__fish_seen_subcommand_from list call' -a '(__fish_craft_connections)'
`;
}

/**
 * Generate completion script for a shell
 */
export function generateCompletion(shell: ShellType): string | null {
  switch (shell) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'fish':
      return generateFishCompletion();
    default:
      return null;
  }
}

/**
 * Install completion script for a shell
 */
export async function installCompletion(shell: ShellType, script: string, targetPath: string): Promise<void> {
  // Ensure parent directory exists
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  // Write the completion script
  await fs.writeFile(targetPath, script, 'utf8');

  // Make it executable (for zsh function files)
  if (shell === 'zsh') {
    await fs.chmod(targetPath, 0o755);
  }
}

/**
 * Handle the completions command
 */
export async function handleCompletions(args: string[]): Promise<void> {
  // Check for _completion helper (internal command for dynamic completions)
  // When called as "craft _completion connections", args[0] is "connections"
  // This function is called directly from the CLI when command is "_completion"
  if (args.length > 0 && (args[0] === 'connections' || args[0] === 'tools')) {
    await handleCompletionHelper(args);
    return;
  }

  // Detect shell
  const shell = detectShell();

  if (shell === 'unknown') {
    logError('Could not detect your shell. Please specify: craft completions [bash|zsh|fish]');
    process.exit(1);
    return;
  }

  // Generate completion script
  const script = generateCompletion(shell);
  if (!script) {
    logError(`Completion generation not supported for shell: ${shell}`);
    process.exit(1);
    return;
  }

  // Get installation path
  const targetPath = getCompletionPath(shell);
  if (!targetPath) {
    logError(`Could not determine installation path for shell: ${shell}`);
    process.exit(1);
    return;
  }

  // Install the completion
  try {
    await installCompletion(shell, script, targetPath);
    console.log(`✓ Installed ${shell} completion to ${targetPath}`);
    console.log('');
    console.log('Restart your shell or run:');
    if (shell === 'zsh') {
      console.log('  source ~/.zshrc');
    } else if (shell === 'bash') {
      console.log('  source ~/.bashrc  # or ~/.bash_profile');
    } else if (shell === 'fish') {
      console.log('  # Fish will automatically load completions');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`Failed to install completion: ${message}`);
    process.exit(1);
  }
}

/**
 * Update completions for all shells that have them installed
 * Called automatically when connections are added or removed
 */
export async function updateCompletionsIfInstalled(): Promise<void> {
  const updatedShells: Array<{ shell: ShellType; method?: string }> = [];

  // Check all three shell types
  const shells: ShellType[] = ['bash', 'zsh', 'fish'];

  for (const shell of shells) {
    try {
      const targetPath = getCompletionPath(shell);
      if (!targetPath) {
        continue;
      }

      // Check if completion file exists
      if (!existsSync(targetPath)) {
        continue;
      }

      // Generate the completion script
      const script = generateCompletion(shell);
      if (!script) {
        continue;
      }

      // Update the completion file
      await installCompletion(shell, script, targetPath);

      // Determine installation method for message
      let method: string | undefined;
      if (shell === 'zsh' && targetPath.includes('.oh-my-zsh/cache/completions')) {
        method = 'oh-my-zsh';
      }

      updatedShells.push({ shell, method });
    } catch (error) {
      // Silently skip errors - don't fail connection operations
      const message = error instanceof Error ? error.message : String(error);
      logError(`Failed to update ${shell} completions: ${message}`);
    }
  }

  // Show message if any shells were updated
  if (updatedShells.length > 0) {
    const shellNames = updatedShells.map(({ shell, method }) => {
      if (method) {
        return `${shell} (${method})`;
      }
      return shell;
    });
    console.log(`Updated completions for ${shellNames.join(', ')}`);
  }
}

/**
 * Handle the _completion helper command (for dynamic completions)
 */
async function handleCompletionHelper(args: string[]): Promise<void> {
  const type = args[0];

  if (type === 'connections') {
    try {
      const config = await loadCraftConfig();
      const connectionNames = config.connections.map((c) => c.name);
      console.log(connectionNames.join(' '));
    } catch {
      // Silently fail - completions should be graceful
      process.exit(0);
    }
    return;
  }

  // Future: add tool name completions here
  // if (type === 'tools' && args[1]) {
  //   const connectionName = args[1];
  //   // Load tools for connection and output names
  // }

  process.exit(0);
}
