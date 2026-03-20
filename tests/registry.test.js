import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEffectorToml, loadRegistry } from '../src/registry.js';
import { parsePipeline, typeCheck } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('parseEffectorToml', () => {
  it('extracts all fields from a valid manifest', () => {
    const content = readFileSync(join(fixturesDir, 'code-review', 'effector.toml'), 'utf-8');
    const def = parseEffectorToml(content);

    assert.equal(def.name, 'code-review');
    assert.equal(def.version, '1.2.0');
    assert.equal(def.type, 'skill');
    assert.equal(def.interface.input, 'CodeDiff');
    assert.equal(def.interface.output, 'ReviewReport');
    assert.equal(def.permissions.network, false);
  });

  it('extracts context array', () => {
    const content = readFileSync(join(fixturesDir, 'slack-notify', 'effector.toml'), 'utf-8');
    const def = parseEffectorToml(content);

    assert.equal(def.name, 'slack-notify');
    assert.deepEqual(def.interface.context, ['GenericAPIKey']);
    assert.equal(def.permissions.network, true);
  });
});

describe('loadRegistry', () => {
  it('loads effectors from fixture directory', () => {
    const registry = loadRegistry(fixturesDir);

    assert.equal(registry.size, 2);
    assert.ok(registry.has('code-review'));
    assert.ok(registry.has('slack-notify'));
  });

  it('returns empty map for non-existent directory', () => {
    const registry = loadRegistry('/nonexistent/path');
    assert.equal(registry.size, 0);
  });
});

describe('typeCheck with registry', () => {
  it('passes for a type-compatible pipeline', () => {
    const registry = loadRegistry(fixturesDir);
    const yml = readFileSync(join(fixturesDir, 'test-pipeline.yml'), 'utf-8');
    const pipeline = parsePipeline(yml);
    const result = typeCheck(pipeline, registry);

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.summary.totalSteps, 2);
  });

  it('fails for unknown effector', () => {
    const registry = loadRegistry(fixturesDir);
    const pipeline = {
      name: 'test',
      version: '1.0.0',
      steps: [{ id: 'step1', effector: 'nonexistent-skill' }],
    };
    const result = typeCheck(pipeline, registry);

    assert.equal(result.valid, false);
    assert.ok(result.errors[0].message.includes('not found in registry'));
  });

  it('fails for type-mismatched pipeline', () => {
    const registry = loadRegistry(fixturesDir);
    // slack-notify expects ReviewReport input, but here it's first so no prev output
    // Then code-review expects CodeDiff but gets Notification from slack-notify
    const pipeline = {
      name: 'test',
      version: '1.0.0',
      steps: [
        { id: 'notify-first', effector: 'slack-notify' },
        { id: 'review-second', effector: 'code-review' },
      ],
    };
    const result = typeCheck(pipeline, registry);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.message.includes('Type mismatch')));
  });
});

describe('parsePipeline validation', () => {
  it('rejects duplicate step IDs', () => {
    const yml = `name: dup-test
version: "1.0.0"
steps:
  - id: review
    effector: code-review
  - id: review
    effector: slack-notify`;
    assert.throws(() => parsePipeline(yml), (err) => {
      assert.ok(err.message.includes('Duplicate step ID'));
      assert.ok(err.message.includes('review'));
      return true;
    });
  });
});
