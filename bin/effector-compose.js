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
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parsePipeline, typeCheck, build } from '../src/index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    target: { type: 'string', short: 't', default: 'json' },
    input: { type: 'string' },
    output: { type: 'string' },
    format: { type: 'string', short: 'f', default: 'terminal' },
  },
});

if (values.version) {
  console.log('effector-compose 0.1.0');
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

Options:
  -t, --target <runtime>    Build target (default: json)
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
      // In production, we'd load the type registry here
      const registry = new Map();
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
      console.log('Pipeline suggestion is not yet implemented. Coming in v0.3.');
      process.exit(0);

    case 'resolve':
      console.log('Dependency resolution is not yet implemented. Coming in v0.3.');
      process.exit(0);

    case 'visualize':
      console.log('Visualization requires effector-graph. Install with: npm install effector-graph');
      process.exit(0);

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
