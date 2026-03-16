/**
 * Registry loader for effector-compose.
 *
 * Delegates to @effectorhq/core for TOML parsing and directory scanning.
 * Re-exports the functions that existing consumers depend on.
 */

import {
  parseEffectorToml,
  loadRegistryAsMap,
} from '@effectorhq/core/toml';

/**
 * Scan a directory for effector.toml files and return a registry Map.
 * @param {string} searchDir - Directory to scan
 * @returns {Map<string, object>}
 */
export function loadRegistry(searchDir) {
  return loadRegistryAsMap(searchDir);
}

export { parseEffectorToml };
