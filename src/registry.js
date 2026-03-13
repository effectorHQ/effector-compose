/**
 * Registry loader for effector-compose.
 *
 * Scans directories for effector.toml manifests and builds a Map
 * suitable for typeCheck(). Zero external dependencies.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parse an effector.toml file into an EffectorDef object.
 * Uses regex extraction for the fields that typeCheck() needs.
 *
 * @param {string} content - Raw effector.toml content
 * @returns {object} EffectorDef with name, version, type, description, interface, permissions
 */
export function parseEffectorToml(content) {
  const name = extractField(content, 'name');
  const version = extractField(content, 'version');
  const type = extractField(content, 'type');
  const description = extractField(content, 'description');

  // Extract [effector.interface] fields
  const input = extractField(content, 'input');
  const output = extractField(content, 'output');
  const contextMatch = content.match(/^\s*context\s*=\s*\[([^\]]*)\]/m);
  const context = contextMatch
    ? contextMatch[1].split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
    : [];

  // Extract [effector.permissions]
  const network = extractBoolField(content, 'network');
  const subprocess = extractBoolField(content, 'subprocess');

  return {
    name,
    version,
    type,
    description,
    interface: { input, output, context },
    permissions: { network, subprocess },
  };
}

function extractField(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"(.+?)"`, 'm'));
  return match ? match[1] : null;
}

function extractBoolField(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(true|false)`, 'm'));
  return match ? match[1] === 'true' : false;
}

/**
 * Scan a directory for effector.toml files and return a registry Map.
 *
 * Checks the directory itself and one level of subdirectories.
 * The Map key is the effector name (matching pipeline step references).
 *
 * @param {string} searchDir - Directory to scan
 * @returns {Map<string, object>} Map of effector name → EffectorDef
 */
export function loadRegistry(searchDir) {
  const registry = new Map();

  if (!existsSync(searchDir)) return registry;

  // Check root directory
  const rootToml = join(searchDir, 'effector.toml');
  if (existsSync(rootToml)) {
    const def = parseEffectorToml(readFileSync(rootToml, 'utf-8'));
    if (def.name) registry.set(def.name, def);
  }

  // Scan subdirectories (one level deep)
  try {
    const entries = readdirSync(searchDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const tomlPath = join(searchDir, entry.name, 'effector.toml');
      if (existsSync(tomlPath)) {
        const def = parseEffectorToml(readFileSync(tomlPath, 'utf-8'));
        if (def.name) registry.set(def.name, def);
      }
    }
  } catch { /* directory not readable */ }

  return registry;
}
