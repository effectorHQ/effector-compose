#!/usr/bin/env node

/**
 * effector-compose — Type-checked composition engine for AI agent capabilities.
 *
 * Usage:
 *   effector-compose check <pipeline.yml>                     Type-check a pipeline
 *   effector-compose build <pipeline.yml> --target <runtime>  Emit runtime config
 *   effector-compose suggest --input <type> --output <type>   Suggest pipeline
 *   effector-compose resolve <pipeline.yml>                   Resolve dependencies
 *   effector-compose visualize <pipeline.yml>                 Generate diagram
 *   effector-compose run <pipeline.yml>                       Dry-run execution plan
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parsePipeline, typeCheck, build, resolve, suggest, dryRun, renderPipelineSVG } from '../src/index.js';
import { loadRegistry } from '../src/registry.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    target: { type: 'string', short: 't', default: 'json' },
    registry: { type: 'string', short: 'r', default: '.' },
    input: { type: 'string' },
    output: { type: 'string' },
    format: { type: 'string', short: 'f', default: 'terminal' },
  },
});

if (values.version) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
  console.log(`effector-compose ${pkg.version}`);
  process.exit(0);
}

if (values.help || positionals.length === 0) {
  console.log(`
effector-compose — Type-checked composition engine

Commands:
  check <pipeline.yml>      Type-check a pipeline
  build <pipeline.yml>      Emit runtime config (--target lobster|langgraph|json)
  suggest                   Suggest pipeline (--input <type> --output <type>)
  resolve <pipeline.yml>    Resolve dependency tree
  visualize <pipeline.yml>  Generate pipeline diagram
  run <pipeline.yml>        Dry-run execution plan

Options:
  -t, --target <runtime>    Build target (default: json)
  -r, --registry <dir>      Directory to scan for effector.toml files (default: .)
  --input <type>            Input type for suggestions
  --output <type>           Output type for suggestions
  -f, --format <fmt>        Output format (default: terminal)
  -h, --help                Show this help
  -v, --version             Show version
`);
  process.exit(0);
}

const [command, pipelinePath] = positionals;

async function main() {
  switch (command) {
    case 'check': {
      const yml = readFileSync(pipelinePath, 'utf-8');
      const pipeline = parsePipeline(yml);
      const registryDir = values.registry || '.';
      const registry = loadRegistry(registryDir);

      if (registry.size === 0) {
        console.log(`\n  Warning: No effector.toml files found in "${registryDir}"`);
        console.log(`  Use --registry <dir> to point to a directory containing Effector packages.\n`);
      } else {
        console.log(`\n  Loaded ${registry.size} effector(s) from registry`);
      }

      const result = typeCheck(pipeline, registry);

      if (result.valid) {
        console.log(`\n  Pipeline type-check: \x1b[32mPASSED\x1b[0m (${result.summary.totalSteps}/${result.summary.totalSteps} steps valid)\n`);
      } else {
        console.log(`\n  Pipeline type-check: \x1b[31mFAILED\x1b[0m\n`);
        for (const err of result.errors) {
          console.log(`  ✗ [${err.step}] ${err.message}`);
        }
        console.log('');
      }
      process.exit(result.valid ? 0 : 1);
    }

    case 'build': {
      const yml = readFileSync(pipelinePath, 'utf-8');
      const pipeline = parsePipeline(yml);
      const output = build(pipeline, values.target);
      console.log(output);
      process.exit(0);
    }

    case 'suggest':
      if (!values.input || !values.output) {
        console.error('Usage: effector-compose suggest --input <type> --output <type> [--registry <dir>]');
        process.exit(1);
      }
      if (!pipelinePath) {
        // suggest doesn't need a pipelinePath positional; allow it to be omitted
      }
      {
        const registryDir = values.registry || '.';
        const registry = loadRegistry(registryDir);
        const result = suggest(registry, values.input, values.output);
        if (values.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        } else {
          if (!result.suggestions.length) {
            console.log(`No suggestions found for ${values.input} → ${values.output}`);
            process.exit(0);
          }
          console.log(`\nSuggestions for ${values.input} → ${values.output}:\n`);
          for (let i = 0; i < result.suggestions.length; i++) {
            const s = result.suggestions[i];
            const chain = s.steps.map((st) => `${st.name}${st.version ? `@${st.version}` : ''}`).join(' -> ');
            console.log(`  ${i + 1}. ${chain}  (weight: ${s.weight.toFixed(2)})`);
          }
          console.log('');
          process.exit(0);
        }
      }

    case 'resolve':
      if (!pipelinePath) {
        console.error('Usage: effector-compose resolve <pipeline.yml> [--registry <dir>]');
        process.exit(1);
      }
      {
        const yml = readFileSync(pipelinePath, 'utf-8');
        const pipeline = parsePipeline(yml);
        const registryDir = values.registry || '.';
        const registry = loadRegistry(registryDir);
        const result = resolve(pipeline, registry);
        if (values.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (!result.valid) {
            console.log('\nMissing effectors:\n');
            for (const m of result.missing) console.log(`  - ${m.id}: ${m.effector}`);
            console.log('');
          } else {
            console.log(`\nResolved ${result.steps.length} step(s) successfully.\n`);
          }
        }
        process.exit(result.valid ? 0 : 1);
      }

    case 'visualize':
      if (!pipelinePath) {
        console.error('Usage: effector-compose visualize <pipeline.yml> [--format terminal|json]');
        process.exit(1);
      }
      {
        const yml = readFileSync(pipelinePath, 'utf-8');
        const pipeline = parsePipeline(yml);
        const svg = renderPipelineSVG(pipeline);
        if (values.format === 'json') {
          console.log(JSON.stringify({ svg }, null, 2));
        } else {
          console.log(svg);
        }
        process.exit(0);
      }

    case 'run': {
      if (!pipelinePath) {
        console.error('Usage: effector-compose run <pipeline.yml> [--registry <dir>]');
        process.exit(1);
      }
      const yml = readFileSync(pipelinePath, 'utf-8');
      const pipeline = parsePipeline(yml);
      const registryDir = values.registry || '.';
      const registry = loadRegistry(registryDir);
      const plan = dryRun(pipeline, registry);

      if (values.format === 'json') {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        if (!plan.typeCheck.valid) {
          console.log('\nDry-run: type-check FAILED.\n');
          for (const err of plan.typeCheck.errors) console.log(`  ✗ [${err.step}] ${err.message}`);
          console.log('');
          process.exit(1);
        }
        console.log('\nDry-run execution plan (type-check PASSED):\n');
        plan.executionPlan.steps.forEach((s, idx) => {
          const parallel = s.parallelWith ? ` (parallelWith: ${s.parallelWith})` : '';
          console.log(`  ${idx + 1}. ${s.id}: ${s.effector}${s.version ? `@${s.version}` : ''}${parallel}`);
        });
        console.log('');
      }

      process.exit(plan.typeCheck.valid ? 0 : 1);
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
