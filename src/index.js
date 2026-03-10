/**
 * effector-compose — Type-checked composition engine for AI agent capabilities.
 *
 * Core API:
 *   parse(pipelineYml)   → PipelineGraph
 *   typeCheck(graph)     → TypeCheckResult
 *   build(graph, target) → RuntimeConfig
 */

import { readFileSync } from 'node:fs';

// ─── Pipeline Parser ─────────────────────────────────────────

/**
 * Parse a pipeline.effector.yml into a graph structure.
 * @param {string} yamlContent - Raw YAML content
 * @returns {Pipeline}
 */
export function parsePipeline(yamlContent) {
  // Minimal YAML parser for pipeline format
  const lines = yamlContent.split('\n');
  const pipeline = { name: '', version: '', steps: [] };
  let currentStep = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('name:')) {
      pipeline.name = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('version:')) {
      pipeline.version = trimmed.slice(8).trim();
    } else if (trimmed.startsWith('- id:')) {
      if (currentStep) pipeline.steps.push(currentStep);
      currentStep = { id: trimmed.slice(5).trim() };
    } else if (currentStep && trimmed.startsWith('effector:')) {
      currentStep.effector = trimmed.slice(9).trim();
    } else if (currentStep && trimmed.startsWith('parallel-with:')) {
      currentStep.parallelWith = trimmed.slice(14).trim();
    } else if (currentStep && trimmed.startsWith('condition:')) {
      currentStep.condition = trimmed.slice(10).trim();
    }
  }
  if (currentStep) pipeline.steps.push(currentStep);

  return pipeline;
}

// ─── Type Checker ────────────────────────────────────────────

/**
 * Type-check a pipeline against the Effector type registry.
 * @param {Pipeline} pipeline
 * @param {Map<string, EffectorDef>} registry - Map of effector name@version → definition
 * @returns {TypeCheckResult}
 */
export function typeCheck(pipeline, registry) {
  const errors = [];
  const warnings = [];
  const stepResults = [];

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const effectorDef = registry.get(step.effector);

    if (!effectorDef) {
      errors.push({
        step: step.id,
        message: `Effector "${step.effector}" not found in registry`,
      });
      stepResults.push({ id: step.id, valid: false });
      continue;
    }

    // Check sequential composition (type compatibility with previous step)
    if (i > 0 && !step.parallelWith) {
      const prevStep = pipeline.steps[i - 1];
      const prevDef = registry.get(prevStep.effector);

      if (prevDef && effectorDef) {
        const compat = checkTypeCompatibility(
          prevDef.interface?.output,
          effectorDef.interface?.input
        );
        if (!compat.compatible) {
          errors.push({
            step: step.id,
            message: `Type mismatch: output of "${prevStep.id}" (${compat.outputType}) is not compatible with input of "${step.id}" (${compat.inputType})`,
          });
        }
      }
    }

    // Check parallel composition safety
    if (step.parallelWith) {
      const parallelStep = pipeline.steps.find((s) => s.id === step.parallelWith);
      if (!parallelStep) {
        warnings.push({
          step: step.id,
          message: `Parallel target "${step.parallelWith}" not found in pipeline`,
        });
      }
      // Verify no data dependency on parallel step
      // (simplified: just check they don't reference each other's output)
    }

    stepResults.push({ id: step.id, valid: true, effector: step.effector });
  }

  const valid = errors.length === 0;

  return {
    valid,
    steps: stepResults,
    errors,
    warnings,
    summary: {
      totalSteps: pipeline.steps.length,
      validSteps: stepResults.filter((s) => s.valid).length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
  };
}

/**
 * Check structural type compatibility between output and input types.
 */
function checkTypeCompatibility(outputType, inputType) {
  if (!outputType || !inputType) {
    return { compatible: true, outputType: 'unknown', inputType: 'unknown' };
  }

  const outputTypeName = typeof outputType === 'string' ? outputType : JSON.stringify(outputType);
  const inputTypeName = typeof inputType === 'string' ? inputType : JSON.stringify(inputType);

  // String-based type comparison
  if (typeof outputType === 'string' && typeof inputType === 'string') {
    // Wildcard matching
    if (inputType.includes('*')) {
      const pattern = inputType.replace('*', '');
      return { compatible: outputType.includes(pattern), outputType, inputType };
    }
    return { compatible: outputType === inputType, outputType, inputType };
  }

  // Structural comparison for object types
  if (typeof outputType === 'object' && typeof inputType === 'object') {
    for (const key of Object.keys(inputType)) {
      if (!(key in outputType)) {
        return { compatible: false, outputType: outputTypeName, inputType: inputTypeName };
      }
    }
    return { compatible: true, outputType: outputTypeName, inputType: inputTypeName };
  }

  return { compatible: false, outputType: outputTypeName, inputType: inputTypeName };
}

// ─── Build Targets ───────────────────────────────────────────

/**
 * Emit a type-checked pipeline as a runtime-specific configuration.
 * @param {Pipeline} pipeline
 * @param {string} target - Target runtime: 'lobster' | 'langgraph' | 'json'
 * @returns {string}
 */
export function build(pipeline, target = 'json') {
  switch (target) {
    case 'json':
      return JSON.stringify(pipeline, null, 2);

    case 'lobster':
      return buildLobster(pipeline);

    case 'langgraph':
      return buildLangGraph(pipeline);

    default:
      throw new Error(`Unknown build target: ${target}. Supported: json, lobster, langgraph`);
  }
}

function buildLobster(pipeline) {
  const steps = pipeline.steps.map((s) => `  - skill: ${s.effector}`);
  return `# Generated by effector-compose\nname: ${pipeline.name}\nversion: ${pipeline.version}\nsteps:\n${steps.join('\n')}\n`;
}

function buildLangGraph(pipeline) {
  const nodes = pipeline.steps.map((s) => `    "${s.id}": ${s.effector}`);
  return `# Generated by effector-compose\n# LangGraph state machine configuration\nnodes:\n${nodes.join('\n')}\n`;
}
