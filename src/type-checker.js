/**
 * Type checker for effector-compose.
 *
 * Delegates to @effectorhq/core for type compatibility checking.
 * Re-exports checkTypeCompatibility with the same API contract.
 */

export { checkTypeCompatibility } from '../../effector-core/src/type-checker.js';
