#!/usr/bin/env bun
/**
 * Build craft binaries for all supported platforms.
 * Useful for creating releases with multiple architecture support.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist-bun');

interface Target {
  name: string;
  target: string;
  output: string;
}

const TARGETS: Target[] = [
  {
    name: 'macOS Apple Silicon',
    target: 'bun-darwin-arm64',
    output: 'craft-darwin-arm64',
  },
  {
    name: 'macOS Intel',
    target: 'bun-darwin-x64',
    output: 'craft-darwin-x64',
  },
  {
    name: 'Linux x64',
    target: 'bun-linux-x64',
    output: 'craft-linux-x64',
  },
  {
    name: 'Windows x64',
    target: 'bun-windows-x64',
    output: 'craft-windows-x64.exe',
  },
];

async function main(): Promise<void> {
  console.log('🚀 Building craft for all platforms...\n');

  // Ensure dist-bun directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const buildScript = path.join(__dirname, 'build-bun.ts');
  const results: Array<{ target: Target; success: boolean; error?: string }> = [];

  for (const target of TARGETS) {
    console.log(`📦 Building ${target.name} (${target.target})...`);

    const outputPath = path.join(distDir, target.output);
    const result = spawnSync('bun', [buildScript, '--target', target.target, '--output', outputPath], {
      stdio: 'inherit',
      cwd: projectRoot,
    });

    const success = result.status === 0;
    results.push({
      target,
      success,
      error: success ? undefined : `Exit code: ${result.status}`,
    });

    if (!success) {
      console.error(`❌ Failed to build ${target.name}\n`);
    } else {
      console.log(`✅ Built ${target.name}\n`);
    }
  }

  // Print summary
  console.log('\n📊 Build Summary:');
  console.log('─'.repeat(60));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  for (const { target, success } of results) {
    const status = success ? '✅' : '❌';
    const outputPath = path.join(distDir, target.output);
    const size = success && fs.existsSync(outputPath) ? formatSize(fs.statSync(outputPath).size) : 'N/A';
    console.log(`${status} ${target.name.padEnd(25)} ${size}`);
  }

  console.log('─'.repeat(60));
  console.log(`Total: ${successful.length}/${TARGETS.length} successful\n`);

  if (failed.length > 0) {
    console.error('❌ Some builds failed:');
    for (const { target, error } of failed) {
      console.error(`   - ${target.name}: ${error}`);
    }
    process.exit(1);
  }

  console.log('🎉 All builds completed successfully!');
  console.log(`\nBinaries available in: ${distDir}`);

  // Show how to create release archives
  console.log('\n💡 To create release archives:');
  console.log('   cd dist-bun');
  console.log('   tar -czf craft-darwin-arm64.tar.gz craft-darwin-arm64');
  console.log('   tar -czf craft-darwin-x64.tar.gz craft-darwin-x64');
  console.log('   tar -czf craft-linux-x64.tar.gz craft-linux-x64');
  console.log('   zip craft-windows-x64.zip craft-windows-x64.exe');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

main().catch((error) => {
  console.error('Build failed:');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
