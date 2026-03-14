import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { checkTypeCompatibility } from '../src/type-checker.js';

describe('checkTypeCompatibility', () => {
  it('exact match is compatible', () => {
    const result = checkTypeCompatibility('ReviewReport', 'ReviewReport');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'exact-match');
  });

  it('alias match: PlainText → String', () => {
    const result = checkTypeCompatibility('PlainText', 'String');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'alias-match');
  });

  it('subtype match: SecurityReport → ReviewReport', () => {
    const result = checkTypeCompatibility('SecurityReport', 'ReviewReport');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'subtype-match');
  });

  it('subtype match: SlackMessage → Notification', () => {
    const result = checkTypeCompatibility('SlackMessage', 'Notification');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'subtype-match');
  });

  it('wildcard match: ReviewReport → *Report', () => {
    const result = checkTypeCompatibility('ReviewReport', '*Report');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'wildcard-match');
  });

  it('incompatible types', () => {
    const result = checkTypeCompatibility('JSON', 'CodeDiff');
    assert.equal(result.compatible, false);
    assert.equal(result.reason, 'incompatible');
  });

  it('supertype is NOT compatible with subtype', () => {
    const result = checkTypeCompatibility('ReviewReport', 'SecurityReport');
    assert.equal(result.compatible, false);
  });

  it('handles missing types gracefully', () => {
    const result = checkTypeCompatibility(null, 'String');
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'missing-type');
  });

  it('handles object-based structural types', () => {
    const result = checkTypeCompatibility(
      { findings: [], severity: 'high', summary: 'ok' },
      { findings: [], severity: 'high' }
    );
    assert.equal(result.compatible, true);
    assert.equal(result.reason, 'structural-match');
  });
});
