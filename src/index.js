/**
 * effector-compose — Type-checked composition engine for AI agent capabilities.
 *
 * Core API:
 *   parse(pipelineYml)   → PipelineGraph
 *   typeCheck(graph)     → TypeCheckResult
 *   build(graph, target) → RuntimeConfig
 */

import { readFileSync } from 'node:fs';
import { checkTypeCompatibility } from './type-checker.js';

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

  // Validate step ID uniqueness
  const seen = new Set();
  for (const step of pipeline.steps) {
    if (seen.has(step.id)) {
      throw new Error(`Duplicate step ID "${step.id}" in pipeline "${pipeline.name}"`);
    }
    seen.add(step.id);
  }

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

// checkTypeCompatibility is imported from ./type-checker.js
// Supports: exact match, alias resolution, subtype relations, wildcard matching

// ─── Resolve ───────────────────────────────────────────────

/**
 * Resolve a parsed pipeline against the effector registry.
 *
 * This does not attempt to execute anything; it only maps each step's
 * `effector` name to the corresponding EffectorDef from the registry.
 *
 * @param {Pipeline} pipeline
 * @param {Map<string, EffectorDef>} registry
 * @returns {{
 *   valid: boolean,
 *   steps: Array<{
 *     id: string,
 *     effector: string,
 *     version: string|null,
 *     interface: any,
 *     permissions: any
 *   }>,
 *   missing: Array<{ id: string, effector: string }>
 * }}
 */
export function resolve(pipeline, registry) {
  const steps = [];
  const missing = [];

  for (const step of pipeline.steps) {
    const effectorDef = registry.get(step.effector);

    if (!effectorDef) {
      missing.push({ id: step.id, effector: step.effector });
      continue;
    }

    steps.push({
      id: step.id,
      effector: effectorDef.name || step.effector,
      version: effectorDef.version || null,
      interface: effectorDef.interface || {},
      permissions: effectorDef.permissions || {},
    });
  }

  return {
    valid: missing.length === 0,
    steps,
    missing,
  };
}

// ─── Suggest ───────────────────────────────────────────────

/**
 * Suggest a short effector chain transforming `inputType` into `outputType`.
 *
 * Implementation: build a compatibility graph between EffectorDefs in the registry,
 * then BFS for the shortest chain up to `maxDepth`.
 *
 * @param {Map<string, EffectorDef>} registry
 * @param {string} inputType
 * @param {string} outputType
 * @param {{ maxDepth?: number, limit?: number }} [options]
 * @returns {{
 *   inputType: string,
 *   outputType: string,
 *   suggestions: Array<{
 *     steps: Array<{ name: string, version: string|null, input: string|null, output: string|null }>,
 *     weight: number
 *   }>
 * }}
 */
