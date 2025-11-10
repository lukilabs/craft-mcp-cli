#!/usr/bin/env node
/**
 * Generate src/version.ts from package.json version field.
 * This ensures the version is always in sync across all distribution formats.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const versionFilePath = path.join(projectRoot, 'src', 'version.ts');

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;

  if (!version || typeof version !== 'string') {
    throw new Error('package.json must contain a valid version string');
  }

  const content = `/**
 * Auto-generated version file.
 * DO NOT EDIT - this file is generated from package.json during build.
 * Run 'pnpm run generate:version' to regenerate.
 */

export const VERSION = '${version}';
`;

  fs.writeFileSync(versionFilePath, content, 'utf8');
  console.log(`✅ Generated src/version.ts with version ${version}`);
} catch (error) {
  console.error('Failed to generate version file:', error);
  process.exit(1);
}