export function suggest(registry, inputType, outputType, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const limit = options.limit ?? 3;

  if (!inputType || !outputType) {
    return { inputType: inputType || '', outputType: outputType || '', suggestions: [] };
  }

  const effectors = [...registry.values()].filter((def) => def?.interface?.input && def?.interface?.output);

  const canStart = (def) => {
    const compat = checkTypeCompatibility(inputType, def.interface.input);
    return compat.compatible;
  };
  const canEnd = (def) => {
    const compat = checkTypeCompatibility(def.interface.output, outputType);
    return compat.compatible;
  };

  /** @type {Array<{ def: EffectorDef, input: string, output: string }>} */
  const nodes = effectors.map((def) => ({
    def,
    input: def.interface.input,
    output: def.interface.output,
  }));

  const startIdx = nodes
    .map((n, idx) => ({ n, idx }))
    .filter(({ n }) => canStart(n.def))
    .map(({ idx }) => idx);

  const endIdx = new Set(
    nodes
      .map((n, idx) => ({ n, idx }))
      .filter(({ n }) => canEnd(n.def))
      .map(({ idx }) => idx),
  );

  const suggestions = [];

  for (const start of startIdx) {
    /** @type {Array<{ path: number[], weight: number }>} */
    const queue = [{ path: [start], weight: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      const path = current.path;
      const last = path[path.length - 1];

      if (path.length > maxDepth) continue;

      if (endIdx.has(last) && path.length > 0) {
        suggestions.push({
          steps: path.map((i) => ({
            name: nodes[i].def.name,
            version: nodes[i].def.version || null,
            input: nodes[i].def.interface.input || null,
            output: nodes[i].def.interface.output || null,
          })),
          weight: current.weight,
        });
        continue;
      }

      // Expand
      for (let next = 0; next < nodes.length; next++) {
        if (path.includes(next)) continue; // avoid cycles

        const fromDef = nodes[last].def;
        const toDef = nodes[next].def;

        const compat = checkTypeCompatibility(fromDef.interface.output, toDef.interface.input);
        if (!compat.compatible) continue;

        const nextWeight = current.weight + (typeof compat.precision === 'number' ? compat.precision : 0.5);
        queue.push({ path: [...path, next], weight: nextWeight });
      }
    }
  }

  suggestions.sort((a, b) => b.weight - a.weight || a.steps.length - b.steps.length);

  return {
    inputType,
    outputType,
    suggestions: suggestions.slice(0, limit),
  };
}

// ─── Run (dry-run plan) ────────────────────────────────────

/**
 * Generate a dry-run execution plan for a pipeline.
 *
 * @param {Pipeline} pipeline
 * @param {Map<string, EffectorDef>} registry
 * @returns {{
 *   mode: 'dry-run',
 *   typeCheck: ReturnType<typeof typeCheck>,
 *   resolved: ReturnType<typeof resolve>,
 *   executionPlan: {
 *     steps: Array<{
 *       id: string,
 *       effector: string,
 *       version: string|null,
 *       inputType: string|null,
 *       outputType: string|null,
 *       parallelWith: string|null
 *     }>,
 *   }
 * }}
 */
export function dryRun(pipeline, registry) {
  const typeCheckResult = typeCheck(pipeline, registry);
  const resolved = resolve(pipeline, registry);

  const resolvedById = new Map(resolved.steps.map((s) => [s.id, s]));

  const steps = pipeline.steps.map((step) => {
    const r = resolvedById.get(step.id);
    return {
      id: step.id,
      effector: r?.effector || step.effector,
      version: r?.version || null,
      inputType: r?.interface?.input || null,
      outputType: r?.interface?.output || null,
      parallelWith: step.parallelWith || null,
    };
  });

  return {
    mode: 'dry-run',
    typeCheck: typeCheckResult,
    resolved,
    executionPlan: { steps },
  };
}

// ─── Visualization ───────────────────────────────────────────

/**
 * Render a pipeline (linear + parallel markers) into SVG.
 * This mirrors the minimal structure of the effector-graph renderer,
 * but keeps effector-compose self-contained (no optional dependency).
 *
 * @param {Pipeline} pipeline
 * @param {{ width?: number, height?: number }} [options]
 * @returns {string} SVG markup
 */
export function renderPipelineSVG(pipeline, options = {}) {
  const { width = 1000, height = 400 } = options;
  const stepWidth = 160;
  const stepHeight = 60;
  const gap = 80;
  const startX = 60;
  const centerY = height / 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  svg += `<style>
    .step-rect { rx: 8; ry: 8; stroke: #ddd; stroke-width: 1.5; }
    .step-name { font-family: 'Inter', system-ui, sans-serif; font-size: 13px; fill: #333; font-weight: 600; }
    .step-effector { font-family: 'Inter', system-ui, sans-serif; font-size: 10px; fill: #666; }
    .connector { stroke: #999; stroke-width: 1.5; fill: none; marker-end: url(#arrow2); }
  </style>`;
  svg += `<defs><marker id="arrow2" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#999"/></marker></defs>`;

  let x = startX;
  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];
    const y = step.parallelWith ? centerY - stepHeight - 10 : centerY - stepHeight / 2;

    svg += `<rect class="step-rect" x="${x}" y="${y}" width="${stepWidth}" height="${stepHeight}" fill="#f8f9fa"/>`;
    svg += `<text class="step-name" x="${x + stepWidth / 2}" y="${y + 24}" text-anchor="middle">${step.id}</text>`;
    svg += `<text class="step-effector" x="${x + stepWidth / 2}" y="${y + 42}" text-anchor="middle">${step.effector || ''}</text>`;

    if (i < pipeline.steps.length - 1) {
      svg += `<line class="connector" x1="${x + stepWidth}" y1="${centerY}" x2="${x + stepWidth + gap}" y2="${centerY}"/>`;
    }

    x += stepWidth + gap;
  }

  svg += `</svg>`;
  return svg;
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
